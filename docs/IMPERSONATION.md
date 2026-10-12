# Thí nghiệm mạo danh đơn vị cấp có đối chứng

Sinh bởi `npx hardhat run scripts/impersonation-experiment.js` lúc 2026-10-11T11:55:36.736Z; kết quả được khẳng định lại bởi `test/Impersonation.test.js`. Mạng Hardhat (hardfork Osaka), `INHERIT_DELAY` = 60 giây.

## 1. Câu hỏi và thiết kế

**Câu hỏi.** Tấn công Block.co (arXiv 06/2026) mạo danh một trường đại học thật bằng cách *tự khai* danh tính đơn vị cấp: ví của kẻ tấn công đăng Merkle root, metadata ghi tên và địa chỉ của trường, và trình xác minh công khai báo hợp lệ cả tính toàn vẹn lẫn danh tính. Hệ thống sổ đăng ký trên chuỗi công khai có chặn được lớp tấn công này không, và cái giá là gì?

**Đối chứng.** Hệ thống của bài *Micro-credentials Batching* (IET Blockchain 2026) — cùng lớp với CredVerify: cấp theo lô Merkle, root trên Ethereum (Sepolia), xác minh ngoài chuỗi. Tái hiện từ repo công khai `github.com/nnieru/academic-record-managment`, nhánh Main, commit `b9b68f4` (25/07/2026):

- `contracts/attack/IetStyleRegistry.sol`: ngữ nghĩa của `Institution.register(name, email)` (ai cũng tự đăng ký, tên không duy nhất) và `AcademicRecord.AddRecord(string)` (public, không kiểm soát truy cập, không có thu hồi). Viết lại, không sao chép (repo gốc ghi SPDX UNLICENSED).
- `scripts/lib/iet-verify.js`: logic trang `verify_status` — kiểm Merkle proof của 5 trường, kiểm root có trên chuỗi; ô *Institution Address* hiển thị `issuerAddress` **lấy từ JSON**, không đối chiếu với chuỗi.

**Quy tắc kết luận.** "Tấn công thành công" = người xác minh làm đúng quy trình của hệ thống đó và kết luận *chứng chỉ hợp lệ, do nạn nhân cấp*. Với CredVerify là quy tắc của giao diện (`app/app.js`): tin khi `valid && !issuedAfterCompromise`, tên đơn vị đọc từ chuỗi; biên nhận khai tên khác tên trên chuỗi thì báo "Tên đơn vị không khớp".

**Vai trò.** owner (bên vận hành sổ) · nạn nhân "Trung tâm Đào tạo Sao Mai" (đơn vị thật) · ví lạ (kẻ tấn công ngoài) · lò bằng (đơn vị được công nhận nhưng gian lận) · khóa kế nhiệm · học viên. Tên đơn vị là hư cấu.

**Mốc.** Chứng chỉ thật được chấp nhận ở cả hai hệ thống: đối chứng true, CredVerify cấp lẻ true, lô true.

## 2. Kết quả

| # | Kịch bản | Đối chứng (IET 2026) | CredVerify V3 |
|---|---|---|---|
| E1 | Ví lạ tự đăng ký làm đơn vị phát hành, dùng đúng tên nạn nhân | **Thành công** — register() thành công — hai ví cùng tên | Bị chặn — addIssuer: NotOwner |
| E2 | Ví chưa được công nhận ghi chứng chỉ/lô lên sổ | **Thành công** — AddRecord() thành công (public, không kiểm soát truy cập) | Bị chặn — issueCertificate: NotActiveIssuer · publishBatch: NotActiveIssuer |
| E3 | Chứng chỉ giả tự khai đơn vị cấp là nạn nhân (lõi tấn công Block.co) | **Thành công** — trang báo "Verified", Institution Address = ví nạn nhân (lấy từ JSON) | Bị chặn — verifyInBatch(nạn nhân, root giả): batchExists=false → "Không tìm thấy lô" |
| E4 | Đơn vị được công nhận (lò bằng) cấp chứng chỉ rồi khai là của nạn nhân | **Thành công** — Verified, Institution Address = ví nạn nhân | Bị chặn — biên nhận trỏ nạn nhân: batchExists=false; biên nhận trỏ đúng ví lò bằng nhưng khai tên nạn nhân: tên trên chuỗi "Trung tâm Đào tạo Bình Minh" ≠ tên khai → "Tên đơn vị không khớp". Lô hợp lệ nhưng công khai là của lò bằng |
| E5 | Đăng ký tên gần giống tên nạn nhân (giả định ví đã được owner công nhận ở CredVerify) | **Thành công** — register() nhận mọi chuỗi (đã thử Kirin, dấu chấm); E1 cho thấy nhận cả tên trùng y hệt | Chặn một phần — trùng y hệt: NameTaken · chữ Kirin 'а' thay 'a': NameNotCanonical · thêm dấu chấm: NameNotCanonical · khoảng trắng cuối: NameNotCanonical · hai khoảng trắng: NameNotCanonical · bỏ dấu tiếng Việt: nhận · thêm hậu tố: nhận |
| E6 | Sửa nội dung chứng chỉ thật, giữ nguyên root/biên nhận | Bị chặn — Merkle proof sai → "Not Exist" (bản Main hiện tại có kiểm proof) | Bị chặn — lô: inBatch=false; cấp lẻ: không có bản ghi cho hash mới |
| E7 | Khóa nạn nhân bị lộ: kẻ tấn công cấp bằng giả và thu hồi bằng thật; hệ thống phản ứng | **Thành công** — bằng giả "Verified" vĩnh viễn: không có thu hồi, không có cách đánh dấu khóa lộ; bằng thật không thu hồi được nên cũng không bị phá | Thành công tới khi owner phản ứng, sau đó bị vô hiệu — trước phản ứng: giả được chấp nhận, thật bị thu hồi; sau gỡ khóa: khóa lộ ký tiếp → NotActiveIssuer; sau chuyển giao (mốc lộ, chờ 60s): giả issuedAfterCompromise=true → bị từ chối; thật revocationVoided=true → hợp lệ trở lại |
| E8 | Đơn vị cấp ngừng hoạt động, ngừng ghim dữ liệu/ngừng vận hành web | **Không còn xác minh được** — trang chỉ lấy JSON qua gateway IPFS theo CID; JSON mất → "Not Exist"; học viên không tự nộp được dữ liệu | Vẫn xác minh được — lô thật do khóa cũ (đã ngừng) đăng: valid=true, issuerState=2 (2 = ngừng), tên "Trung tâm Đào tạo Sao Mai" |

