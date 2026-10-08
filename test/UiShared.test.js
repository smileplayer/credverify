const { expect } = require("chai");
const { ethers } = require("hardhat");
const { load } = require("./uiSource");
const { canonicalName, nameProblem } = require("../scripts/lib/name");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");
const { time, INHERIT_DELAY } = require("./helpers");

// Test đọc hàm thật của app/app.js. Ở đây kiểm các quy tắc
// mà giao diện và script PHẢI giống hệt nhau — lệch là tra theo tên / công nhận tên ra kết quả khác.
describe("Giao diện và script dùng cùng quy tắc", function () {
  const ui = load(["canonicalName", "VN_LETTERS", "NAME_ALLOWED", "nameProblem", "certIdOf",
    "LEAF_TYPES", "cmpHex", "merkleInner", "merkleLeaf", "merkleNode", "buildMerkle", "STATS_EVENTS", "issuerStats"], ethers);

  it("chuẩn hóa tên và danh sách cho phép: app.js giống hệt scripts/lib/name.js", () => {
    const samples = ["  Trung   tâm  Z ", "Trung ta\u0302m X", "A\u00a0B\tC\nD", "Trung tâm đào tạo X", "",
      "Trung tâm \u2013 Trường X", "x\u200by", "TP. Hồ Chí Minh", "A & B", "Trung t\u0430m", "Cơ sở 2 (Hà Nội), Đà Nẵng",
      "A".repeat(257), "Ỹ ỹ Ạ ạ Đ đ Ư ư Ơ ơ"];
    for (const s of samples) {
      expect(ui.canonicalName(s)).to.equal(canonicalName(s));
      expect(ui.nameProblem(canonicalName(s))).to.equal(nameProblem(canonicalName(s)));
    }
  });

  it("cây Merkle dựng trong trình duyệt cho đúng root, lá và proof như OpenZeppelin StandardMerkleTree", () => {
    for (const n of [1, 2, 3, 5, 8, 13, 50]) {
      const values = Array.from({ length: n }, (_, i) => [ethers.id("tep-" + n + "-" + i),
        i % 3 ? ethers.Wallet.createRandom().address : ethers.ZeroAddress, ethers.hexlify(ethers.randomBytes(32))]);
      const oz = StandardMerkleTree.of(values, ["bytes32", "address", "bytes32"]);
      const mine = ui.buildMerkle(values);
      expect(mine.root, "root n=" + n).to.equal(oz.root);
      for (let i = 0; i < n; i++) {
        expect(mine.leaf(i)).to.equal(oz.leafHash(values[i]));
        expect(mine.proof(i), "proof n=" + n + " i=" + i).to.deep.equal(oz.getProof(i));
      }
    }
  });

  it("lá của trình duyệt khớp leafOf của contract; proof qua được verifyInBatch", async () => {
    const [, issuer] = await ethers.getSigners();
    const reg = await (await ethers.getContractFactory("CredentialRegistry")).deploy(INHERIT_DELAY);
    await reg.addIssuer(issuer.address, "Trung tâm Lô");
    const values = [0, 1, 2].map((i) => [ethers.id("lo-" + i), i ? issuer.address : ethers.ZeroAddress, ethers.hexlify(ethers.randomBytes(32))]);
    const t = ui.buildMerkle(values);
    await reg.connect(issuer).publishBatch(t.root, 3);
    for (let i = 0; i < 3; i++) {
      expect(t.leaf(i)).to.equal(await reg.leafOf(...values[i]));
      expect((await reg.verifyInBatch(issuer.address, t.root, ...values[i], t.proof(i))).valid).to.equal(true);
      expect(ui.merkleInner(values[i])).to.equal(await reg.leafInnerOf(...values[i]));
    }
    // `inner` của trình duyệt là đúng thứ revokeLeaf cần — thu hồi xong verifyInBatch thấy ngay.
    const batchId = await reg.batchIdOf(issuer.address, t.root);
    await reg.connect(issuer).revokeLeaf(batchId, t.root, ui.merkleInner(values[1]), t.proof(1));
    const r = await reg.verifyInBatch(issuer.address, t.root, ...values[1], t.proof(1));
    expect(r.leafRevoked).to.equal(true);
    expect(r.valid).to.equal(false);
  });

  it("certId tính ở trình duyệt khớp certIdOf của contract", async () => {
    const reg = await (await ethers.getContractFactory("CredentialRegistry")).deploy(INHERIT_DELAY);
    const issuer = ethers.Wallet.createRandom().address, h = ethers.id("tep.pdf");
    expect(ui.certIdOf(issuer, h)).to.equal(await reg.certIdOf(issuer, h));
  });

  it("thống kê theo đơn vị dựng từ event: gom theo danh tính, đếm thu hồi bị vô hiệu như contract", async () => {
    const [, A, A2, B, holder] = await ethers.getSigners();
    const reg = await (await ethers.getContractFactory("CredentialRegistry")).deploy(INHERIT_DELAY);
    await reg.addIssuer(A.address, "Trung tâm A");
    await reg.addIssuer(B.address, "Trung tâm B");
    await reg.connect(A).issueCertificate(ethers.id("s1"), holder.address);
    await reg.connect(A).issueCertificate(ethers.id("s2"), holder.address);
    await reg.connect(B).issueCertificate(ethers.id("b1"), holder.address);
    const values = [0, 1, 2, 3, 4].map((i) => [ethers.id("lo-tk-" + i), ethers.ZeroAddress, ethers.id("m" + i)]);
    const t = ui.buildMerkle(values);
    await reg.connect(A).publishBatch(t.root, 5);
    const batchId = await reg.batchIdOf(A.address, t.root);
    await time.increase(3600);
    // Từ đây khóa A bị đánh cắp: kẻ gian thu hồi và cấp thêm.
    const since = (await ethers.provider.getBlock("latest")).timestamp + 1;
    await reg.connect(A).revokeCertificate(await reg.certIdOf(A.address, ethers.id("s1")));
    await reg.connect(A).revokeLeaf(batchId, t.root, ui.merkleInner(values[0]), t.proof(0));
    await reg.connect(A).issueCertificate(ethers.id("s3-gia"), holder.address);
    await reg.removeIssuer(A.address);
    await reg.proposeInherit(A.address, A2.address, since);
    await time.increase(INHERIT_DELAY + 1);
    await reg.executeInherit(A.address);
    await reg.connect(A2).revokeBatch(batchId);           // khóa mới, hợp lệ

    const names = ui.STATS_EVENTS.concat(["IssuerInherited"]);
    const topics = [names.map((n) => reg.interface.getEvent(n).topicHash)];
    const raw = await ethers.provider.getLogs({ address: await reg.getAddress(), topics, fromBlock: 0 });
    const logs = raw.map((lg) => ({ ...reg.interface.parseLog(lg), blockNumber: lg.blockNumber }));
    const predecessor = {};
    for (const l of logs) if (l.name === "IssuerInherited") predecessor[l.args.newIssuer.toLowerCase()] = l.args.oldIssuer.toLowerCase();
    const st = ui.issuerStats(logs, predecessor);
    expect(st.length).to.equal(2);                         // A và A2 là MỘT danh tính
    const a = st.find((r) => r.identity === A.address.toLowerCase());
    const b = st.find((r) => r.identity === B.address.toLowerCase());
    expect({ ...a }).to.deep.equal({ identity: A.address.toLowerCase(), single: 3, batches: 1, declaredLeaves: 5,
      afterCompromise: 1, revSingle: 1, revLeaf: 1, revBatch: 1, voided: 2 });
    expect([b.single, b.batches, b.revSingle, b.voided]).to.deep.equal([1, 0, 0, 0]);
    // Đối chiếu với contract: thu hồi lẻ bị vô hiệu ⇒ chứng chỉ s1 vẫn hợp lệ trên chuỗi.
    expect((await reg.verifyCertificate(A.address, ethers.id("s1"))).valid).to.equal(true);
  });
});
