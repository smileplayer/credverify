const { expect } = require("chai");
const { ethers } = require("hardhat");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");
const { inherit, CR, time, INHERIT_DELAY } = require("./helpers");
const { canonicalName, nameProblem, VN_LETTERS } = require("../scripts/lib/name");
const { resolveInheritDelay, humanDelay, PRODUCTION_DEFAULT } = require("../scripts/lib/delay");

// ---------------------------------------------------------------------------
//  Bộ test của CredentialRegistry V3 (bộ test kế thừa từ V2 nằm ở CredentialRegistry.test.js):
//    A–E   Tách quyền owner/issuer, xoay khóa từ Disabled, danh tính O(1), cấp theo lô, issuer multisig
//    S1–S7 Khóa lộ: vô hiệu thu hồi, cờ issuedAfterCompromise, độ trễ chuyển giao, tên dạng chuẩn
//          (kèm PoC F-01…F-03 của kiểm toán lượt 1, đảo kỳ vọng sau khi sửa)
//    W–G   Danh sách cho phép tên tiếng Việt, mốc công bố lộ, effectiveStatus (kiểm toán lượt 2)
//    V34-01 Thu hồi trong lô chỉ nhận lá thật
//    V341-01 INHERIT_DELAY là tham số deploy
//  Quy ước tên: "BỊ CHẶN:", "BẤT BIẾN:", "CHỦ ĐÍCH:".
// ---------------------------------------------------------------------------

const LEAF_TYPES = ["bytes32", "address", "bytes32"];
const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
const salt = (i) => ethers.keccak256(ethers.toUtf8Bytes("salt-" + i)); // test: tất định; thực tế: ngẫu nhiên

async function fixture() {
  const s = await ethers.getSigners();
  const [credverify, centerX, centerY, hotKey2, alice, bob, stranger] = s;
  const reg = await (await ethers.getContractFactory("CredentialRegistry")).deploy(INHERIT_DELAY);
  await reg.waitForDeployment();
  await reg.addIssuer(centerX.address, "Trung tam dao tao X");
  await reg.addIssuer(centerY.address, "Trung tam dao tao Y");
  return { reg, s, credverify, centerX, centerY, hotKey2, alice, bob, stranger };
}

/** Dựng một lô n chứng chỉ, trả về cây và dữ liệu từng lá. */
function makeBatch(n, holderOf = () => ethers.ZeroAddress, tag = "lo") {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push([h(`${tag}-chung-chi-${i}.pdf`), holderOf(i), salt(`${tag}-${i}`)]);
  const tree = StandardMerkleTree.of(rows, LEAF_TYPES);
  return { tree, rows, root: tree.root };
}

const proofOf = (b, i) => b.tree.getProof(i);
const leafOfRow = (b, i) => b.tree.leafHash(b.rows[i]);
// revokeLeaf nhận `inner` = keccak(abi.encode(row)); hợp đồng tự tính lá = keccak(inner).
const innerOfRow = (b, i) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(LEAF_TYPES, b.rows[i]));

