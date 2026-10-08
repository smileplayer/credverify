const { expect } = require("chai");
const { ethers } = require("hardhat");
const { inherit, CR, time, INHERIT_DELAY } = require("./helpers");
const { buildDirectory } = require("../scripts/lib/directory");

// ---------------------------------------------------------------------------
//  Bộ test cho kiến trúc V2 — sổ đăng ký dùng chung.
//  Quy ước tên:
//    "BỊ CHẶN:"    — hành vi sai phải revert
//    "BẤT BIẾN:"   — thuộc tính không bao giờ được vi phạm
//    "CHỦ ĐÍCH:"   — hành vi dễ bị hiểu nhầm là lỗ hổng, ghim lại kèm lý do
// ---------------------------------------------------------------------------

const FILE_A = ethers.keccak256(ethers.toUtf8Bytes("chung-chi-cua-an.pdf"));
const FILE_B = ethers.keccak256(ethers.toUtf8Bytes("chung-chi-cua-binh.pdf"));

async function fixture() {
  const [credverify, centerX, centerY, hotKey2, alice, bob, stranger] = await ethers.getSigners();
  const F = await ethers.getContractFactory("CredentialRegistry");
  const reg = await F.deploy(INHERIT_DELAY);
  await reg.waitForDeployment();
  await reg.connect(credverify).addIssuer(centerX.address, "Trung tam dao tao X");
  await reg.connect(credverify).addIssuer(centerY.address, "Trung tam dao tao Y");
  return { reg, credverify, centerX, centerY, hotKey2, alice, bob, stranger };
}

const idOf = (issuer, hash) =>
  ethers.keccak256(ethers.solidityPacked(["address", "bytes32"], [issuer, hash]));

