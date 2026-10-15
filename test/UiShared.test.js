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

// Đọc event qua RPC công cộng có giới hạn. Hai kiểu lỗi mô phỏng đúng thứ đã đo trên Sepolia 14/10/2026:
//   publicnode: JSON-RPC lỗi 4444 "pruned history unavailable" (ethers bọc thành "could not coalesce error");
//   dRPC gói miễn phí: HTTP 400, thân "ranges over 10000 blocks are not supported on free plan" (dù khoảng chỉ ~200).
describe("Đọc event bền trước giới hạn của RPC công cộng (getLogsRobust)", function () {
  const ui = load(["BLOCK_CHUNK", "LOG_MIN_CHUNK", "RANGE_ERR", "rpcErrText", "getLogsRobust"], ethers);

  let reg, addr, deployBlock, topics, expected;
  before(async () => {
    const [, a, b, c] = await ethers.getSigners();
    reg = await (await ethers.getContractFactory("CredentialRegistry")).deploy(INHERIT_DELAY);
    deployBlock = (await reg.deploymentTransaction().wait()).blockNumber;
    addr = await reg.getAddress();
    await reg.addIssuer(a.address, "Trung tâm Một");
    await ethers.provider.send("hardhat_mine", ["0x3e8"]);          // 1.000 block
    await reg.addIssuer(b.address, "Trung tâm Hai");
    await ethers.provider.send("hardhat_mine", ["0x1f4"]);          // 500 block
    await reg.addIssuer(c.address, "Trung tâm Ba");
    topics = [[reg.interface.getEvent("IssuerAdded").topicHash]];
    expected = (await ethers.provider.getLogs({ address: addr, topics, fromBlock: deployBlock }))
      .map((l) => l.transactionHash);
    expect(expected.length).to.equal(3);
  });

  const base = ethers.provider;
  const counting = (getLogs) => { const p = { calls: 0, getBlockNumber: () => base.getBlockNumber() };
    p.getLogs = (f) => { p.calls++; return getLogs(f); }; return p; };
  const pruned = (cutoff) => counting(async (f) => {
    if (f.fromBlock < cutoff) throw Object.assign(new Error("could not coalesce error (payload={fromBlock,toBlock})"),
      { shortMessage: "could not coalesce error", error: { code: 4444, message: "pruned history unavailable" } });
    return base.getLogs(f);
  });
  const limited = (maxSpan) => counting(async (f) => {
    if (f.toBlock - f.fromBlock + 1 > maxSpan) throw Object.assign(new Error("server response 400 Bad Request"),
      { shortMessage: "server response 400 Bad Request",
        info: { responseStatus: 400, responseBody: '{"error":{"message":"ranges over 10000 blocks are not supported on free plan","code":35}}' } });
    return base.getLogs(f);
  });
  const hashes = (logs) => logs.map((l) => l.transactionHash).sort();

  it("RPC đầu trả được cả khoảng thì chỉ một lời gọi, đủ event", async () => {
    const full = counting((f) => base.getLogs(f));
    const logs = await ui.getLogsRobust([full], addr, topics, deployBlock);
    expect(hashes(logs)).to.deep.equal([...expected].sort());
    expect(full.calls).to.equal(1);
  });

  it("RPC đầu đã xóa log cũ, RPC sau giới hạn khoảng: tự chuyển RPC và chia nhỏ khúc, không sót không trùng", async () => {
    const pn = pruned(Number.MAX_SAFE_INTEGER), dr = limited(150);
    const logs = await ui.getLogsRobust([pn, dr], addr, topics, deployBlock);
    expect(hashes(logs)).to.deep.equal([...expected].sort());
    expect(new Set(hashes(logs)).size).to.equal(logs.length);
    expect(dr.calls).to.be.greaterThan(1);
  });

  it("mọi RPC đều đã xóa log cũ: NÉM LỖI kèm lý do, không trả mảng rỗng", async () => {
    let err = null;
    try { await ui.getLogsRobust([pruned(Number.MAX_SAFE_INTEGER), pruned(Number.MAX_SAFE_INTEGER)], addr, topics, deployBlock); }
    catch (e) { err = e; }
    expect(err, "phải ném lỗi").to.not.equal(null);
    expect(err.message).to.include("pruned history unavailable");
  });

  it("mọi RPC giới hạn dưới LOG_MIN_CHUNK: chia tới mức tối thiểu rồi ném lỗi, không lặp vô hạn", async () => {
    const tiny = limited(ui.LOG_MIN_CHUNK - 1);
    let err = null;
    try { await ui.getLogsRobust([tiny], addr, topics, deployBlock); } catch (e) { err = e; }
    expect(err).to.not.equal(null);
    expect(err.message).to.include("ranges over 10000 blocks");
    expect(tiny.calls).to.be.lessThan(20);
  });

  it("phân loại lỗi: giới hạn khoảng thì chia khúc; lỗi pruned thì không (payload của ethers không bị đọc nhầm)", () => {
    const e1 = { shortMessage: "could not coalesce error", error: { message: "pruned history unavailable" },
      message: "could not coalesce error (payload={\"fromBlock\":\"0x1\",\"toBlock\":\"0x2\"})" };
    expect(ui.RANGE_ERR.test(ui.rpcErrText(e1))).to.equal(false);
    for (const m of ["ranges over 10000 blocks are not supported on free plan", "eth_getLogs is limited to 0 - 50 blocks range",
      "query returned more than 10000 results", "Log response size exceeded"])
      expect(ui.RANGE_ERR.test(ui.rpcErrText({ error: { message: m } })), m).to.equal(true);
  });
});