describe("CredentialRegistry V3 — tách quyền, xoay khóa, danh tính, lô, multisig (A–E)", function () {

  // =========================================================================
  describe("A. Bất biến owner ≠ issuer qua mọi lần chuyển quyền", function () {

    it("BỊ CHẶN: transferOwnership cho một issuer đang hoạt động", async () => {
      const { reg, centerX } = await fixture();
      await expect(reg.transferOwnership(centerX.address))
        .to.be.revertedWithCustomError(CR, "IssuerCannotBeOwner");
    });

    it("BỊ CHẶN: transferOwnership cho một khóa issuer đã bị gỡ (Disabled)", async () => {
      const { reg, centerX } = await fixture();
      await reg.removeIssuer(centerX.address);
      await expect(reg.transferOwnership(centerX.address))
        .to.be.revertedWithCustomError(CR, "IssuerCannotBeOwner");
    });

    it("BỊ CHẶN: addIssuer cho chính owner được đề cử (pendingOwner)", async () => {
      const { reg, stranger } = await fixture();
      await reg.transferOwnership(stranger.address);
      await expect(reg.addIssuer(stranger.address, "Z"))
        .to.be.revertedWithCustomError(CR, "PendingOwnerCannotBeIssuer");
    });

    it("BỊ CHẶN: chuyển giao (propose→execute) sang owner được đề cử", async () => {
      const { reg, centerX, stranger } = await fixture();
      await reg.transferOwnership(stranger.address);
      await expect(reg.proposeInherit(centerX.address, stranger.address, 0))
        .to.be.revertedWithCustomError(CR, "PendingOwnerCannotBeIssuer");
    });

    it("BỊ CHẶN: đề cử X, đổi đề cử sang Y, công nhận X làm issuer, rồi X cố nhận quyền", async () => {
      const { reg, alice, bob } = await fixture();
      await reg.transferOwnership(alice.address);
      await reg.transferOwnership(bob.address);      // alice hết là pendingOwner
      await reg.addIssuer(alice.address, "A");        // hợp lệ: alice không còn ở phía owner
      await expect(reg.connect(alice).acceptOwnership())
        .to.be.revertedWithCustomError(CR, "NotPendingOwner");
      // Và nếu owner đề cử lại alice thì bị chặn ngay ở transferOwnership.
      await expect(reg.transferOwnership(alice.address))
        .to.be.revertedWithCustomError(CR, "IssuerCannotBeOwner");
    });

    it("BẤT BIẾN: sau khi chuyển quyền hợp lệ, owner mới không cấp được và owner cũ thành người ngoài", async () => {
      const { reg, credverify, stranger, alice } = await fixture();
      await reg.transferOwnership(stranger.address);
      await reg.connect(stranger).acceptOwnership();
      expect(await reg.owner()).to.equal(stranger.address);
      await expect(reg.connect(stranger).issueCertificate(h("x"), alice.address))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
      await expect(reg.connect(stranger).publishBatch(h("root"), 1))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
      await expect(reg.connect(credverify).addIssuer(alice.address, "A"))
        .to.be.revertedWithCustomError(CR, "NotOwner");
    });

    it("CHỦ ĐÍCH: owner cũ (đã chuyển quyền) CÓ THỂ được công nhận làm issuer", async () => {
      const { reg, credverify, stranger } = await fixture();
      await reg.transferOwnership(stranger.address);
      await reg.connect(stranger).acceptOwnership();
      // Ví này không còn quyền owner nên không vi phạm bất biến. Ghim lại để ai đọc
      // cũng biết đây là chủ ý, không phải sót.
      await reg.connect(stranger).addIssuer(credverify.address, "Trung tam cu");
      expect(await reg.issuerStatus(credverify.address)).to.equal(1);
    });
  });

  // =========================================================================
  describe("B. Xoay khóa từ trạng thái Disabled", function () {

    it("chuyển giao (propose→execute) từ khóa Disabled: khóa mới Active, tên đi theo, đếm Active tăng 1", async () => {
      const { reg, centerX, hotKey2 } = await fixture();
      await reg.removeIssuer(centerX.address);
      const before = await reg.activeIssuerCount();
      await expect(inherit(reg, centerX.address, hotKey2.address))
        .to.emit(reg, "IssuerInherited").withArgs(centerX.address, hotKey2.address, "Trung tam dao tao X")
        .and.not.to.emit(reg, "IssuerRemoved");
      expect(await reg.activeIssuerCount()).to.equal(before + 1n);
      expect(await reg.issuerStatus(hotKey2.address)).to.equal(1);
      expect(await reg.issuerByName("Trung tam dao tao X")).to.equal(hotKey2.address);
    });

    it("chuyển giao (propose→execute) từ khóa Active: đếm Active KHÔNG đổi, phát IssuerRemoved cho khóa cũ", async () => {
      const { reg, centerX, hotKey2 } = await fixture();
      const before = await reg.activeIssuerCount();
      await expect(inherit(reg, centerX.address, hotKey2.address))
        .to.emit(reg, "IssuerRemoved").withArgs(centerX.address);
      expect(await reg.activeIssuerCount()).to.equal(before);
    });

    it("BỊ CHẶN: kế nhiệm một khóa đã từng được kế nhiệm (kể cả khi nó Disabled)", async () => {
      const { reg, centerX, hotKey2, stranger } = await fixture();
      await inherit(reg, centerX.address, hotKey2.address);
      await expect(reg.proposeInherit(centerX.address, stranger.address, 0))
        .to.be.revertedWithCustomError(CR, "CannotBeInherited");
    });

    it("BỊ CHẶN: kế nhiệm một địa chỉ chưa từng là issuer", async () => {
      const { reg, stranger, hotKey2 } = await fixture();
      await expect(reg.proposeInherit(stranger.address, hotKey2.address, 0))
        .to.be.revertedWithCustomError(CR, "CannotBeInherited");
    });

    it("BẤT BIẾN: quá RECOVERY_WINDOW sau khi gỡ, danh tính ĐÓNG BĂNG — owner không bật lại, không chuyển giao được", async () => {
      const { reg, centerX, hotKey2, alice } = await fixture();
      await reg.connect(centerX).issueCertificate(h("bang-that"), alice.address);
      const b = makeBatch(3);
      await reg.connect(centerX).publishBatch(b.root, 3);
      await reg.removeIssuer(centerX.address);                 // trung tâm giải thể
      const win = await reg.RECOVERY_WINDOW();
      expect(win).to.equal(7n * 24n * 3600n);
      await ethers.provider.send("evm_increaseTime", [Number(win) + 1]);
      await ethers.provider.send("evm_mine", []);
      // Đường cướp danh tính của V2/V3-chưa-sửa: chuyển giao sang ví của owner rồi thu hồi hết.
      await expect(reg.proposeInherit(centerX.address, hotKey2.address, 0))
        .to.be.revertedWithCustomError(CR, "RecoveryWindowClosed");
      await expect(reg.restoreIssuer(centerX.address))
        .to.be.revertedWithCustomError(CR, "RecoveryWindowClosed");
      // Chứng chỉ lẻ và lô của trung tâm đã giải thể vẫn hợp lệ, vĩnh viễn.
      expect((await reg.verifyCertificate(centerX.address, h("bang-that"))).valid).to.equal(true);
      expect((await reg.verifyInBatch(centerX.address, b.root, ...b.rows[0], proofOf(b, 0))).valid).to.equal(true);
    });

    it("trong RECOVERY_WINDOW (sát hạn) vẫn bật lại / chuyển giao được", async () => {
      const { reg, centerX, centerY, hotKey2 } = await fixture();
      await reg.removeIssuer(centerX.address);
      await reg.removeIssuer(centerY.address);
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 3600 - 60]);
      await ethers.provider.send("evm_mine", []);
      await reg.restoreIssuer(centerY.address);
      await inherit(reg, centerX.address, hotKey2.address);
      expect(await reg.issuerStatus(hotKey2.address)).to.equal(1);
      expect(await reg.issuerStatus(centerY.address)).to.equal(1);
    });

    it("CHỦ ĐÍCH: khóa ĐANG hoạt động thì chuyển giao không bị giới hạn thời gian (nhưng luôn qua độ trễ INHERIT_DELAY)", async () => {
      const { reg, centerX, hotKey2 } = await fixture();
      await ethers.provider.send("evm_increaseTime", [365 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);
      await inherit(reg, centerX.address, hotKey2.address);
      expect(await reg.issuerStatus(hotKey2.address)).to.equal(1);
    });

    it("BỊ CHẶN: restoreIssuer một khóa đã được kế nhiệm từ trạng thái Disabled", async () => {
      const { reg, centerX, hotKey2 } = await fixture();
      await reg.removeIssuer(centerX.address);
      await inherit(reg, centerX.address, hotKey2.address);
      await expect(reg.restoreIssuer(centerX.address))
        .to.be.revertedWithCustomError(CR, "IssuerWasInherited");
    });
  });

  // =========================================================================
  describe("C. Danh tính issuer — O(1), không trần", function () {

    it("identityOf / currentKeyOf đi theo chuỗi kế nhiệm", async () => {
      const { reg, centerX, hotKey2, stranger } = await fixture();
      expect(await reg.identityOf(centerX.address)).to.equal(centerX.address);
      expect(await reg.currentKeyOf(centerX.address)).to.equal(centerX.address);
      await inherit(reg, centerX.address, hotKey2.address);
      await inherit(reg, hotKey2.address, stranger.address);
      for (const k of [centerX, hotKey2, stranger]) {
        expect(await reg.identityOf(k.address)).to.equal(centerX.address);
        expect(await reg.currentKeyOf(k.address)).to.equal(stranger.address);
      }
    });

    it("tên lưu theo danh tính — mọi khóa trong chuỗi đọc ra cùng một tên, không chép chuỗi", async () => {
      const { reg, centerX, hotKey2, stranger } = await fixture();
      await inherit(reg, centerX.address, hotKey2.address);
      await inherit(reg, hotKey2.address, stranger.address);
      for (const k of [centerX, hotKey2, stranger]) {
        expect(await reg.issuerName(k.address)).to.equal("Trung tam dao tao X");
      }
      expect(await reg.issuerByName("Trung tam dao tao X")).to.equal(stranger.address);
    });

    it("issuerName trả về chuỗi rỗng cho địa chỉ chưa từng là issuer", async () => {
      const { reg, alice } = await fixture();
      expect(await reg.issuerName(alice.address)).to.equal("");
    });

    it("BỊ CHẶN: tên dài hơn MAX_NAME_BYTES (256 byte UTF-8); đúng 256 byte thì được", async () => {
      const { reg, alice, bob } = await fixture();
      expect(await reg.MAX_NAME_BYTES()).to.equal(256n);
      await expect(reg.addIssuer(alice.address, "A".repeat(257)))
        .to.be.revertedWithCustomError(CR, "NameTooLong");
      // Đo theo BYTE: 86 chữ "Đ" (2 byte) = 172 byte vẫn được; 129 chữ "Đ" = 258 byte bị chặn.
      await expect(reg.addIssuer(alice.address, "Đ".repeat(129)))
        .to.be.revertedWithCustomError(CR, "NameTooLong");
      await reg.addIssuer(alice.address, "A".repeat(256));
      await reg.addIssuer(bob.address, "Đ".repeat(86));
    });

    it("currentKeyOf trả về address(0) cho địa chỉ chưa từng là issuer", async () => {
      const { reg, stranger } = await fixture();
      expect(await reg.currentKeyOf(stranger.address)).to.equal(ethers.ZeroAddress);
    });

    it("BẤT BIẾN: hai danh tính khác nhau không thu hồi hộ nhau, kể cả sau khi xoay khóa", async () => {
      const { reg, centerX, centerY, hotKey2, alice } = await fixture();
      await reg.connect(centerX).issueCertificate(h("a"), alice.address);
      await inherit(reg, centerY.address, hotKey2.address);
      await expect(reg.connect(hotKey2).revokeCertificate(await reg.certIdOf(centerX.address, h("a"))))
        .to.be.revertedWithCustomError(CR, "NotIssuingKeyOrSuccessor");
    });

    it("BẤT BIẾN: tối đa MỘT khóa Active cho mỗi danh tính, qua 12 lần xoay", async () => {
      const { reg, s, centerX } = await fixture();
      const keys = [centerX, ...s.slice(7, 19)];
      for (let i = 1; i < keys.length; i++) await inherit(reg, keys[i - 1].address, keys[i].address);
      let active = 0;
      for (const k of keys) if ((await reg.issuerStatus(k.address)) === 1n) active++;
      expect(active).to.equal(1);
      expect(await reg.issuerStatus(keys[keys.length - 1].address)).to.equal(1);
    });
  });

  // =========================================================================
  describe("D1. Cấp theo lô — đăng và xác minh", function () {

    it("leafOf() trên chuỗi khớp StandardMerkleTree của OpenZeppelin (off-chain)", async () => {
      const { reg, alice } = await fixture();
      const b = makeBatch(5, (i) => (i % 2 ? alice.address : ethers.ZeroAddress));
      for (let i = 0; i < 5; i++) {
        expect(await reg.leafOf(...b.rows[i])).to.equal(leafOfRow(b, i));
      }
    });

    it("HAPPY PATH: đăng lô 8 chứng chỉ, mọi chứng chỉ xác minh hợp lệ trên chuỗi", async () => {
      const { reg, centerX } = await fixture();
      const b = makeBatch(8);
      await expect(reg.connect(centerX).publishBatch(b.root, 8))
        .to.emit(reg, "BatchPublished");
      for (let i = 0; i < 8; i++) {
        const r = await reg.verifyInBatch(centerX.address, b.root, ...b.rows[i], proofOf(b, i));
        expect(r.valid).to.equal(true);
        expect(r.inBatch).to.equal(true);
        expect(r.leafCount).to.equal(8);
        expect(r.issuerDisplayName).to.equal("Trung tam dao tao X");
      }
    });

    it("lô MỘT chứng chỉ: proof rỗng, vẫn xác minh được", async () => {
      const { reg, centerX } = await fixture();
      const b = makeBatch(1);
      expect(proofOf(b, 0)).to.deep.equal([]);
      await reg.connect(centerX).publishBatch(b.root, 1);
      expect((await reg.verifyInBatch(centerX.address, b.root, ...b.rows[0], [])).valid).to.equal(true);
    });

    it("tệp bị sửa (certHash khác) -> KHÔNG hợp lệ", async () => {
      const { reg, centerX } = await fixture();
      const b = makeBatch(4);
      await reg.connect(centerX).publishBatch(b.root, 4);
      const [, holder, sl] = b.rows[2];
      const r = await reg.verifyInBatch(centerX.address, b.root, h("tep-bi-sua.pdf"), holder, sl, proofOf(b, 2));
      expect(r.valid).to.equal(false);
      expect(r.inBatch).to.equal(false);
      expect(r.batchExists).to.equal(true);
    });

    it("sai salt hoặc sai holder -> KHÔNG hợp lệ", async () => {
      const { reg, centerX, alice, bob } = await fixture();
      const b = makeBatch(4, () => alice.address);
      await reg.connect(centerX).publishBatch(b.root, 4);
      const [ch, holder, sl] = b.rows[1];
      expect((await reg.verifyInBatch(centerX.address, b.root, ch, holder, salt("khac"), proofOf(b, 1))).valid).to.equal(false);
      expect((await reg.verifyInBatch(centerX.address, b.root, ch, bob.address, sl, proofOf(b, 1))).valid).to.equal(false);
      expect((await reg.verifyInBatch(centerX.address, b.root, ch, holder, sl, proofOf(b, 1))).valid).to.equal(true);
    });

    it("proof của lá khác -> KHÔNG hợp lệ", async () => {
      const { reg, centerX } = await fixture();
      const b = makeBatch(6);
      await reg.connect(centerX).publishBatch(b.root, 6);
      expect((await reg.verifyInBatch(centerX.address, b.root, ...b.rows[0], proofOf(b, 3))).valid).to.equal(false);
    });

    it("lô chưa đăng -> batchExists=false, valid=false", async () => {
      const { reg, centerX } = await fixture();
      const b = makeBatch(3);
      const r = await reg.verifyInBatch(centerX.address, b.root, ...b.rows[0], proofOf(b, 0));
      expect(r.batchExists).to.equal(false);
      expect(r.valid).to.equal(false);
    });

    it("BẤT BIẾN: lô của X tra dưới tên Y -> không tồn tại (không gian tên riêng)", async () => {
      const { reg, centerX, centerY } = await fixture();
      const b = makeBatch(3);
      await reg.connect(centerX).publishBatch(b.root, 3);
      expect((await reg.verifyInBatch(centerY.address, b.root, ...b.rows[0], proofOf(b, 0))).batchExists).to.equal(false);
    });

    it("BẤT BIẾN: issuer khác đăng TRƯỚC cùng root cũng không chặn được trung tâm thật", async () => {
      const { reg, centerX, centerY } = await fixture();
      const b = makeBatch(3);
      await reg.connect(centerY).publishBatch(b.root, 3);
      await reg.connect(centerX).publishBatch(b.root, 3);
      expect(await reg.batchIdOf(centerX.address, b.root)).to.not.equal(await reg.batchIdOf(centerY.address, b.root));
    });

    it("BẤT BIẾN: không thể dùng root làm 'lá' với proof rỗng (verifyInBatch tự tính lá)", async () => {
      const { reg, centerX } = await fixture();
      const b = makeBatch(4);
      await reg.connect(centerX).publishBatch(b.root, 4);
      // Kẻ gian không có tệp nào, chỉ biết root. Muốn valid thì phải tìm được
      // (certHash, holder, salt) sao cho leafOf(...) == root: bất khả về mật mã.
      const r = await reg.verifyInBatch(centerX.address, b.root, b.root, ethers.ZeroAddress, ethers.ZeroHash, []);
      expect(r.valid).to.equal(false);
    });

    it("BẤT BIẾN: nút trong của cây không dùng làm lá được (băm hai lần) — chặn cả ở revokeLeaf", async () => {
      const { reg, centerX } = await fixture();
      const b = makeBatch(4);
      await reg.connect(centerX).publishBatch(b.root, 4);
      // Nút trong = hash của lá 0 và nút anh em của nó (StandardMerkleTree sắp xếp
      // lá theo hash nên anh em của lá 0 là phần tử đầu tiên trong proof).
      const l0 = leafOfRow(b, 0);
      const p0 = proofOf(b, 0);
      const [a, c] = l0 < p0[0] ? [l0, p0[0]] : [p0[0], l0];
      const node = ethers.keccak256(ethers.concat([a, c]));
      const batchId = await reg.batchIdOf(centerX.address, b.root);
      // Hợp đồng băm thêm một lần: lá = keccak(node) không nằm trong cây ⇒ LeafNotInBatch (V34-01).
      await expect(reg.connect(centerX).revokeLeaf(batchId, b.root, node, p0.slice(1)))
        .to.be.revertedWithCustomError(reg, "LeafNotInBatch");
      expect(node).to.not.equal(await reg.leafOf(...b.rows[0]));
    });
  });

  // =========================================================================
  describe("D2. Cấp theo lô — các trường hợp bị chặn", function () {

    it("BỊ CHẶN: người không phải issuer đăng lô", async () => {
      const { reg, stranger } = await fixture();
      await expect(reg.connect(stranger).publishBatch(h("r"), 1))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
    });

    it("BỊ CHẶN: owner đăng lô", async () => {
      const { reg, credverify } = await fixture();
      await expect(reg.connect(credverify).publishBatch(h("r"), 1))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
    });

    it("BỊ CHẶN: khóa đã bị gỡ đăng lô", async () => {
      const { reg, centerX } = await fixture();
      await reg.removeIssuer(centerX.address);
      await expect(reg.connect(centerX).publishBatch(h("r"), 1))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
    });

    it("BỊ CHẶN: root rỗng / lô rỗng / đăng trùng", async () => {
      const { reg, centerX } = await fixture();
      await expect(reg.connect(centerX).publishBatch(ethers.ZeroHash, 1))
        .to.be.revertedWithCustomError(CR, "EmptyRoot");
      await expect(reg.connect(centerX).publishBatch(h("r"), 0))
        .to.be.revertedWithCustomError(CR, "EmptyBatch");
      await reg.connect(centerX).publishBatch(h("r"), 1);
      await expect(reg.connect(centerX).publishBatch(h("r"), 5))
        .to.be.revertedWithCustomError(CR, "BatchExists");
    });
  });

  // =========================================================================
  describe("D3. Thu hồi trong lô", function () {

    async function coLo(n = 4) {
      const f = await fixture();
      const b = makeBatch(n);
      await f.reg.connect(f.centerX).publishBatch(b.root, n);
      const batchId = await f.reg.batchIdOf(f.centerX.address, b.root);
      return { ...f, b, batchId };
    }

    it("HAPPY PATH: thu hồi một lá — lá đó mất hiệu lực, các lá khác vẫn hợp lệ", async () => {
      const { reg, centerX, b, batchId } = await coLo();
      await expect(reg.connect(centerX).revokeLeaf(batchId, b.root, innerOfRow(b, 1), proofOf(b, 1)))
        .to.emit(reg, "LeafRevoked");
      const r1 = await reg.verifyInBatch(centerX.address, b.root, ...b.rows[1], proofOf(b, 1));
      expect(r1.valid).to.equal(false);
      expect(r1.leafRevoked).to.equal(true);
      expect(r1.revokedAt).to.be.greaterThan(0);
      expect((await reg.verifyInBatch(centerX.address, b.root, ...b.rows[0], proofOf(b, 0))).valid).to.equal(true);
    });

    it("HAPPY PATH: thu hồi cả lô — mọi lá mất hiệu lực", async () => {
      const { reg, centerX, b, batchId } = await coLo();
      await expect(reg.connect(centerX).revokeBatch(batchId)).to.emit(reg, "BatchRevoked");
      for (let i = 0; i < 4; i++) {
        const r = await reg.verifyInBatch(centerX.address, b.root, ...b.rows[i], proofOf(b, i));
        expect(r.valid).to.equal(false);
        expect(r.batchRevoked).to.equal(true);
        expect(r.inBatch).to.equal(true);
      }
    });

    it("revokedAt lấy mốc SỚM NHẤT khi lá bị thu hồi trước rồi cả lô bị thu hồi sau", async () => {
      const { reg, centerX, b, batchId } = await coLo();
      await reg.connect(centerX).revokeLeaf(batchId, b.root, innerOfRow(b, 0), proofOf(b, 0));
      const tLeaf = await reg.leafRevokedAt(batchId, leafOfRow(b, 0));
      await ethers.provider.send("evm_increaseTime", [3600]);
      await reg.connect(centerX).revokeBatch(batchId);
      const r = await reg.verifyInBatch(centerX.address, b.root, ...b.rows[0], proofOf(b, 0));
      expect(r.revokedAt).to.equal(tLeaf);
      const r2 = await reg.verifyInBatch(centerX.address, b.root, ...b.rows[1], proofOf(b, 1));
      expect(r2.revokedAt).to.equal((await reg.batches(batchId)).revokedAt);
    });

    it("BỊ CHẶN: thu hồi lá không thuộc lô (proof sai)", async () => {
      const { reg, centerX, b, batchId } = await coLo();
      await expect(reg.connect(centerX).revokeLeaf(batchId, b.root, h("la-gia"), proofOf(b, 0)))
        .to.be.revertedWithCustomError(CR, "LeafNotInBatch");
    });

    it("BỊ CHẶN: root không khớp batchId", async () => {
      const { reg, centerX, b, batchId } = await coLo();
      await expect(reg.connect(centerX).revokeLeaf(batchId, h("root-khac"), innerOfRow(b, 0), proofOf(b, 0)))
        .to.be.revertedWithCustomError(CR, "RootMismatch");
    });

    it("BỊ CHẶN: lô không tồn tại", async () => {
      const { reg, centerX, b } = await coLo();
      await expect(reg.connect(centerX).revokeBatch(h("khong-co")))
        .to.be.revertedWithCustomError(CR, "BatchNotFound");
      await expect(reg.connect(centerX).revokeLeaf(h("khong-co"), b.root, innerOfRow(b, 0), proofOf(b, 0)))
        .to.be.revertedWithCustomError(CR, "BatchNotFound");
    });

    it("BỊ CHẶN: thu hồi lá hai lần / thu hồi lô hai lần / thu hồi lá sau khi cả lô đã thu hồi", async () => {
      const { reg, centerX, b, batchId } = await coLo();
      await reg.connect(centerX).revokeLeaf(batchId, b.root, innerOfRow(b, 0), proofOf(b, 0));
      await expect(reg.connect(centerX).revokeLeaf(batchId, b.root, innerOfRow(b, 0), proofOf(b, 0)))
        .to.be.revertedWithCustomError(CR, "LeafAlreadyRevoked");
      await reg.connect(centerX).revokeBatch(batchId);
      await expect(reg.connect(centerX).revokeBatch(batchId))
        .to.be.revertedWithCustomError(CR, "BatchAlreadyRevoked");
      await expect(reg.connect(centerX).revokeLeaf(batchId, b.root, innerOfRow(b, 1), proofOf(b, 1)))
        .to.be.revertedWithCustomError(CR, "BatchAlreadyRevoked");
    });

    it("BỊ CHẶN: owner KHÔNG thu hồi được lá hay lô", async () => {
      const { reg, credverify, b, batchId } = await coLo();
      await expect(reg.connect(credverify).revokeBatch(batchId))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
      await expect(reg.connect(credverify).revokeLeaf(batchId, b.root, innerOfRow(b, 0), proofOf(b, 0)))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
    });

    it("BỊ CHẶN: issuer khác KHÔNG thu hồi được lô của trung tâm thật", async () => {
      const { reg, centerY, batchId } = await coLo();
      await expect(reg.connect(centerY).revokeBatch(batchId))
        .to.be.revertedWithCustomError(CR, "NotIssuingKeyOrSuccessor");
    });

    it("BỊ CHẶN: khóa đã bị gỡ mất quyền thu hồi lô của chính mình", async () => {
      const { reg, centerX, batchId } = await coLo();
      await reg.removeIssuer(centerX.address);
      await expect(reg.connect(centerX).revokeBatch(batchId))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
    });

    it("KỊCH BẢN: khóa lộ đăng 3 lô giả -> gỡ -> chuyển giao -> khóa mới thu hồi 3 lô bằng 3 giao dịch", async () => {
      const { reg, centerX, hotKey2 } = await fixture();
      const ids = [];
      for (let k = 0; k < 3; k++) {
        const b = makeBatch(50, undefined, "gia" + k);
        await reg.connect(centerX).publishBatch(b.root, 50);   // kẻ tấn công dùng khóa lộ
        ids.push({ b, id: await reg.batchIdOf(centerX.address, b.root) });
      }
      await reg.removeIssuer(centerX.address);                  // chặn máu ngay — V3 không còn bẫy
      await inherit(reg, centerX.address, hotKey2.address);
      for (const { id } of ids) await reg.connect(hotKey2).revokeBatch(id);
      for (const { b } of ids) {
        expect((await reg.verifyInBatch(centerX.address, b.root, ...b.rows[7], proofOf(b, 7))).valid).to.equal(false);
      }
    });

    it("CHỦ ĐÍCH: lô của khóa bị gỡ (không lộ) VẪN hợp lệ — gỡ quyền không viết lại quá khứ", async () => {
      const { reg, centerX, b } = await coLo();
      await reg.removeIssuer(centerX.address);
      const r = await reg.verifyInBatch(centerX.address, b.root, ...b.rows[0], proofOf(b, 0));
      expect(r.valid).to.equal(true);
      expect(r.issuerState).to.equal(2);
    });
  });

  // =========================================================================
  describe("E. Issuer là một contract multisig (khuyến nghị chống gian lận nội bộ)", function () {

    it("ví 2-trên-3 đăng lô và thu hồi lô; một chữ ký thì không đủ", async () => {
      const { reg, s } = await fixture();
      const [o1, o2, o3] = s.slice(10, 13);
      const ms = await (await ethers.getContractFactory("MultiSigIssuerMock"))
        .deploy([o1.address, o2.address, o3.address], 2);
      await reg.addIssuer(await ms.getAddress(), "Truong co multisig");

      const b = makeBatch(4);
      const callPublish = reg.interface.encodeFunctionData("publishBatch", [b.root, 4]);
      await ms.connect(o1).submit(await reg.getAddress(), callPublish);
      await expect(ms.connect(o1).confirm(0)).to.be.revertedWith("MultiSig: already confirmed");
      expect((await reg.verifyInBatch(await ms.getAddress(), b.root, ...b.rows[0], proofOf(b, 0))).batchExists).to.equal(false);
      await ms.connect(o2).confirm(0);                           // đủ 2 chữ ký -> thực thi
      expect((await reg.verifyInBatch(await ms.getAddress(), b.root, ...b.rows[0], proofOf(b, 0))).valid).to.equal(true);

      const batchId = await reg.batchIdOf(await ms.getAddress(), b.root);
      await ms.connect(o3).submit(await reg.getAddress(), reg.interface.encodeFunctionData("revokeBatch", [batchId]));
      await ms.connect(o1).confirm(1);
      expect((await reg.batches(batchId)).revokedAt).to.be.greaterThan(0);
    });
  });
});


