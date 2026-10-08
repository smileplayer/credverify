// =============================================================================
//  Đo khả năng mở rộng của việc LƯU TÊN đơn vị phát hành trên chuỗi.
//
//    npx hardhat run scripts/scale-names.js
//
//  Ba câu hỏi:
//    A. Ghi tên tốn bao nhiêu gas theo độ dài tên (addIssuer, executeInherit)?
//    B. Hàm đọc toàn bộ danh bạ (listActiveIssuers, knownIssuers, findByHash) tốn bao
//       nhiêu gas và trả về bao nhiêu byte khi số đơn vị tăng — tức là đến đâu thì một
//       lời gọi eth_call vượt trần của RPC? V3 KHÔNG có ba hàm này vì kết quả đo dưới đây,
//       nên phần B chạy trên contracts/legacy/CredentialRegistryV2.sol (cùng mã vòng lặp).
//    C. Chọn tên dài "thực tế" cho Việt Nam là bao nhiêu byte?
//  Mọi số là gasUsed của giao dịch thật / estimateGas của lời gọi thật. Ghi ra docs/SCALE-NAMES.md.
// =============================================================================

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { ethers } = hre;

const fmt = (n) => Number(n).toLocaleString("vi-VN");
const bytesOf = (s) => Buffer.byteLength(s, "utf8");
const randAddr = () => ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));

// Tên thật kiểu Việt Nam (UTF-8: chữ có dấu tốn 2–3 byte).
const VN_SHORT = "Trung tâm Tin học";
const VN_TYPICAL = "Trung tâm Đào tạo Tin học Ứng dụng - Trường Đại học Bách khoa";
const VN_LONG = "Trung tâm Đào tạo và Bồi dưỡng Nghiệp vụ Công nghệ Thông tin và Truyền thông - Viện Khoa học Kỹ thuật Ứng dụng Thành phố Hồ Chí Minh";

