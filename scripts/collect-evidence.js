/**
 * Thu thập bằng chứng tự động cho D8 (EVIDENCE.md).
 *
 * Script chạy trọn kịch bản nghiệm thu ở Mục 10.1 của đề bài:
 *   khởi tạo -> cấp quyền -> cấp chứng chỉ -> xác minh -> hành vi bị chặn -> thu hồi -> xác minh lại
 * rồi ghi toàn bộ tx hash, block, gas, event và state change thật ra tệp EVIDENCE.md.
 *
 * Chạy:
 *   Terminal 1:  npx hardhat node
 *   Terminal 2:  npx hardhat run scripts/collect-evidence.js --network localhost
 *
 * Script KHÔNG ghi private key hay dữ liệu cá nhân vào tệp kết quả.
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const rows = [];      // các giao dịch thành công
const blocked = [];   // các hành vi bị chặn
const events = [];    // event thu được từ receipt

function recordTx(step, action, receipt, note) {
  rows.push({
    step,
    action,
    txHash: receipt.hash,
    block: receipt.blockNumber,
    gas: receipt.gasUsed.toString(),
    note: note || "",
  });
}

function recordEvents(contract, receipt, action) {
  for (const log of receipt.logs) {
    let parsed;
    try {
      parsed = contract.interface.parseLog(log);
    } catch {
      continue;
    }
    if (!parsed) continue;
    const args = parsed.fragment.inputs
      .map((inp, i) => {
        let v = parsed.args[i];
        if (typeof v === "bigint") v = v.toString();
        return inp.name + "=" + v;
      })
      .join(", ");
    events.push({ action, name: parsed.name, args, txHash: receipt.hash });
  }
}

async function main() {
  const net = await hre.ethers.provider.getNetwork();
  const [deployer, trainingCenter, student, attacker] = await hre.ethers.getSigners();

  console.log("Mạng:", hre.network.name, "| chainId:", net.chainId.toString());

  // ---------- Bước 1: deploy ----------
  const Factory = await hre.ethers.getContractFactory("CredentialRegistry");
  const registry = await Factory.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  const deployTx = registry.deploymentTransaction();
  const deployRc = await deployTx.wait();
  console.log("Đã deploy:", address);

  // ---------- Bước 2: cấp quyền phát hành ----------
  let rc = await (await registry.connect(deployer).addIssuer(trainingCenter.address)).wait();
  recordTx(2, "addIssuer — chủ sở hữu cấp quyền phát hành cho đơn vị đào tạo", rc);
  recordEvents(registry, rc, "addIssuer");

  // ---------- Bước 3: cấp chứng chỉ (happy path) ----------
  const rawId = "KHOAHOC-2026-0001";
  const certId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(rawId));
  const pdfData = fs.readFileSync("Demo/Microsoft Office Specialist  Associate.pdf")
  const certHash = hre.ethers.keccak256(pdfData);

  rc = await (
    await registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address)
  ).wait();
  recordTx(3, "issueCertificate — đơn vị đào tạo cấp chứng chỉ cho học viên", rc, "mã: " + rawId);
  recordEvents(registry, rc, "issueCertificate");

  const afterIssue = await registry.verifyCertificate(certId, certHash);

  // ---------- Bước 4: hành vi bị chặn #1 — không có quyền phát hành ----------
  const rawId2 = "KHOAHOC-2026-GIAMAO";
  const certId2 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(rawId2));
  try {
    await registry.connect(attacker).issueCertificate(certId2, certHash, student.address);
    blocked.push({ action: "issueCertificate bởi ví không có quyền", reason: "KHÔNG BỊ CHẶN — cần xem lại contract" });
  } catch (err) {
    blocked.push({
      action: "issueCertificate gọi từ ví không được cấp quyền phát hành",
      reason: err.reason || err.shortMessage || err.message,
      expected: "Giao dịch phải revert",
    });
  }

  // ---------- Bước 5: hành vi bị chặn #2 — sai issuer khi thu hồi ----------
  try {
    await registry.connect(deployer).revokeCertificate(certId);
    blocked.push({ action: "revokeCertificate bởi issuer khác", reason: "KHÔNG BỊ CHẶN — cần xem lại contract" });
  } catch (err) {
    blocked.push({
      action: "revokeCertificate gọi từ issuer hợp lệ nhưng không phải bên đã cấp",
      reason: err.reason || err.shortMessage || err.message,
      expected: "Giao dịch phải revert",
    });
  }

  // ---------- Bước 6: hành vi bị chặn #3 — tệp bị sửa nội dung ----------
  const tamperedHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("noi-dung-tep-DA-BI-SUA"));
  const tamperedResult = await registry.verifyCertificate(certId, tamperedHash);
  blocked.push({
    action: "verifyCertificate với tệp đã bị chỉnh sửa (hash không khớp)",
    reason: "Hàm read-only trả về valid = " + tamperedResult[0] + " (không phát sinh giao dịch)",
    expected: "Kết quả phải là false",
  });

  // ---------- Bước 7: thu hồi ----------
  rc = await (await registry.connect(trainingCenter).revokeCertificate(certId)).wait();
  recordTx(7, "revokeCertificate — đơn vị đào tạo thu hồi chứng chỉ đã cấp", rc, "mã: " + rawId);
  recordEvents(registry, rc, "revokeCertificate");

  const afterRevoke = await registry.verifyCertificate(certId, certHash);

  // ---------- Bước 8: hành vi bị chặn #4 — thu hồi lần hai ----------
  try {
    await registry.connect(trainingCenter).revokeCertificate(certId);
    blocked.push({ action: "revokeCertificate lần hai", reason: "KHÔNG BỊ CHẶN — cần xem lại contract" });
  } catch (err) {
    blocked.push({
      action: "revokeCertificate lần hai trên cùng một chứng chỉ (double revoke)",
      reason: err.reason || err.shortMessage || err.message,
      expected: "Giao dịch phải revert",
    });
  }

  // ---------- Sinh EVIDENCE.md ----------
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  const solcVersion =
    typeof hre.config.solidity === "string"
      ? hre.config.solidity
      : hre.config.solidity.version || hre.config.solidity.compilers?.[0]?.version || "xem hardhat.config.js";

  const fmt = (v) => "`" + v + "`";
  const statusName = ["None (chưa tồn tại)", "Issued (còn hiệu lực)", "Revoked (đã thu hồi)"];

  let md = "";
  md += "# EVIDENCE — CredVerify MVP\n\n";
  md += "Tệp này được sinh tự động bởi `scripts/collect-evidence.js`. ";
  md += "Sinh lúc: " + new Date().toISOString() + "\n\n";
  md += "Tái chạy toàn bộ: `npx hardhat node` (terminal 1), sau đó ";
  md += "`npx hardhat run scripts/collect-evidence.js --network localhost` (terminal 2).\n\n";

  md += "## 1. Môi trường triển khai\n\n";
  md += "| Hạng mục | Giá trị |\n|---|---|\n";
  md += "| Tên mạng | " + fmt(hre.network.name) + " |\n";
  md += "| Chain ID | " + fmt(net.chainId.toString()) + " |\n";
  md += "| Endpoint | " + fmt(hre.network.config.url || "http://127.0.0.1:8545") + " |\n";
  md += "| Lệnh khởi tạo mạng | " + fmt("npx hardhat node") + " |\n";
  md += "| Phiên bản Solidity | " + fmt(solcVersion) + " |\n";
  md += "| Hardhat | " + fmt(pkg.devDependencies?.hardhat || "xem package.json") + " |\n";
  md += "| Node.js | " + fmt(process.version) + " |\n\n";

  md += "## 2. Hợp đồng đã triển khai\n\n";
  md += "| Hạng mục | Giá trị |\n|---|---|\n";
  md += "| Tên contract | `CredentialRegistry` |\n";
  md += "| Contract address | " + fmt(address) + " |\n";
  md += "| Deployment tx hash | " + fmt(deployRc.hash) + " |\n";
  md += "| Deployment block | " + fmt(deployRc.blockNumber) + " |\n";
  md += "| Gas deploy | " + fmt(deployRc.gasUsed.toString()) + " |\n";
  md += "| ABI | sinh ra tại `artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json` |\n\n";

  md += "## 3. Tài khoản demo\n\n";
  md += "Các tài khoản do `npx hardhat node` sinh ra, chỉ dùng cho mạng local. ";
  md += "**Không có private key nào được ghi vào tệp này.**\n\n";
  md += "| Vai trò | Địa chỉ |\n|---|---|\n";
  md += "| Chủ sở hữu contract | " + fmt(deployer.address) + " |\n";
  md += "| Đơn vị đào tạo (issuer) | " + fmt(trainingCenter.address) + " |\n";
  md += "| Học viên (holder) | " + fmt(student.address) + " |\n";
  md += "| Ví không có quyền (dùng để test tấn công) | " + fmt(attacker.address) + " |\n\n";

  md += "## 4. Giao dịch của luồng nghiệp vụ chính\n\n";
  md += "| Bước | Thao tác | Tx hash | Block | Gas | Ghi chú |\n|---|---|---|---|---|---|\n";
  rows.forEach((r) => {
    md += "| " + r.step + " | " + r.action + " | " + fmt(r.txHash) + " | " + r.block + " | " + r.gas + " | " + r.note + " |\n";
  });
  md += "\n";

  md += "## 5. Event ghi nhận trên chuỗi\n\n";
  md += "| Event | Tham số | Tx hash |\n|---|---|---|\n";
  events.forEach((e) => {
    md += "| `" + e.name + "` | " + e.args + " | " + fmt(e.txHash) + " |\n";
  });
  md += "\n";

  md += "## 6. Thay đổi trạng thái (state change)\n\n";
  md += "Chứng chỉ `" + rawId + "` — certId " + fmt(certId) + "\n\n";
  md += "| Thời điểm | valid | status | Ý nghĩa |\n|---|---|---|---|\n";
  md += "| Sau khi cấp | " + afterIssue[0] + " | " + Number(afterIssue[1]) + " | " + statusName[Number(afterIssue[1])] + " |\n";
  md += "| Sau khi thu hồi | " + afterRevoke[0] + " | " + Number(afterRevoke[1]) + " | " + statusName[Number(afterRevoke[1])] + " |\n\n";
  md += "Trạng thái chuyển một chiều `Issued -> Revoked`, không có đường quay lại. ";
  md += "Hash tệp vẫn khớp sau khi thu hồi nhưng `valid` trả về false — chứng minh trạng thái ";
  md += "được kiểm tra độc lập với tính toàn vẹn của tệp.\n\n";

  md += "## 7. Hành vi sai bị chặn (M7)\n\n";
  md += "| # | Hành vi | Kỳ vọng | Kết quả thực tế |\n|---|---|---|---|\n";
  blocked.forEach((b, i) => {
    md += "| " + (i + 1) + " | " + b.action + " | " + (b.expected || "Bị từ chối") + " | " + b.reason + " |\n";
  });
  md += "\n";

  md += "## 8. Đối chiếu thao tác giao diện với giao dịch trên chuỗi\n\n";
  md += "| Thao tác trên giao diện `index.html` | Hàm contract | Thay đổi trạng thái |\n|---|---|---|\n";
  md += "| Quản trị đơn vị phát hành → Cấp quyền phát hành | `addIssuer(address)` | `isIssuer[addr]` = true, event `IssuerAdded` |\n";
  md += "| Cấp chứng chỉ → nút Cấp chứng chỉ | `issueCertificate(bytes32,bytes32,address)` | `certificates[certId].status` None → Issued, event `CertificateIssued` |\n";
  md += "| Xác minh → nút Xác minh | `verifyCertificate(bytes32,bytes32)` | Chỉ đọc, không phát sinh giao dịch |\n";
  md += "| Tra cứu & thu hồi → nút Thu hồi | `revokeCertificate(bytes32)` | `status` Issued → Revoked, event `CertificateRevoked` |\n\n";
  md += "Giao diện băm tệp bằng `keccak256` ngay trên máy người dùng; tệp gốc không được tải lên. ";
  md += "Giá trị đưa lên chuỗi chỉ gồm certId, hash tệp và địa chỉ ví.\n\n";

  md += "## 9. Cần bổ sung thủ công\n\n";
  md += "- [ ] Kết quả `npx hardhat test` (số test pass/fail) — dán output vào đây.\n";
  md += "- [ ] Kết quả static analysis (Slither hoặc tương đương) và giải thích false positive.\n";
  md += "- [ ] Ảnh chụp màn hình: luồng cấp thành công, kết quả xác minh hợp lệ, thông báo bị chặn.\n";
  md += "- [ ] Đo độ trễ và chi phí gas cho từng thao tác chính (đã có gas ở Mục 4).\n";
  md += "- [ ] Bảng so sánh với baseline tập trung.\n\n";

  md += "## 10. Cam kết an toàn dữ liệu\n\n";
  md += "- Không có private key, seed phrase hay access token nào trong tệp này.\n";
  md += "- Không có dữ liệu cá nhân thật; tên học viên trong demo là dữ liệu giả.\n";
  md += "- Các địa chỉ ví ở Mục 3 là tài khoản mặc định của mạng local Hardhat, công khai theo thiết kế.\n";

  const outPath = path.join(__dirname, "..", "EVIDENCE.md");
  fs.writeFileSync(outPath, md, "utf8");

  console.log("\nĐã ghi:", outPath);
  console.log("Giao dịch thành công:", rows.length, "| Hành vi bị chặn:", blocked.length, "| Event:", events.length);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