// ===========================================================================
describe("CredentialRegistry V3 — khóa lộ, độ trễ chuyển giao, tên dạng chuẩn (S1–S7)", function () {
  const LEAF_TYPES = ["bytes32", "address", "bytes32"];
  const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
  const DAY = 86400;

  async function fixture() {
    const [owner, keyA, newKey, rogue, holder, attacker, other] = await ethers.getSigners();
    const reg = await (await ethers.getContractFactory("CredentialRegistry")).deploy(INHERIT_DELAY);
    await reg.waitForDeployment();
    await reg.addIssuer(keyA.address, "Trung tam A");
    return { reg, owner, keyA, newKey, rogue, holder, attacker, other };
  }

  function batchOf(holder) {
    const vals = [
      [h("bang-that-lo"), holder, ethers.keccak256(ethers.toUtf8Bytes("s0"))],
      [h("bang-khac-lo"), ethers.ZeroAddress, ethers.keccak256(ethers.toUtf8Bytes("s1"))],
    ];
    const tree = StandardMerkleTree.of(vals, LEAF_TYPES);
    return { vals, tree, root: tree.root };
  }
  const vib = (reg, issuer, b, i) => reg.verifyInBatch(issuer, b.root, ...b.vals[i], b.tree.getProof(i));

  describe("PoC của bản kiểm toán — sau khi sửa", function () {
    it("F-01 ĐÃ SỬA: khóa lộ thu hồi chứng chỉ thật; sau khi tuyên bố lộ, các lần thu hồi đó bị VÔ HIỆU", async () => {
      const { reg, keyA, newKey, holder } = await fixture();
      const bang = h("bang-that");
      await reg.connect(keyA).issueCertificate(bang, holder.address);
      const b = batchOf(holder.address);
      await reg.connect(keyA).publishBatch(b.root, 2);
      const batchId = await reg.batchIdOf(keyA.address, b.root);

      const lo = await time.latest();                 // khóa rơi vào tay kẻ gian từ đây
      await reg.connect(keyA).revokeCertificate(await reg.certIdOf(keyA.address, bang));
      await reg.connect(keyA).revokeBatch(batchId);
      expect((await reg.verifyCertificate(keyA.address, bang)).valid).to.equal(false);

      await reg.removeIssuer(keyA.address);            // chặn ngay — tức thì
      await inherit(reg, keyA.address, newKey.address, lo + 1);

      const r1 = await reg.verifyCertificate(keyA.address, bang);
      expect(r1.valid).to.equal(true);
      expect(r1.status).to.equal(1);
      expect(r1.revocationVoided).to.equal(true);
      expect(r1.revokedAt).to.equal(0);
      expect(r1.issuedAfterCompromise).to.equal(false);   // cấp TRƯỚC mốc lộ
      const r2 = await vib(reg, keyA.address, b, 0);
      expect(r2.valid).to.equal(true);
      expect(r2.revocationVoided).to.equal(true);
      expect(r2.batchRevoked).to.equal(false);
      // Lịch sử không bị xóa: bản ghi lưu trữ vẫn ghi Revoked.
      expect((await reg.getCertificate(await reg.certIdOf(keyA.address, bang))).status).to.equal(2);
    });

    it("F-02 KHÔNG CÒN ÁP DỤNG: findByHash đã gỡ; bản ghi trùng hash của issuer khác nằm trong không gian tên riêng", async () => {
      const { reg, keyA, rogue, holder } = await fixture();
      await reg.addIssuer(rogue.address, "Trung tam B");
      const bang = h("bang-that-2");
      await reg.connect(keyA).issueCertificate(bang, holder.address);
      const ev = (await reg.queryFilter(reg.filters.CertificateIssued()))[0];
      await reg.connect(rogue).issueCertificate(ev.args.certHash, rogue.address);
      await reg.connect(rogue).revokeCertificate(await reg.certIdOf(rogue.address, bang));
      expect(reg.interface.getFunction("findByHash")).to.equal(null);
      // Người xác minh chọn đơn vị in trên chứng chỉ -> kết quả không bị phá.
      expect((await reg.verifyCertificate(keyA.address, bang)).valid).to.equal(true);
    });

    it("F-03 ĐÃ SỬA: bằng giả do khóa lộ cấp sau mốc lộ bị gắn cờ issuedAfterCompromise", async () => {
      const { reg, keyA, newKey, attacker } = await fixture();
      const lo = await time.latest();
      const fake = h("bang-gia");
      await reg.connect(keyA).issueCertificate(fake, attacker.address);
      await inherit(reg, keyA.address, newKey.address, lo + 1);
      const r = await reg.verifyCertificate(keyA.address, fake);
      expect(r.valid).to.equal(true);                  // bản ghi tồn tại, chưa thu hồi...
      expect(r.issuedAfterCompromise).to.equal(true);  // ...nhưng KHÔNG đáng tin
    });
  });

  describe("S1. Vô hiệu thu hồi do khóa lộ", function () {
    it("CHỦ ĐÍCH: thu hồi TRƯỚC mốc lộ (khóa còn trong tay chủ) giữ nguyên hiệu lực", async () => {
      const { reg, keyA, newKey, holder } = await fixture();
      const bang = h("thu-hoi-that");
      await reg.connect(keyA).issueCertificate(bang, holder.address);
      await reg.connect(keyA).revokeCertificate(await reg.certIdOf(keyA.address, bang));
      await time.increase(DAY);
      const lo = await time.latest();
      await inherit(reg, keyA.address, newKey.address, lo);
      const r = await reg.verifyCertificate(keyA.address, bang);
      expect(r.valid).to.equal(false);
      expect(r.revocationVoided).to.equal(false);
      expect(r.status).to.equal(2);
    });

    it("thu hồi của KHÓA KẾ NHIỆM (hợp lệ) không bị vô hiệu", async () => {
      const { reg, keyA, newKey, holder } = await fixture();
      const bang = h("bang-x");
      await reg.connect(keyA).issueCertificate(bang, holder.address);
      const lo = await time.latest();
      await inherit(reg, keyA.address, newKey.address, lo);
      await reg.connect(newKey).revokeCertificate(await reg.certIdOf(keyA.address, bang));
      expect((await reg.verifyCertificate(keyA.address, bang)).valid).to.equal(false);
      expect(await reg.certRevokedBy(await reg.certIdOf(keyA.address, bang))).to.equal(newKey.address);
    });

    it("khóa hợp lệ thu hồi LẠI được một chứng chỉ có lần thu hồi đã bị vô hiệu", async () => {
      const { reg, keyA, newKey, holder } = await fixture();
      const bang = h("bang-y");
      await reg.connect(keyA).issueCertificate(bang, holder.address);
      const id = await reg.certIdOf(keyA.address, bang);
      const lo = await time.latest();
      await reg.connect(keyA).revokeCertificate(id);
      await inherit(reg, keyA.address, newKey.address, lo + 1);
      expect((await reg.verifyCertificate(keyA.address, bang)).valid).to.equal(true);
      await expect(reg.connect(newKey).revokeCertificate(id)).to.emit(reg, "CertificateRevoked");
      const r = await reg.verifyCertificate(keyA.address, bang);
      expect(r.valid).to.equal(false);
      expect(r.revocationVoided).to.equal(false);
      // Lần thu hồi hợp lệ thì không thu hồi lần nữa được.
      await expect(reg.connect(newKey).revokeCertificate(id)).to.be.revertedWithCustomError(CR, "NotRevocable");
    });

    it("lá: thu hồi lá do khóa lộ bị vô hiệu; khóa mới thu hồi lại được lá đó", async () => {
      const { reg, keyA, newKey, holder } = await fixture();
      const b = batchOf(holder.address);
      await reg.connect(keyA).publishBatch(b.root, 2);
      const batchId = await reg.batchIdOf(keyA.address, b.root);
      const leaf = b.tree.leafHash(b.vals[0]);
      const inner = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(LEAF_TYPES, b.vals[0])); 
      const lo = await time.latest();
      await reg.connect(keyA).revokeLeaf(batchId, b.root, inner, b.tree.getProof(0));
      expect((await vib(reg, keyA.address, b, 0)).valid).to.equal(false);
      await inherit(reg, keyA.address, newKey.address, lo + 1);
      const r = await vib(reg, keyA.address, b, 0);
      expect(r.valid).to.equal(true);
      expect(r.leafRevoked).to.equal(false);
      expect(r.revocationVoided).to.equal(true);
      expect(await reg.leafRevokedAt(batchId, leaf)).to.not.equal(0);  // lịch sử còn nguyên
      await reg.connect(newKey).revokeLeaf(batchId, b.root, inner, b.tree.getProof(0));
      const r2 = await vib(reg, keyA.address, b, 0);
      expect(r2.valid).to.equal(false);
      expect(r2.revocationVoided).to.equal(false);
      await expect(reg.connect(newKey).revokeLeaf(batchId, b.root, inner, b.tree.getProof(0)))
        .to.be.revertedWithCustomError(CR, "LeafAlreadyRevoked");
    });

    it("lô: thu hồi cả lô do khóa lộ bị vô hiệu; sau đó khóa mới thu hồi lá, rồi thu hồi lại cả lô", async () => {
      const { reg, keyA, newKey, holder } = await fixture();
      const b = batchOf(holder.address);
      await reg.connect(keyA).publishBatch(b.root, 2);
      const batchId = await reg.batchIdOf(keyA.address, b.root);
      const lo = await time.latest();
      await reg.connect(keyA).revokeBatch(batchId);
      await inherit(reg, keyA.address, newKey.address, lo + 1);
      expect((await vib(reg, keyA.address, b, 1)).valid).to.equal(true);
      // Lô không còn bị coi là thu hồi -> thu hồi lá được.
      await reg.connect(newKey).revokeLeaf(batchId, b.root, ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(LEAF_TYPES, b.vals[0])), b.tree.getProof(0));
      const r0 = await vib(reg, keyA.address, b, 0);
      expect(r0.valid).to.equal(false);
      expect(r0.revocationVoided).to.equal(true);     // lần thu hồi lô vẫn được báo là đã vô hiệu
      await time.increase(10);
      await reg.connect(newKey).revokeBatch(batchId);
      const r0b = await vib(reg, keyA.address, b, 0);
      // revokedAt = mốc hiệu lực SỚM NHẤT (lá, vì thu hồi trước lô).
      expect(r0b.revokedAt).to.be.lessThan(BigInt(await time.latest()));
      expect(r0b.leafRevoked && r0b.batchRevoked).to.equal(true);
      expect((await vib(reg, keyA.address, b, 1)).valid).to.equal(false);
      await expect(reg.connect(newKey).revokeBatch(batchId)).to.be.revertedWithCustomError(CR, "BatchAlreadyRevoked");
    });

    it("revokedAt: lô thu hồi trước, lá thu hồi sau (khi lần thu hồi lô đã bị vô hiệu rồi lô bị thu hồi lại)", async () => {
      const { reg, keyA, newKey, holder } = await fixture();
      const b = batchOf(holder.address);
      await reg.connect(keyA).publishBatch(b.root, 2);
      const batchId = await reg.batchIdOf(keyA.address, b.root);
      const lo = await time.latest();
      await reg.connect(keyA).revokeLeaf(batchId, b.root, ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(LEAF_TYPES, b.vals[0])), b.tree.getProof(0)); // sẽ bị vô hiệu
      await inherit(reg, keyA.address, newKey.address, lo + 1);
      await reg.connect(newKey).revokeBatch(batchId);
      const tBatch = await time.latest();
      const r = await vib(reg, keyA.address, b, 0);
      expect(r.revokedAt).to.equal(tBatch);
      expect(r.batchRevoked).to.equal(true);
      expect(r.leafRevoked).to.equal(false);
      expect(r.revocationVoided).to.equal(true);
    });
  });

  describe("S2. Cờ issuedAfterCompromise", function () {
    it("lô cấp trước mốc lộ: cờ false; lô cấp sau mốc lộ: cờ true", async () => {
      const { reg, keyA, newKey, holder } = await fixture();
      const truoc = batchOf(holder.address);
      await reg.connect(keyA).publishBatch(truoc.root, 2);
      await time.increase(DAY);
      const lo = await time.latest();
      const sau = batchOf(ethers.ZeroAddress);
      await reg.connect(keyA).publishBatch(sau.root, 2);
      await inherit(reg, keyA.address, newKey.address, lo + 1);
      expect((await vib(reg, keyA.address, truoc, 0)).issuedAfterCompromise).to.equal(false);
      expect((await vib(reg, keyA.address, sau, 1)).issuedAfterCompromise).to.equal(true);
    });

    it("xoay khóa ĐỊNH KỲ (compromisedSince = 0): không gắn cờ, không vô hiệu gì, không phát KeyCompromised", async () => {
      const { reg, keyA, newKey, holder } = await fixture();
      const bang = h("dinh-ky");
      await reg.connect(keyA).issueCertificate(bang, holder.address);
      await expect(inherit(reg, keyA.address, newKey.address, 0)).to.not.emit(reg, "KeyCompromised");
      expect(await reg.compromisedAt(keyA.address)).to.equal(0);
      expect((await reg.verifyCertificate(keyA.address, bang)).issuedAfterCompromise).to.equal(false);
    });

    it("chứng chỉ không tồn tại / lô không tồn tại: cờ luôn false", async () => {
      const { reg, keyA, newKey, holder } = await fixture();
      const lo = await time.latest();
      await inherit(reg, keyA.address, newKey.address, lo);
      expect((await reg.verifyCertificate(keyA.address, h("khong-co"))).issuedAfterCompromise).to.equal(false);
      expect((await vib(reg, keyA.address, batchOf(holder.address), 0)).issuedAfterCompromise).to.equal(false);
    });

    it("executeInherit phát KeyCompromised và ghi compromisedAt", async () => {
      const { reg, keyA, newKey } = await fixture();
      const lo = await time.latest();
      await expect(inherit(reg, keyA.address, newKey.address, lo))
        .to.emit(reg, "KeyCompromised").withArgs(keyA.address, lo);
      expect(await reg.compromisedAt(keyA.address)).to.equal(lo);
    });

    it("BỊ CHẶN: mốc lộ ở tương lai, hoặc lùi quá MAX_COMPROMISE_LOOKBACK (30 ngày)", async () => {
      const { reg, keyA, newKey } = await fixture();
      const now = await time.latest();
      await expect(reg.proposeInherit(keyA.address, newKey.address, now + 1000))
        .to.be.revertedWithCustomError(CR, "InvalidCompromiseTime");
      await expect(reg.proposeInherit(keyA.address, newKey.address, now - 31 * DAY))
        .to.be.revertedWithCustomError(CR, "InvalidCompromiseTime");
      await expect(reg.proposeInherit(keyA.address, newKey.address, now - 29 * DAY)).to.emit(reg, "InheritProposed");
    });
  });

  describe("S3. Độ trễ chuyển giao danh tính (R1 / SC-03)", function () {
    it("BỊ CHẶN: thực thi trước INHERIT_DELAY; đúng hạn thì chạy", async () => {
      const { reg, keyA, newKey } = await fixture();
      await expect(reg.proposeInherit(keyA.address, newKey.address, 0)).to.emit(reg, "InheritProposed");
      const p = await reg.inheritProposals(keyA.address);
      expect(p.newIssuer).to.equal(newKey.address);
      await time.increase(INHERIT_DELAY - 10);
      await expect(reg.executeInherit(keyA.address)).to.be.revertedWithCustomError(CR, "TimelockNotElapsed");
      await time.increase(10);
      await expect(reg.executeInherit(keyA.address)).to.emit(reg, "IssuerInherited");
      expect((await reg.inheritProposals(keyA.address)).eta).to.equal(0);
    });

    it("BỊ CHẶN: đề xuất quá PROPOSAL_TTL sau eta thì hết hiệu lực", async () => {
      const { reg, keyA, newKey } = await fixture();
      await reg.proposeInherit(keyA.address, newKey.address, 0);
      await time.increase(INHERIT_DELAY + 7 * DAY + 10);
      await expect(reg.executeInherit(keyA.address)).to.be.revertedWithCustomError(CR, "ProposalExpired");
    });

    it("trong lúc chờ, khóa cũ VẪN hoạt động cho tới khi owner gỡ — gỡ quyền thì tức thì", async () => {
      const { reg, keyA, newKey, holder } = await fixture();
      await reg.proposeInherit(keyA.address, newKey.address, 0);
      await reg.connect(keyA).issueCertificate(h("trong-luc-cho"), holder.address);
      await reg.removeIssuer(keyA.address);
      await expect(reg.connect(keyA).issueCertificate(h("sau-khi-go"), holder.address))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
      await time.increase(INHERIT_DELAY);
      await reg.executeInherit(keyA.address);
      expect(await reg.issuerStatus(newKey.address)).to.equal(1);
      expect(await reg.activeIssuerCount()).to.equal(1);
    });

    it("hủy đề xuất: phát InheritCancelled, không thực thi được nữa, đề xuất lại được", async () => {
      const { reg, keyA, newKey, other } = await fixture();
      await reg.proposeInherit(keyA.address, newKey.address, 0);
      await expect(reg.proposeInherit(keyA.address, other.address, 0)).to.be.revertedWithCustomError(CR, "ProposalExists");
      await expect(reg.cancelInherit(keyA.address)).to.emit(reg, "InheritCancelled").withArgs(keyA.address, newKey.address);
      await time.increase(INHERIT_DELAY);
      await expect(reg.executeInherit(keyA.address)).to.be.revertedWithCustomError(CR, "NoProposal");
      await expect(reg.cancelInherit(keyA.address)).to.be.revertedWithCustomError(CR, "NoProposal");
      await reg.proposeInherit(keyA.address, other.address, 0);
    });

    it("BỊ CHẶN: người ngoài / issuer không đề xuất, thực thi hay hủy được", async () => {
      const { reg, keyA, newKey } = await fixture();
      await expect(reg.connect(keyA).proposeInherit(keyA.address, newKey.address, 0)).to.be.revertedWithCustomError(CR, "NotOwner");
      await reg.proposeInherit(keyA.address, newKey.address, 0);
      await time.increase(INHERIT_DELAY);
      await expect(reg.connect(keyA).executeInherit(keyA.address)).to.be.revertedWithCustomError(CR, "NotOwner");
      await expect(reg.connect(newKey).cancelInherit(keyA.address)).to.be.revertedWithCustomError(CR, "NotOwner");
    });

    it("kiểm lại lúc thực thi: khóa mới đã bị dùng làm issuer trong lúc chờ -> BỊ CHẶN", async () => {
      const { reg, keyA, newKey } = await fixture();
      await reg.proposeInherit(keyA.address, newKey.address, 0);
      await reg.addIssuer(newKey.address, "Trung tam khac");
      await time.increase(INHERIT_DELAY);
      await expect(reg.executeInherit(keyA.address)).to.be.revertedWithCustomError(CR, "AddressAlreadyUsed");
    });

    it("kiểm lại lúc thực thi: khóa mới đã thành owner được đề cử trong lúc chờ -> BỊ CHẶN", async () => {
      const { reg, keyA, newKey } = await fixture();
      await reg.proposeInherit(keyA.address, newKey.address, 0);
      await reg.transferOwnership(newKey.address);
      await time.increase(INHERIT_DELAY);
      await expect(reg.executeInherit(keyA.address)).to.be.revertedWithCustomError(CR, "PendingOwnerCannotBeIssuer");
    });

    it("đề xuất tạo trong RECOVERY_WINDOW vẫn thực thi được dù lúc thực thi cửa sổ đã đóng (giới hạn bởi PROPOSAL_TTL)", async () => {
      const { reg, keyA, newKey } = await fixture();
      await reg.removeIssuer(keyA.address);
      await time.increase(7 * DAY - 120);
      await reg.proposeInherit(keyA.address, newKey.address, 0);
      await time.increase(INHERIT_DELAY);
      await expect(reg.executeInherit(keyA.address)).to.emit(reg, "IssuerInherited");
      expect(await reg.activeIssuerCount()).to.equal(1);
    });
  });

  describe("S7. Vệ sinh mã", function () {
    it("cancelOwnershipTransfer: xóa đề cử, địa chỉ đó lại được làm issuer", async () => {
      const { reg, owner, other } = await fixture();
      await reg.transferOwnership(other.address);
      await expect(reg.cancelOwnershipTransfer()).to.emit(reg, "OwnershipTransferCancelled").withArgs(owner.address, other.address);
      expect(await reg.pendingOwner()).to.equal(ethers.ZeroAddress);
      await expect(reg.connect(other).acceptOwnership()).to.be.revertedWithCustomError(CR, "NotPendingOwner");
      await reg.addIssuer(other.address, "Trung tam C");
      await expect(reg.cancelOwnershipTransfer()).to.be.revertedWithCustomError(CR, "NotPendingOwner");
      await expect(reg.connect(other).cancelOwnershipTransfer()).to.be.revertedWithCustomError(CR, "NotOwner");
    });

    for (const [label, name] of [
      ["khoảng trắng đầu", " Trung tam D"],
      ["khoảng trắng cuối", "Trung tam D "],
      ["hai khoảng trắng liền nhau", "Trung  tam D"],
      ["ký tự xuống dòng", "Trung\ntam D"],
      ["tab", "Trung\ttam D"],
      ["DEL (0x7f)", "Trung\x7ftam D"],
    ]) {
      it(`BỊ CHẶN: tên không ở dạng chuẩn — ${label}`, async () => {
        const { reg, other } = await fixture();
        await expect(reg.addIssuer(other.address, name)).to.be.revertedWithCustomError(CR, "NameNotCanonical");
      });
    }

    it("tên tiếng Việt có dấu (UTF-8 nhiều byte) và một ký tự đơn được chấp nhận; tra ngược theo tên chạy", async () => {
      const { reg, other, rogue } = await fixture();
      const ten = "Trung tâm Đào tạo Tin học Ứng dụng".normalize("NFC");
      await reg.addIssuer(other.address, ten);
      await reg.addIssuer(rogue.address, "X");
      expect(await reg.issuerByName(ten)).to.equal(other.address);
      expect(await reg.issuerName(other.address)).to.equal(ten);
    });

    it("predecessorOf: từ khóa mới nhất (issuerByName) đi ngược được về khóa gốc chỉ bằng trạng thái", async () => {
      const { reg, keyA, newKey, other } = await fixture();
      await inherit(reg, keyA.address, newKey.address);
      await inherit(reg, newKey.address, other.address);
      const latest = await reg.issuerByName("Trung tam A");
      expect(latest).to.equal(other.address);
      const chain = [];
      for (let k = latest; k !== ethers.ZeroAddress; k = await reg.predecessorOf(k)) chain.push(k);
      expect(chain).to.deep.equal([other.address, newKey.address, keyA.address]);
    });

    it("pragma được ghim (0.8.24), không còn ^", async () => {
      const src = require("fs").readFileSync(require("path").join(__dirname, "..", "contracts", "CredentialRegistry.sol"), "utf8");
      expect(src).to.match(/^pragma solidity 0\.8\.24;$/m);
    });
  });
});