async function main() {
  const [owner] = await ethers.getSigners();
  const md = [];
  md.push("# Khả năng mở rộng của việc lưu tên đơn vị phát hành");
  md.push("");
  md.push(`Sinh bởi \`scripts/scale-names.js\` ngày ${new Date().toISOString().slice(0, 10)}. Solc ${hre.config.solidity.compilers[0].version}, optimizer bật, runs 200.`);
  md.push("");

  // ---------- A. Gas ghi tên theo độ dài ----------
  md.push("## A. Gas ghi tên theo độ dài");
  md.push("");
  md.push("| Tên | Byte (UTF-8) | `addIssuer` | `executeInherit` |");
  md.push("|---|---:|---:|---:|");
  const samples = [
    ["ASCII 8", "A".repeat(8)], ["ASCII 31", "A".repeat(31)], ["ASCII 32", "A".repeat(32)],
    ["ASCII 64", "A".repeat(64)], ["ASCII 128", "A".repeat(128)],
    ["ASCII 256 (giới hạn)", "A".repeat(256)],
    [`VN ngắn: "${VN_SHORT}"`, VN_SHORT], [`VN điển hình`, VN_TYPICAL], [`VN dài`, VN_LONG],
  ];
  const rowsA = [];
  for (const [label, name] of samples) {
    const reg = await (await ethers.getContractFactory("CredentialRegistry")).deploy(60);
    await reg.waitForDeployment();
    const a = randAddr(), b = randAddr();
    const g1 = (await (await reg.addIssuer(a, name)).wait()).gasUsed;
    await (await reg.proposeInherit(a, b, 0)).wait();
    await hre.network.provider.send("evm_increaseTime", [61]);   // > INHERIT_DELAY (60 giây)
    const g2 = (await (await reg.executeInherit(a)).wait()).gasUsed;
    rowsA.push({ label, bytes: bytesOf(name), add: g1, inh: g2 });
    md.push(`| ${label} | ${bytesOf(name)} | ${fmt(g1)} | ${fmt(g2)} |`);
  }
  const a32 = rowsA.find((r) => r.label === "ASCII 32"), aMax = rowsA.find((r) => r.label.startsWith("ASCII 256"));
  const perSlotAdd = Number(aMax.add - a32.add) / ((256 - 32) / 32);
  const perSlotInh = Number(aMax.inh - a32.inh) / ((256 - 32) / 32);
  md.push("");
  md.push(`Mỗi 32 byte tên thêm ≈ **${fmt(Math.round(perSlotAdd))} gas** ở \`addIssuer\` và ≈ **${fmt(Math.round(perSlotInh))} gas** ở \`executeInherit\` ` +
    "(tên lưu theo **danh tính**, nên chuyển giao (`executeInherit`) không chép chuỗi — chi phí của nó gần như không đổi theo độ dài tên). Tên ≤ 31 byte nằm gọn trong một slot. Tên dài quá `MAX_NAME_BYTES` = 256 byte bị từ chối.");
  md.push("");
  md.push(`Tên tiếng Việt điển hình (${bytesOf(VN_TYPICAL)} byte) tốn ${fmt(rowsA.find((r) => r.label === "VN điển hình").add)} gas để công nhận — chi phí **một lần cho mỗi đơn vị**, không ảnh hưởng chi phí cấp chứng chỉ.`);
  md.push("");

  // ---------- B. Đọc toàn bộ danh bạ ----------
  md.push("## B. Hàm đọc toàn bộ danh bạ theo số đơn vị");
  md.push("");
  md.push("**Đo trên `CredentialRegistryV2` (bản lưu ở `contracts/legacy/`)** — V3 không có ba hàm này, dựa trên kết quả dưới đây.");
  md.push("");
  md.push(`Mỗi đơn vị mang tên điển hình ${bytesOf(VN_TYPICAL)} byte (thêm hậu tố số thứ tự để tên là duy nhất). Gas là \`estimateGas\` của \`eth_call\` — người gọi trả 0 đồng, nhưng RPC **từ chối** lời gọi vượt trần gas của nó.`);
  md.push("");
  md.push("| Số đơn vị | `listActiveIssuers` (gas) | Dữ liệu trả về | `knownIssuers` (gas) | `findByHash` (gas) |");
  md.push("|---:|---:|---:|---:|---:|");
  const reg = await (await ethers.getContractFactory("CredentialRegistryV2")).deploy();
  await reg.waitForDeployment();
  const HASH = ethers.id("mot-tep.pdf");
  // Hardhat (EDR, hardfork Osaka) áp trần 2^24 gas/giao dịch của EIP-7825 cho cả estimateGas.
  // Mạng thật KHÔNG áp trần đó cho eth_call (blog.ethereum.org, 21/10/2025), nên ta đo tới
  // mức còn dưới 2^24 rồi ngoại suy tuyến tính — cấu trúc vòng lặp là tuyến tính chính xác.
  const marks = [10, 100, 250, 500, 1000];
  const rowsB = [];
  let made = 0;
  for (const N of marks) {
    while (made < N) {
      await reg.addIssuer(randAddr(), VN_TYPICAL + " #" + made);
      made++;
    }
    const gList = await reg.listActiveIssuers.estimateGas();
    const gKnown = await reg.knownIssuers.estimateGas();
    const gFind = await reg.findByHash.estimateGas(HASH);
    const raw = await ethers.provider.call({ to: await reg.getAddress(), data: reg.interface.encodeFunctionData("listActiveIssuers") });
    const size = (raw.length - 2) / 2;
    rowsB.push({ N, gList, gKnown, gFind, size });
    md.push(`| ${fmt(N)} | ${fmt(gList)} | ${fmt(size)} byte | ${fmt(gKnown)} | ${fmt(gFind)} |`);
    console.log("N =", N, "list", gList.toString(), "find", gFind.toString());
  }
  const f = rowsB[0], l = rowsB[rowsB.length - 1];
  const slope = (k) => Number(l[k] - f[k]) / (l.N - f.N);
  const sList = slope("gList"), sFind = slope("gFind"), sKnown = slope("gKnown");
  const cap = (s, base, c) => Math.floor((c - Number(base)) / s);
  md.push("");
  md.push(`Tăng **tuyến tính**: ≈ ${fmt(Math.round(sList))} gas/đơn vị với \`listActiveIssuers\`, ≈ ${fmt(Math.round(sKnown))} với \`knownIssuers\`, ≈ ${fmt(Math.round(sFind))} với \`findByHash\`; dữ liệu trả về ≈ ${fmt(Math.round((l.size - f.size) / (l.N - f.N)))} byte/đơn vị.`);
  md.push("");
  md.push("Số đơn vị tối đa trước khi một lời gọi vượt trần gas của `eth_call` (ngoại suy tuyến tính từ số đo trên):");
  md.push("");
  md.push("| Trần gas của RPC | `listActiveIssuers` | `findByHash` | `knownIssuers` |");
  md.push("|---|---:|---:|---:|");
  for (const [lbl, c] of [["10 triệu", 10e6], ["50 triệu (mặc định của geth `--rpc.gascap`)", 50e6]]) {
    md.push(`| ${lbl} | ≈ ${fmt(cap(sList, f.gList, c))} | ≈ ${fmt(cap(sFind, f.gFind, c))} | ≈ ${fmt(cap(sKnown, f.gKnown, c))} |`);
  }
  md.push("");
  md.push("Trần gas của RPC công khai mỗi nhà cung cấp một khác và có thể thay đổi; con số 50 triệu là mặc định của geth, không phải cam kết của nhà cung cấp nào.");
  md.push("");

  // ---------- C. Thay thế: danh bạ từ event ----------
  md.push("## C. Thay thế ở V3: danh bạ dựng từ event");
  md.push("");
  md.push("Giao diện quét event `IssuerAdded/Removed/Restored/Inherited` (một lần quét, OR theo topic) từ `DEPLOY_BLOCK`, " +
    "phát lại để biết khóa nào đang hoạt động, rồi đối chiếu với `activeIssuerCount()` trên chuỗi. Chi phí không còn là gas " +
    "của một lời gọi mà là **số lời gọi `eth_getLogs`** = số block từ lúc deploy ÷ 10.000 (kích thước khúc quét):");
  md.push("");
  md.push("| Tuổi contract (block 12 giây) | Số block | Số lời gọi `eth_getLogs` |");
  md.push("|---|---:|---:|");
  for (const [lbl, days] of [["1 tháng", 30], ["1 năm", 365], ["3 năm", 1095]]) {
    const blocks = Math.round(days * 86400 / 12);
    md.push(`| ${lbl} | ${fmt(blocks)} | ${fmt(Math.ceil(blocks / 10000))} |`);
  }
  md.push("");
  md.push("Không phụ thuộc số đơn vị phát hành. Dữ liệu tải về ≈ một event `IssuerAdded` cho mỗi khóa (tên ≤ 256 byte). " +
    "Khi contract đủ cũ, bản triển khai thật nên dùng một indexer (ví dụ The Graph) đọc đúng các event này thay vì trình duyệt tự quét.");
  md.push("");

  const out = md.join("\n") + "\n";
  fs.writeFileSync(path.join(__dirname, "..", "docs", "SCALE-NAMES.md"), out, "utf8");
  console.log(out);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
