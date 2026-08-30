const { expect } = require("chai");
const { ethers } = require("hardhat");

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
  const reg = await F.deploy();
  await reg.waitForDeployment();
  await reg.connect(credverify).addIssuer(centerX.address, "Trung tam dao tao X");
  await reg.connect(credverify).addIssuer(centerY.address, "Trung tam dao tao Y");
  return { reg, credverify, centerX, centerY, hotKey2, alice, bob, stranger };
}

const idOf = (issuer, hash) =>
  ethers.keccak256(ethers.solidityPacked(["address", "bytes32"], [issuer, hash]));

describe("CredentialRegistry V2", function () {

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
        .to.be.revertedWith("CredentialRegistry: caller is not owner");
    });

    it("BỊ CHẶN: owner không tự cấp quyền phát hành cho chính địa chỉ owner", async () => {
      const { reg, credverify } = await fixture();
      await expect(reg.connect(credverify).addIssuer(credverify.address, "CredVerify"))
        .to.be.revertedWith("CredentialRegistry: owner cannot be an issuer");
    });

    it("BỊ CHẶN: tên rỗng", async () => {
      const { reg, credverify, stranger } = await fixture();
      await expect(reg.connect(credverify).addIssuer(stranger.address, ""))
        .to.be.revertedWith("CredentialRegistry: empty name");
    });

    it("BỊ CHẶN: một địa chỉ đã dùng thì không công nhận lại được dưới tên khác", async () => {
      const { reg, credverify, centerX } = await fixture();
      await reg.connect(credverify).removeIssuer(centerX.address);
      await expect(reg.connect(credverify).addIssuer(centerX.address, "Ten khac hoan toan"))
        .to.be.revertedWith("CredentialRegistry: address already used as issuer");
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
      await reg.connect(credverify).inheritIssuer(centerX.address, hotKey2.address);
      await expect(reg.connect(credverify).restoreIssuer(centerX.address))
        .to.be.revertedWith("CredentialRegistry: issuer was inherited, cannot restore");
    });
  });

  describe("1a. Người không có quyền gọi hàm quản trị", function () {

    it("BỊ CHẶN: người ngoài không gỡ quyền được ai", async () => {
      const { reg, centerX, stranger } = await fixture();
      await expect(reg.connect(stranger).removeIssuer(centerX.address))
        .to.be.revertedWith("CredentialRegistry: caller is not owner");
    });

    it("BỊ CHẶN: người ngoài không bật lại được ai", async () => {
      const { reg, credverify, centerX, stranger } = await fixture();
      await reg.connect(credverify).removeIssuer(centerX.address);
      await expect(reg.connect(stranger).restoreIssuer(centerX.address))
        .to.be.revertedWith("CredentialRegistry: caller is not owner");
    });

    it("BỊ CHẶN: người ngoài không chuyển quyền owner được", async () => {
      const { reg, stranger, bob } = await fixture();
      await expect(reg.connect(stranger).transferOwnership(bob.address))
        .to.be.revertedWith("CredentialRegistry: caller is not owner");
    });

    it("BỊ CHẶN: công nhận địa chỉ 0 làm đơn vị phát hành", async () => {
      const { reg, credverify } = await fixture();
      await expect(reg.connect(credverify).addIssuer(ethers.ZeroAddress, "Trung tam ma"))
        .to.be.revertedWith("CredentialRegistry: zero address");
    });

    it("BỊ CHẶN: gỡ quyền một địa chỉ vốn không đang hoạt động", async () => {
      const { reg, credverify, centerX } = await fixture();
      await reg.connect(credverify).removeIssuer(centerX.address);
      await expect(reg.connect(credverify).removeIssuer(centerX.address))
        .to.be.revertedWith("CredentialRegistry: issuer is not active");
    });

    it("BỊ CHẶN: bật lại một đơn vị vốn đang hoạt động", async () => {
      const { reg, credverify, centerX } = await fixture();
      await expect(reg.connect(credverify).restoreIssuer(centerX.address))
        .to.be.revertedWith("CredentialRegistry: issuer is not disabled");
    });

    it("BỊ CHẶN: chuyển giao danh tính sang địa chỉ 0", async () => {
      const { reg, credverify, centerX } = await fixture();
      await expect(reg.connect(credverify).inheritIssuer(centerX.address, ethers.ZeroAddress))
        .to.be.revertedWith("CredentialRegistry: zero address");
    });

    it("BỊ CHẶN: chuyển giao danh tính sang chính ví owner", async () => {
      const { reg, credverify, centerX } = await fixture();

      await expect(reg.connect(credverify).inheritIssuer(centerX.address, credverify.address))
        .to.be.revertedWith("CredentialRegistry: owner cannot be an issuer");
    });
  });

  // =========================================================================
  describe("1b. Tên là duy nhất — chặn đường lạm quyền IM LẶNG", function () {

    it("BỊ CHẶN: hai ví khác nhau KHÔNG mang được cùng một tên", async () => {
      const { reg, credverify, stranger } = await fixture();
      await expect(reg.connect(credverify).addIssuer(stranger.address, "Trung tam dao tao X"))
        .to.be.revertedWith("CredentialRegistry: name already taken");
    });

    it("BẤT BIẾN: gỡ quyền một trung tâm KHÔNG trả tên đó lại cho người khác", async () => {
      const { reg, credverify, centerX, stranger } = await fixture();
      await reg.connect(credverify).removeIssuer(centerX.address);

      await expect(reg.connect(credverify).addIssuer(stranger.address, "Trung tam dao tao X"))
        .to.be.revertedWith("CredentialRegistry: name already taken");
      expect(await reg.issuerByName("Trung tam dao tao X")).to.equal(centerX.address);
    });

    it("chuyển giao thì TÊN ĐI THEO khóa mới, và vẫn chỉ một chủ", async () => {
      const { reg, credverify, centerX, hotKey2 } = await fixture();
      await reg.connect(credverify).inheritIssuer(centerX.address, hotKey2.address);
      expect(await reg.issuerByName("Trung tam dao tao X")).to.equal(hotKey2.address);
    });

    it("issuerByName() trả về địa chỉ 0 cho tên chưa ai đăng ký", async () => {
      const { reg } = await fixture();
      expect(await reg.issuerByName("Truong khong ton tai")).to.equal(ethers.ZeroAddress);
    });

    it("BẤT BIẾN: danh sách khả kiến không còn hai dòng trùng tên", async () => {
      const { reg } = await fixture();
      const [, names] = await reg.listActiveIssuers();
      expect(new Set(names).size).to.equal(names.length);
    });

    it("GIỚI HẠN ĐÃ BIẾT: tên GẦN GIỐNG vẫn đăng ký được — so khớp theo byte", async () => {
      const { reg, credverify, stranger, bob } = await fixture();
      // Bỏ dấu: contract thấy đây là hai chuỗi byte khác nhau.
      await reg.connect(credverify).addIssuer(stranger.address, "Trung tam dao tao  X");
      // Chữ 'A' Kirin (U+0410) trông y hệt 'A' Latin trên màn hình.
      await reg.connect(credverify).addIssuer(bob.address, "Trung tam dаo tao X");
      const [, names] = await reg.listActiveIssuers();
      expect(names).to.have.lengthOf(4);
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
        .to.be.revertedWith("CredentialRegistry: caller is not an active issuer");
    });

    it("BỊ CHẶN: khóa đã bị gỡ quyền không cấp được nữa", async () => {
      const { reg, credverify, centerX, alice } = await fixture();
      await reg.connect(credverify).removeIssuer(centerX.address);
      await expect(reg.connect(centerX).issueCertificate(FILE_A, alice.address))
        .to.be.revertedWith("CredentialRegistry: caller is not an active issuer");
    });

    it("BỊ CHẶN: owner KHÔNG cấp được chứng chỉ — không có đường nào dẫn tới", async () => {
      const { reg, credverify, alice } = await fixture();
      await expect(reg.connect(credverify).issueCertificate(FILE_A, alice.address))
        .to.be.revertedWith("CredentialRegistry: caller is not an active issuer");
    });

    it("BỊ CHẶN: hash rỗng", async () => {
      const { reg, centerX, alice } = await fixture();
      await expect(reg.connect(centerX).issueCertificate(ethers.ZeroHash, alice.address))
        .to.be.revertedWith("CredentialRegistry: empty certHash");
    });

    it("BỊ CHẶN: học viên là địa chỉ 0", async () => {
      const { reg, centerX } = await fixture();
      await expect(reg.connect(centerX).issueCertificate(FILE_A, ethers.ZeroAddress))
        .to.be.revertedWith("CredentialRegistry: holder is zero address");
    });

    it("BỊ CHẶN: cùng một issuer cấp trùng một tệp hai lần", async () => {
      const { reg, centerX, alice, bob } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await expect(reg.connect(centerX).issueCertificate(FILE_A, bob.address))
        .to.be.revertedWith("CredentialRegistry: certificate already exists for this issuer and file");
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
        .to.be.revertedWith("CredentialRegistry: not the issuing key or its successor");
    });

    it("findByHash() cho verifier thấy CẢ HAI bản ghi và ai đã cấp", async () => {
      const { reg, centerX, centerY, alice, bob } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await reg.connect(centerY).issueCertificate(FILE_A, bob.address);
      const [issuers, ids, statuses] = await reg.findByHash(FILE_A);
      expect(issuers).to.have.lengthOf(2);
      expect(issuers).to.include(centerX.address);
      expect(issuers).to.include(centerY.address);
      expect(statuses.every((s) => s === 1n)).to.equal(true);
      expect(ids[0]).to.not.equal(ids[1]);
    });

    it("findByHash() trả về rỗng cho một tệp chưa từng đăng ký", async () => {
      const { reg } = await fixture();
      const [issuers] = await reg.findByHash(FILE_B);
      expect(issuers).to.have.lengthOf(0);
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
        .to.be.revertedWith("CredentialRegistry: certificate already exists for this issuer and file");
      expect((await reg.getCertificate(certId)).status).to.equal(2);
    });

    it("BỊ CHẶN: thu hồi hai lần", async () => {
      const { reg, centerX, alice } = await fixture();
      const certId = idOf(centerX.address, FILE_A);
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await reg.connect(centerX).revokeCertificate(certId);
      await expect(reg.connect(centerX).revokeCertificate(certId))
        .to.be.revertedWith("CredentialRegistry: certificate not in Issued state");
    });

    it("BỊ CHẶN: thu hồi một chứng chỉ chưa từng tồn tại", async () => {
      const { reg, centerX } = await fixture();
      await expect(reg.connect(centerX).revokeCertificate(idOf(centerX.address, FILE_B)))
        .to.be.revertedWith("CredentialRegistry: certificate not in Issued state");
    });

    it("BỊ CHẶN: owner KHÔNG thu hồi được — quyền này không thuộc về đơn vị vận hành", async () => {
      const { reg, credverify, centerX, alice } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await expect(reg.connect(credverify).revokeCertificate(idOf(centerX.address, FILE_A)))
        .to.be.revertedWith("CredentialRegistry: caller is not an active issuer");
    });

    it("BỊ CHẶN: người lạ không thu hồi được", async () => {
      const { reg, centerX, alice, stranger } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await expect(reg.connect(stranger).revokeCertificate(idOf(centerX.address, FILE_A)))
        .to.be.revertedWith("CredentialRegistry: caller is not an active issuer");
    });

    it("BỊ CHẶN: khóa ĐÃ BỊ GỠ QUYỀN mất luôn quyền thu hồi", async () => {
      const { reg, credverify, centerX, alice } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await reg.connect(credverify).removeIssuer(centerX.address);
      // Trong V1 đây là chỗ một khóa đã lộ vẫn phá hoại được.
      await expect(reg.connect(centerX).revokeCertificate(idOf(centerX.address, FILE_A)))
        .to.be.revertedWith("CredentialRegistry: caller is not an active issuer");
    });
  });

  // =========================================================================
  describe("5. Xoay khóa khi bị lộ", function () {

    it("khóa kế nhiệm thu hồi được chứng chỉ do khóa cũ đã cấp", async () => {
      const { reg, credverify, centerX, hotKey2, alice } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await reg.connect(credverify).inheritIssuer(centerX.address, hotKey2.address);
      await reg.connect(hotKey2).revokeCertificate(idOf(centerX.address, FILE_A));
      expect((await reg.getCertificate(idOf(centerX.address, FILE_A))).status).to.equal(2);
    });

    it("chuyển giao chép TÊN sang khóa mới — trung tâm không mất danh tính", async () => {
      const { reg, credverify, centerX, hotKey2 } = await fixture();
      await reg.connect(credverify).inheritIssuer(centerX.address, hotKey2.address);
      expect(await reg.issuerName(hotKey2.address)).to.equal("Trung tam dao tao X");
      expect(await reg.issuerStatus(centerX.address)).to.equal(2); // Disabled
      expect(await reg.issuerStatus(hotKey2.address)).to.equal(1); // Active
      expect(await reg.activeIssuerCount()).to.equal(2);           // khong doi
    });

    it("BỊ CHẶN: khóa kế nhiệm ĐÃ BỊ GỠ cũng mất quyền thu hồi", async () => {
      const { reg, credverify, centerX, hotKey2, alice } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await reg.connect(credverify).inheritIssuer(centerX.address, hotKey2.address);
      await reg.connect(credverify).removeIssuer(hotKey2.address);
      // Cửa hậu của V1: nhánh kế nhiệm thiếu điều kiện "đang hoạt động".
      await expect(reg.connect(hotKey2).revokeCertificate(idOf(centerX.address, FILE_A)))
        .to.be.revertedWith("CredentialRegistry: caller is not an active issuer");
    });

    it("BỊ CHẶN: chỉ owner chuyển giao được danh tính issuer", async () => {
      const { reg, centerX, hotKey2 } = await fixture();
      await expect(reg.connect(centerX).inheritIssuer(centerX.address, hotKey2.address))
        .to.be.revertedWith("CredentialRegistry: caller is not owner");
    });

    it("BỊ CHẶN: không chuyển giao sang một địa chỉ đã dùng làm issuer", async () => {
      const { reg, credverify, centerX, centerY } = await fixture();
      await expect(reg.connect(credverify).inheritIssuer(centerX.address, centerY.address))
        .to.be.revertedWith("CredentialRegistry: address already used as issuer");
    });

    it("chuỗi kế nhiệm hai bậc: X -> K2 -> K3, K3 vẫn dọn được hậu quả của X", async () => {
      const { reg, credverify, centerX, hotKey2, alice, stranger } = await fixture();
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      await reg.connect(credverify).inheritIssuer(centerX.address, hotKey2.address);
      await reg.connect(credverify).inheritIssuer(hotKey2.address, stranger.address);
      await reg.connect(stranger).revokeCertificate(idOf(centerX.address, FILE_A));
      expect((await reg.getCertificate(idOf(centerX.address, FILE_A))).status).to.equal(2);
    });

    it("CHỦ ĐÍCH: kế nhiệm chỉ chảy XUÔI — khóa cũ không thu hồi hộ khóa mới", async () => {
      const { reg, credverify, centerX, hotKey2, alice } = await fixture();
      await reg.connect(credverify).inheritIssuer(centerX.address, hotKey2.address);
      await reg.connect(hotKey2).issueCertificate(FILE_B, alice.address);
      await reg.connect(credverify).restoreIssuer(centerX.address).catch(() => {});
      // centerX đã Disabled và không restore được (đã chuyển giao) -> không có đường nào
      await expect(reg.connect(centerX).revokeCertificate(idOf(hotKey2.address, FILE_B)))
        .to.be.revertedWith("CredentialRegistry: caller is not an active issuer");
    });

    it("KỊCH BẢN ĐẦU-CUỐI: lộ khóa -> chuyển giao -> khóa cũ tê liệt -> khóa mới dọn hậu quả", async () => {
      const { reg, credverify, centerX, hotKey2, alice, bob } = await fixture();
      // 1. Hoạt động bình thường
      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      // 2. Khóa bị lộ, kẻ tấn công cấp bậy một chứng chỉ
      await reg.connect(centerX).issueCertificate(FILE_B, bob.address);
      // 3. Phát hiện -> owner chuyển giao danh tính sang khóa lạnh mới
      await reg.connect(credverify).inheritIssuer(centerX.address, hotKey2.address);
      // 4. Khóa lộ tê liệt hoàn toàn: không cấp được, không thu hồi được
      await expect(reg.connect(centerX).issueCertificate(
        ethers.keccak256(ethers.toUtf8Bytes("them-mot-cai-nua")), bob.address
      )).to.be.revertedWith("CredentialRegistry: caller is not an active issuer");
      await expect(reg.connect(centerX).revokeCertificate(idOf(centerX.address, FILE_A)))
        .to.be.revertedWith("CredentialRegistry: caller is not an active issuer");
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

    it("listActiveIssuers() trả về địa chỉ KÈM tên", async () => {
      const { reg, centerX, centerY } = await fixture();
      const [addrs, names] = await reg.listActiveIssuers();
      expect(addrs).to.have.lengthOf(2);
      expect(names).to.include("Trung tam dao tao X");
      expect(names).to.include("Trung tam dao tao Y");
      expect(addrs).to.include(centerX.address);
      expect(addrs).to.include(centerY.address);
    });

    it("owner thêm một issuer lén thì nó HIỆN NGAY trong danh sách", async () => {
      const { reg, credverify, stranger } = await fixture();
      await reg.connect(credverify).addIssuer(stranger.address, "Trung tam ma");
      const [addrs, names] = await reg.listActiveIssuers();
      expect(addrs).to.have.lengthOf(3);
      expect(names).to.include("Trung tam ma");
    });

    it("knownIssuers() giữ cả khóa đã bị gỡ, phục vụ kiểm toán", async () => {
      const { reg, credverify, centerX } = await fixture();
      await reg.connect(credverify).removeIssuer(centerX.address);
      expect(await reg.knownIssuers()).to.include(centerX.address);
      const [addrs] = await reg.listActiveIssuers();
      expect(addrs).to.not.include(centerX.address);
    });

    it("governance() trả về toàn bộ trạng thái quản trị trong một lời gọi", async () => {
      const { reg, credverify } = await fixture();
      const g = await reg.governance();
      expect(g.owner_).to.equal(credverify.address);
      expect(g.pendingOwner_).to.equal(ethers.ZeroAddress);
      expect(g.activeIssuerCount_).to.equal(2);
      expect(g.knownIssuerCount_).to.equal(2);
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
        .to.be.revertedWith("CredentialRegistry: not pending owner");
    });

    it("BỊ CHẶN: chuyển quyền cho địa chỉ 0", async () => {
      const { reg, credverify } = await fixture();
      await expect(reg.connect(credverify).transferOwnership(ethers.ZeroAddress))
        .to.be.revertedWith("CredentialRegistry: zero address");
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
        "acceptOwnership", "addIssuer", "inheritIssuer", "issueCertificate",
        "removeIssuer", "restoreIssuer", "revokeCertificate", "transferOwnership",
      ]);
      // Trong số đó, hai hàm chạm vào `certificates` đều KHÔNG phải onlyOwner
    });

    it("RỦI RO CÒN LẠI: owner cướp được danh tính một trung tâm đang hoạt động", async () => {
      const { reg, credverify, centerX, hotKey2, alice } = await fixture();
      // hotKey2 ở đây đóng vai một ví do CHÍNH OWNER kiểm soát.
      await expect(reg.connect(credverify).inheritIssuer(centerX.address, hotKey2.address))
        .to.emit(reg, "IssuerInherited").withArgs(centerX.address, hotKey2.address, "Trung tam dao tao X");
      await reg.connect(hotKey2).issueCertificate(FILE_A, alice.address);
      const r = await reg.verifyCertificate(hotKey2.address, FILE_A);
      expect(r.valid).to.equal(true);
      expect(r.issuerDisplayName).to.equal("Trung tam dao tao X");
      // Đây là ranh giới tin cậy đã công bố.
      // Cơ chế bù duy nhất là tính CÔNG KHAI: event IssuerInherited tồn tại vĩnh viễn,
      // và trung tâm thật nhận ra ngay khi khóa của mình ngừng cấp được.
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

    it("QUY TRÌNH ĐÚNG: inheritIssuer khi khóa xấu CÒN Active -> khóa dọn dẹp thu hồi được", async () => {
      const { reg, credverify, centerX, hotKey2 } = await coSuCo();
      await reg.connect(credverify).inheritIssuer(centerX.address, hotKey2.address);
      await reg.connect(hotKey2).revokeCertificate(idOf(centerX.address, FILE_A));
      await reg.connect(hotKey2).revokeCertificate(idOf(centerX.address, FILE_B));
      expect((await reg.getCertificate(idOf(centerX.address, FILE_A))).status).to.equal(2);
      expect((await reg.getCertificate(idOf(centerX.address, FILE_B))).status).to.equal(2);
    });

    it("BẪY VẬN HÀNH: gọi removeIssuer TRƯỚC thì inheritIssuer revert", async () => {
      const { reg, credverify, centerX, hotKey2 } = await coSuCo();
      // Phản xạ tự nhiên khi phát hiện sự cố là "chặn máu" bằng removeIssuer.
      // Đúng về trực giác, nhưng nó đóng luôn cánh cửa chuyển giao.
      await reg.connect(credverify).removeIssuer(centerX.address);
      await expect(reg.connect(credverify).inheritIssuer(centerX.address, hotKey2.address))
        .to.be.revertedWith("CredentialRegistry: old address is not an active issuer");
    });

    it("KHÔNG CÓ NGÕ CỤT: restoreIssuer -> inheritIssuer -> thu hồi, vẫn cứu được", async () => {
      const { reg, credverify, centerX, hotKey2 } = await coSuCo();
      await reg.connect(credverify).removeIssuer(centerX.address);
      await reg.connect(credverify).restoreIssuer(centerX.address);
      await reg.connect(credverify).inheritIssuer(centerX.address, hotKey2.address);
      await reg.connect(hotKey2).revokeCertificate(idOf(centerX.address, FILE_A));
      expect((await reg.getCertificate(idOf(centerX.address, FILE_A))).status).to.equal(2);
    });

    it("R4 — CHUỖI KẾ NHIỆM CẠN SAU 8 ĐỜI: chứng chỉ đời đầu mất khả năng thu hồi", async () => {
      const { reg, credverify, centerX, alice } = await fixture();
      const all = await ethers.getSigners();
      const chain = all.slice(6, 16);            // 10 ví dự phòng, đủ cho 9 lần chuyển giao
      expect(chain.length).to.be.greaterThanOrEqual(9);

      await reg.connect(centerX).issueCertificate(FILE_A, alice.address);
      const certId = idOf(centerX.address, FILE_A);

      let cur = centerX;
      for (let doi = 1; doi <= 8; doi++) {
        await reg.connect(credverify).inheritIssuer(cur.address, chain[doi - 1].address);
        cur = chain[doi - 1];
      }
      // Đời thứ 8 vẫn với tới được khóa gốc.
      await reg.connect(cur).revokeCertificate.staticCall(certId);

      // Đời thứ 9 thì không. MAX_INHERIT_HOPS = 8 nên vòng lặp cạn trước khi tới nơi.
      await reg.connect(credverify).inheritIssuer(cur.address, chain[8].address);
      await expect(reg.connect(chain[8]).revokeCertificate(certId))
        .to.be.revertedWith("CredentialRegistry: not the issuing key or its successor");

      // Chứng chỉ vẫn còn hiệu lực và KHÔNG AI thu hồi được nữa — kể cả owner.
      expect((await reg.getCertificate(certId)).status).to.equal(1);
      await expect(reg.connect(credverify).revokeCertificate(certId)).to.be.reverted;
      // Cách phòng: cấp lại chứng chỉ bằng khóa hiện hành TRƯỚC khi chạm trần 8 đời.
    });

    it("GIỚI HẠN THẬT: thu hồi TỪNG chứng chỉ một — không có thu hồi hàng loạt", async () => {
      const { reg, credverify, centerX, hotKey2 } = await coSuCo();
      await reg.connect(credverify).inheritIssuer(centerX.address, hotKey2.address);
      await reg.connect(hotKey2).revokeCertificate(idOf(centerX.address, FILE_A));
      expect((await reg.getCertificate(idOf(centerX.address, FILE_B))).status).to.equal(1);
      // N chứng chỉ giả = N giao dịch. Đây mới là giới hạn thật của cơ chế dọn dẹp,
      // và nó là giới hạn về CHI PHÍ VẬN HÀNH, không phải ngõ cụt về khả năng.
    });
  });
});