// ===========================================================================
describe("CredentialRegistry V3 — danh sách cho phép tên, mốc công bố lộ, effectiveStatus (W–G)", function () {
  const DAY = 86400;
  const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

  async function fixture() {
    const [owner, A, A2, B, holder, evil, x1, x2, x3] = await ethers.getSigners();
    const reg = await (await ethers.getContractFactory("CredentialRegistry")).deploy(INHERIT_DELAY);
    await reg.addIssuer(A.address, "Trung tâm A");
    return { reg, owner, A, A2, B, holder, evil, x1, x2, x3 };
  }

  async function declare(reg, oldK, newK, since) {
    await reg.removeIssuer(oldK);
    await reg.proposeInherit(oldK, newK, since);
    await time.increase(INHERIT_DELAY + 1);
    return reg.executeInherit(oldK);
  }

  /** Gửi addIssuer với tên là BYTE THÔ (có thể không phải UTF-8 hợp lệ). */
  async function addRaw(reg, owner, addr, bytes) {
    const sel = reg.interface.getFunction("addIssuer").selector;
    const data = sel + ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes"], [addr, bytes]).slice(2);
    return owner.sendTransaction({ to: await reg.getAddress(), data });
  }

  describe("W. Danh sách cho phép tên tiếng Việt (V32-02)", function () {
    it("nhận đủ 134 chữ có dấu tiếng Việt (dựng sẵn), chữ số, dấu cách, ( ) , -", async () => {
      const { reg, x1, x2, x3 } = await fixture();
      const letters = [...VN_LETTERS];
      expect(letters).to.have.lengthOf(134);
      const half = Math.ceil(letters.length / 2);
      await reg.addIssuer(x1.address, "Chữ " + letters.slice(0, half).join(""));
      await reg.addIssuer(x2.address, "Chữ " + letters.slice(half).join(""));
      await reg.addIssuer(x3.address, "Cơ sở 2 (Hà Nội), Trung tâm Tin học - Ngoại ngữ 0123456789");
      expect(await reg.issuerByName("Cơ sở 2 (Hà Nội), Trung tâm Tin học - Ngoại ngữ 0123456789")).to.equal(x3.address);
    });

    it("BỊ CHẶN: NBSP, ký tự vô hình, NFD, Kirin, Hy Lạp, dấu chấm, ký tự đặc biệt, gạch dài, tab", async () => {
      const { reg, x1 } = await fixture();
      const bad = [
        "Trung tâm\u00a0A", "Trung tâm A\u200b", "Trung ta\u0302m A", "Trung t\u0430m A", "Trung t\u03bfm A",
        "TP. Hồ Chí Minh", "A & B", "Trung tâm #1", "100% Tin học", "Nhà O'Neil", "A/B", "Trung tâm \u2013 X",
        "Trung tâm \u2014 X", "A\tB", "Trung tâm Ä", "Trung tâm Ā", "Trung tâm ỹỺ",
      ];
      for (const n of bad) await expect(reg.addIssuer(x1.address, n), JSON.stringify(n)).to.be.revertedWithCustomError(CR, "NameNotCanonical");
    });

    it("BỊ CHẶN: chuỗi UTF-8 cụt hoặc byte tiếp nối ngoài dải (gửi byte thô)", async () => {
      const { reg, owner, x1 } = await fixture();
      const cases = ["0x41c3", "0x41e1ba", "0x41e1", "0x41e1ba9f", "0x41e1bbba", "0x41c37f", "0x41c3c0", "0x41e1bc80", "0x41ff", "0x4180"];
      for (const b of cases) await expect(addRaw(reg, owner, x1.address, b), b).to.be.revertedWithCustomError(CR, "NameNotCanonical");
      // Biên hợp lệ: Ạ (E1 BA A0, U+1EA0) và ỹ (E1 BB B9, U+1EF9).
      await addRaw(reg, owner, x1.address, "0x41e1baa0e1bbb9");
      expect(await reg.issuerName(x1.address)).to.equal("A\u1ea0\u1ef9");   // Ạ ỹ
    });

    it("KHỚP: nameProblem() của script/giao diện và contract cho cùng kết luận trên 300 tên ngẫu nhiên", async () => {
      const { reg } = await fixture();
      const pool = [..."aAzZ09 (),-.&#%'/\u2013\u2014\u00a0\u200b\u0430\u03bf\u0302" + VN_LETTERS.slice(0, 40) + VN_LETTERS.slice(-10)];
      let seed = 7; const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
      let accepted = 0, rejected = 0; const seen = new Set(["Trung tâm A"]);
      for (let i = 0; i < 300; i++) {
        let s = ""; const len = 1 + rnd(12);
        for (let j = 0; j < len; j++) s += pool[rnd(pool.length)];
        const name = canonicalName(s);
        const w = ethers.Wallet.createRandom().address;
        const ok = nameProblem(name) === null;
        if (!name || seen.has(name)) continue;
        seen.add(name);
        if (ok) { await reg.addIssuer(w, name).then(() => accepted++, () => { throw new Error("contract từ chối tên script cho phép: " + JSON.stringify(name)); }); }
        else {
          let reverted = false;
          try { await reg.addIssuer.staticCall(w, name); } catch (e) { reverted = /NameNotCanonical/.test(e.message); }
          expect(reverted, "contract nhận tên script từ chối: " + JSON.stringify(name)).to.equal(true);
          rejected++;
        }
      }
      expect(accepted).to.be.greaterThan(20); expect(rejected).to.be.greaterThan(20);
    });

    it("chuẩn hóa: tên dán từ PDF (NFD, NBSP, gạch dài, zero-width) ra đúng tên đã công nhận", async () => {
      const { reg, x1 } = await fixture();
      await reg.addIssuer(x1.address, canonicalName("Trung tâm Ngoại ngữ \u2013 Trường Đại học X"));
      const pasted = "  Trung ta\u0302m\u00a0Ngoa\u0323i ngư\u0303 \u2014 Trươ\u0300ng Đa\u0323i ho\u0323c\u200b X ";
      expect(await reg.issuerByName(canonicalName(pasted))).to.equal(x1.address);
    });
  });

  describe("D. Độ trễ chuyển giao \u2014 bản thử nghiệm", function () {
    it("INHERIT_DELAY = 60 giây, khớp helper của bộ test", async () => {
      const { reg } = await fixture();
      expect(await reg.INHERIT_DELAY()).to.equal(60n);
      expect(INHERIT_DELAY).to.equal(60);
    });
  });

  describe("C. Thời điểm công bố lộ khóa", function () {
    it("ghi lúc executeInherit; trả trong verifyCertificate và verifyInBatch cùng mốc lộ", async () => {
      const { reg, A, A2, holder } = await fixture();
      await reg.connect(A).issueCertificate(h("c1"), holder.address);
      const vals = [[h("l1"), holder.address, ethers.ZeroHash]];
      const tree = StandardMerkleTree.of(vals, ["bytes32", "address", "bytes32"]);
      await reg.connect(A).publishBatch(tree.root, 1);
      const since = (await time.latest()) - 20 * DAY;
      const tx = await declare(reg, A.address, A2.address, since);
      const declaredAt = (await ethers.provider.getBlock((await tx.wait()).blockNumber)).timestamp;
      expect(await reg.compromiseDeclaredAt(A.address)).to.equal(declaredAt);
      const r = await reg.verifyCertificate(A.address, h("c1"));
      expect(r.compromisedSince).to.equal(since);
      expect(r.compromiseDeclaredAt).to.equal(declaredAt);
      expect(Number(r.compromiseDeclaredAt) - Number(r.compromisedSince)).to.be.greaterThan(20 * DAY - 1);
      const b = await reg.verifyInBatch(A.address, tree.root, ...vals[0], tree.getProof(0));
      expect(b.compromisedSince).to.equal(since);
      expect(b.compromiseDeclaredAt).to.equal(declaredAt);
    });

    it("xoay khóa định kỳ (không khai lộ): cả hai mốc bằng 0", async () => {
      const { reg, A, A2, holder } = await fixture();
      await reg.connect(A).issueCertificate(h("c2"), holder.address);
      await reg.proposeInherit(A.address, A2.address, 0);
      await time.increase(INHERIT_DELAY + 1);
      await reg.executeInherit(A.address);
      expect(await reg.compromiseDeclaredAt(A.address)).to.equal(0);
      const r = await reg.verifyCertificate(A.address, h("c2"));
      expect(r.compromisedSince).to.equal(0); expect(r.compromiseDeclaredAt).to.equal(0);
    });
  });

  describe("E. effectiveStatus (V32-04)", function () {
    it("None / Issued / Revoked hợp lệ giữ nguyên; thu hồi do khóa lộ -> Issued; getCertificate vẫn THÔ", async () => {
      const { reg, A, A2, holder } = await fixture();
      expect(await reg.effectiveStatus(ethers.ZeroHash)).to.equal(0);
      await reg.connect(A).issueCertificate(h("hop-le"), holder.address);
      await reg.connect(A).issueCertificate(h("bi-pha"), holder.address);
      const idOk = await reg.certIdOf(A.address, h("hop-le")), idBad = await reg.certIdOf(A.address, h("bi-pha"));
      expect(await reg.effectiveStatus(idOk)).to.equal(1);
      await reg.connect(A).revokeCertificate(idOk);                 // thu hồi HỢP LỆ, trước mốc lộ
      await time.increase(100);
      const since = await time.latest();
      await time.increase(10);
      await reg.connect(A).revokeCertificate(idBad);                // kẻ gian, sau mốc lộ
      await declare(reg, A.address, A2.address, since);
      expect(await reg.effectiveStatus(idOk)).to.equal(2);
      expect(await reg.effectiveStatus(idBad)).to.equal(1);
      expect((await reg.getCertificate(idBad)).status).to.equal(2n);   // bản ghi THÔ không đổi
    });
  });

  describe("G. PoC lượt 2", function () {
    it("G-03 (RỦI RO GHIM, chấp nhận): owner vẫn 'hồi sinh' được thu hồi hợp pháp và gắn cờ bằng thật trong 30 ngày \u2014 nhưng mốc công bố lộ ra độ lùi", async () => {
      const { reg, A, B, holder } = await fixture();
      await reg.connect(A).issueCertificate(h("gian-lan"), holder.address);
      await reg.connect(A).issueCertificate(h("bang-that"), holder.address);
      await time.increase(5 * DAY);
      await reg.connect(A).revokeCertificate(await reg.certIdOf(A.address, h("gian-lan")));
      const since = (await time.latest()) - 29 * DAY;
      await reg.proposeInherit(A.address, B.address, since);
      await expect(reg.connect(A).cancelInherit(A.address)).to.be.revertedWithCustomError(CR, "NotOwner");
      await time.increase(INHERIT_DELAY + 1);
      await reg.executeInherit(A.address);
      const g = await reg.verifyCertificate(A.address, h("gian-lan"));
      expect(g.valid).to.equal(true);
      const t = await reg.verifyCertificate(A.address, h("bang-that"));
      expect(t.issuedAfterCompromise).to.equal(true);
      // Minh bạch: người xác minh thấy owner lùi mốc ~29 ngày so với lúc công bố.
      expect(Number(t.compromiseDeclaredAt) - Number(t.compromisedSince)).to.be.greaterThan(29 * DAY - 1);
    });

    it("G-04 (ĐÃ SỬA): NBSP, ZWSP, NFD không còn tạo được tên trông y hệt", async () => {
      const { reg, A2, B, evil } = await fixture();
      await expect(reg.addIssuer(B.address, "Trung tâm\u00a0A")).to.be.revertedWithCustomError(CR, "NameNotCanonical");
      await expect(reg.addIssuer(A2.address, "Trung tâm A\u200b")).to.be.revertedWithCustomError(CR, "NameNotCanonical");
      await expect(reg.addIssuer(evil.address, "Trung ta\u0302m A")).to.be.revertedWithCustomError(CR, "NameNotCanonical");
    });

    it("G-05 (GIỚI HẠN GHIM): bằng giả cấp trước mốc lookback 30 ngày không bị gắn cờ", async () => {
      const { reg, A, A2, evil } = await fixture();
      await reg.connect(A).issueCertificate(h("gia-cu"), evil.address);
      await time.increase(31 * DAY);
      const since = (await time.latest()) - 30 * DAY + 10;
      await declare(reg, A.address, A2.address, since);
      const r = await reg.verifyCertificate(A.address, h("gia-cu"));
      expect(r.valid).to.equal(true); expect(r.issuedAfterCompromise).to.equal(false);
    });

    it("G-06 (ĐÃ SỬA một phần): getCertificate vẫn THÔ, nhưng effectiveStatus và verifyCertificate cho kết luận đúng", async () => {
      const { reg, A, A2, holder } = await fixture();
      await reg.connect(A).issueCertificate(h("x"), holder.address);
      const t0 = await time.latest(); await time.increase(10);
      const id = await reg.certIdOf(A.address, h("x"));
      await reg.connect(A).revokeCertificate(id);
      await declare(reg, A.address, A2.address, t0);
      expect((await reg.getCertificate(id)).status).to.equal(2n);
      expect(await reg.effectiveStatus(id)).to.equal(1);
      expect((await reg.verifyCertificate(A.address, h("x"))).valid).to.equal(true);
    });
  });
});


