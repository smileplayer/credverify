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

  // ---------- NEGATIVE / ADVERSARIAL TESTS  ----------

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

  it("THIẾT KẾ CÓ CHỦ ĐÍCH: issuer đã bị gỡ quyền VẪN thu hồi được chứng chỉ do chính mình đã cấp", async function () {
    await registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address);

    await registry.connect(owner).removeIssuer(trainingCenter.address);
    expect(await registry.isIssuer(trainingCenter.address)).to.equal(false);

    const newCertId = ethers.keccak256(ethers.toUtf8Bytes("KHOAHOC-2026-0003"));
    await expect(
      registry.connect(trainingCenter).issueCertificate(newCertId, certHash, student.address)
    ).to.be.revertedWith("CredentialRegistry: caller is not an authorized issuer");

    await expect(registry.connect(trainingCenter).revokeCertificate(certId))
      .to.emit(registry, "CertificateRevoked");

    const [valid, status] = await registry.verifyCertificate(certId, certHash);
    expect(valid).to.equal(false);
    expect(status).to.equal(2); // Status.Revoked
  });

  it("GIỚI HẠN RỦI RO TỒN DƯ: issuer bị gỡ quyền KHÔNG thu hồi được chứng chỉ của issuer khác", async function () {
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

  // ---------- TRUY VẤN QUA EVENT  ----------
  it("Học viên truy vấn được đúng danh sách chứng chỉ của chính mình qua event", async function () {
    const certId2 = ethers.keccak256(ethers.toUtf8Bytes("KHOAHOC-2026-0002"));
    const certHash2 = ethers.keccak256(ethers.toUtf8Bytes("noi-dung-file-pdf-2"));

    await registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address);
    await registry.connect(trainingCenter).issueCertificate(certId2, certHash2, student.address);

    const logs = await registry.queryFilter(
      registry.filters.CertificateIssued(null, null, null, student.address),
      0,
      "latest"
    );

    expect(logs.length).to.equal(2);
    const ids = logs.map((l) => l.args.certId);
    expect(ids).to.include(certId);
    expect(ids).to.include(certId2);
    logs.forEach((l) => expect(l.args.holder).to.equal(student.address));
  });

  it("Danh sách của học viên không lẫn chứng chỉ của ví khác", async function () {
    const certIdKhac = ethers.keccak256(ethers.toUtf8Bytes("KHOAHOC-2026-0009"));

    await registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address);
    await registry.connect(trainingCenter).issueCertificate(certIdKhac, certHash, attacker.address);

    const cuaHocVien = await registry.queryFilter(
      registry.filters.CertificateIssued(null, null, null, student.address), 0, "latest");
    const cuaViKhac = await registry.queryFilter(
      registry.filters.CertificateIssued(null, null, null, otherIssuer.address), 0, "latest");

    expect(cuaHocVien.length).to.equal(1);
    expect(cuaHocVien[0].args.certId).to.equal(certId);
    expect(cuaViKhac.length).to.equal(0); // ví chưa từng được cấp gì
  });

  it("Xác minh không cần mã: tra ngược được certId từ hash của tệp", async function () {
    await registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address);

    // Đây là việc findCertIdByHash() làm ở giao diện khi người dùng bỏ trống ô mã.
    const logs = await registry.queryFilter(
      registry.filters.CertificateIssued(null, certHash, null, null), 0, "latest");

    expect(logs.length).to.equal(1);
    expect(logs[0].args.certId).to.equal(certId);

    // Có certId rồi thì xác minh như bình thường.
    const [valid, status] = await registry.verifyCertificate(logs[0].args.certId, certHash);
    expect(valid).to.equal(true);
    expect(status).to.equal(1);
  });

  it("Xác minh không cần mã: tệp chưa từng đăng ký thì không tra ra bản ghi nào", async function () {
    await registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address);

    const hashLa = ethers.keccak256(ethers.toUtf8Bytes("tep-chua-tung-duoc-cap"));
    const logs = await registry.queryFilter(
      registry.filters.CertificateIssued(null, hashLa, null, null), 0, "latest");

    expect(logs.length).to.equal(0);
  });

  it("issuer tuy không còn indexed nhưng vẫn đọc được đầy đủ từ dữ liệu event", async function () {
    // Bỏ indexed của issuer chỉ mất khả năng để node lọc, KHÔNG mất dữ liệu.
    await registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address);

    const logs = await registry.queryFilter(registry.filters.CertificateIssued(), 0, "latest");

    expect(logs.length).to.equal(1);
    expect(logs[0].args.issuer).to.equal(trainingCenter.address);
    expect(logs[0].args.certHash).to.equal(certHash);
    expect(Number(logs[0].args.issuedAt)).to.be.greaterThan(0);
  });
});
