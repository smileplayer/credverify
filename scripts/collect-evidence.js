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
const { PRODUCTION_DEFAULT: PROD_DELAY } = require("./lib/delay");
const fs = require("fs");
const path = require("path");

const { execSync } = require("child_process");
const { buildDirectory } = require("./lib/directory");

function runTests() {
  const t0 = process.hrtime.bigint();
  let out, failed = false;
  try {
    out = execSync("npx hardhat test", {
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, REPORT_GAS: "false" },
      cwd: path.join(__dirname, ".."),
    });
  } catch (e) {
    failed = true;
    out = (e.stdout || "") + (e.stderr || "");
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const passing = Number((out.match(/(\d+) passing/) || [])[1] || 0);
  const failing = Number((out.match(/(\d+) failing/) || [])[1] || 0);
  // Bỏ dòng trống thừa và mã màu ANSI cho gọn
  const clean = out.replace(/\u001b\[[0-9;]*m/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return { passing, failing, failed, ms, output: clean };
}


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

/**
 * Đọc coverage.json do `npx hardhat coverage` sinh ra và tính lại các tỉ lệ.
 * Nếu chưa chạy coverage thì trả về null và mục tương
 * ứng trong EVIDENCE.md sẽ nói thẳng là chưa có.
 */
function readCoverage() {
  const f = path.join(__dirname, "..", "coverage.json");
  if (!fs.existsSync(f)) return null;
  let data;
  try { data = JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; }
  const rows = [];
  const pct = (hit, total) => (total === 0 ? 100 : (hit / total) * 100);
  for (const key of Object.keys(data)) {
    const c = data[key];
    const sVals = Object.values(c.s || {});
    const fVals = Object.values(c.f || {});
    const bVals = Object.values(c.b || {}).flat();
    rows.push({
      file: (c.path || key).split(/[\\/]/).slice(-2).join("/"),
      stmts: pct(sVals.filter((v) => v > 0).length, sVals.length),
      branch: pct(bVals.filter((v) => v > 0).length, bVals.length),
      funcs: pct(fVals.filter((v) => v > 0).length, fVals.length),
      nStmts: sVals.length, nBranch: bVals.length, nFuncs: fVals.length,
    });
  }
  return rows.length ? rows : null;
}

async function main() {
  const net = await hre.ethers.provider.getNetwork();
  const [credverify, centerX, centerY, newKeyX, student, attacker, recruiter] =
    await hre.ethers.getSigners();

  console.log("Mạng:", hre.network.name, "| chainId:", net.chainId.toString());

  // ---------- Bước 1: deploy ----------
  const Factory = await hre.ethers.getContractFactory("CredentialRegistry");
  const deployRun = await timed(async () => {
    const r = await Factory.deploy(PROD_DELAY);   // độ trễ production (48 giờ); script tua thời gian
    await r.waitForDeployment();
    return r;
  });
  const registry = deployRun.result;
  const deployMs = deployRun.ms;
  const address = await registry.getAddress();
  const deployTx = registry.deploymentTransaction();
  const deployRc = await deployTx.wait();
  console.log("Đã deploy:", address, "|", ms2(deployMs), "ms");

  // ---------- Bước 2: owner công nhận hai đơn vị phát hành ----------
  let run = await timed(async () =>
    (await registry.connect(credverify).addIssuer(centerX.address, "Trung tam dao tao X")).wait());
  let rc = run.result;
  recordTx(2, "addIssuer — CredVerify công nhận Trung tâm X và gắn tên hiển thị", rc, "tên phải là duy nhất", run.ms);
  recordEvents(registry, rc, "addIssuer");

  await (await registry.connect(credverify).addIssuer(centerY.address, "Trung tam dao tao Y")).wait();

  // ---------- Bước 3: cấp chứng chỉ (happy path) ----------
  const pdfPath = path.join(__dirname, "..", "Demo", "DemoCert.pdf");
  if (!fs.existsSync(pdfPath)) throw new Error("Không tìm thấy tệp demo: " + pdfPath);
  const pdfData = fs.readFileSync(pdfPath);
  const certHash = hre.ethers.keccak256(pdfData);
  const certId = await registry.certIdOf(centerX.address, certHash);

  run = await timed(async () =>
    (await registry.connect(centerX).issueCertificate(certHash, student.address)).wait());
  rc = run.result;
  recordTx(3, "issueCertificate — Trung tâm X cấp chứng chỉ cho học viên", rc,
    "certId sinh tự động = keccak256(issuer ‖ certHash)", run.ms);
  recordEvents(registry, rc, "issueCertificate");

  const afterIssue = await registry.verifyCertificate(centerX.address, certHash);

  console.log("Đang đo độ trễ thao tác đọc (" + READ_SAMPLES + " mẫu mỗi thao tác)…");
  await measureRead("verifyCertificate — nhà tuyển dụng xác minh khi ĐÃ BIẾT đơn vị cấp (đường O(1))",
    () => registry.verifyCertificate(centerX.address, certHash));
  await measureRead("effectiveStatus — giao diện làm mới trạng thái HIỆU LỰC một chứng chỉ",
    () => registry.effectiveStatus(certId));
  await measureRead("buildDirectory — giao diện dựng danh bạ đơn vị phát hành từ event",
    () => buildDirectory(registry));
  await measureRead("keccak256 — băm tệp PDF trên máy người dùng (" + (pdfData.length / 1024).toFixed(0) + " KB)",
    async () => hre.ethers.keccak256(pdfData));

  // ---------- Bước 4: KHÔNG GIAN TÊN RIÊNG — đòn đăng ký trước bị vô hiệu ----------
  // Trung tâm Y (bất lương) đăng ký ĐÚNG tệp mà X đã cấp. 
  run = await timed(async () =>
    (await registry.connect(centerY).issueCertificate(certHash, attacker.address)).wait());
  recordTx(4, "issueCertificate — một đơn vị KHÁC đăng ký đúng tệp đó, bản ghi độc lập", run.result,
    "certId khác vì khóa gồm cả địa chỉ issuer", run.ms);
  const afterNamespaceX = await registry.verifyCertificate(centerX.address, certHash);
  const afterNamespaceY = await registry.verifyCertificate(centerY.address, certHash);

  // ---------- Bước 5–9: hành vi sai bị chặn ----------
  const tryBlock = async (label, expected, fn) => {
    try {
      await fn();
      blocked.push({ action: label, expected, reason: "KHÔNG BỊ CHẶN — cần xem lại contract" });
    } catch (err) {
      // Custom error: ethers giải mã thành err.revert.name nhờ ABI.
      const why = err.revert ? "revert `" + err.revert.name + "()`" : (err.reason || err.shortMessage || err.message);
      blocked.push({ action: label, expected, reason: why });
    }
  };

  await tryBlock("issueCertificate gọi từ ví chưa được công nhận là đơn vị phát hành",
    "Giao dịch phải revert",
    () => registry.connect(attacker).issueCertificate(certHash, student.address));

  await tryBlock("issueCertificate gọi từ chính OWNER — đơn vị vận hành không được cấp chứng chỉ",
    "Giao dịch phải revert",
    () => registry.connect(credverify).issueCertificate(certHash, student.address));

  await tryBlock("revokeCertificate gọi từ OWNER — đơn vị vận hành không được thu hồi",
    "Giao dịch phải revert",
    () => registry.connect(credverify).revokeCertificate(certId));

  await tryBlock("revokeCertificate gọi từ một đơn vị phát hành KHÁC (Trung tâm Y)",
    "Giao dịch phải revert",
    () => registry.connect(centerY).revokeCertificate(certId));

  await tryBlock("addIssuer với tên TRÙNG một đơn vị đã có — đường lạm quyền im lặng",
    "Giao dịch phải revert",
    () => registry.connect(credverify).addIssuer(attacker.address, "Trung tam dao tao X"));

  await tryBlock("issueCertificate cùng một tệp hai lần bởi cùng một đơn vị",
    "Giao dịch phải revert",
    () => registry.connect(centerX).issueCertificate(certHash, student.address));

  // Tệp bị sửa nội dung — hàm view, không phát sinh giao dịch
  const tamperedHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("noi-dung-tep-DA-BI-SUA"));
  const tamperedResult = await registry.verifyCertificate(centerX.address, tamperedHash);
  blocked.push({
    action: "verifyCertificate với tệp đã bị chỉnh sửa (hash không khớp)",
    expected: "Kết quả phải là false",
    reason: "Hàm read-only trả về valid = " + tamperedResult.valid + " (không phát sinh giao dịch)",
  });

  // ---------- Bước 10: thu hồi ----------
  run = await timed(async () =>
    (await registry.connect(centerX).revokeCertificate(certId)).wait());
  rc = run.result;
  recordTx(10, "revokeCertificate — Trung tâm X thu hồi chứng chỉ đã cấp", rc, "", run.ms);
  recordEvents(registry, rc, "revokeCertificate");
  const afterRevoke = await registry.verifyCertificate(centerX.address, certHash);

  // ---------- Bước 11: BẤT BIẾN — thu hồi là vĩnh viễn ----------
  await tryBlock("issueCertificate CẤP LẠI một tệp đã bị thu hồi — bất biến chống 'nói hai lời'",
    "Giao dịch phải revert",
    () => registry.connect(centerX).issueCertificate(certHash, student.address));

  await tryBlock("revokeCertificate lần hai trên cùng một chứng chỉ",
    "Giao dịch phải revert",
    () => registry.connect(centerX).revokeCertificate(certId));

  // ---------- Bước 12–17: kịch bản lộ khóa và dọn hậu quả ----------
  console.log("Đang chạy kịch bản lộ khóa…");
  const realHash2 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("BANG-THAT-THU-HAI-CUA-TRUNG-TAM-X"));
  await (await registry.connect(centerX).issueCertificate(realHash2, student.address)).wait();
  const realId2 = await registry.certIdOf(centerX.address, realHash2);
  const compromisedSince = (await hre.ethers.provider.getBlock("latest")).timestamp + 1; // khóa lộ từ đây

  const fakeHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("BANG-GIA-DO-KHOA-BI-LO"));
  run = await timed(async () =>
    (await registry.connect(centerX).issueCertificate(fakeHash, attacker.address)).wait());
  recordTx(12, "issueCertificate — kẻ tấn công dùng khóa đã lộ của Trung tâm X cấp một bằng giả",
    run.result, "", run.ms);
  const fakeId = await registry.certIdOf(centerX.address, fakeHash);
  run = await timed(async () =>
    (await registry.connect(centerX).revokeCertificate(realId2)).wait());
  recordTx(13, "revokeCertificate — kẻ tấn công thu hồi phá hoại một chứng chỉ THẬT",
    run.result, "", run.ms);
  const sabotaged = await registry.verifyCertificate(centerX.address, realHash2);

  // THỨ TỰ ĐÚNG: gỡ quyền NGAY (tức thì), rồi đề xuất chuyển giao kèm mốc lộ.
  run = await timed(async () =>
    (await registry.connect(credverify).removeIssuer(centerX.address)).wait());
  recordTx(14, "removeIssuer — chặn khóa lộ NGAY, không chờ", run.result, "hành động bảo vệ không qua độ trễ", run.ms);

  await tryBlock("khóa đã lộ cố cấp thêm chứng chỉ sau khi bị gỡ quyền",
    "Giao dịch phải revert",
    () => registry.connect(centerX).issueCertificate(
      hre.ethers.keccak256(hre.ethers.toUtf8Bytes("them-mot-cai-nua")), attacker.address));

  run = await timed(async () =>
    (await registry.connect(credverify).proposeInherit(centerX.address, newKeyX.address, compromisedSince)).wait());
  recordTx(15, "proposeInherit — đề xuất CÔNG KHAI chuyển danh tính sang khóa mới, kèm mốc lộ khóa",
    run.result, "phải chờ INHERIT_DELAY (tham số deploy; bằng chứng này dùng 48 giờ như production)", run.ms);
  recordEvents(registry, run.result, "proposeInherit");

  await tryBlock("executeInherit ngay sau khi đề xuất, chưa hết INHERIT_DELAY",
    "Giao dịch phải revert",
    () => registry.connect(credverify).executeInherit(centerX.address));

  await hre.network.provider.send("evm_increaseTime", [Number(await registry.INHERIT_DELAY())]);
  await hre.network.provider.send("evm_mine", []);
  run = await timed(async () =>
    (await registry.connect(credverify).executeInherit(centerX.address)).wait());
  recordTx(16, "executeInherit — sau INHERIT_DELAY: khóa mới nhận danh tính, ghi compromisedAt cho khóa lộ",
    run.result, "tên đi theo danh tính, không chép chuỗi", run.ms);
  recordEvents(registry, run.result, "executeInherit");

  const restored = await registry.verifyCertificate(centerX.address, realHash2);
  const flagged = await registry.verifyCertificate(centerX.address, fakeHash);

  await tryBlock("khóa đã lộ cố thu hồi bậy một chứng chỉ hợp lệ sau khi bị chuyển giao",
    "Giao dịch phải revert",
    () => registry.connect(centerX).revokeCertificate(fakeId));

  run = await timed(async () =>
    (await registry.connect(newKeyX).revokeCertificate(fakeId)).wait());
  recordTx(17, "revokeCertificate — khóa kế nhiệm dọn bằng giả do khóa cũ đã cấp", run.result, "", run.ms);
  const afterCleanup = await registry.verifyCertificate(centerX.address, fakeHash);

  // Bất biến owner ≠ issuer qua chuyển quyền.
  await tryBlock("transferOwnership cho một issuer đang hoạt động",
    "Giao dịch phải revert",
    () => registry.connect(credverify).transferOwnership(newKeyX.address));
  await (await registry.connect(credverify).transferOwnership(recruiter.address)).wait();
  await tryBlock("addIssuer cho chính owner đang được đề cử",
    "Giao dịch phải revert",
    () => registry.connect(credverify).addIssuer(recruiter.address, "Trung tam cua owner moi"));
  await (await registry.connect(credverify).transferOwnership(credverify.address)).wait();
  await (await registry.connect(credverify).acceptOwnership()).wait();

  // ---------- Bước 16: đo giới hạn khi mở rộng ----------
  console.log("Đang đo chi phí truy vấn theo số lượng đơn vị phát hành…");
  const scale = [];
  {
    const F2 = await hre.ethers.getContractFactory("CredentialRegistry");
    const r2 = await F2.deploy(PROD_DELAY); await r2.waitForDeployment();
    let made = 0, lastAdd = 0n;
    for (const N of [10, 50, 100]) {
      while (made < N) {
        lastAdd = (await (await r2.connect(credverify).addIssuer(
          hre.ethers.Wallet.createRandom().address, "TT-" + String(made).padStart(4, "0"))).wait()).gasUsed;
        made++;
      }
      scale.push({
        n: N,
        verify: (await r2.verifyCertificate.estimateGas(centerX.address, certHash)).toString(),
        add: lastAdd.toString(),
      });
    }
  }

  // ---------- Chạy lại bộ kiểm thử để lấy số liệu THẬT ----------
  console.log("Đang chạy lại npx hardhat test để lấy kết quả thật…");
  const T = runTests();
  console.log("  →", T.passing, "passing,", T.failing, "failing");

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
  md += "| `owner` — CredVerify, đơn vị vận hành sổ đăng ký | " + fmt(credverify.address) + " |\n";
  md += "| Trung tâm X — đơn vị phát hành, khóa bị lộ trong kịch bản | " + fmt(centerX.address) + " |\n";
  md += "| Trung tâm Y — đơn vị phát hành thứ hai | " + fmt(centerY.address) + " |\n";
  md += "| Khóa mới của Trung tâm X sau khi chuyển giao | " + fmt(newKeyX.address) + " |\n";
  md += "| Học viên (holder) | " + fmt(student.address) + " |\n";
  md += "| Ví không có quyền (dùng để test tấn công) | " + fmt(attacker.address) + " |\n\n";
  md += "Lưu ý: `owner` **không** xuất hiện trong bất kỳ giao dịch cấp hay thu hồi nào ở Mục 4.\n\n";

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
  md += "### 6.1. Vòng đời một chứng chỉ\n\n";
  md += "certId " + fmt(certId) + " — Trung tâm X, tệp `Demo/DemoCert.pdf`\n\n";
  md += "| Thời điểm | valid | status | Ý nghĩa |\n|---|---|---|---|\n";
  md += "| Sau khi cấp | " + afterIssue.valid + " | " + Number(afterIssue.status) + " | " + statusName[Number(afterIssue.status)] + " |\n";
  md += "| Sau khi thu hồi | " + afterRevoke.valid + " | " + Number(afterRevoke.status) + " | " + statusName[Number(afterRevoke.status)] + " |\n\n";
  md += "Trạng thái chuyển một chiều `Issued -> Revoked`: thu hồi bởi một khóa hợp lệ **không có đường quay lại** ";
  md += "(ngoại lệ duy nhất: lần thu hồi do một khóa đã bị tuyên bố lộ thực hiện bị vô hiệu — Mục 6.3). Hash tệp vẫn khớp sau khi ";
  md += "thu hồi nhưng `valid` trả về false — chứng minh trạng thái được kiểm tra độc lập với tính toàn vẹn của tệp. ";
  md += "Mục 7 có một dòng chứng minh việc **cấp lại** tệp đã thu hồi bị contract từ chối: đó là bất biến chống ";
  md += "\"nói hai lời\".\n\n";

  md += "### 6.2. Không gian tên riêng trong sổ chung\n\n";
  md += "Trung tâm Y đăng ký **đúng tệp** mà Trung tâm X đã cấp (Bước 4). Hai bản ghi hoàn toàn độc lập:\n\n";
  md += "| Bản ghi | valid | Ví học viên |\n|---|---|---|\n";
  md += "| Của Trung tâm X | " + afterNamespaceX.valid + " | " + fmt(afterNamespaceX.holder) + " |\n";
  md += "| Của Trung tâm Y | " + afterNamespaceY.valid + " | " + fmt(afterNamespaceY.holder) + " |\n\n";
  md += "Nếu khóa chính là hash tệp trần thì lời gọi thứ hai sẽ **khóa cửa** Trung tâm X khỏi chính chứng chỉ của ";
  md += "mình, và bản ghi trên chuỗi sẽ ghi tên kẻ tấn công là đơn vị cấp. Khóa `keccak256(issuer ‖ certHash)` cho ";
  md += "mỗi đơn vị một không gian tên riêng bên trong một sổ chung, nên đòn này vô hại.\n\n";

  md += "### 6.3. Dọn hậu quả sau khi khóa cấp bị lộ\n\n";
  md += "Kẻ gian giữ khóa của Trung tâm X cấp một bằng giả (#12) và thu hồi phá hoại một chứng chỉ thật (#13). ";
  md += "Owner gỡ quyền khóa lộ ngay (#14), đề xuất chuyển giao kèm mốc lộ `compromisedSince = " + compromisedSince + "` (#15), ";
  md += "chờ INHERIT_DELAY rồi thực thi (#16).\n\n";
  md += "| Bản ghi | Thời điểm | valid | status | revocationVoided | issuedAfterCompromise |\n|---|---|---|---|---|---|\n";
  md += "| Chứng chỉ thật bị thu hồi phá hoại | sau #13 | " + sabotaged.valid + " | " + Number(sabotaged.status) + " | " + sabotaged.revocationVoided + " | " + sabotaged.issuedAfterCompromise + " |\n";
  md += "| Chứng chỉ thật bị thu hồi phá hoại | sau #16 | " + restored.valid + " | " + Number(restored.status) + " | " + restored.revocationVoided + " | " + restored.issuedAfterCompromise + " |\n";
  md += "| Bằng giả do khóa lộ cấp | sau #16 | " + flagged.valid + " | " + Number(flagged.status) + " | " + flagged.revocationVoided + " | " + flagged.issuedAfterCompromise + " |\n";
  md += "| Bằng giả do khóa lộ cấp | sau #17 (khóa mới thu hồi) | " + afterCleanup.valid + " | " + Number(afterCleanup.status) + " | " + afterCleanup.revocationVoided + " | " + afterCleanup.issuedAfterCompromise + " |\n\n";
  md += "Lần thu hồi phá hoại bị **vô hiệu tự động** trong hàm xác minh — không cần giao dịch nào cho từng chứng chỉ, ";
  md += "và bản ghi gốc vẫn nằm nguyên trên chuỗi. Bằng giả được gắn cờ `issuedAfterCompromise` ngay khi chuyển giao xong, ";
  md += "trước cả khi khóa mới kịp thu hồi nó. Xem `docs/AUDIT-V3.md`.\n\n";

  md += "## 7. Hành vi sai bị chặn\n\n";
  md += "| # | Hành vi | Kỳ vọng | Kết quả thực tế |\n|---|---|---|---|\n";
  blocked.forEach((b, i) => {
    md += "| " + (i + 1) + " | " + b.action + " | " + (b.expected || "Bị từ chối") + " | " + b.reason + " |\n";
  });
  md += "\n";

  md += "## 8. Đối chiếu thao tác giao diện với giao dịch trên chuỗi\n\n";
  md += "| Thao tác trên giao diện `app/` | Hàm contract | Thay đổi trạng thái |\n|---|---|---|\n";
  md += "| Quản trị → Công nhận | `addIssuer(address,string)` | `issuerStatus` None→Active, `nameHolder[keccak(tên)]`, event `IssuerAdded` |\n";
  md += "| Quản trị → Gỡ quyền / Bật lại | `removeIssuer` / `restoreIssuer` | `issuerStatus` Active↔Disabled |\n";
  md += "| Quản trị → Đề xuất / Thực thi / Hủy chuyển giao | `proposeInherit(old,new,compromisedSince)` → INHERIT_DELAY → `executeInherit(old)`; `cancelInherit(old)` | `inheritProposals[old]`; khi thực thi: khóa cũ→Disabled, khóa mới→Active, `inheritedBy`, `identityOf`, `latestKeyOf`, `compromisedAt` + `compromiseDeclaredAt` (nếu khóa lộ) |\n";
  md += "| Quản trị → Chuyển/Hủy đề cử/Nhận quyền owner | `transferOwnership` / `cancelOwnershipTransfer` / `acceptOwnership` | `pendingOwner` rồi `owner` |\n";
  md += "| Cấp chứng chỉ → nút Cấp | `issueCertificate(bytes32,address)` | `certificates[certId].status` None→Issued, event `CertificateIssued` |\n";
  md += "| Tra cứu & thu hồi → nút Thu hồi | `revokeCertificate(bytes32)` | `status` Issued→Revoked, event `CertificateRevoked` |\n";
  md += "| Xác minh → có chọn đơn vị cấp | `verifyCertificate(address,bytes32)` | Chỉ đọc, **một** lời gọi view |\n";
  md += "| Xác minh → gõ tên in trên chứng chỉ (không cần event) | `issuerByName(string)` | Chỉ đọc trạng thái |\n";
  md += "| Xác minh → yêu cầu ứng viên chứng minh chủ ví | — (chữ ký `personal_sign`, 0 gas) | Không ghi gì lên chuỗi |\n";
  md += "| Xác minh → **bắt buộc** chọn đơn vị ghi trên chứng chỉ | — | Danh sách chọn gồm cả đơn vị đã ngừng, dựng từ event |\n";
  md += "| Xác minh → có biên nhận lô | `verifyInBatch(issuer, root, certHash, holder, salt, proof)` | Chỉ đọc, Merkle proof kiểm **trên chuỗi** |\n";
  md += "| (script) Cấp theo lô — `scripts/issue-batch.js` | `publishBatch(bytes32,uint32)` | `batches[batchId]`, event `BatchPublished` |\n";
  md += "| (script/Etherscan) Thu hồi trong lô | `revokeLeaf` / `revokeBatch` | `leafRevocation` / `batches[batchId].revokedAt, revokedBy` |\n";
  md += "| Chứng chỉ của tôi | event `CertificateIssued` lọc theo `holder`, rồi `verifyCertificate` (trạng thái hiệu lực) | Chỉ đọc |\n";
  md += "| Đơn vị phát hành → danh bạ | event `IssuerAdded/Removed/Restored/Inherited`, đối chiếu `activeIssuerCount()` | Chỉ đọc |\n";
  md += "| Đơn vị phát hành → nhật ký quản trị | event `IssuerAdded/Removed/Restored/Inherited` | Chỉ đọc |\n";
  md += "| Xác minh, Chứng chỉ của tôi, Đơn vị phát hành | qua `JsonRpcProvider` | **không cần ví** |\n\n";
  md += "`certId` **không** do người dùng nhập. Giao diện tính tại chỗ bằng `solidityPackedKeccak256([\"address\",\"bytes32\"], [ví, hash])`, ";
  md += "đúng công thức của hàm `pure certIdOf` trên chuỗi, nên không tốn một vòng RPC nào.\n\n";
  md += "Giao diện băm tệp bằng `keccak256` ngay trên máy người dùng; **tệp gốc không bao giờ rời máy**. ";
  md += "Giá trị đưa lên chuỗi chỉ gồm hash tệp và địa chỉ ví.\n\n";

  md += "## 8b. Ba việc giao diện làm mà contract không làm được\n\n";
  md += "Nguyên tắc phân chia: **contract cưỡng chế cái gì phải ĐÚNG, giao diện cung cấp cái gì phải được NHÌN THẤY.**\n\n";
  md += "| Cải tiến ở giao diện | Vì sao contract không làm được |\n|---|---|\n";
  md += "| **Cảnh báo tuổi khóa cấp** — hiện đơn vị được công nhận từ bao giờ, cách thời điểm cấp bao lâu | Trên chuỗi, \"đơn vị hợp pháp vừa được công nhận\" và \"ví giả được thêm 3 phút trước\" giống hệt nhau từng byte. Không `require` nào tách được hai cái đó; một con người có ngữ cảnh thì tách được ngay |\n";
  md += "| **Cảnh báo tên gần giống** — chuẩn hóa NFKC + gộp khoảng trắng + bỏ dấu rồi so | `nameHolder` chặn trùng tên y hệt theo byte; chuẩn hóa Unicode trong Solidity thì không có giá hợp lý |\n";
  md += "| **Ghi chú xoay khóa** — phân biệt \"đơn vị đã xoay sang khóa mới\" với \"đơn vị bị gỡ\" | Contract trả `issuerState = Disabled` cho cả hai; giao diện đọc thêm `currentKeyOf` để nói đúng chuyện gì đã xảy ra |\n\n";
  md += "**Giới hạn phải nói rõ:** mọi cảnh báo trên chỉ bảo vệ người đang dùng đúng trang này. Kẻ tấn công dựng ";
  md += "trang riêng, hoặc gọi thẳng contract qua Etherscan. Đây là lớp phòng vệ chống **nhầm lẫn**, không phải lớp ";
  md += "phòng vệ chống **tấn công**.\n\n";

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
  md += "**Kết quả: " + T.passing + " passing, " + T.failing + " failing** (" + ms2(T.ms) + " ms).\n\n";
  md += "```\n" + T.output + "\n```\n\n";
  md += "> Khối kết quả trên được sinh bằng cách **chạy lại `npx hardhat test` ngay trong script này**\n\n";

  md += "### 10.1. Nhóm kiểm thử\n\n";
  md += "| Nhóm | Mục đích |\n|---|---|\n";
  md += "| 1. Công nhận đơn vị phát hành | Chỉ owner công nhận được; một địa chỉ ứng với đúng một danh tính |\n";
  md += "| 1b. Tên là duy nhất | Chặn đường lạm quyền **im lặng**: hai ví cùng một tên |\n";
  md += "| 2. Cấp chứng chỉ | Happy path và mọi cách gọi sai đều bị chặn, kể cả từ owner |\n";
  md += "| 3. Không gian tên riêng | Đòn đăng ký trước bị vô hiệu; mỗi đơn vị một bản ghi độc lập, tra theo đơn vị |\n";
  md += "| 4. Thu hồi | Thu hồi bởi khóa hợp lệ là vĩnh viễn; owner không thu hồi được |\n";
  md += "| 5. Xoay khóa khi bị lộ | Chuyển giao chép tên, khóa cũ tê liệt hoàn toàn |\n";
  md += "| 6. Xác minh | Không bao giờ bị chặn, kể cả khi đơn vị cấp đã bị vô hiệu hóa |\n";
  md += "| 7. Khả kiến | Đơn vị thêm lén hiện ngay trong danh sách |\n";
  md += "| 8. Chuyển quyền owner | Hai bước, gõ nhầm không mất quyền vĩnh viễn |\n";
  md += "| 9. Ranh giới quyền owner | Liệt kê tường minh 14 hàm ghi; không hàm nào của owner chạm vào `certificates` |\n";
  md += "| 10. Dọn dẹp sau sự cố | Ghim **thứ tự thao tác đúng** và bẫy vận hành đi kèm |\n";
  md += "| A–E | Owner ≠ issuer qua chuyển quyền; xoay khóa từ Disabled; danh tính O(1); cấp/thu hồi theo lô; issuer multisig |\n";
  md += "| PoC, S1–S7 | Ba PoC của bản kiểm toán (đảo kỳ vọng); vô hiệu thu hồi do khóa lộ; cờ `issuedAfterCompromise`; độ trễ chuyển giao; tên dạng chuẩn; hủy đề cử owner |\n";
  md += "| W, D, C, E, G | Danh sách cho phép tên tiếng Việt (khớp `scripts/lib/name.js` trên 300 tên ngẫu nhiên); `INHERIT_DELAY` của bộ test; mốc công bố lộ; `effectiveStatus`; PoC lượt 2 (G-03, G-05 ghim rủi ro; G-04, G-06 đã sửa) |\n";
  md += "| V34-01 | `revokeLeaf` nhận `inner`, tự băm thành lá: nút trong ở mọi tầng (kể cả root) và cách gọi cũ (gửi lá) đều bị từ chối; `leafInnerOf` ≡ ngoài chuỗi; thống kê kiểm toán theo đơn vị của giao diện ≡ contract |\n";
  md += "| V341-01 | `INHERIT_DELAY` là tham số constructor trong [1 phút, 7 ngày], bất biến; `scripts/lib/delay.js` mặc định 48 giờ, từ chối < 24 giờ trên mạng không phải local/testnet; deploy 48 giờ: thực thi sớm bị chặn, đủ hạn thì chạy |\n";
  md += "| XSS qua chuỗi lỗi từ RPC / revert (frontend) | Chuỗi lỗi do kẻ tấn công (RPC độc hại hoặc revert) kiểm soát tới được client, nhưng `reasonOf()`/`esc()` THẬT của giao diện không để nó tới chỗ hiển thị; mọi chỗ dùng `reasonOf()` trong `app.js` đều qua `bannerText`/`esc`/`alert` |\n";
  md += "| CSP/SRI và quy tắc chung (frontend) | CSP khớp `RPC_URLS`, không script nội tuyến, SRI phát hành bắt được `app.js` bị sửa; chuẩn hóa tên và `certId` của giao diện ≡ script/contract |\n\n";
  md += "Trọng tâm của bộ kiểm thử là **hành vi sai bị chặn** và **kịch bản phục hồi sự cố**, ";
  md += "không chỉ chứng minh luồng thuận chạy được.\n\n";

  md += "### 10.2. Ba test khẳng định rủi ro thay vì vá\n\n";
  md += "Ba test dưới đây **pass** để ghim một rủi ro còn lại, không phải để tuyên bố đã xử lý. ";
  md += "Nếu một phiên bản sau vô tình vá chúng, test sẽ vỡ và buộc người sửa phải đọc lại lý do.\n\n";
  md += "| Test | Khẳng định điều gì |\n|---|---|\n";
  md += "| *GIỚI HẠN ĐÃ BIẾT: tên khác chữ hoa/thường vẫn đăng ký được* | `nameHolder` so khớp theo byte. Danh sách cho phép chặn chữ Kirin/Hy Lạp, ký tự vô hình, NFD, dấu chấm và ký tự đặc biệt; còn lại khác chữ hoa/thường hoặc l/I, 0/O — giao diện cảnh báo |\n";
  md += "| *RỦI RO CHẤP NHẬN (V32-01): owner qua mốc lộ khóa ảnh hưởng hiệu lực chứng chỉ trong 30 ngày* | Hồi sinh được một lần thu hồi hợp pháp và gắn cờ bằng thật cấp sau mốc lộ — công khai, sau INHERIT_DELAY. Contract ghi và trả thời điểm công bố để người xác minh thấy mốc bị lùi bao xa (test G-03) |\n";
  md += "| *RỦI RO CÒN LẠI: owner cướp được danh tính một trung tâm đang hoạt động* | Chuyển giao là quyền nguy hiểm nhất của owner; contract buộc nó qua đề xuất công khai + INHERIT_DELAY chờ (48 giờ ở production), nhưng owner một mình vẫn làm được — ví đa chữ ký là future work |\n";
  md += "| *CHỦ ĐÍCH: lô của khóa bị gỡ (không lộ) VẪN hợp lệ* | Gỡ quyền không viết lại quá khứ — áp dụng cho cả đường cấp theo lô |\n\n";

  md += "### 10.3. Đối chiếu test với lớp phòng thủ trong contract\n\n";
  md += "| Lớp phòng thủ | Test xác nhận |\n|---|---|\n";
  md += "| `onlyOwner` — chỉ CredVerify công nhận được đơn vị | *BỊ CHẶN: người ngoài không công nhận được ai* |\n";
  md += "| `onlyActiveIssuer` — chỉ đơn vị đang hoạt động mới cấp được | *BỊ CHẶN: ví không có quyền cấp*, *khóa đã bị gỡ quyền không cấp được nữa* |\n";
  md += "| `require(issuerAddress != owner)` | *BỊ CHẶN: owner không tự cấp quyền phát hành cho chính địa chỉ owner* |\n";
  md += "| `require(nameHolder[nameKey] == 0)` | *BỊ CHẶN: hai ví khác nhau KHÔNG mang được cùng một tên* |\n";
  md += "| Tên không được trả tự do khi gỡ quyền | *BẤT BIẾN: gỡ quyền KHÔNG trả tên đó lại cho người khác* |\n";
  md += "| `require(certHash != 0)` | *BỊ CHẶN: hash rỗng* |\n";
  md += "| `require(holder != address(0))` | *BỊ CHẶN: học viên là địa chỉ 0* |\n";
  md += "| `require(status == None)` — chặn trùng VÀ chặn cấp lại sau thu hồi | *BỊ CHẶN: cấp trùng*, *BẤT BIẾN: thu hồi là VĨNH VIỄN* |\n";
  md += "| `require(issuerStatus[msg.sender] == Active)` trong `revokeCertificate` | *Khóa đã bị gỡ quyền mất luôn quyền thu hồi*, *Knhiệm đã bị gỡ cũng mất quyền* |\n";
  md += "| `_requireCanRevoke` — cùng `identityOf`, đang Active | *BỊ CHẶN: issuer khác không thu hồi được*, *chuỗi kế nhiệm hai bậc*, *9 lần chuyển giao* |\n";
  md += "| `transferOwnership`/`acceptOwnership` từ chối issuer; `addIssuer`/`proposeInherit`/`executeInherit` từ chối `pendingOwner` | *A. Bất biến owner ≠ issuer* (7 test), *S3. kiểm lại lúc thực thi* |\n";
  md += "| `INHERIT_DELAY`, `PROPOSAL_TTL` — chuyển giao qua độ trễ, đề xuất có hạn | *S3. Độ trễ chuyển giao danh tính* |\n";
  md += "| `compromisedAt` + `_voided` — thu hồi do khóa lộ bị vô hiệu; cờ `issuedAfterCompromise`; `MAX_COMPROMISE_LOOKBACK` | *PoC F-01, F-03*, *S1*, *S2* |\n";
  md += "| `_requireCanonicalName` — tên dạng chuẩn | *S7. BỊ CHẶN: tên không ở dạng chuẩn* (6 test) |\n";
  md += "| `RECOVERY_WINDOW` — quá 7 ngày sau khi gỡ thì không bật lại/chuyển giao được | *BẤT BIẾN: quá RECOVERY_WINDOW sau khi gỡ, danh tính ĐÓNG BĂNG* |\n";
  md += "| `publishBatch` — `onlyActiveIssuer`, root ≠ 0, lô không rỗng, không trùng | *D2. Cấp theo lô — các trường hợp bị chặn* |\n";
  md += "| `revokeLeaf` — kèm Merkle proof, khớp root, lô chưa thu hồi | *D3. Thu hồi trong lô* |\n";
  md += "| `revokeLeaf` nhận `inner`, lá = keccak(inner) — chỉ lá thật của cây thu hồi được (V34-01) | *V34-01. revokeLeaf chỉ thu hồi được LÁ THẬT* (6 test), *BẤT BIẾN: nút trong của cây không dùng làm lá được* |\n";
  md += "| `acceptOwnership` hai bước | *BỊ CHẶN: người không được chỉ định không nhận được quyền* |\n\n";
  md += "Mọi điều kiện revert (custom error) và `modifier` trong contract đều có ít nhất một test tương ứng.\n\n";

  md += "### 10.4. Độ phủ kiểm thử (coverage)\n\n";
  const cov = readCoverage();
  if (!cov) {
    md += "> Chưa có số liệu. Chạy `npx hardhat coverage` rồi sinh lại tệp này — ";
    md += "script đọc thẳng `coverage.json`, không gõ tay con số nào.\n\n";
  } else {
    md += "Lệnh: `npx hardhat coverage` (solidity-coverage). Số dưới đây được script này ";
    md += "**đọc lại từ `coverage.json`** và tính lại, không phải chép tay.\n\n";
    md += "| Tệp | % câu lệnh | % nhánh | % hàm |\n|---|---:|---:|---:|\n";
    cov.forEach((r) => {
      md += "| `" + r.file + "` | " + r.stmts.toFixed(2) + " | " +
        r.branch.toFixed(2) + " | " + r.funcs.toFixed(2) + " |\n";
    });
    md += "\n";
    md += "`contracts/test/MultiSigIssuerMock.sol` là ví mẫu chỉ dùng trong test; `contracts/legacy/CredentialRegistryV2.sol` chỉ dùng để đo gas so sánh. ";
    md += "Nhánh duy nhất chưa phủ trong `CredentialRegistry.sol` là kiểm tra thừa trong `acceptOwnership` — phòng thủ chiều sâu, không đến được với mã hiện tại (xem `docs/AUDIT-V3.md`).\n\n";
  }

  md += "## 11. Phân tích tĩnh — Slither\n\n";
  md += "Lưu ý: toàn bộ mục này là hằng số trong script, phải cập nhật tay sau mỗi lần chạy Slither.\n\n";
  md += "| Hạng mục | Giá trị |\n|---|---|\n";
  md += "| Công cụ | Slither `slither-analyzer` 0.11.6 |\n";
  md += "| Lệnh | `slither . --compile-force-framework hardhat --filter-paths \"contracts/attack|contracts/test|contracts/legacy|node_modules\" --exclude-dependencies` |\n";
  md += "| Log gốc | `docs/slither-report.txt` |\n";
  md += "| Phạm vi | `contracts/CredentialRegistry.sol`, 102 detector |\n";
  md += "| Kết quả | **10 phát hiện — 0 High, 0 Medium, 3 Low (`timestamp`), 7 Informational (`assembly`, `cyclomatic-complexity`, 4 × `too-many-digits`, `naming-convention`)** |\n\n";
  md += "`contracts/attack/` (dành cho contract đối chứng/tấn công, không thuộc hệ thống), `contracts/test/` và `contracts/legacy/` bị loại khỏi phạm vi quét.\n\n";

  md += "### 11.1. Bảng phát hiện\n\n";
  md += "| # | Detector | Mức | Vị trí | So sánh | Kết luận |\n|---|---|---|---|---|---|\n";
  md += "| 1 | `timestamp` | Low | `proposeInherit` | mốc lộ khóa ≤ bây giờ và ≥ bây giờ − 30 ngày | **So sánh thời gian có chủ đích — chấp nhận** |\n";
  md += "| 2 | `timestamp` | Low | `executeInherit` | bây giờ ≥ eta (INHERIT_DELAY) và ≤ eta + 7 ngày | **So sánh thời gian có chủ đích — chấp nhận** |\n";
  md += "| 3 | `timestamp` | Low | `_requireInRecoveryWindow` | bây giờ ≤ lúc gỡ + 7 ngày | **So sánh thời gian có chủ đích — chấp nhận** |\n";
  md += "| 4 | `assembly` | Informational | `_requireCanonicalName` | — | **Có chủ đích**: vòng kiểm tên theo danh sách cho phép, chỉ đọc calldata; test W phủ đủ 134 chữ, mọi biên và chuỗi UTF-8 cụt |\n";
  md += "| 5 | `cyclomatic-complexity` | Informational | `_requireCanonicalName` | 16 nhánh | **Có chủ đích**: mỗi nhánh là một dải byte UTF-8 của chữ tiếng Việt |\n";
  md += "| 6–9 | `too-many-digits` | Informational | hằng `_ASCII_OK`, `_C4_OK`, `_C5_OK`, `_C6_OK` | — | **Có chủ đích**: mặt nạ bit của danh sách cho phép; chú thích ngay trên từng hằng |\n";
  md += "| 10 | `naming-convention` | Informational | `INHERIT_DELAY` (immutable) | — | **Có chủ đích**: giữ tên viết hoa như một hằng cấu hình; getter `INHERIT_DELAY()` là tên giao diện và script dùng |\n\n";

  md += "### 11.2. Vì sao chấp nhận\n\n";
  md += "Cả ba là ranh giới thời gian **thiết kế có chủ đích**: cửa sổ khôi phục 7 ngày, độ trễ chuyển giao (tham số deploy: 48 giờ production, có thể ngắn hơn ở bản demo), hạn ";
  md += "đề xuất 7 ngày và giới hạn lùi mốc lộ khóa 30 ngày. Người đề xuất block chỉ lệch được timestamp vài giây — ";
  md += "không đáng kể so với các cửa sổ tính bằng giờ và ngày ở production (riêng độ trễ 1 phút nếu bản demo chọn thì vài giây là đáng kể, ";
  md += "nhưng đó chỉ là cấu hình demo), và lệch theo chiều nào cũng chỉ dời ranh giới vài giây. ";
  md += "**Không sửa.**\n\n";
  md += "## 11b. Giới hạn khi mở rộng — số đo\n\n";
  md += "V2 có ba hàm `view` duyệt toàn bộ danh bạ (`findByHash`, `listActiveIssuers`, `knownIssuers`). Người gọi trả 0 gas, ";
  md += "nhưng RPC từ chối lời gọi vượt trần gas của `eth_call`. Đo trên bản V2: `listActiveIssuers` — hàm trả kèm **tên** — ";
  md += "tốn ~15.600 gas/đơn vị, vỡ ở **~3.200 đơn vị** với trần 50 triệu gas và **~630** với trần 10 triệu. Số liệu đầy đủ: `docs/SCALE-NAMES.md` ";
  md += "(`npx hardhat run scripts/scale-names.js`).\n\n";
  md += "**V3 không có ba hàm này.** Mọi thao tác trên chuỗi là O(1) theo số đơn vị — bảng dưới đo trên chính contract V3:\n\n";
  md += "| Số đơn vị phát hành | `verifyCertificate` (gas) | `addIssuer` đơn vị thứ N (gas) |\n|---|---|---|\n";
  scale.forEach((r) => { md += "| " + r.n + " | " + r.verify + " | " + r.add + " |\n"; });
  md += "\n";
  md += "Danh bạ trên giao diện dựng từ event (một lần quét cho mọi loại event, từ `DEPLOY_BLOCK`), rồi **đối chiếu với `activeIssuerCount()`** ";
  md += "trên chuỗi — lệch thì giao diện báo đỏ. Chi phí chuyển sang số lời gọi `eth_getLogs`: tỉ lệ với **tuổi contract tính bằng block**, ";
  md += "không tỉ lệ với số đơn vị. Bản triển khai thật nên dùng indexer (ví dụ The Graph) đọc cùng các event này.\n\n";
  md += "Người xác minh **phải** chọn đơn vị ghi trên chứng chỉ (tên đơn vị in trên chính tệp PDF) — đường đi là `verifyCertificate(đơn vị, hash)`, một lời gọi.\n\n";

  md += "## 12. Ảnh chụp màn hình\n\n";
  md += "Bộ 11 ảnh cũ chụp **giao diện V2** (còn mục \"Nâng cao\", ô \"tra tất cả đơn vị\", chuỗi revert thay vì custom error) ";
  md += "nên đã được gỡ khỏi repo vì không còn khớp giao diện V3. Ảnh mới sẽ chụp trên bản triển khai Sepolia ";
  md += "(README mục 12.0) và đặt ở `picture/screenshots/`. Trong lúc chờ, bằng chứng giao diện là các kịch bản e2e chạy thật ";
  md += "trên Chromium ghi ở `docs/AUDIT-V3.md`.\n\n";

  md += "## 13. So sánh với baseline tập trung (Proposal mục 2.1 và mục 6)\n\n";
  md += "### 13.1. So sánh định lượng — thời gian xác minh một chứng chỉ\n\n";
  const vfy = readLat.find((r) => r.action.startsWith("verifyCertificate"));
  const hashOp = readLat.find((r) => r.action.startsWith("keccak256"));
  const e2e = (vfy && hashOp) ? vfy.median + hashOp.median : null;
  md += "| Bước trong một lượt xác minh | MVP CredVerify | Baseline thủ công |\n|---|---|---|\n";
  md += "| Băm tệp trên máy nhà tuyển dụng | " + (hashOp ? ms2(hashOp.median) + " ms" : "—") + " | Không có bước này |\n";
  md += "| Tra cứu và đối chiếu | " + (vfy ? ms2(vfy.median) + " ms" : "—") + " (đọc on-chain) | Gửi văn bản / email cho đơn vị cấp rồi chờ phản hồi |\n";
  md += "| **Tổng thời gian** | **" + (e2e != null ? ms2(e2e) + " ms" : "—") + "** (đo thực tế) | **Vài ngày tới hơn một tuần** (ước lượng từ nguồn thứ cấp — xem 13.2) |\n";
  md += "| Chi phí mỗi lượt xác minh | 0 gas (hàm `view`) | Nhân lực hai phía |\n";
  md += "| Kết quả có chắc chắn nhận được không? | Có — hàm luôn trả về một trong ba trạng thái | **Không** — có thể không nhận được phản hồi nào |\n";
  md += "| Cần đơn vị cấp còn hoạt động? | Không | Có |\n";
  md += "| Xác minh được ngoài giờ hành chính? | Có | Không |\n\n";
  md += "Dòng \"kết quả có chắc chắn nhận được không\" đáng chú ý hơn cả dòng thời gian. Khác biệt giữa hai ";
  md += "phương án không chỉ là nhanh hay chậm, mà là **có kết quả xác định** hay **có thể không có kết quả nào**.\n\n";
  md += "### 13.2. Nguồn của con số baseline và giới hạn của nó\n\n";
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