// ===========================================================================
describe("CredentialRegistry V3 — thu hồi trong lô chỉ nhận lá thật (V34-01)", function () {
  const LEAF_TYPES = ["bytes32", "address", "bytes32"];
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const innerOf = (row) => ethers.keccak256(coder.encode(LEAF_TYPES, row));
  const pair = (x, y) => ethers.keccak256(ethers.concat(x < y ? [x, y] : [y, x]));

  async function fixture(n = 8) {
    const [owner, A, holder] = await ethers.getSigners();
    const reg = await (await ethers.getContractFactory("CredentialRegistry")).deploy(INHERIT_DELAY);
    await reg.addIssuer(A.address, "Trung tâm A");
    const rows = Array.from({ length: n }, (_, i) =>
      [ethers.id("v34-" + i), i % 2 ? holder.address : ethers.ZeroAddress, ethers.id("muoi-" + i)]);
    const tree = StandardMerkleTree.of(rows, LEAF_TYPES);
    await reg.connect(A).publishBatch(tree.root, n);
    const batchId = await reg.batchIdOf(A.address, tree.root);
    return { reg, A, rows, tree, batchId };
  }

  describe("V34-01. revokeLeaf chỉ thu hồi được LÁ THẬT", function () {
    it("leafInnerOf khớp cách tính ngoài chuỗi; leafOf = keccak(leafInnerOf) = lá của OpenZeppelin", async () => {
      const { reg, rows, tree } = await fixture(3);
      for (const r of rows) {
        const inner = await reg.leafInnerOf(...r);
        expect(inner).to.equal(innerOf(r));
        expect(await reg.leafOf(...r)).to.equal(ethers.keccak256(inner));
        expect(await reg.leafOf(...r)).to.equal(tree.leafHash(r));
      }
    });

    it("nút trong ở MỌI tầng (kể cả root với proof rỗng) đều bị từ chối LeafNotInBatch", async () => {
      const { reg, A, rows, tree, batchId } = await fixture(8);
      // Đi từ lá 0 lên root, ở mỗi tầng thử gửi nút đó kèm phần proof còn lại.
      const proof = tree.getProof(0);
      let node = tree.leafHash(rows[0]);
      for (let k = 0; k < proof.length; k++) {
        node = pair(node, proof[k]);
        await expect(reg.connect(A).revokeLeaf(batchId, tree.root, node, proof.slice(k + 1)))
          .to.be.revertedWithCustomError(reg, "LeafNotInBatch");
      }
      expect(node).to.equal(tree.root);
    });

    it("gửi chính LÁ thay cho inner cũng bị từ chối — không ghi nhầm", async () => {
      const { reg, A, rows, tree, batchId } = await fixture(4);
      await expect(reg.connect(A).revokeLeaf(batchId, tree.root, tree.leafHash(rows[2]), tree.getProof(2)))
        .to.be.revertedWithCustomError(reg, "LeafNotInBatch");
    });

    it("inner thật: thu hồi đúng chứng chỉ, sự kiện mang lá thật, các lá khác không đổi", async () => {
      const { reg, A, rows, tree, batchId } = await fixture(5);
      const leaf = tree.leafHash(rows[3]);
      await expect(reg.connect(A).revokeLeaf(batchId, tree.root, innerOf(rows[3]), tree.getProof(3)))
        .to.emit(reg, "LeafRevoked").withArgs(batchId, leaf, A.address, (t) => t > 0n);
      expect(await reg.leafRevokedAt(batchId, leaf)).to.not.equal(0);
      for (let i = 0; i < rows.length; i++) {
        const r = await reg.verifyInBatch(A.address, tree.root, ...rows[i], tree.getProof(i));
        expect(r.inBatch).to.equal(true);
        expect(r.leafRevoked, "lá " + i).to.equal(i === 3);
        expect(r.valid, "lá " + i).to.equal(i !== 3);
      }
      await expect(reg.connect(A).revokeLeaf(batchId, tree.root, innerOf(rows[3]), tree.getProof(3)))
        .to.be.revertedWithCustomError(reg, "LeafAlreadyRevoked");
    });

    it("lô một chứng chỉ: root = lá; inner với proof rỗng thu hồi được, gửi root thì không", async () => {
      const { reg, A, rows, tree, batchId } = await fixture(1);
      expect(tree.root).to.equal(tree.leafHash(rows[0]));
      await expect(reg.connect(A).revokeLeaf(batchId, tree.root, tree.root, []))
        .to.be.revertedWithCustomError(reg, "LeafNotInBatch");
      await reg.connect(A).revokeLeaf(batchId, tree.root, innerOf(rows[0]), []);
      expect((await reg.verifyInBatch(A.address, tree.root, ...rows[0], [])).leafRevoked).to.equal(true);
    });

    it("inner KHÔNG lộ certHash/holder: không có muối thì không dò ngược được từ dữ liệu công khai", async () => {
      const { rows } = await fixture(2);
      // Cùng certHash và holder, khác muối ⇒ inner khác hẳn: người xem sự kiện/giao dịch không suy ra được tệp.
      const other = [rows[0][0], rows[0][1], ethers.id("muoi-khac")];
      expect(innerOf(other)).to.not.equal(innerOf(rows[0]));
    });
  });
});