Ô "Thành công" = tấn công đạt mục tiêu. E8 đo tính sẵn sàng, không phải tấn công.

## 3. Đọc kết quả

- **E1–E4 (mạo danh):** đối chứng thua cả bốn vì danh tính đơn vị cấp là *tự khai* — đúng nguyên nhân gốc của Block.co. CredVerify chặn ở hai lớp: chỉ owner công nhận đơn vị (`addIssuer`), và mỗi đơn vị có không gian tên riêng (`certIdOf(issuer, hash)`, `batchIdOf(issuer, root)`), nên chứng chỉ của lò bằng không bao giờ tra ra dưới danh tính nạn nhân.
- **E5 (tên gần giống):** contract chặn trùng y hệt, ký tự ngoài danh sách cho phép (Kirin, dấu chấm) và khoảng trắng không chuẩn. Biến thể *bỏ dấu tiếng Việt* lọt qua contract nhưng giao diện gom vào cùng nhóm tên gần giống (`normName` của `app.js` cho cùng khóa: có) và cảnh báo. Biến thể *thêm hậu tố* lọt cả hai lớp — đây là giới hạn đã biết: CredVerify chuyển bài toán "ai là trường thật" sang trách nhiệm công nhận của owner, chứ không giải nó.
- **E6 (sửa nội dung):** cả hai từ chối. Ghi nhận công bằng: bản Main hiện tại của đối chứng **có** kiểm Merkle proof (các commit trước đó chỉ `console.log` kết quả).
- **E7 (khóa lộ):** CredVerify **không** chặn được tấn công trong khoảng từ lúc lộ khóa tới lúc owner phản ứng — bằng giả được chấp nhận, bằng thật bị thu hồi. Khác biệt nằm ở sau phản ứng: gỡ khóa tức thì chặn khóa lộ ký tiếp; chuyển giao có độ trễ kèm mốc lộ đánh dấu mọi thứ khóa lộ cấp sau mốc là không đáng tin và vô hiệu mọi lần thu hồi nó làm sau mốc. Đối chứng không có cơ chế nào tương ứng.
- **E8 (đơn vị biến mất):** đối chứng phụ thuộc dữ liệu IPFS còn được ghim; CredVerify chỉ cần tệp, biên nhận học viên giữ và một RPC.

## 4. Giới hạn của thí nghiệm

- Đối chứng là bản tái hiện ngữ nghĩa trên Hardhat, không tấn công bản triển khai của nhóm tác giả. Block.co gốc chạy trên Bitcoin (OP_RETURN + Chainpoint); thí nghiệm này tái hiện *lớp* tấn công (danh tính tự khai), không tái hiện định dạng.
- Ngoài phạm vi: owner bị chiếm khóa hoặc lạm quyền (giả định tin cậy, README mục 11 — owner/issuer là ví đa chữ ký khi vận hành thật); kẻ tấn công kiểm soát RPC của người xác minh (giao diện đối chiếu nhiều RPC, `docs/AUDIT-V3.md`).
- E7 dùng độ trễ 60 giây; production 48 giờ. Khoảng hở trước phản ứng phụ thuộc thời gian phát hiện lộ khóa, không đo được bằng thí nghiệm này.

Địa chỉ trong lần chạy (mạng Hardhat, chỉ để đối chiếu log): CredVerify `0x5FbDB2315678afecb367f032d93F642f64180aa3`, đối chứng `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` / `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`.
