const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("CredentialRegistry", function () {
  let registry, owner, trainingCenter, otherIssuer, student, attacker;
  let certId, certHash;

  beforeEach(async function () {
    [owner, trainingCenter, otherIssuer, student, attacker] = await ethers.getSigners();

    const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");
    registry = await CredentialRegistry.deploy();
    await registry.waitForDeployment();

    // owner (deployer) tự động là issuer; thêm trainingCenter làm issuer thứ hai để test đa issuer
    await registry.connect(owner).addIssuer(trainingCenter.address);

    certId = ethers.keccak256(ethers.toUtf8Bytes("KHOAHOC-2026-0001"));
    certHash = ethers.keccak256(ethers.toUtf8Bytes("noi-dung-file-pdf-chung-chi"));
  });

  // ---------- HAPPY PATH ----------

  it("issuer hợp lệ cấp chứng chỉ thành công và phát event CertificateIssued", async function () {
    await expect(
      registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address)
    )
      .to.emit(registry, "CertificateIssued")
      .withArgs(certId, certHash, trainingCenter.address, student.address, anyValue);

    const [valid, status] = await registry.verifyCertificate(certId, certHash);
    expect(valid).to.equal(true);
    expect(status).to.equal(1); // Status.Issued
  });

  it("verifier xác minh đúng hash trả về valid = true", async function () {
    await registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address);
    const [valid] = await registry.verifyCertificate(certId, certHash);
    expect(valid).to.equal(true);
  });

  it("verifier xác minh với hash sai (file bị chỉnh sửa) trả về valid = false", async function () {
    await registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address);
    const wrongHash = ethers.keccak256(ethers.toUtf8Bytes("file-da-bi-sua"));
    const [valid] = await registry.verifyCertificate(certId, wrongHash);
    expect(valid).to.equal(false);
  });

  it("issuer đúng người thu hồi chứng chỉ thành công", async function () {
    await registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address);

    await expect(registry.connect(trainingCenter).revokeCertificate(certId))
      .to.emit(registry, "CertificateRevoked");

    const [valid, status] = await registry.verifyCertificate(certId, certHash);
    expect(valid).to.equal(false); // đã revoke nên không còn valid dù hash đúng
    expect(status).to.equal(2); // Status.Revoked
  });

  // ---------- NEGATIVE / ADVERSARIAL TESTS (M7 - hành vi bị chặn) ----------

  it("BỊ CHẶN: địa chỉ không phải issuer cố cấp chứng chỉ => revert", async function () {
    await expect(
      registry.connect(attacker).issueCertificate(certId, certHash, student.address)
    ).to.be.revertedWith("CredentialRegistry: caller is not an authorized issuer");
  });

  it("BỊ CHẶN: issuer khác (không phải người đã cấp) cố thu hồi chứng chỉ => revert", async function () {
    await registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address);

    await expect(
      registry.connect(owner).revokeCertificate(certId) // owner là issuer hợp lệ nhưng KHÔNG phải người đã cấp cert này
    ).to.be.revertedWith("CredentialRegistry: only the issuing address can revoke");
  });

  it("BỊ CHẶN: cấp trùng certId đã tồn tại => revert", async function () {
    await registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address);

    await expect(
      registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address)
    ).to.be.revertedWith("CredentialRegistry: certId already used");
  });

  it("BỊ CHẶN: thu hồi một chứng chỉ đã bị thu hồi trước đó (double revoke) => revert", async function () {
    await registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address);
    await registry.connect(trainingCenter).revokeCertificate(certId);

    await expect(
      registry.connect(trainingCenter).revokeCertificate(certId)
    ).to.be.revertedWith("CredentialRegistry: certificate not in Issued state");
  });

  it("BỊ CHẶN: địa chỉ không phải owner cố thêm issuer mới => revert", async function () {
    await expect(
      registry.connect(attacker).addIssuer(attacker.address)
    ).to.be.revertedWith("CredentialRegistry: caller is not owner");
  });

  it("issuer bị owner xóa quyền thì không cấp chứng chỉ được nữa", async function () {
    await registry.connect(owner).removeIssuer(trainingCenter.address);

    await expect(
      registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address)
    ).to.be.revertedWith("CredentialRegistry: caller is not an authorized issuer");
  });

  it("BỊ CHẶN: xác minh chứng chỉ không tồn tại => valid = false và status = None", async function () {
    const unknownCertId = ethers.keccak256(
      ethers.toUtf8Bytes("KHOAHOC-2026-UNKNOWN")
    );
    const unknownHash = ethers.keccak256(
      ethers.toUtf8Bytes("file-khong-ton-tai")
    );

    const [valid, status, issuer, holder, issuedAt] =
      await registry.verifyCertificate(unknownCertId, unknownHash);

    expect(valid).to.equal(false);
    expect(status).to.equal(0); // Status.None
    expect(issuer).to.equal(ethers.ZeroAddress);
    expect(holder).to.equal(ethers.ZeroAddress);
    expect(issuedAt).to.equal(0);
  });

  it("BỊ CHẶN: thu hồi chứng chỉ không tồn tại => revert", async function () {
    const unknownCertId = ethers.keccak256(
      ethers.toUtf8Bytes("KHOAHOC-2026-UNKNOWN")
    );

    await expect(
      registry.connect(trainingCenter).revokeCertificate(unknownCertId)
    ).to.be.revertedWith(
      "CredentialRegistry: certificate not in Issued state"
    );
  });

  it("BỊ CHẶN: cấp chứng chỉ với holder là zero address => revert", async function () {
    await expect(
      registry.connect(trainingCenter).issueCertificate(
        certId,
        certHash,
        ethers.ZeroAddress
      )
    ).to.be.revertedWith(
      "CredentialRegistry: holder is zero address"
    );
  });

  it("BỊ CHẶN: owner thêm issuer với zero address => revert", async function () {
    await expect(
      registry.connect(owner).addIssuer(ethers.ZeroAddress)
    ).to.be.revertedWith(
      "CredentialRegistry: zero address"
    );
  });

  it("owner thêm issuer thành công và issuer mới có thể cấp chứng chỉ", async function () {
    await registry.connect(owner).addIssuer(otherIssuer.address);

    await expect(
      registry.connect(otherIssuer).issueCertificate(
        certId,
        certHash,
        student.address
      )
    ).to.emit(registry, "CertificateIssued")
    .withArgs(
      certId,
      certHash,
      otherIssuer.address,
      student.address,
      anyValue
    );
  });

  it("issuer bị xóa quyền thì không thể cấp chứng chỉ nhưng chứng chỉ cũ vẫn có thể được xác minh", async function () {
    await registry.connect(trainingCenter).issueCertificate(
      certId,
      certHash,
      student.address
    );

    await registry.connect(owner).removeIssuer(trainingCenter.address);

    // Mất quyền issue
    const newCertId = ethers.keccak256(
      ethers.toUtf8Bytes("KHOAHOC-2026-0002")
    );

    await expect(
      registry.connect(trainingCenter).issueCertificate(
        newCertId,
        certHash,
        student.address
      )
    ).to.be.revertedWith(
      "CredentialRegistry: caller is not an authorized issuer"
    );

    // Nhưng certificate cũ vẫn tồn tại và còn valid
    const [valid, status] =
      await registry.verifyCertificate(certId, certHash);

    expect(valid).to.equal(true);
    expect(status).to.equal(1); // Status.Issued
  });

  it("BỊ CHẶN: certificate đã revoke không thể được issue lại bằng cùng certId", async function () {
    await registry.connect(trainingCenter).issueCertificate(
      certId,
      certHash,
      student.address
    );

    await registry.connect(trainingCenter).revokeCertificate(certId);

    await expect(
      registry.connect(trainingCenter).issueCertificate(
        certId,
        certHash,
        student.address
      )
    ).to.be.revertedWith(
      "CredentialRegistry: certId already used"
    );
  });

  it("certificate vẫn giữ nguyên issuer và holder sau khi bị revoke", async function () {
    await registry.connect(trainingCenter).issueCertificate(
      certId,
      certHash,
      student.address
    );

    await registry.connect(trainingCenter).revokeCertificate(certId);

    const [valid, status, issuer, holder, issuedAt] =
      await registry.verifyCertificate(certId, certHash);

    expect(valid).to.equal(false);
    expect(status).to.equal(2); // Status.Revoked
    expect(issuer).to.equal(trainingCenter.address);
    expect(holder).to.equal(student.address);
    expect(issuedAt).to.be.greaterThan(0);
  });

  // ---------- QUYẾT ĐỊNH THIẾT KẾ CÓ CHỦ ĐÍCH ----------
  // Hai test dưới đây ghim lại một hành vi dễ bị hiểu nhầm là lỗ hổng.
  // Hàm revokeCertificate() cố ý KHÔNG dùng modifier onlyIssuer; nó chỉ kiểm
  // cert.issuer == msg.sender. Xem lập luận đầy đủ ở Mục 8 báo cáo cuối kỳ.

  it("THIẾT KẾ CÓ CHỦ ĐÍCH: issuer đã bị gỡ quyền VẪN thu hồi được chứng chỉ do chính mình đã cấp", async function () {
    // Trung tâm đào tạo cấp chứng chỉ trong lúc còn quyền phát hành.
    await registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address);

    // Sau đó owner gỡ quyền phát hành (vd: trung tâm chấm dứt hợp tác, rời hệ thống).
    await registry.connect(owner).removeIssuer(trainingCenter.address);
    expect(await registry.isIssuer(trainingCenter.address)).to.equal(false);

    // Từ đây trung tâm KHÔNG cấp mới được nữa.
    const newCertId = ethers.keccak256(ethers.toUtf8Bytes("KHOAHOC-2026-0003"));
    await expect(
      registry.connect(trainingCenter).issueCertificate(newCertId, certHash, student.address)
    ).to.be.revertedWith("CredentialRegistry: caller is not an authorized issuer");

    // NHƯNG vẫn thu hồi được chứng chỉ CŨ của chính mình.
    // Lý do: một đơn vị đã rời hệ thống vẫn phải chịu trách nhiệm sửa sai sót của
    // chính mình. Nếu chặn, mọi chứng chỉ cấp nhầm trước đó sẽ vĩnh viễn không thu
    // hồi được — mâu thuẫn với chính mục đích tồn tại của cơ chế thu hồi.
    await expect(registry.connect(trainingCenter).revokeCertificate(certId))
      .to.emit(registry, "CertificateRevoked");

    const [valid, status] = await registry.verifyCertificate(certId, certHash);
    expect(valid).to.equal(false);
    expect(status).to.equal(2); // Status.Revoked
  });

  it("GIỚI HẠN RỦI RO TỒN DƯ: issuer bị gỡ quyền KHÔNG thu hồi được chứng chỉ của issuer khác", async function () {
    // Quyền thu hồi còn lại sau khi bị gỡ chỉ giới hạn trong phạm vi các chứng chỉ
    // do chính địa chỉ đó đã cấp; nó không lan sang chứng chỉ của issuer khác.
    // Đây là ranh giới làm cho quyết định thiết kế ở test trên chấp nhận được.
    await registry.connect(owner).addIssuer(otherIssuer.address);
    await registry.connect(otherIssuer).issueCertificate(certId, certHash, student.address);

    await registry.connect(owner).removeIssuer(trainingCenter.address);

    await expect(
      registry.connect(trainingCenter).revokeCertificate(certId)
    ).to.be.revertedWith("CredentialRegistry: only the issuing address can revoke");
  });

  it("hai certId khác nhau có thể tạo hai certificate độc lập", async function () {
    const certId2 = ethers.keccak256(
      ethers.toUtf8Bytes("KHOAHOC-2026-0002")
    );

    const certHash2 = ethers.keccak256(
      ethers.toUtf8Bytes("noi-dung-file-pdf-chung-chi-2")
    );

    await registry.connect(trainingCenter).issueCertificate(
      certId,
      certHash,
      student.address
    );

    await registry.connect(trainingCenter).issueCertificate(
      certId2,
      certHash2,
      student.address
    );

    const [valid1, status1] =
      await registry.verifyCertificate(certId, certHash);

    const [valid2, status2] =
      await registry.verifyCertificate(certId2, certHash2);

    expect(valid1).to.equal(true);
    expect(status1).to.equal(1); // Status.Issued

    expect(valid2).to.equal(true);
    expect(status2).to.equal(1); // Status.Issued
  });
});