describe("CredentialRegistry (bộ test V2, cập nhật cho V3)", function () {

  // =========================================================================
  describe("1. Công nhận đơn vị phát hành", function () {

    it("owner công nhận được một trung tâm, kèm tên hiển thị", async () => {
      const { reg, credverify, stranger } = await fixture();
      await expect(reg.connect(credverify).addIssuer(stranger.address, "Trung tam Z"))
        .to.emit(reg, "IssuerAdded").withArgs(stranger.address, "Trung tam Z");
      expect(await reg.issuerStatus(stranger.address)).to.equal(1); // Active
      expect(await reg.issuerName(stranger.address)).to.equal("Trung tam Z");
      expect(await reg.activeIssuerCount()).to.equal(3);
    });

    it("BỊ CHẶN: người ngoài không công nhận được ai", async () => {
      const { reg, stranger, bob } = await fixture();
      await expect(reg.connect(stranger).addIssuer(bob.address, "Gia mao"))
        .to.be.revertedWithCustomError(CR, "NotOwner");
    });

    it("BỊ CHẶN: owner không tự cấp quyền phát hành cho chính địa chỉ owner", async () => {
      const { reg, credverify } = await fixture();
      await expect(reg.connect(credverify).addIssuer(credverify.address, "CredVerify"))
        .to.be.revertedWithCustomError(CR, "OwnerCannotBeIssuer");
    });

    it("BỊ CHẶN: tên rỗng", async () => {
      const { reg, credverify, stranger } = await fixture();
      await expect(reg.connect(credverify).addIssuer(stranger.address, ""))
        .to.be.revertedWithCustomError(CR, "EmptyName");
    });

    it("BỊ CHẶN: một địa chỉ đã dùng thì không công nhận lại được dưới tên khác", async () => {
      const { reg, credverify, centerX } = await fixture();
      await reg.connect(credverify).removeIssuer(centerX.address);
      await expect(reg.connect(credverify).addIssuer(centerX.address, "Ten khac hoan toan"))
        .to.be.revertedWithCustomError(CR, "AddressAlreadyUsed");
    });

    it("BẤT BIẾN: bật lại một khóa đã gỡ thì GIỮ NGUYÊN tên cũ", async () => {
      const { reg, credverify, centerX } = await fixture();
      await reg.connect(credverify).removeIssuer(centerX.address);
      expect(await reg.activeIssuerCount()).to.equal(1);
      await reg.connect(credverify).restoreIssuer(centerX.address);
      expect(await reg.issuerName(centerX.address)).to.equal("Trung tam dao tao X");
      expect(await reg.activeIssuerCount()).to.equal(2);
    });

    it("BỊ CHẶN: không bật lại được một khóa đã chuyển giao cho người kế nhiệm", async () => {
      const { reg, credverify, centerX, hotKey2 } = await fixture();
      await inherit(reg.connect(credverify), centerX.address, hotKey2.address);
      await expect(reg.connect(credverify).restoreIssuer(centerX.address))
        .to.be.revertedWithCustomError(CR, "IssuerWasInherited");
    });
  });

  describe("1a. Người không có quyền gọi hàm quản trị", function () {

    it("BỊ CHẶN: người ngoài không gỡ quyền được ai", async () => {
      const { reg, centerX, stranger } = await fixture();
      await expect(reg.connect(stranger).removeIssuer(centerX.address))
        .to.be.revertedWithCustomError(CR, "NotOwner");
    });

    it("BỊ CHẶN: người ngoài không bật lại được ai", async () => {
      const { reg, credverify, centerX, stranger } = await fixture();
      await reg.connect(credverify).removeIssuer(centerX.address);
      await expect(reg.connect(stranger).restoreIssuer(centerX.address))
        .to.be.revertedWithCustomError(CR, "NotOwner");
    });

    it("BỊ CHẶN: người ngoài không chuyển quyền owner được", async () => {
      const { reg, stranger, bob } = await fixture();
      await expect(reg.connect(stranger).transferOwnership(bob.address))
        .to.be.revertedWithCustomError(CR, "NotOwner");
    });

    it("BỊ CHẶN: công nhận địa chỉ 0 làm đơn vị phát hành", async () => {
      const { reg, credverify } = await fixture();
      await expect(reg.connect(credverify).addIssuer(ethers.ZeroAddress, "Trung tam ma"))
        .to.be.revertedWithCustomError(CR, "ZeroAddress");
    });

    it("BỊ CHẶN: gỡ quyền một địa chỉ vốn không đang hoạt động", async () => {
      const { reg, credverify, centerX } = await fixture();
      await reg.connect(credverify).removeIssuer(centerX.address);
      await expect(reg.connect(credverify).removeIssuer(centerX.address))
        .to.be.revertedWithCustomError(CR, "IssuerNotActive");
    });

    it("BỊ CHẶN: bật lại một đơn vị vốn đang hoạt động", async () => {
      const { reg, credverify, centerX } = await fixture();
      await expect(reg.connect(credverify).restoreIssuer(centerX.address))
        .to.be.revertedWithCustomError(CR, "IssuerNotDisabled");
    });

    it("BỊ CHẶN: chuyển giao danh tính sang địa chỉ 0", async () => {
      const { reg, credverify, centerX } = await fixture();
      await expect(reg.connect(credverify).proposeInherit(centerX.address, ethers.ZeroAddress, 0))
        .to.be.revertedWithCustomError(CR, "ZeroAddress");
    });

    it("BỊ CHẶN: chuyển giao danh tính sang chính ví owner", async () => {
      const { reg, credverify, centerX } = await fixture();

      await expect(reg.connect(credverify).proposeInherit(centerX.address, credverify.address, 0))
        .to.be.revertedWithCustomError(CR, "OwnerCannotBeIssuer");
    });
  });

  // =========================================================================
  describe("1b. Tên là duy nhất — chặn đường lạm quyền IM LẶNG", function () {

    it("BỊ CHẶN: hai ví khác nhau KHÔNG mang được cùng một tên", async () => {
      const { reg, credverify, stranger } = await fixture();
      await expect(reg.connect(credverify).addIssuer(stranger.address, "Trung tam dao tao X"))
        .to.be.revertedWithCustomError(CR, "NameTaken");
    });

    it("BẤT BIẾN: gỡ quyền một trung tâm KHÔNG trả tên đó lại cho người khác", async () => {
      const { reg, credverify, centerX, stranger } = await fixture();
      await reg.connect(credverify).removeIssuer(centerX.address);

      await expect(reg.connect(credverify).addIssuer(stranger.address, "Trung tam dao tao X"))
        .to.be.revertedWithCustomError(CR, "NameTaken");
      expect(await reg.issuerByName("Trung tam dao tao X")).to.equal(centerX.address);
    });

    it("chuyển giao thì TÊN ĐI THEO khóa mới, và vẫn chỉ một chủ", async () => {
      const { reg, credverify, centerX, hotKey2 } = await fixture();
      await inherit(reg.connect(credverify), centerX.address, hotKey2.address);
      expect(await reg.issuerByName("Trung tam dao tao X")).to.equal(hotKey2.address);
    });

    it("issuerByName() trả về địa chỉ 0 cho tên chưa ai đăng ký", async () => {
      const { reg } = await fixture();
      expect(await reg.issuerByName("Truong khong ton tai")).to.equal(ethers.ZeroAddress);
    });

    it("BẤT BIẾN: danh sách khả kiến không còn hai dòng trùng tên", async () => {
      const { reg, credverify, centerX, hotKey2 } = await fixture();
      await inherit(reg.connect(credverify), centerX.address, hotKey2.address);
      const names = (await buildDirectory(reg)).active.map((k) => k.name);
      expect(new Set(names).size).to.equal(names.length);
    });

    it("GIỚI HẠN ĐÃ BIẾT: tên khác chữ hoa/thường vẫn đăng ký được — so khớp theo byte (Kirin bị chặn)", async () => {
      const { reg, credverify, stranger, bob } = await fixture();
      // Khác chữ hoa/thường: contract thấy đây là hai chuỗi byte khác nhau.
      // (Hai khoảng trắng liền nhau bị chặn — NameNotCanonical.)
      await reg.connect(credverify).addIssuer(stranger.address, "Trung Tam dao tao X");
      // Khác chữ hoa/thường ở chỗ khác: vẫn là chuỗi byte khác.
      await reg.connect(credverify).addIssuer(bob.address, "Trung tam DAO tao X");
      expect((await buildDirectory(reg)).active).to.have.lengthOf(4);
      // Chữ Kirin (trông y hệt Latin) bị danh sách cho phép CHẶN trên chuỗi.
      const [, , , , , , , , , extra] = await ethers.getSigners();
      await expect(reg.connect(credverify).addIssuer(extra.address, "Trung tam d\u0430o tao X"))
        .to.be.revertedWithCustomError(reg, "NameNotCanonical");
      // Test này PASS để ghim một rủi ro còn lại, không phải để khẳng định đã vá.
      // Ràng buộc `nameHolder` chặn trùng tên Y HỆT, không chặn tên gần giống.
    });
  });


  describe("2. Cấp chứng chỉ", function () {

    it("HAPPY PATH: trung tâm cấp, bản ghi đúng, event đúng", async () => {
      const { reg, centerX, alice } = await fixture();
      const certId = idOf(centerX.address, FILE_A);
      await expect(reg.connect(centerX).issueCertificate(FILE_A, alice.address))
        .to.emit(reg, "CertificateIssued");
      const c = await reg.getCertificate(certId);
      expect(c.issuer).to.equal(centerX.address);
      expect(c.holder).to.equal(alice.address);
      expect(c.status).to.equal(1);   // Issued
      expect(c.revokedAt).to.equal(0);
    });

    it("certIdOf() trên chuỗi khớp với giá trị client tự tính", async () => {
      const { reg, centerX } = await fixture();
      expect(await reg.certIdOf(centerX.address, FILE_A)).to.equal(idOf(centerX.address, FILE_A));
    });

    it("BỊ CHẶN: ví không có quyền cấp", async () => {
      const { reg, stranger, alice } = await fixture();
      await expect(reg.connect(stranger).issueCertificate(FILE_A, alice.address))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
    });

    it("BỊ CHẶN: khóa đã bị gỡ quyền không cấp được nữa", async () => {
      const { reg, credverify, centerX, alice } = await fixture();
      await reg.connect(credverify).removeIssuer(centerX.address);
      await expect(reg.connect(centerX).issueCertificate(FILE_A, alice.address))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
    });

    it("BỊ CHẶN: owner KHÔNG cấp được chứng chỉ — không có đường nào dẫn tới", async () => {
      const { reg, credverify, alice } = await fixture();
      await expect(reg.connect(credverify).issueCertificate(FILE_A, alice.address))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
    });

    it("BỊ CHẶN: hash rỗng", async () => {
      const { reg, centerX, alice } = await fixture();
      await expect(reg.connect(centerX).issueCertificate(ethers.ZeroHash, alice.address))
        .to.be.revertedWithCustomError(CR, "EmptyCertHash");
    });

    it("BỊ CHẶN: học viên là địa chỉ 0", async () => {
      const { reg, centerX } = await fixture();
      await expect(reg.connect(centerX).issueCertificate(FILE_A, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(CR, "HolderZero");
    });

    it("BỊ CHẶN: cùng một issuer cấp trùng một tệp hai lần", async () => {
      const { reg, centerX, alice, bob } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await expect(reg.connect(centerX).issueCertificate(FILE_A, bob.address))
        .to.be.revertedWithCustomError(CR, "CertificateExists");
    });
  });

  describe("3. Không gian tên riêng trong sổ chung", function () {

    it("BẤT BIẾN: issuer bất lương KHÔNG khóa cửa được trung tâm thật bằng cách đăng ký trước", async () => {
      const { reg, centerX, centerY, alice, bob } = await fixture();
      // Y tính được hash tệp mà X sắp cấp, và đăng ký trước
      await reg.connect(centerY).issueCertificate(FILE_A, bob.address);
      // X vẫn cấp được bình thường — hai bản ghi độc lập
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);

      const byX = await reg.getCertificate(idOf(centerX.address, FILE_A));
      const byY = await reg.getCertificate(idOf(centerY.address, FILE_A));
      expect(byX.holder).to.equal(alice.address);
      expect(byY.holder).to.equal(bob.address);
      expect(byX.issuer).to.not.equal(byY.issuer);
    });

    it("BẤT BIẾN: issuer khác KHÔNG thu hồi được chứng chỉ của trung tâm thật", async () => {
      const { reg, centerX, centerY, alice } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await expect(reg.connect(centerY).revokeCertificate(idOf(centerX.address, FILE_A)))
        .to.be.revertedWithCustomError(CR, "NotIssuingKeyOrSuccessor");
    });

    it("verifier chọn ĐÚNG đơn vị ghi trên chứng chỉ thì thấy đúng bản ghi của đơn vị đó", async () => {
      const { reg, centerX, centerY, alice, bob } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await reg.connect(centerY).issueCertificate(FILE_A, bob.address);
      const rx = await reg.verifyCertificate(centerX.address, FILE_A);
      const ry = await reg.verifyCertificate(centerY.address, FILE_A);
      expect(rx.holder).to.equal(alice.address);
      expect(ry.holder).to.equal(bob.address);
      expect(rx.issuerDisplayName).to.equal("Trung tam dao tao X");
    });

    it("CHỦ ĐÍCH: findByHash đã bị gỡ — không còn hàm view nào duyệt toàn bộ danh bạ", async () => {
      const { reg } = await fixture();
      for (const fn of ["findByHash", "listActiveIssuers", "knownIssuers"]) {
        expect(reg.interface.getFunction(fn)).to.equal(null);
      }
    });
  });

  // =========================================================================
  describe("4. Thu hồi", function () {

    it("HAPPY PATH: đúng khóa đã cấp thì thu hồi được, có dấu thời gian", async () => {
      const { reg, centerX, alice } = await fixture();
      const certId = idOf(centerX.address, FILE_A);
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await expect(reg.connect(centerX).revokeCertificate(certId))
        .to.emit(reg, "CertificateRevoked");
      const c = await reg.getCertificate(certId);
      expect(c.status).to.equal(2);
      expect(c.revokedAt).to.be.greaterThan(0);
    });

    it("BẤT BIẾN: thu hồi là VĨNH VIỄN — không cấp lại được cùng tệp đó", async () => {
      const { reg, centerX, alice, bob } = await fixture();
      const certId = idOf(centerX.address, FILE_A);
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await reg.connect(centerX).revokeCertificate(certId);
      // Đây là điểm chống "nói hai lời": tra tháng 3 thấy Revoked thì tháng 8 vẫn Revoked.
      await expect(reg.connect(centerX).issueCertificate(FILE_A, bob.address))
        .to.be.revertedWithCustomError(CR, "CertificateExists");
      expect((await reg.getCertificate(certId)).status).to.equal(2);
    });

    it("BỊ CHẶN: thu hồi hai lần", async () => {
      const { reg, centerX, alice } = await fixture();
      const certId = idOf(centerX.address, FILE_A);
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await reg.connect(centerX).revokeCertificate(certId);
      await expect(reg.connect(centerX).revokeCertificate(certId))
        .to.be.revertedWithCustomError(CR, "NotRevocable");
    });

    it("BỊ CHẶN: thu hồi một chứng chỉ chưa từng tồn tại", async () => {
      const { reg, centerX } = await fixture();
      await expect(reg.connect(centerX).revokeCertificate(idOf(centerX.address, FILE_B)))
        .to.be.revertedWithCustomError(CR, "NotRevocable");
    });

    it("BỊ CHẶN: owner KHÔNG thu hồi được — quyền này không thuộc về đơn vị vận hành", async () => {
      const { reg, credverify, centerX, alice } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await expect(reg.connect(credverify).revokeCertificate(idOf(centerX.address, FILE_A)))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
    });

    it("BỊ CHẶN: người lạ không thu hồi được", async () => {
      const { reg, centerX, alice, stranger } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await expect(reg.connect(stranger).revokeCertificate(idOf(centerX.address, FILE_A)))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
    });

    it("BỊ CHẶN: khóa ĐÃ BỊ GỠ QUYỀN mất luôn quyền thu hồi", async () => {
      const { reg, credverify, centerX, alice } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await reg.connect(credverify).removeIssuer(centerX.address);
      // Trong V1 đây là chỗ một khóa đã lộ vẫn phá hoại được.
      await expect(reg.connect(centerX).revokeCertificate(idOf(centerX.address, FILE_A)))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
    });
  });

  // =========================================================================
  describe("5. Xoay khóa khi bị lộ", function () {

    it("khóa kế nhiệm thu hồi được chứng chỉ do khóa cũ đã cấp", async () => {
      const { reg, credverify, centerX, hotKey2, alice } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await inherit(reg.connect(credverify), centerX.address, hotKey2.address);
      await reg.connect(hotKey2).revokeCertificate(idOf(centerX.address, FILE_A));
      expect((await reg.getCertificate(idOf(centerX.address, FILE_A))).status).to.equal(2);
    });

    it("chuyển giao chép TÊN sang khóa mới — trung tâm không mất danh tính", async () => {
      const { reg, credverify, centerX, hotKey2 } = await fixture();
      await inherit(reg.connect(credverify), centerX.address, hotKey2.address);
      expect(await reg.issuerName(hotKey2.address)).to.equal("Trung tam dao tao X");
      expect(await reg.issuerStatus(centerX.address)).to.equal(2); // Disabled
      expect(await reg.issuerStatus(hotKey2.address)).to.equal(1); // Active
      expect(await reg.activeIssuerCount()).to.equal(2);           // khong doi
    });

    it("BỊ CHẶN: khóa kế nhiệm ĐÃ BỊ GỠ cũng mất quyền thu hồi", async () => {
      const { reg, credverify, centerX, hotKey2, alice } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await inherit(reg.connect(credverify), centerX.address, hotKey2.address);
      await reg.connect(credverify).removeIssuer(hotKey2.address);
      // Cửa hậu của V1: nhánh kế nhiệm thiếu điều kiện "đang hoạt động".
      await expect(reg.connect(hotKey2).revokeCertificate(idOf(centerX.address, FILE_A)))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
    });

    it("BỊ CHẶN: chỉ owner chuyển giao được danh tính issuer", async () => {
      const { reg, centerX, hotKey2 } = await fixture();
      await expect(reg.connect(centerX).proposeInherit(centerX.address, hotKey2.address, 0))
        .to.be.revertedWithCustomError(CR, "NotOwner");
    });

    it("BỊ CHẶN: không chuyển giao sang một địa chỉ đã dùng làm issuer", async () => {
      const { reg, credverify, centerX, centerY } = await fixture();
      await expect(reg.connect(credverify).proposeInherit(centerX.address, centerY.address, 0))
        .to.be.revertedWithCustomError(CR, "AddressAlreadyUsed");
    });

    it("chuỗi kế nhiệm hai bậc: X -> K2 -> K3, K3 vẫn dọn được hậu quả của X", async () => {
      const { reg, credverify, centerX, hotKey2, alice, stranger } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await inherit(reg.connect(credverify), centerX.address, hotKey2.address);
      await inherit(reg.connect(credverify), hotKey2.address, stranger.address);
      await reg.connect(stranger).revokeCertificate(idOf(centerX.address, FILE_A));
      expect((await reg.getCertificate(idOf(centerX.address, FILE_A))).status).to.equal(2);
    });

    it("CHỦ ĐÍCH: kế nhiệm chỉ chảy XUÔI — khóa cũ không thu hồi hộ khóa mới", async () => {
      const { reg, credverify, centerX, hotKey2, alice } = await fixture();
      await inherit(reg.connect(credverify), centerX.address, hotKey2.address);
      await reg.connect(hotKey2).issueCertificate(FILE_B, alice.address);
      await reg.connect(credverify).restoreIssuer(centerX.address).catch(() => {});
      // centerX đã Disabled và không restore được (đã chuyển giao) -> không có đường nào
      await expect(reg.connect(centerX).revokeCertificate(idOf(hotKey2.address, FILE_B)))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
    });

    it("KỊCH BẢN ĐẦU-CUỐI: lộ khóa -> chuyển giao -> khóa cũ tê liệt -> khóa mới dọn hậu quả", async () => {
      const { reg, credverify, centerX, hotKey2, alice, bob } = await fixture();
      // 1. Hoạt động bình thường
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      // 2. Khóa bị lộ, kẻ tấn công cấp bậy một chứng chỉ
      await reg.connect(centerX).issueCertificate(FILE_B, bob.address);
      // 3. Phát hiện -> owner chuyển giao danh tính sang khóa lạnh mới
      await inherit(reg.connect(credverify), centerX.address, hotKey2.address);
      // 4. Khóa lộ tê liệt hoàn toàn: không cấp được, không thu hồi được
      await expect(reg.connect(centerX).issueCertificate(
        ethers.keccak256(ethers.toUtf8Bytes("them-mot-cai-nua")), bob.address
      )).to.be.revertedWithCustomError(CR, "NotActiveIssuer");
      await expect(reg.connect(centerX).revokeCertificate(idOf(centerX.address, FILE_A)))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
      // 5. Khóa mới dọn chứng chỉ bậy, GIỮ chứng chỉ hợp lệ
      await reg.connect(hotKey2).revokeCertificate(idOf(centerX.address, FILE_B));
      expect((await reg.getCertificate(idOf(centerX.address, FILE_B))).status).to.equal(2);
      expect((await reg.getCertificate(idOf(centerX.address, FILE_A))).status).to.equal(1);
    });
  });

  // =========================================================================
  describe("6. Xác minh", function () {

    it("tệp đúng, chưa thu hồi -> hợp lệ, kèm tên đơn vị cấp", async () => {
      const { reg, centerX, alice } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      const r = await reg.verifyCertificate(centerX.address, FILE_A);
      expect(r.valid).to.equal(true);
      expect(r.holder).to.equal(alice.address);
      expect(r.issuerDisplayName).to.equal("Trung tam dao tao X");
      expect(r.issuerState).to.equal(1);
    });

    it("tệp bị sửa một byte -> hash lệch -> KHÔNG hợp lệ", async () => {
      const { reg, centerX, alice } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      const r = await reg.verifyCertificate(centerX.address, FILE_B);
      expect(r.valid).to.equal(false);
      expect(r.status).to.equal(0); // None
    });

    it("đã thu hồi -> không hợp lệ, nhưng vẫn trả về MỐC THỜI GIAN thu hồi", async () => {
      const { reg, centerX, alice } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await reg.connect(centerX).revokeCertificate(idOf(centerX.address, FILE_A));
      const r = await reg.verifyCertificate(centerX.address, FILE_A);
      expect(r.valid).to.equal(false);
      expect(r.status).to.equal(2);
      // Trả lời được câu "lúc tuyển tháng 3, bằng này còn hiệu lực không?"
      expect(r.revokedAt).to.be.greaterThan(0);
      expect(r.issuedAt).to.be.greaterThan(0);
    });

    it("CHỦ ĐÍCH: xác minh KHÔNG bị chặn khi đơn vị cấp đã bị gỡ quyền", async () => {
      const { reg, credverify, centerX, alice } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await reg.connect(credverify).removeIssuer(centerX.address);
      const r = await reg.verifyCertificate(centerX.address, FILE_A);
      // Chứng chỉ đã cấp hợp lệ vẫn hợp lệ: owner không có quyền viết lại quá khứ.
      // Nhưng verifier NHÌN THẤY đơn vị đó nay đã bị vô hiệu, và tự quyết định.
      expect(r.valid).to.equal(true);
      expect(r.issuerState).to.equal(2); // Disabled
    });

    it("BẤT BIẾN: người lạ không cần ví, không cần quyền gì để xác minh", async () => {
      const { reg, centerX, alice, stranger } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      const r = await reg.connect(stranger).verifyCertificate(centerX.address, FILE_A);
      expect(r.valid).to.equal(true);
    });
  });

  // =========================================================================
  describe("7. Khả kiến — issuer thêm lén không còn vô hình", function () {

    it("danh bạ dựng từ event trả về địa chỉ KÈM tên", async () => {
      const { reg, centerX, centerY } = await fixture();
      const d = await buildDirectory(reg);
      expect(d.active.map((k) => k.address)).to.have.members([centerX.address, centerY.address]);
      expect(d.active.map((k) => k.name)).to.have.members(["Trung tam dao tao X", "Trung tam dao tao Y"]);
    });

    it("owner thêm một issuer lén thì nó HIỆN NGAY trong danh bạ (event IssuerAdded vĩnh viễn)", async () => {
      const { reg, credverify, stranger } = await fixture();
      await reg.connect(credverify).addIssuer(stranger.address, "Trung tam ma");
      const d = await buildDirectory(reg);
      expect(d.active).to.have.lengthOf(3);
      expect(d.active.map((k) => k.name)).to.include("Trung tam ma");
    });

    it("danh bạ từ event giữ cả khóa đã gỡ và chuỗi kế nhiệm, phục vụ kiểm toán", async () => {
      const { reg, credverify, centerX, centerY, hotKey2 } = await fixture();
      await reg.connect(credverify).removeIssuer(centerY.address);
      await inherit(reg.connect(credverify), centerX.address, hotKey2.address);
      const d = await buildDirectory(reg);
      expect(d.byAddress(centerY.address).status).to.equal(2);
      expect(d.byAddress(centerX.address).status).to.equal(2);
      expect(d.byAddress(centerX.address).successor).to.equal(hotKey2.address);
      expect(d.byAddress(hotKey2.address).name).to.equal("Trung tam dao tao X");
      expect(d.active.map((k) => k.address)).to.deep.equal([hotKey2.address]);
    });

    it("BẤT BIẾN: số đơn vị Active dựng từ event KHỚP activeIssuerCount trên chuỗi, qua mọi thao tác quản trị", async () => {
      const { reg, credverify, centerX, centerY, hotKey2, stranger, bob } = await fixture();
      const check = async () =>
        expect((await buildDirectory(reg)).active.length).to.equal(Number(await reg.activeIssuerCount()));
      await check();
      await reg.connect(credverify).addIssuer(stranger.address, "Z"); await check();
      await reg.connect(credverify).removeIssuer(centerY.address); await check();
      await reg.connect(credverify).restoreIssuer(centerY.address); await check();
      await inherit(reg.connect(credverify), centerX.address, hotKey2.address); await check();
      await reg.connect(credverify).removeIssuer(stranger.address); await check();
      await inherit(reg.connect(credverify), stranger.address, bob.address); await check();
    });

    it("governance() trả về toàn bộ trạng thái quản trị trong một lời gọi", async () => {
      const { reg, credverify } = await fixture();
      const g = await reg.governance();
      expect(g.owner_).to.equal(credverify.address);
      expect(g.pendingOwner_).to.equal(ethers.ZeroAddress);
      expect(g.activeIssuerCount_).to.equal(2);
    });
  });

  // =========================================================================
  describe("8. Chuyển quyền owner", function () {

    it("hai bước: đề nghị rồi bên nhận phải chấp nhận", async () => {
      const { reg, credverify, stranger } = await fixture();
      await reg.connect(credverify).transferOwnership(stranger.address);
      expect(await reg.owner()).to.equal(credverify.address); // chua doi
      await reg.connect(stranger).acceptOwnership();
      expect(await reg.owner()).to.equal(stranger.address);
      expect(await reg.pendingOwner()).to.equal(ethers.ZeroAddress);
    });

    it("BỊ CHẶN: người không được chỉ định không nhận được quyền", async () => {
      const { reg, credverify, stranger, bob } = await fixture();
      await reg.connect(credverify).transferOwnership(stranger.address);
      await expect(reg.connect(bob).acceptOwnership())
        .to.be.revertedWithCustomError(CR, "NotPendingOwner");
    });

    it("BỊ CHẶN: chuyển quyền cho địa chỉ 0", async () => {
      const { reg, credverify } = await fixture();
      await expect(reg.connect(credverify).transferOwnership(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(CR, "ZeroAddress");
    });
  });

  // =========================================================================
  describe("9. Ranh giới quyền của đơn vị vận hành (đề bài mục 3 & 5.2)", function () {

    it("BẤT BIẾN: owner gỡ quyền một trung tâm nhưng KHÔNG làm mất hiệu lực chứng chỉ đã cấp", async () => {
      const { reg, credverify, centerX, alice } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await reg.connect(credverify).removeIssuer(centerX.address);
      expect((await reg.getCertificate(idOf(centerX.address, FILE_A))).status).to.equal(1);
    });

    it("BẤT BIẾN: owner không có MỘT hàm nào ghi vào `certificates`", async () => {
      const { reg } = await fixture();
      const writers = reg.interface.fragments
        .filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure")
        .map((f) => f.name);
      // Toàn bộ hàm ghi của contract, liệt kê tường minh để test vỡ khi có ai thêm hàm mới.
      expect(writers.sort()).to.deep.equal([
        "acceptOwnership", "addIssuer", "cancelInherit", "cancelOwnershipTransfer",
        "executeInherit", "issueCertificate", "proposeInherit",
        "publishBatch", "removeIssuer", "restoreIssuer", "revokeBatch",
        "revokeCertificate", "revokeLeaf", "transferOwnership",
      ]);
      // Trong số đó, năm hàm chạm vào `certificates`/`batches`/`leafRevocation`
      // (issueCertificate, revokeCertificate, publishBatch, revokeLeaf, revokeBatch)
      // đều KHÔNG phải onlyOwner — xem test/CredentialRegistryV3.test.js mục "owner không cấp/thu hồi lô".
    });

    it("RỦI RO CÒN LẠI: owner cướp được danh tính một trung tâm đang hoạt động", async () => {
      const { reg, credverify, centerX, hotKey2, alice } = await fixture();
      // hotKey2 ở đây đóng vai một ví do CHÍNH OWNER kiểm soát.
      await expect(inherit(reg.connect(credverify), centerX.address, hotKey2.address))
        .to.emit(reg, "IssuerInherited").withArgs(centerX.address, hotKey2.address, "Trung tam dao tao X");
      await reg.connect(hotKey2).issueCertificate(FILE_A, alice.address);
      const r = await reg.verifyCertificate(hotKey2.address, FILE_A);
      expect(r.valid).to.equal(true);
      expect(r.issuerDisplayName).to.equal("Trung tam dao tao X");
      // Đây là ranh giới tin cậy đã công bố, được thu hẹp: chuyển giao phải qua đề xuất
      // CÔNG KHAI (event InheritProposed) và chờ INHERIT_DELAY = 48 giờ, đủ để trung tâm thật
      // thấy và phản đối; owner nên là ví đa chữ ký (Safe 2-trên-3) khi triển khai thật.
    });
  });

  // =========================================================================
  describe("10. Dọn dẹp sau sự cố — THỨ TỰ THAO TÁC QUYẾT ĐỊNH KẾT QUẢ", function () {

    // Bối cảnh: một khóa cấp bị lộ, hoặc owner lạm quyền thêm một issuer bất lương.
    // Kẻ tấn công đã kịp cấp chứng chỉ giả. Câu hỏi: dọn thế nào?

    async function coSuCo() {
      const f = await fixture();
      await f.reg.connect(f.centerX).issueCertificate(FILE_A, f.alice.address);
      await f.reg.connect(f.centerX).issueCertificate(FILE_B, f.bob.address);
      return f;
    }

    it("QUY TRÌNH ĐÚNG: chuyển giao (propose→execute) khi khóa xấu CÒN Active -> khóa dọn dẹp thu hồi được", async () => {
      const { reg, credverify, centerX, hotKey2 } = await coSuCo();
      await inherit(reg.connect(credverify), centerX.address, hotKey2.address);
      await reg.connect(hotKey2).revokeCertificate(idOf(centerX.address, FILE_A));
      await reg.connect(hotKey2).revokeCertificate(idOf(centerX.address, FILE_B));
      expect((await reg.getCertificate(idOf(centerX.address, FILE_A))).status).to.equal(2);
      expect((await reg.getCertificate(idOf(centerX.address, FILE_B))).status).to.equal(2);
    });

    it("V3 — HẾT BẪY VẬN HÀNH: removeIssuer TRƯỚC rồi chuyển giao (propose→execute) vẫn chạy, khóa mới dọn được", async () => {
      const { reg, credverify, centerX, hotKey2 } = await coSuCo();
      // Phản xạ tự nhiên khi phát hiện sự cố là "chặn máu" bằng removeIssuer.
      // V2: nước đi này đóng cánh cửa chuyển giao. V3: không còn.
      await reg.connect(credverify).removeIssuer(centerX.address);
      await inherit(reg.connect(credverify), centerX.address, hotKey2.address);
      await reg.connect(hotKey2).revokeCertificate(idOf(centerX.address, FILE_A));
      expect((await reg.getCertificate(idOf(centerX.address, FILE_A))).status).to.equal(2);
    });

    it("V3 — KHÔNG CẦN restoreIssuer: khóa lộ KHÔNG BAO GIỜ Active trở lại trong quá trình dọn", async () => {
      const { reg, credverify, centerX, hotKey2 } = await coSuCo();
      // V2 buộc owner restoreIssuer(khóa lộ) rồi mới inheritIssuer được — giữa hai giao
      // dịch đó kẻ giữ khóa lộ có thể chen vào thu hồi VĨNH VIỄN chứng chỉ thật.
      await reg.connect(credverify).removeIssuer(centerX.address);
      await expect(reg.connect(centerX).revokeCertificate(idOf(centerX.address, FILE_A)))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
      await inherit(reg.connect(credverify), centerX.address, hotKey2.address);
      await expect(reg.connect(centerX).revokeCertificate(idOf(centerX.address, FILE_A)))
        .to.be.revertedWithCustomError(CR, "NotActiveIssuer");
      expect(await reg.issuerStatus(centerX.address)).to.equal(2);
    });

    it("R4 ĐÃ ĐÓNG: sau 9 lần chuyển giao, khóa mới nhất vẫn thu hồi được chứng chỉ đời đầu", async () => {
      const { reg, credverify, centerX, alice } = await fixture();
      const all = await ethers.getSigners();
      const chain = all.slice(6, 16);            // 10 ví dự phòng, đủ cho 9 lần chuyển giao
      expect(chain.length).to.be.greaterThanOrEqual(9);

      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      const certId = idOf(centerX.address, FILE_A);

      let cur = centerX;
      for (let doi = 1; doi <= 8; doi++) {
        await inherit(reg.connect(credverify), cur.address, chain[doi - 1].address);
        cur = chain[doi - 1];
      }
      // Đời thứ 8 vẫn với tới được khóa gốc.
      await reg.connect(cur).revokeCertificate.staticCall(certId);

      // V2: đời thứ 9 thì không (MAX_INHERIT_HOPS = 8). V3: quyền thu hồi kiểm bằng
      // `identityOf` (O(1)), không còn vòng lặp nên không còn trần.
      await inherit(reg.connect(credverify), cur.address, chain[8].address);
      expect(await reg.currentKeyOf(centerX.address)).to.equal(chain[8].address);
      await reg.connect(chain[8]).revokeCertificate(certId);
      expect((await reg.getCertificate(certId)).status).to.equal(2);
      // Owner vẫn không thu hồi được.
      await expect(reg.connect(credverify).revokeCertificate(certId)).to.be.reverted;
    });

    it("GIỚI HẠN (đường cấp lẻ): thu hồi TỪNG chứng chỉ một — cấp theo lô thì có revokeBatch", async () => {
      const { reg, credverify, centerX, hotKey2 } = await coSuCo();
      await inherit(reg.connect(credverify), centerX.address, hotKey2.address);
      await reg.connect(hotKey2).revokeCertificate(idOf(centerX.address, FILE_A));
      expect((await reg.getCertificate(idOf(centerX.address, FILE_B))).status).to.equal(1);
      // N chứng chỉ giả = N giao dịch. Đây mới là giới hạn thật của cơ chế dọn dẹp,
      // và nó là giới hạn về CHI PHÍ VẬN HÀNH, không phải ngõ cụt về khả năng.
    });
  });
});
