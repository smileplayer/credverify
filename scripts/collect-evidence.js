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

// NỘI DUNG TĨNH — cập nhật thủ công khi kết quả bên ngoài thay đổi.

const TEST_PASSING = 26;
const TEST_DURATION = "699ms";
const TEST_OUTPUT = `  CredentialRegistry
    ✔ issuer hợp lệ cấp chứng chỉ thành công và phát event CertificateIssued
    ✔ verifier xác minh đúng hash trả về valid = true
    ✔ verifier xác minh với hash sai (file bị chỉnh sửa) trả về valid = false
    ✔ issuer đúng người thu hồi chứng chỉ thành công
    ✔ BỊ CHẶN: địa chỉ không phải issuer cố cấp chứng chỉ => revert
    ✔ BỊ CHẶN: issuer khác (không phải người đã cấp) cố thu hồi chứng chỉ => revert
    ✔ BỊ CHẶN: cấp trùng certId đã tồn tại => revert
    ✔ BỊ CHẶN: thu hồi một chứng chỉ đã bị thu hồi trước đó (double revoke) => revert
    ✔ BỊ CHẶN: địa chỉ không phải owner cố thêm issuer mới => revert
    ✔ issuer bị owner xóa quyền thì không cấp chứng chỉ được nữa
    ✔ BỊ CHẶN: xác minh chứng chỉ không tồn tại => valid = false và status = None
    ✔ BỊ CHẶN: thu hồi chứng chỉ không tồn tại => revert
    ✔ BỊ CHẶN: cấp chứng chỉ với holder là zero address => revert
    ✔ BỊ CHẶN: owner thêm issuer với zero address => revert
    ✔ owner thêm issuer thành công và issuer mới có thể cấp chứng chỉ
    ✔ issuer bị xóa quyền thì không thể cấp chứng chỉ nhưng chứng chỉ cũ vẫn có thể được xác minh
    ✔ BỊ CHẶN: certificate đã revoke không thể được issue lại bằng cùng certId
    ✔ certificate vẫn giữ nguyên issuer và holder sau khi bị revoke
    ✔ THIẾT KẾ CÓ CHỦ ĐÍCH: issuer đã bị gỡ quyền VẪN thu hồi được chứng chỉ do chính mình đã cấp
    ✔ GIỚI HẠN RỦI RO TỒN DƯ: issuer bị gỡ quyền KHÔNG thu hồi được chứng chỉ của issuer khác
    ✔ hai certId khác nhau có thể tạo hai certificate độc lập
    ✔ Học viên truy vấn được đúng danh sách chứng chỉ của chính mình qua event
    ✔ Danh sách của học viên không lẫn chứng chỉ của ví khác
    ✔ Xác minh không cần mã: tra ngược được certId từ hash của tệp
    ✔ Xác minh không cần mã: tệp chưa từng đăng ký thì không tra ra bản ghi nào
    ✔ issuer tuy không còn indexed nhưng vẫn đọc được đầy đủ từ dữ liệu event

  26 passing (699ms)
`;

const rows = [];      // các giao dịch thành công
const blocked = [];   // các hành vi bị chặn
const events = [];    // event thu được từ receipt
const readLat = [];   // số đo độ trễ của các thao tác chỉ đọc

// Số mẫu lấy khi đo độ trễ thao tác đọc.
const READ_SAMPLES = 30;

 // Đo thời gian thực thi một hàm bất đồng bộ
async function timed(fn) {
  const t0 = process.hrtime.bigint();
  const result = await fn();
  const t1 = process.hrtime.bigint();
  return { result, ms: Number(t1 - t0) / 1e6 };
}

const ms2 = (n) => (n == null ? "—" : n.toFixed(2));

async function measureRead(action, fn, samples = READ_SAMPLES) {
  await fn(); // lần gọi khởi động, bỏ đi để không tính chi phí thiết lập kết nối lần đầu
  const t = [];
  for (let i = 0; i < samples; i++) {
    const { ms } = await timed(fn);
    t.push(ms);
  }
  t.sort((a, b) => a - b);
  const at = (p) => t[Math.min(t.length - 1, Math.floor(t.length * p))];
  readLat.push({
    action,
    samples,
    min: t[0],
    median: at(0.5),
    mean: t.reduce((a, b) => a + b, 0) / t.length,
    p95: at(0.95),
    max: t[t.length - 1],
  });
}

