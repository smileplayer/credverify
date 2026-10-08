# Khả năng mở rộng của việc lưu tên đơn vị phát hành

Sinh bởi `scripts/scale-names.js` ngày 2026-10-08. Solc 0.8.24, optimizer bật, runs 200.

## A. Gas ghi tên theo độ dài

| Tên | Byte (UTF-8) | `addIssuer` | `executeInherit` |
|---|---:|---:|---:|
| ASCII 8 | 8 | 165.217 | 145.520 |
| ASCII 31 | 31 | 169.403 | 145.520 |
| ASCII 32 | 32 | 191.827 | 147.582 |
| ASCII 64 | 64 | 220.235 | 150.414 |
| ASCII 128 | 128 | 277.051 | 156.078 |
| ASCII 256 (giới hạn) | 256 | 390.683 | 167.407 |
| VN ngắn: "Trung tâm Tin học" | 20 | 167.257 | 145.520 |
| VN điển hình | 81 | 245.051 | 153.246 |
| VN dài | 173 | 328.589 | 161.731 |

Mỗi 32 byte tên thêm ≈ **28.408 gas** ở `addIssuer` và ≈ **2.832 gas** ở `executeInherit` (tên lưu theo **danh tính**, nên chuyển giao (`executeInherit`) không chép chuỗi — chi phí của nó gần như không đổi theo độ dài tên). Tên ≤ 31 byte nằm gọn trong một slot. Tên dài quá `MAX_NAME_BYTES` = 256 byte bị từ chối.

Tên tiếng Việt điển hình (81 byte) tốn 245.051 gas để công nhận — chi phí **một lần cho mỗi đơn vị**, không ảnh hưởng chi phí cấp chứng chỉ.

## B. Hàm đọc toàn bộ danh bạ theo số đơn vị

**Đo trên `CredentialRegistryV2` (bản lưu ở `contracts/legacy/`)** — V3 không có ba hàm này, dựa trên kết quả dưới đây.

Mỗi đơn vị mang tên điển hình 81 byte (thêm hậu tố số thứ tự để tên là duy nhất). Gas là `estimateGas` của `eth_call` — người gọi trả 0 đồng, nhưng RPC **từ chối** lời gọi vượt trần gas của nó.

| Số đơn vị | `listActiveIssuers` (gas) | Dữ liệu trả về | `knownIssuers` (gas) | `findByHash` (gas) |
|---:|---:|---:|---:|---:|
| 10 | 177.623 | 2.048 byte | 46.582 | 81.287 |
| 100 | 1.562.044 | 19.328 byte | 251.324 | 589.060 |
| 250 | 3.879.537 | 48.128 byte | 592.843 | 1.437.293 |
| 500 | 7.770.150 | 96.128 byte | 1.162.821 | 2.856.386 |
| 1.000 | 15.656.845 | 192.128 byte | 2.305.708 | 5.714.769 |

Tăng **tuyến tính**: ≈ 15.636 gas/đơn vị với `listActiveIssuers`, ≈ 2.282 với `knownIssuers`, ≈ 5.690 với `findByHash`; dữ liệu trả về ≈ 192 byte/đơn vị.

Số đơn vị tối đa trước khi một lời gọi vượt trần gas của `eth_call` (ngoại suy tuyến tính từ số đo trên):

| Trần gas của RPC | `listActiveIssuers` | `findByHash` | `knownIssuers` |
|---|---:|---:|---:|
| 10 triệu | ≈ 628 | ≈ 1.743 | ≈ 4.361 |
| 50 triệu (mặc định của geth `--rpc.gascap`) | ≈ 3.186 | ≈ 8.772 | ≈ 21.890 |

Trần gas của RPC công khai mỗi nhà cung cấp một khác và có thể thay đổi; con số 50 triệu là mặc định của geth, không phải cam kết của nhà cung cấp nào.

## C. Thay thế ở V3: danh bạ dựng từ event

Giao diện quét event `IssuerAdded/Removed/Restored/Inherited` (một lần quét, OR theo topic) từ `DEPLOY_BLOCK`, phát lại để biết khóa nào đang hoạt động, rồi đối chiếu với `activeIssuerCount()` trên chuỗi. Chi phí không còn là gas của một lời gọi mà là **số lời gọi `eth_getLogs`** = số block từ lúc deploy ÷ 10.000 (kích thước khúc quét):

| Tuổi contract (block 12 giây) | Số block | Số lời gọi `eth_getLogs` |
|---|---:|---:|
| 1 tháng | 216.000 | 22 |
| 1 năm | 2.628.000 | 263 |
| 3 năm | 7.884.000 | 789 |

Không phụ thuộc số đơn vị phát hành. Dữ liệu tải về ≈ một event `IssuerAdded` cho mỗi khóa (tên ≤ 256 byte). Khi contract đủ cũ, bản triển khai thật nên dùng một indexer (ví dụ The Graph) đọc đúng các event này thay vì trình duyệt tự quét.