// ===========================================================================
describe("CredentialRegistry V3 — INHERIT_DELAY là tham số deploy (V341-01)", function () {
  const HOUR = 3600, DAY = 24 * HOUR;
  const deployWith = async (d) => (await ethers.getContractFactory("CredentialRegistry")).deploy(d);

  it("constructor nhận đúng khoảng [1 phút, 7 ngày] và lưu giá trị bất biến", async () => {
    const F = await ethers.getContractFactory("CredentialRegistry");
    await expect(F.deploy(59)).to.be.revertedWithCustomError(F, "InvalidInheritDelay");
    await expect(F.deploy(7 * DAY + 1)).to.be.revertedWithCustomError(F, "InvalidInheritDelay");
    await expect(F.deploy(0)).to.be.revertedWithCustomError(F, "InvalidInheritDelay");
    for (const d of [60, HOUR, 48 * HOUR, 7 * DAY]) {
      const r = await deployWith(d);
      expect(await r.INHERIT_DELAY()).to.equal(BigInt(d));
    }
    const r = await deployWith(60);
    expect(await r.MIN_INHERIT_DELAY()).to.equal(60n);
    expect(await r.MAX_INHERIT_DELAY()).to.equal(BigInt(7 * DAY));
    expect(await r.MAX_INHERIT_DELAY()).to.equal(await r.RECOVERY_WINDOW());
  });

  it("deploy 48 giờ: thực thi sớm bị chặn, đủ 48 giờ thì thực thi được", async () => {
    const [, A, A2] = await ethers.getSigners();
    const r = await deployWith(48 * HOUR);
    await r.addIssuer(A.address, "Trung tâm A");
    await r.proposeInherit(A.address, A2.address, 0);
    const eta = (await r.inheritProposals(A.address)).eta;
    await time.increaseTo(Number(eta) - 2);
    await expect(r.executeInherit(A.address)).to.be.revertedWithCustomError(r, "TimelockNotElapsed");
    await time.increaseTo(Number(eta));
    await r.executeInherit(A.address);
    expect(await r.currentKeyOf(A.address)).to.equal(A2.address);
  });

  it("độ trễ tối đa (7 ngày) vẫn thực thi được với đề xuất tạo trong RECOVERY_WINDOW sau khi gỡ", async () => {
    const [, A, A2] = await ethers.getSigners();
    const r = await deployWith(7 * DAY);
    await r.addIssuer(A.address, "Trung tâm A");
    await r.removeIssuer(A.address);
    await time.increase(7 * DAY - 10);                 // sát hạn cửa sổ khôi phục
    await r.proposeInherit(A.address, A2.address, 0);
    await time.increase(7 * DAY);
    await r.executeInherit(A.address);
    expect(await r.currentKeyOf(A.address)).to.equal(A2.address);
  });

  describe("scripts/lib/delay.js — quy tắc chọn độ trễ khi deploy", () => {
    it("mặc định 48 giờ trên mọi mạng", () => {
      expect(PRODUCTION_DEFAULT).to.equal(48 * HOUR);
      for (const id of [31337, 11155111, 1, 8453]) expect(resolveInheritDelay(undefined, id)).to.equal(48 * HOUR);
      expect(resolveInheritDelay("", 1)).to.equal(48 * HOUR);
    });
    it("mạng thử nghiệm cho phép độ trễ demo (60 giây, 1 giờ)", () => {
      expect(resolveInheritDelay("60", 11155111)).to.equal(60);
      expect(resolveInheritDelay("3600", 84532)).to.equal(3600);
      expect(resolveInheritDelay("60", 31337)).to.equal(60);
    });
    it("mạng thật (mainnet, Base…) từ chối dưới 24 giờ — đúng lỗi V341-01 cảnh báo", () => {
      expect(() => resolveInheritDelay("60", 1)).to.throw(/24 giờ/);
      expect(() => resolveInheritDelay(String(DAY - 1), 8453)).to.throw(/24 giờ/);
      expect(resolveInheritDelay(String(DAY), 1)).to.equal(DAY);
    });
    it("giá trị sai định dạng hoặc ngoài khoảng của contract bị từ chối trước khi gửi giao dịch", () => {
      for (const bad of ["1h", "-60", "60.5", "abc"]) expect(() => resolveInheritDelay(bad, 31337)).to.throw();
      expect(() => resolveInheritDelay("59", 31337)).to.throw(/\[60/);
      expect(() => resolveInheritDelay(String(7 * DAY + 1), 31337)).to.throw(/\[60/);
    });
    it("humanDelay đọc được", () => {
      expect(humanDelay(60)).to.equal("1 phút");
      expect(humanDelay(3600)).to.equal("1 giờ");
      expect(humanDelay(48 * HOUR)).to.equal("2 ngày");
      expect(humanDelay(90)).to.equal("90 giây");
    });
  });
});