function recordTx(step, action, receipt, note, latencyMs) {
  rows.push({
    step,
    action,
    txHash: receipt.hash,
    block: receipt.blockNumber,
    gas: receipt.gasUsed.toString(),
    latency: latencyMs,
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
  const deployRun = await timed(async () => {
    const r = await Factory.deploy();
    await r.waitForDeployment();
    return r;
  });
  const registry = deployRun.result;
  const deployMs = deployRun.ms;
  const address = await registry.getAddress();
  const deployTx = registry.deploymentTransaction();
  const deployRc = await deployTx.wait();
  console.log("Đã deploy:", address, "|", ms2(deployMs), "ms");

  // ---------- Bước 2: cấp quyền phát hành ----------
  let run = await timed(async () =>
    (await registry.connect(deployer).addIssuer(trainingCenter.address)).wait()
  );
  let rc = run.result;
  recordTx(2, "addIssuer — chủ sở hữu cấp quyền phát hành cho đơn vị đào tạo", rc, "", run.ms);
  recordEvents(registry, rc, "addIssuer");

  // ---------- Bước 3: cấp chứng chỉ (happy path) ----------
  const rawId = "KHOAHOC-2026-0001";
  const certId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(rawId));
  const pdfPath = path.join(__dirname, "..", "Demo", "DemoCert.pdf");
  if (!fs.existsSync(pdfPath)) {
    throw new Error("Không tìm thấy tệp demo: " + pdfPath);
  }
  const pdfData = fs.readFileSync(pdfPath);
  const certHash = hre.ethers.keccak256(pdfData);

  run = await timed(async () =>
    (await registry.connect(trainingCenter).issueCertificate(certId, certHash, student.address)).wait()
  );
  rc = run.result;
  recordTx(3, "issueCertificate — đơn vị đào tạo cấp chứng chỉ cho học viên", rc, "mã: " + rawId, run.ms);
  recordEvents(registry, rc, "issueCertificate");

  const afterIssue = await registry.verifyCertificate(certId, certHash);

  console.log("Đang đo độ trễ thao tác đọc (" + READ_SAMPLES + " mẫu mỗi thao tác)…");
  await measureRead(
    "verifyCertificate — nhà tuyển dụng xác minh một chứng chỉ",
    () => registry.verifyCertificate(certId, certHash)
  );
  await measureRead(
    "certificates — giao diện làm mới trạng thái một chứng chỉ",
    () => registry.certificates(certId)
  );
  await measureRead(
    "isIssuer — kiểm tra quyền phát hành của một ví",
    () => registry.isIssuer(trainingCenter.address)
  );

  await measureRead(
    "keccak256 — băm tệp PDF trên máy người dùng (" + (pdfData.length / 1024).toFixed(0) + " KB)",
    async () => hre.ethers.keccak256(pdfData)
  );

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
  run = await timed(async () =>
    (await registry.connect(trainingCenter).revokeCertificate(certId)).wait()
  );
  rc = run.result;
  recordTx(7, "revokeCertificate — đơn vị đào tạo thu hồi chứng chỉ đã cấp", rc, "mã: " + rawId, run.ms);
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
  md += "| Độ trễ deploy | " + fmt(ms2(deployMs) + " ms") + " |\n";
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
  md += "| Bước | Thao tác | Tx hash | Block | Gas | Độ trễ (ms) | Ghi chú |\n|---|---|---|---|---|---|---|\n";
  rows.forEach((r) => {
    md += "| " + r.step + " | " + r.action + " | " + fmt(r.txHash) + " | " + r.block + " | " +
      r.gas + " | " + ms2(r.latency) + " | " + r.note + " |\n";
  });
  md += "\n";
  md += "Cột độ trễ đo từ lúc gửi giao dịch tới khi nhận được receipt. ";
  md += "Xem Mục 9 để biết phương pháp đo và giới hạn diễn giải của các con số này.\n\n";

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

  md += "## 7. Hành vi sai bị chặn\n\n";
  md += "| # | Hành vi | Kỳ vọng | Kết quả thực tế |\n|---|---|---|---|\n";
  blocked.forEach((b, i) => {
    md += "| " + (i + 1) + " | " + b.action + " | " + (b.expected || "Bị từ chối") + " | " + b.reason + " |\n";
  });
  md += "\n";

  md += "## 8. Đối chiếu thao tác giao diện với giao dịch trên chuỗi\n\n";
  md += "| Thao tác trên giao diện `index.html` | Hàm contract | Thay đổi trạng thái |\n|---|---|---|\n";
  md += "| Quản trị đơn vị phát hành → Cấp quyền phát hành | `addIssuer(address)` | `isIssuer[addr]` = true, event `IssuerAdded` |\n";
  md += "| Cấp chứng chỉ → nút Cấp chứng chỉ | `issueCertificate(bytes32,bytes32,address)` | `certificates[certId].status` None → Issued, event `CertificateIssued` |\n";
  md += "| Xác minh → nút Xác minh (có nhập mã) | `verifyCertificate(bytes32,bytes32)` | Chỉ đọc, không phát sinh giao dịch |\n";
  md += "| Xác minh → nút Xác minh (bỏ trống mã) | Truy vấn event `CertificateIssued` lọc theo `certHash` để tra `certId`, rồi `verifyCertificate` | Chỉ đọc, không phát sinh giao dịch |\n";
  md += "| Chứng chỉ của tôi → mở tab | Truy vấn event `CertificateIssued` lọc theo `holder`, rồi `certificates(bytes32)` | Chỉ đọc, không phát sinh giao dịch |\n";
  md += "| Tra cứu & thu hồi → nút Thu hồi | `revokeCertificate(bytes32)` | `status` Issued → Revoked, event `CertificateRevoked` |\n\n";
  md += "Giao diện băm tệp bằng `keccak256` ngay trên máy người dùng; tệp gốc không được tải lên. ";
  md += "Giá trị đưa lên chuỗi chỉ gồm certId, hash tệp và địa chỉ ví.\n\n";

  md += "## 9. Độ trễ và chi phí\n\n";

  md += "### 9.1. Phương pháp đo\n\n";
  md += "| Hạng mục | Cách làm |\n|---|---|\n";
  md += "| Đồng hồ | `process.hrtime.bigint()` — độ phân giải nano giây, không bị lệch khi đồng hồ hệ thống đồng bộ lại |\n";
  md += "| Thao tác ghi | Đo từ lúc gửi giao dịch tới khi `tx.wait()` trả về receipt |\n";
  md += "| Thao tác đọc | " + READ_SAMPLES + " mẫu mỗi thao tác, có một lần gọi khởi động bị loại bỏ trước khi đo |\n";
  md += "| Thống kê | Báo cả trung vị và p95 thay vì chỉ trung bình, vì trung bình bị kéo lệch bởi vài mẫu ngoại lai |\n";
  md += "| Máy đo | Node.js " + process.version + " trên mạng local Hardhat |\n\n";

  md += "### 9.2. Thao tác ghi — gas và độ trễ\n\n";
  md += "| Thao tác | Gas | Độ trễ (ms) |\n|---|---|---|\n";
  md += "| Deploy contract | " + deployRc.gasUsed.toString() + " | " + ms2(deployMs) + " |\n";
  rows.forEach((r) => {
    md += "| " + r.action.split(" — ")[0] + " | " + r.gas + " | " + ms2(r.latency) + " |\n";
  });
  md += "\n";

  md += "### 9.3. Thao tác đọc — độ trễ\n\n";
  md += "Các thao tác dưới đây không phát sinh giao dịch nên **chi phí gas bằng 0**.\n\n";
  md += "| Thao tác | Mẫu | Nhỏ nhất | Trung vị | Trung bình | p95 | Lớn nhất |\n|---|---|---|---|---|---|---|\n";
  readLat.forEach((r) => {
    md += "| " + r.action + " | " + r.samples + " | " + ms2(r.min) + " | " + ms2(r.median) +
      " | " + ms2(r.mean) + " | " + ms2(r.p95) + " | " + ms2(r.max) + " |\n";
  });
  md += "\n";

  md += "### 9.4. Giới hạn diễn giải của các số đo này\n\n";
  md += "1. **Mạng local Hardhat đào block tức thì.** Không có thời gian chờ đồng thuận, không có ";
  md += "hàng đợi giao dịch, không có cạnh tranh phí. Độ trễ ghi đo được ở đây gần như chỉ là thời gian ";
  md += "vòng tròn của lời gọi RPC nội bộ, **không đại diện cho mạng thật**. Trên Ethereum mainnet, một ";
  md += "block mất khoảng 12 giây, nên độ trễ ghi thực tế sẽ lớn hơn nhiều bậc.\n";
  md += "2. **Độ trễ đọc thì có ý nghĩa hơn.** Thao tác `view` không cần đồng thuận nên số đo ở đây phản ánh ";
  md += "đúng bản chất: xác minh là thao tác rẻ và nhanh. Trên mạng thật, phần tăng thêm chủ yếu là độ trễ ";
  md += "mạng tới node RPC, không phải chi phí tính toán.\n";
  md += "3. **Gas thì không phụ thuộc mạng.** Lượng gas ở Mục 9.2 đúng trên mọi mạng EVM; chỉ có ";
  md += "*giá* mỗi đơn vị gas là thay đổi theo mạng và theo thời điểm.\n";
  md += "4. **Số đo phụ thuộc máy chạy.** Chạy lại trên máy khác sẽ ra con số khác. Đây là lý do bảng trên ";
  md += "báo trung vị và p95 thay vì một giá trị đơn lẻ.\n\n";

  md += "## 10. Kết quả kiểm thử tự động\n\n";
  md += "Lệnh: `npx hardhat test`. Mỗi test deploy một contract mới qua `beforeEach` nên các test độc lập hoàn toàn.\n\n";
  md += "**Kết quả: " + TEST_PASSING + "/" + TEST_PASSING + " passing (" + TEST_DURATION + "), 0 failing.**\n\n";
  md += "```\n" + TEST_OUTPUT + "```\n\n";
  md += "> Khối kết quả trên được dán từ lần chạy thực tế và lưu trong `scripts/collect-evidence.js`. ";
  md += "Nếu bộ test thay đổi, cập nhật hằng số `TEST_OUTPUT` trong script rồi sinh lại tệp này.\n\n";

  md += "### 10.1. Phân loại test\n\n";
  md += "| Nhóm | Số lượng | Mục đích |\n|---|---|---|\n";
  md += "| Happy path | 4 | Xác nhận luồng đúng hoạt động đúng |\n";
  md += "| Hành vi sai bị chặn | 12 | Xác nhận truy cập trái phép và trạng thái sai đều bị từ chối |\n";
  md += "| Bất biến nghiệp vụ | 3 | Xác nhận dữ liệu lịch sử không mất khi trạng thái đổi |\n";
  md += "| Quyết định thiết kế có chủ đích | 2 | Ghim lại hành vi dễ bị hiểu nhầm là lỗ hổng, kèm ranh giới rủi ro |\n";
  md += "| Truy vấn qua event | 5 | Xác nhận lọc theo `holder` và `certHash` chạy đúng — nền tảng của F2 và xác minh không cần mã |\n\n";
  md += "Test âm bản chiếm 12/26 — phù hợp với trọng tâm của đề tài là chứng minh access control và ";
  md += "state machine được cưỡng chế đúng, không chỉ chứng minh luồng thuận chạy được.\n\n";
  md += "Nhóm cuối ghim lại khả năng lọc event theo tham số `indexed`.\n\n";

  md += "### 10.2. Đối chiếu test với yêu cầu chức năng\n\n";
  md += "| Mã | Yêu cầu | Test tương ứng | Trạng thái |\n|---|---|---|---|\n";
  md += "| F1 | Issuer cấp chứng chỉ mới, ghi hash + metadata lên contract | Test 1, 15 | Đạt |\n";
  md += "| F2 | Holder xem danh sách/chi tiết chứng chỉ mình sở hữu | Test 22, 23 | Đạt một phần — xem Mục 10.4 |\n";
  md += "| F3 | Verifier đối chiếu hash và trạng thái | Test 2, 3, 11, 24, 25 | Đạt |\n";
  md += "| F4 | Issuer thu hồi chứng chỉ đã cấp | Test 4, 8, 12, 17, 19 | Đạt |\n";
  md += "| F5 | Từ chối yêu cầu cấp từ địa chỉ không được ủy quyền | Test 5, 10 | Đạt |\n\n";

  md += "### 10.3. Đối chiếu test với lớp phòng thủ trong contract\n\n";
  md += "| Lớp phòng thủ | Dòng contract | Test xác nhận |\n|---|---|---|\n";
  md += "| `onlyOwner` — chỉ chủ sở hữu phân quyền | 58–61 | Test 9 |\n";
  md += "| `onlyIssuer` — chỉ issuer được ủy quyền cấp | 63–66 | Test 5, 10 |\n";
  md += "| Chặn zero address khi thêm issuer | 80 | Test 14 |\n";
  md += "| Chặn zero address cho holder | 94 | Test 13 |\n";
  md += "| Chặn trùng certId / hồi sinh cert đã thu hồi | 95 | Test 7, 17 |\n";
  md += "| Chặn thu hồi cert chưa cấp / thu hồi hai lần | 111 | Test 8, 12 |\n";
  md += "| Chỉ đúng issuer đã cấp mới thu hồi được | 112 | Test 6, 20 |\n\n";
  md += "Mọi `require` và `modifier` trong contract đều có ít nhất một test tương ứng.\n\n";

  md += "### 10.4. Phạm vi đạt được của yêu cầu F2\n\n";
  md += "F2 được đánh giá là **đạt một phần**. Học viên biết được gì tùy vào việc họ có tệp gốc hay không:\n\n";
  md += "| Tình huống | Học viên thấy được |\n|---|---|\n";
  md += "| Chỉ kết nối ví, không có tệp | Số lượng chứng chỉ, ngày cấp, địa chỉ đơn vị cấp, và **trạng thái còn hiệu lực hay đã thu hồi** |\n";
  md += "| Có tệp gốc | Thêm: xác minh được tệp nào ứng với bản ghi nào (qua tab Xác minh) |\n";
  md += "| Dùng đúng trình duyệt đã cấp | Thêm: mã chứng chỉ gốc và tên khóa học, lấy từ `localStorage` |\n\n";
  md += "Phần **chưa đạt**: học viên không có tệp gốc thì chỉ đọc được `certId` — một giá trị băm, ";
  md += "không suy ngược ra tên khóa học. Đây là hệ quả trực tiếp của quyết định chỉ đưa hash lên chuỗi ";
  md += "(Proposal mục 4, Bảng 5), không phải thiếu sót khi lập trình.\n\n";
  md += "Vẫn giữ nguyên thiết kế này vì việc theo dõi được trạng thái thu hồi đã là năng lực có giá trị: ";
  md += "học viên tự phát hiện chứng chỉ của mình bị thu hồi mà không phụ thuộc vào việc đơn vị cấp có ";
  md += "thông báo hay không — đúng với abuse case \"Issuer/insider\" trong threat model (Proposal mục 5, Bảng 6).\n\n";
  md += "Hai hướng khắc phục đã cân nhắc, xếp vào công việc tiếp theo:\n\n";
  md += "1. **Phát tên khóa học vào event** (không lưu vào storage nên chỉ tốn vài trăm gas). Đổi lại, tên ";
  md += "khóa học trở thành dữ liệu công khai vĩnh viễn, làm nặng thêm rủi ro tồn dư ở dòng cuối Bảng 6 và ";
  md += "nới lỏng so với phân loại dữ liệu đã đăng ký ở Bảng 5.\n";
  md += "2. **Chuẩn W3C Verifiable Credentials** như EBSI đang dùng (Proposal mục 2, mục 8) — giải quyết ";
  md += "triệt để nhưng vượt phạm vi một MVP cá nhân trong một tháng.\n\n";
  md += "Phương án mã hóa tên khóa học bằng khóa công khai của học viên đã bị loại: MetaMask đã gỡ bỏ ";
  md += "`eth_getEncryptionPublicKey` và `eth_decrypt`, nên không thực hiện được trong trình duyệt nếu ";
  md += "không dựng thêm hạ tầng quản lý khóa riêng.\n\n";

  md += "## 11. Phân tích tĩnh — Slither\n\n";
  md += "| Hạng mục | Giá trị |\n|---|---|\n";
  md += "| Công cụ | Slither (`slither-analyzer`) |\n";
  md += "| Lệnh | `slither .` chạy tại thư mục gốc (tự gọi `hardhat clean` + `compile --force`) |\n";
  md += "| Log gốc | `docs/slither-report.txt` |\n";
  md += "| Phạm vi | 1 contract, 102 detector |\n";
  md += "| Kết quả | **3 phát hiện — 0 High, 0 Medium, 2 Low, 1 Optimization** |\n\n";
  md += "Không có phát hiện nào ở mức High hoặc Medium.\n\n";

  md += "### 11.1. Bảng phát hiện\n\n";
  md += "| # | Detector | Mức | Vị trí | Kết luận |\n|---|---|---|---|---|\n";
  md += "| 1 | `timestamp` | Low | `issueCertificate` — dòng 93–106 | **False positive** |\n";
  md += "| 2 | `timestamp` | Low | `revokeCertificate` — dòng 109–116 | **False positive** |\n";
  md += "| 3 | `immutable-states` | Optimization | `owner` — dòng 35 | Hợp lệ, **không áp dụng** (có lập luận) |\n\n";

  md += "### 11.2. Phát hiện 1 và 2 — `timestamp`: false positive\n\n";
  md += "Slither báo hai hàm *\"uses timestamp for comparisons\"* và liệt kê các so sánh sau là nguy hiểm:\n\n";
  md += "```\n";
  md += "- require(certificates[certId].status == Status.None, \"...certId already used\")     (dòng 95)\n";
  md += "- require(cert.status == Status.Issued, \"...certificate not in Issued state\")       (dòng 111)\n";
  md += "- require(cert.issuer == msg.sender, \"...only the issuing address can revoke\")      (dòng 112)\n";
  md += "```\n\n";
  md += "**Cả ba so sánh này đều không liên quan tới thời gian.** Dòng 95 và 111 so sánh giá trị `enum Status`; ";
  md += "dòng 112 so sánh hai biến `address`. Không có biểu thức nào trong contract lấy `block.timestamp` làm điều kiện.\n\n";
  md += "Nguyên nhân báo nhầm: detector `timestamp` hoạt động ở mức hàm — nó đánh dấu bất kỳ hàm nào có **đọc** ";
  md += "`block.timestamp`, rồi liệt kê **toàn bộ** phép so sánh trong hàm đó là \"dangerous comparisons\", không ";
  md += "phân tích xem giá trị timestamp có thật sự chảy vào phép so sánh hay không. Trong contract này, ";
  md += "`block.timestamp` chỉ xuất hiện ở hai chỗ và cả hai đều là **ghi dữ liệu, không phải điều kiện**:\n\n";
  md += "| Vị trí | Cách dùng | Có nằm trong điều kiện không? |\n|---|---|---|\n";
  md += "| Dòng 102 | `issuedAt: block.timestamp` — gán vào trường của struct | Không |\n";
  md += "| Dòng 115 | `emit CertificateRevoked(..., block.timestamp)` — tham số event | Không |\n\n";
  md += "Ngay cả cách dùng thực tế cũng vô hại. Người đào block có thể làm lệch timestamp trong khoảng vài giây ";
  md += "tới vài chục giây, nhưng giá trị này chỉ dùng để ghi **ngày cấp chứng chỉ** phục vụ hiển thị và kiểm toán ";
  md += "— không có nhánh logic nào rẽ theo nó, không có phần thưởng kinh tế nào để thao túng, và sai lệch vài giây ";
  md += "không đổi ý nghĩa nghiệp vụ của một ngày cấp.\n\n";
  md += "**Kết luận: không sửa code.** Sửa để làm im cảnh báo (ví dụ bỏ trường `issuedAt`) sẽ làm mất một dữ liệu ";
  md += "kiểm toán cần thiết mà không đổi lại được lợi ích an toàn nào.\n\n";

  md += "### 11.3. Phát hiện 3 — `immutable-states`: hợp lệ nhưng không áp dụng\n\n";
  md += "Slither đề xuất khai báo `address public immutable owner` vì biến này chỉ được gán một lần trong ";
  md += "constructor và không bao giờ đổi. Đây **không phải false positive** — đề xuất đúng về mặt kỹ thuật: ";
  md += "biến `immutable` được nhúng thẳng vào bytecode nên đọc rẻ hơn khoảng 2.100 gas so với đọc từ storage.\n\n";
  md += "Quyết định: **giữ nguyên `address public owner`**, vì hai lý do.\n\n";
  md += "**Thứ nhất — không khóa vĩnh viễn khả năng chuyển quyền sở hữu.** Threat model (Proposal mục 5, Bảng 6) ";
  md += "đã liệt kê \"Issuer/insider bị lộ khóa quản trị\" là một rủi ro tồn dư có thật. Nếu khai báo `immutable`, ";
  md += "contract vĩnh viễn không thể bổ sung hàm `transferOwnership` ở phiên bản sau; khóa owner bị mất hoặc lộ ";
  md += "đồng nghĩa với việc không còn ai phân quyền được nữa. Giữ biến ở storage là chừa lại đường nâng cấp.\n\n";
  md += "**Thứ hai — lợi ích gas không đáng kể.** Biến `owner` chỉ được đọc trong modifier `onlyOwner` (áp cho ";
  md += "`addIssuer` và `removeIssuer` — hai thao tác quản trị hiếm khi gọi) và trong lời gọi read-only `owner()` ";
  md += "từ giao diện để hiển thị vai trò. Nó không nằm trên đường đi nóng của `issueCertificate`, ";
  md += "`revokeCertificate` hay `verifyCertificate` — ba thao tác chiếm gần như toàn bộ lưu lượng thực tế.\n\n";
  md += "Đánh đổi giữa \"tiết kiệm ~2.100 gas cho thao tác quản trị hiếm\" và \"mất vĩnh viễn khả năng khôi phục ";
  md += "quyền sở hữu\" nghiêng rõ về phía không áp dụng.\n\n";

  md += "### 11.4. Những lỗ hổng Slither KHÔNG phát hiện\n\n";
  md += "Kết quả âm tính cũng là bằng chứng cần ghi nhận. Trong 102 detector đã chạy, các nhóm sau không có phát hiện nào:\n\n";
  md += "| Nhóm lỗ hổng | Kết quả | Lý do về mặt thiết kế |\n|---|---|---|\n";
  md += "| Reentrancy (mọi biến thể) | Không có | Contract không thực hiện bất kỳ lời gọi ngoài nào (`call`, `transfer`, `delegatecall`) |\n";
  md += "| Access control (`suicidal`, `unprotected-upgrade`, `arbitrary-send`) | Không có | Mọi hàm ghi đều qua `modifier` hoặc `require` kiểm tra `msg.sender` |\n";
  md += "| `tx.origin` dùng để xác thực | Không có | Contract chỉ dùng `msg.sender` |\n";
  md += "| `delegatecall` / `selfdestruct` | Không có | Contract không dùng |\n";
  md += "| Tràn số nguyên | Không áp dụng | Solidity 0.8.24 tự kiểm tra overflow/underflow ở mức compiler |\n";
  md += "| Biến chưa khởi tạo, shadowing | Không có | — |\n\n";

  md += "### 11.5. Ghi chú khi đọc log gốc\n\n";
  md += "Trong `docs/slither-report.txt` có một khối văn bản trông như lỗi PowerShell ";
  md += "(`slither.exe : INFO:Detectors:` kèm `NativeCommandError`). Đây **không phải lỗi chạy Slither**. ";
  md += "Slither ghi toàn bộ output chẩn đoán ra luồng `stderr` theo thiết kế; PowerShell mặc định bọc mọi nội dung ";
  md += "`stderr` của chương trình ngoài thành đối tượng lỗi rồi in ra theo định dạng lỗi. Dòng cuối ";
  md += "`INFO:Slither:. analyzed (1 contracts with 102 detectors), 3 result(s) found` xác nhận quá trình phân tích ";
  md += "đã hoàn tất bình thường.\n\n";

  md += "## 12. Ảnh chụp màn hình\n\n";
  md += "**12.1. Cấp chứng chỉ thành công** — banner xác nhận và mục nhật ký kèm tx hash, số block, lượng gas.\n\n";
  md += "![Cấp chứng chỉ thành công](docs/screenshots/01-cap-thanh-cong.png)\n\n";
  md += "**12.2. Xác minh hợp lệ** — nộp đúng tệp gốc, hash khớp và trạng thái còn hiệu lực.\n\n";
  md += "![Xác minh hợp lệ](docs/screenshots/02-xac-minh-hop-le.png)\n\n";
  md += "**12.3. Thao tác bị chặn** — ví không được cấp quyền phát hành cố cấp chứng chỉ; giao dịch revert với lý do ";
  md += "lấy trực tiếp từ `require` trong contract.\n\n";
  md += "![Thao tác bị chặn](docs/screenshots/03-bi-chan.png)\n\n";
  md += "**12.4. Chứng chỉ đã bị thu hồi** — xác minh lại bằng **đúng tệp gốc** sau khi thu hồi: hash vẫn khớp nhưng ";
  md += "kết quả trả về không hợp lệ. Minh chứng trực quan cho state machine một chiều `Issued → Revoked` ở Mục 6.\n\n";
  md += "![Chứng chỉ đã bị thu hồi](docs/screenshots/04-da-thu-hoi.png)\n\n";
  md += "**12.5. Tệp bị chỉnh sửa không khớp** — nộp tệp PDF đã sửa nội dung: mã chứng chỉ vẫn tồn tại và còn hiệu lực ";
  md += "nhưng hash không khớp. Minh chứng cho abuse case \"Holder gian lận\" trong threat model (Proposal mục 5, Bảng 6).\n\n";
  md += "![Tệp không khớp](docs/screenshots/05-tep-khong-khop.png)\n\n";
  md += "**12.6. Màn hình học viên (F2)** — ví học viên kết nối và thấy danh sách chứng chỉ của chính mình, ";
  md += "dựng từ event trên chuỗi nên hoạt động trên bất kỳ máy nào.\n\n";
  md += "![Chứng chỉ của tôi](docs/screenshots/06-chung-chi-cua-toi.png)\n\n";

  md += "## 13. So sánh với baseline tập trung (Proposal mục 2.1 và mục 6)\n\n";
  md += "### 13.1. So sánh định lượng — thời gian xác minh một chứng chỉ\n\n";
  const vfy = readLat.find((r) => r.action.startsWith("verifyCertificate"));
  const hashOp = readLat.find((r) => r.action.startsWith("keccak256"));
  const e2e = (vfy && hashOp) ? vfy.median + hashOp.median : null;
  md += "| Bước trong một lượt xác minh | MVP CredVerify | Baseline thủ công |\n|---|---|---|\n";
  md += "| Băm tệp trên máy nhà tuyển dụng | " + (hashOp ? ms2(hashOp.median) + " ms" : "—") + " | Không có bước này |\n";
  md += "| Tra cứu và đối chiếu | " + (vfy ? ms2(vfy.median) + " ms" : "—") + " (đọc on-chain) | Gửi văn bản / email cho đơn vị cấp rồi chờ phản hồi |\n";
  md += "| **Tổng thời gian** | **" + (e2e != null ? ms2(e2e) + " ms" : "—") + "** (đo thực tế) | **Vài ngày tới hơn một tuần** (ước lượng từ nguồn thứ cấp — xem 13.3) |\n";
  md += "| Chi phí mỗi lượt xác minh | 0 gas (hàm `view`) | Nhân lực hai phía |\n";
  md += "| Kết quả có chắc chắn nhận được không? | Có — hàm luôn trả về một trong ba trạng thái | **Không** — có thể không nhận được phản hồi nào |\n";
  md += "| Cần đơn vị cấp còn hoạt động? | Không | Có |\n";
  md += "| Xác minh được ngoài giờ hành chính? | Có | Không |\n\n";
  md += "Dòng \"kết quả có chắc chắn nhận được không\" đáng chú ý hơn cả dòng thời gian. Khác biệt giữa hai ";
  md += "phương án không chỉ là nhanh hay chậm, mà là **có kết quả xác định** hay **có thể không có kết quả nào**.\n\n";
  md += "### 13.2. So sánh định tính (rút từ Proposal mục 2.1, đã kiểm chứng bằng MVP)\n\n";
  md += "| Tiêu chí | CSDL tập trung (baseline) | CredVerify | Bằng chứng trong tệp này |\n|---|---|---|---|\n";
  md += "| Trust | Verifier phải tin tuyệt đối vào issuer | Xác minh độc lập qua hash công khai | Mục 6, Mục 12.2 |\n";
  md += "| Khả dụng dài hạn | Mất tra cứu nếu issuer ngừng vận hành | Bản ghi vẫn còn trên chuỗi | Mục 10.2 (test 16) |\n";
  md += "| Auditability | Issuer sửa/xóa được, không để dấu vết | Lịch sử Issue/Revoke bất biến, truy vết công khai | Mục 5, Mục 6 |\n";
  md += "| Chi phí vận hành | Thấp: server + CSDL | Cao hơn: gas khi ghi, đọc thì miễn phí | Mục 9.2, 9.3 |\n";
  md += "| Độ phức tạp triển khai | Thấp | Cao hơn: cần kiến thức smart contract | — |\n";
  md += "| Độ trễ xác minh | Nhanh nếu server còn sống | Nhanh, không phụ thuộc server của issuer | Mục 9.3 |\n\n";
  md += "### 13.3. Nguồn của con số baseline và giới hạn của nó\n\n";
  md += "**Cảnh báo về cách đọc:** cột MVP ở Mục 13.1 là **số đo thực tế** của đề tài này. Cột baseline ";
  md += "**không phải số đo** — đề tài không tự khảo sát được thời gian phản hồi của các trung tâm đào tạo. ";
  md += "Đó là ước lượng tổng hợp từ nguồn thứ cấp, và phải được trình bày đúng như vậy trong báo cáo.\n\n";
  md += "**Bối cảnh Việt Nam.** Báo Tuổi Trẻ (02/12/2023) ghi nhận quy trình xác minh văn bằng truyền thống ";
  md += "\"tốn nhiều thời gian\", dữ liệu các trường \"không đầy đủ\" và mỗi trường \"làm một kiểu\". ";
  md += "Ông Thái Phương Triều, giám đốc Công ty Talent, được dẫn lời: *\"Nếu chỉ gửi văn bản hay email rồi ngồi đợi ";
  md += "thì chưa chắc đơn vị tuyển dụng nhận được phản hồi, nếu có thì cũng rất lâu.\"* Ông Trần Ngọc Phú, ";
  md += "giám đốc Công ty PVAcons, cho biết nhiều hồ sơ văn bằng \"chưa được số hóa, mất nhiều thời gian, công sức để xác minh\".\n\n";
  md += "**So sánh quốc tế.** Ngành sàng lọc nhân sự Hoa Kỳ công bố thời gian xác minh học vấn trung bình ";
  md += "khoảng **2–5 ngày làm việc**, nhanh nhất khoảng 72 giờ khi trường có tham gia hệ thống tra cứu tập trung ";
  md += "(National Student Clearinghouse). Con số này là **cận dưới lạc quan** cho bối cảnh Việt Nam, vì nó giả định ";
  md += "có hạ tầng tra cứu tập trung mà các trung tâm đào tạo ngắn hạn ở Việt Nam chưa có.\n\n";
  md += "**Vì sao không có thời hạn pháp lý để trích dẫn.** Thông tư 21/2019/TT-BGDĐT và các văn bản liên quan ";
  md += "có quy định thời hạn cho một số thủ tục hành chính (ví dụ 03 ngày làm việc cho việc chỉnh sửa nội dung ";
  md += "văn bằng; tối đa 20 ngày làm việc cho công nhận văn bằng do nước ngoài cấp). Nhưng **không có thời hạn nào ";
  md += "ràng buộc việc một doanh nghiệp gửi yêu cầu xác minh tới đơn vị cấp** — đây là trao đổi ngoài thủ tục ";
  md += "hành chính. Chính khoảng trống đó giải thích vì sao thời gian phản hồi không xác định được, và vì sao ";
  md += "khả năng \"không nhận được phản hồi nào\" là có thật.\n\n";
  md += "**Phạm vi áp dụng còn hẹp hơn nữa với đề tài này.** Các hệ thống tra cứu văn bằng hiện có ở Việt Nam ";
  md += "chủ yếu phủ văn bằng chính quy của trường đại học, cao đẳng, và thường chỉ từ một mốc năm nhất định trở đi. ";
  md += "**Chứng chỉ khóa học ngắn hạn do trung tâm đào tạo cấp — chính là đối tượng của đề tài này — gần như ";
  md += "nằm ngoài mọi hệ thống tra cứu tập trung.** Với nhóm này, baseline thực tế không phải \"tra cứu chậm\" ";
  md += "mà là \"không có kênh tra cứu nào\".\n\n";
  md += "**Nếu muốn nâng chất lượng bằng chứng**, cách làm chuẩn là gửi yêu cầu xác minh thử tới 3–5 trung tâm ";
  md += "đào tạo, ghi lại thời điểm gửi và thời điểm nhận phản hồi, rồi báo cáo cả số trường hợp **không phản hồi**. ";
  md += "Khi đó cột baseline mới trở thành số đo của đề tài thay vì trích dẫn.\n\n";
  md += "Nguồn tham khảo:\n\n";
  md += "- Trần Huỳnh, *\"Vụ giảng viên dùng bằng tiến sĩ giả: Cần khắc phục lỗ hổng tra cứu văn bằng\"*, ";
  md += "Tuổi Trẻ Online, 02/12/2023. https://tuoitre.vn/vu-giang-vien-dung-bang-tien-si-gia-can-khac-phuc-lo-hong-tra-cuu-van-bang-20231202081544234.htm\n";
  md += "- Thông tư 21/2019/TT-BGDĐT — Quy chế quản lý văn bằng, chứng chỉ của hệ thống giáo dục quốc dân. ";
  md += "https://luatvietnam.vn/giao-duc/thong-tu-21-2019-tt-bgddt-quy-che-quan-ly-bang-tot-nghiep-178752-d1.html\n";
  md += "- GoodHire, *\"How Long Do Background Checks Take?\"*. https://www.goodhire.com/blog/how-long-do-background-checks-take/\n";
  md += "- First Advantage, *\"How Long Does a Background Check Take?\"*. https://fadv.com/article/how-long-does-a-background-check-take/\n\n";

  md += "## 14. Cam kết an toàn dữ liệu\n\n";
  md += "- Không có private key, seed phrase hay access token nào trong tệp này.\n";
  md += "- Không có dữ liệu cá nhân thật; tên học viên trong demo là dữ liệu giả.\n";
  md += "- Các địa chỉ ví ở Mục 3 là tài khoản mặc định của mạng local Hardhat, công khai theo thiết kế.\n";

  const outPath = path.join(__dirname, "..", "EVIDENCE.md");
  fs.writeFileSync(outPath, md, "utf8");

  console.log("\nĐã ghi:", outPath);
  console.log("Giao dịch thành công:", rows.length, "| Hành vi bị chặn:", blocked.length, "| Event:", events.length);
  console.log("Thao tác đã đo độ trễ:", readLat.length, "(" + READ_SAMPLES + " mẫu mỗi thao tác)");
  readLat.forEach((r) => console.log("  -", r.action, "→ trung vị", ms2(r.median), "ms"));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
