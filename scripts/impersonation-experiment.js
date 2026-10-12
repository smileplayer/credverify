// Sinh docs/IMPERSONATION.md:  npx hardhat run scripts/impersonation-experiment.js
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { run, resultTable, VICTIM_NAME } = require("./lib/impersonation");
const { load } = require("../test/uiSource");


async function main() {
  const delay = 60;
  const res = await run(hre, { delay });
  const { normName } = load(["CONFUSABLES", "normName"], hre.ethers);
  const flagged = normName("Trung tam Dao tao Sao Mai") === normName(VICTIM_NAME);

  const md = [];
  md.push("# Thí nghiệm mạo danh đơn vị cấp có đối chứng");
  md.push("");
  md.push(`Sinh bởi \`npx hardhat run scripts/impersonation-experiment.js\` lúc ${new Date().toISOString()}; ` +
    "kết quả được khẳng định lại bởi `test/Impersonation.test.js`. Mạng Hardhat (hardfork Osaka), `INHERIT_DELAY` = " + delay + " giây.");
  md.push("");
  md.push("## 1. Câu hỏi và thiết kế");
  md.push("");
  md.push("**Câu hỏi.** Tấn công Block.co (arXiv 06/2026) mạo danh một trường đại học thật bằng cách *tự khai* danh tính đơn vị cấp: " +
    "ví của kẻ tấn công đăng Merkle root, metadata ghi tên và địa chỉ của trường, và trình xác minh công khai báo hợp lệ cả tính toàn vẹn lẫn danh tính. " +
    "Hệ thống sổ đăng ký trên chuỗi công khai có chặn được lớp tấn công này không, và cái giá là gì?");
  md.push("");
  md.push("**Đối chứng.** Hệ thống của bài *Micro-credentials Batching* (IET Blockchain 2026) — cùng lớp với CredVerify: cấp theo lô Merkle, " +
    "root trên Ethereum (Sepolia), xác minh ngoài chuỗi. Tái hiện từ repo công khai `github.com/nnieru/academic-record-managment`, nhánh Main, " +
    "commit `b9b68f4` (25/07/2026):");
  md.push("");
  md.push("- `contracts/attack/IetStyleRegistry.sol`: ngữ nghĩa của `Institution.register(name, email)` (ai cũng tự đăng ký, tên không duy nhất) " +
    "và `AcademicRecord.AddRecord(string)` (public, không kiểm soát truy cập, không có thu hồi). Viết lại, không sao chép (repo gốc ghi SPDX UNLICENSED).");
  md.push("- `scripts/lib/iet-verify.js`: logic trang `verify_status` — kiểm Merkle proof của 5 trường, kiểm root có trên chuỗi; " +
    "ô *Institution Address* hiển thị `issuerAddress` **lấy từ JSON**, không đối chiếu với chuỗi.");
  md.push("");
  md.push("**Quy tắc kết luận.** \"Tấn công thành công\" = người xác minh làm đúng quy trình của hệ thống đó và kết luận *chứng chỉ hợp lệ, do nạn nhân cấp*. " +
    "Với CredVerify là quy tắc của giao diện (`app/app.js`): tin khi `valid && !issuedAfterCompromise`, tên đơn vị đọc từ chuỗi; biên nhận khai tên khác tên trên chuỗi thì báo \"Tên đơn vị không khớp\".");
  md.push("");
  md.push("**Vai trò.** owner (bên vận hành sổ) · nạn nhân \"" + VICTIM_NAME + "\" (đơn vị thật) · ví lạ (kẻ tấn công ngoài) · " +
    "lò bằng (đơn vị được công nhận nhưng gian lận) · khóa kế nhiệm · học viên. Tên đơn vị là hư cấu.");
  md.push("");
  md.push(`**Mốc.** Chứng chỉ thật được chấp nhận ở cả hai hệ thống: đối chứng ${res.base.iet}, CredVerify cấp lẻ ${res.base.cvSingle}, lô ${res.base.cvBatch}.`);
  md.push("");
  md.push("## 2. Kết quả");
  md.push("");
  md.push(resultTable(res));
  md.push("");
  md.push("Ô \"Thành công\" = tấn công đạt mục tiêu. E8 đo tính sẵn sàng, không phải tấn công.");
  md.push("");
  md.push("## 3. Đọc kết quả");
  md.push("");
  md.push("- **E1–E4 (mạo danh):** đối chứng thua cả bốn vì danh tính đơn vị cấp là *tự khai* — đúng nguyên nhân gốc của Block.co. " +
    "CredVerify chặn ở hai lớp: chỉ owner công nhận đơn vị (`addIssuer`), và mỗi đơn vị có không gian tên riêng " +
    "(`certIdOf(issuer, hash)`, `batchIdOf(issuer, root)`), nên chứng chỉ của lò bằng không bao giờ tra ra dưới danh tính nạn nhân.");
  md.push("- **E5 (tên gần giống):** contract chặn trùng y hệt, ký tự ngoài danh sách cho phép (Kirin, dấu chấm) và khoảng trắng không chuẩn. " +
    "Biến thể *bỏ dấu tiếng Việt* lọt qua contract nhưng giao diện gom vào cùng nhóm tên gần giống (`normName` của `app.js` cho cùng khóa: " +
    `${flagged ? "có" : "KHÔNG"}) và cảnh báo. Biến thể *thêm hậu tố* lọt cả hai lớp — đây là giới hạn đã biết: CredVerify chuyển bài toán ` +
    "\"ai là trường thật\" sang trách nhiệm công nhận của owner, chứ không giải nó.");
  md.push("- **E6 (sửa nội dung):** cả hai từ chối. Ghi nhận công bằng: bản Main hiện tại của đối chứng **có** kiểm Merkle proof " +
    "(các commit trước đó chỉ `console.log` kết quả).");
  md.push("- **E7 (khóa lộ):** CredVerify **không** chặn được tấn công trong khoảng từ lúc lộ khóa tới lúc owner phản ứng — bằng giả được chấp nhận, " +
    "bằng thật bị thu hồi. Khác biệt nằm ở sau phản ứng: gỡ khóa tức thì chặn khóa lộ ký tiếp; chuyển giao có độ trễ kèm mốc lộ đánh dấu " +
    "mọi thứ khóa lộ cấp sau mốc là không đáng tin và vô hiệu mọi lần thu hồi nó làm sau mốc. Đối chứng không có cơ chế nào tương ứng.");
  md.push("- **E8 (đơn vị biến mất):** đối chứng phụ thuộc dữ liệu IPFS còn được ghim; CredVerify chỉ cần tệp, biên nhận học viên giữ và một RPC.");
  md.push("");
  md.push("## 4. Giới hạn của thí nghiệm");
  md.push("");
  md.push("- Đối chứng là bản tái hiện ngữ nghĩa trên Hardhat, không tấn công bản triển khai của nhóm tác giả. Block.co gốc chạy trên Bitcoin " +
    "(OP_RETURN + Chainpoint); thí nghiệm này tái hiện *lớp* tấn công (danh tính tự khai), không tái hiện định dạng.");
  md.push("- Ngoài phạm vi: owner bị chiếm khóa hoặc lạm quyền (giả định tin cậy, README mục 11 — owner/issuer là ví đa chữ ký khi vận hành thật); " +
    "kẻ tấn công kiểm soát RPC của người xác minh (giao diện đối chiếu nhiều RPC, `docs/AUDIT-V3.md`).");
  md.push("- E7 dùng độ trễ 60 giây; production 48 giờ. Khoảng hở trước phản ứng phụ thuộc thời gian phát hiện lộ khóa, không đo được bằng thí nghiệm này.");
  md.push("");
  md.push("Địa chỉ trong lần chạy (mạng Hardhat, chỉ để đối chiếu log): CredVerify `" + res.addresses.CV + "`, đối chứng `" +
    res.addresses.IetRec + "` / `" + res.addresses.IetInst + "`.");
  md.push("");
  const out = path.join(__dirname, "..", "docs", "IMPERSONATION.md");
  fs.writeFileSync(out, md.join("\n"), "utf8");
  console.log(md.join("\n"));
  console.log("\nĐã ghi:", out);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
