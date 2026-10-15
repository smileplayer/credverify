# Gas V3 — đo thật, không ngoại suy

Sinh bởi `scripts/gas-v3.js` ngày 2026-10-08. Solc 0.8.24 · optimizer bật · runs 200.
Mọi số là `gasUsed` trong receipt (đã gồm 21.000 gas nội tại của giao dịch).

## 1. Chi phí một lần

| Thao tác | V2 | V3 | Chênh |
|---|---:|---:|---:|
| Deploy contract | 2.241.680 | 3.177.154 | 935.474 |
| `addIssuer` (tên đầu tiên) | 161.219 | 165.763 | 4.544 |

V3 ghi thêm `identityOf`, `latestKeyOf` (kiểm quyền thu hồi O(1), không trần số đời kế nhiệm) và không có mảng duyệt danh bạ (danh bạ dựng từ event), nên `addIssuer` gần ngang V2; `addIssuer` còn kiểm tên theo danh sách cho phép chữ tiếng Việt trong một vòng assembly. Deploy đắt hơn V2 vì thêm cấp theo lô, cơ chế khóa lộ, độ trễ chuyển giao và kiểm tên; custom error thay chuỗi revert bù một phần kích thước bytecode. `INHERIT_DELAY` là `immutable` (tham số constructor) nên đọc từ bytecode, không tốn SLOAD.

## 2. Cấp n chứng chỉ: lẻ × n so với một lô

Một lần `issueCertificate`: V2 = **72.673**, V3 = **72.743** gas (hàm không đổi). Cột "lẻ × n" dưới đây là tổng gas của **n giao dịch thật** trên V3, không phải nhân lên.

| n | Cấp lẻ × n (tổng, V3) | Một lô `publishBatch` | Gas/chứng chỉ theo lô | Tiết kiệm | Độ dài proof |
|---:|---:|---:|---:|---:|---:|
| 1 | 72.743 | 72.130 | 72.130 | 0.85% | 0 |
| 10 | 727.418 | 72.142 | 7.214 | 90.09% | 4 |
| 50 | 3.637.078 | 72.130 | 1.442 | 98.02% | 6 |
| 100 | 7.274.168 | 72.142 | 721 | 99.01% | 6 |
| 500 | 36.370.816 | 72.154 | 144 | 99.81% | 9 |

Gas của `publishBatch` không phụ thuộc n (chỉ ghi một bản ghi `Batch` gồm 2 slot; root nằm trong khóa `batchId` và event); chênh vài gas giữa các dòng là do số byte 0 trong calldata của root. Từ n = 1 lô đã ngang giá cấp lẻ; từ n = 2 rẻ hơn rõ rệt. Đổi lại, học viên phải giữ biên nhận (salt + proof) — xem mục 4 của docs/AUDIT-V3.md.

## 3. Thu hồi

| Thao tác | Gas |
|---|---:|
| `revokeCertificate` (cấp lẻ) | 61.053 |
| `revokeLeaf` — lô 10 (proof 4 nút) | 61.302 |
| `revokeLeaf` — lô 50 (proof 6 nút) | 62.798 |
| `revokeLeaf` — lô 100 (proof 6 nút) | 62.834 |
| `revokeLeaf` — lô 500 (proof 9 nút) | 65.091 |
| `revokeBatch` — lô 500, bất kể kích thước | 36.110 |

## 4. Xác minh (hàm `view`, người gọi trả 0 gas — số dưới đây là gas nếu gọi trong một giao dịch)

| Thao tác | Gas ước tính |
|---|---:|
| `verifyCertificate` (cấp lẻ) | 43.600 |
| `verifyInBatch` — lô 1 | 46.259 |
| `verifyInBatch` — lô 10 | 48.561 |
| `verifyInBatch` — lô 50 | 50.802 |
| `verifyInBatch` — lô 100 | 51.576 |
| `verifyInBatch` — lô 500 | 53.351 |

## 5. Xoay khóa

V2 chuyển giao trong MỘT giao dịch, có hiệu lực ngay. V3 tách thành `proposeInherit` → chờ INHERIT_DELAY (tham số deploy; đo ở 172800 giây = 48 giờ như production — gas không phụ thuộc độ trễ) → `executeInherit`.

| Thao tác | V2 `inheritIssuer` | V3 `proposeInherit` | V3 `executeInherit` | V3 tổng |
|---|---:|---:|---:|---:|
| Từ khóa Active, xoay định kỳ | 138.459 | 58.962 | 145.520 | 204.482 |
| Từ khóa Disabled | không làm được | 63.555 | 164.000 | 227.555 |
| Khóa bị lộ (ghi `compromisedAt` + `compromiseDeclaredAt`) | không có | 79.054 | 189.415 | 268.469 |

Thu hồi lẻ đắt hơn V2 vì V3 ghi thêm khóa đã thu hồi (`certRevokedBy`, một slot) để vô hiệu được các lần thu hồi do khóa lộ. Thu hồi lô không đắt thêm: `revokedBy` nằm gọn trong slot còn trống của struct `Batch`.

## 6. Kích thước tệp biên nhận lô

Mục này **không** do `scripts/gas-v3.js` sinh; số lấy từ `node scripts/receipt-size.js` chạy ngày 2026-10-15 (chạy lại `gas-v3.js` sẽ ghi đè tệp này — khi đó dán lại bảng từ `receipt-size.js`). Script dựng lô bằng `buildBatch` và ghi bằng `writeReceipts` trong `scripts/lib/batch.js` — đúng đường mà `issue-batch.js` và `seed-sepolia.js` dùng — rồi đọc lại số byte của từng tệp `.receipt.json` trên đĩa (UTF-8, JSON thụt 2 dấu cách, LF, có dòng trống cuối). Các trường có độ dài thay đổi theo lô demo trên Sepolia: `issuerName` "Trung tam dao tao Demo", `blockNumber` 8 chữ số, `issuedAt` 10 chữ số; không gắn ví học viên (holder = 0x0…0, vẫn 42 ký tự). Salt ngẫu nhiên không đổi kích thước (luôn 32 byte hex).

| n | Proof (nút) | Biên nhận nhỏ nhất (byte) | Lớn nhất (byte) | Trung bình (byte) | Tổng cả lô (byte) |
|---:|---:|---:|---:|---:|---:|
| 2 | 1 | 880 | 880 | 880,0 | 1.760 |
| 100 | 6–7 | 1.250 | 1.324 | 1.303,3 | 130.328 |
| 500 | 8–9 | 1.398 | 1.472 | 1.470,2 | 735.112 |
| 2.000 | 10–11 | 1.546 | 1.620 | 1.618,2 | 3.236.448 |

Mỗi nút proof thêm đúng 74 byte; biên nhận = 806 + 74 × (độ dài proof) byte với tên đơn vị trên (tên dài hơn k byte UTF-8 thì cộng k). Đối chiếu: lô demo Sepolia 4 chứng chỉ (proof 2 nút) có biên nhận 954 byte = 806 + 2 × 74. Cây `StandardMerkleTree` với n lá có độ sâu ⌈log₂ n⌉, nên một số lá có proof ngắn hơn một nút. Cột "Độ dài proof" ở mục 2 là proof của **một** lá (`getProof(0)`), không phải độ dài lớn nhất trong lô.
