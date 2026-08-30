# Gas — đo trước và sau, qua ba kiến trúc

Sinh lại bằng `npx hardhat test` với `gasReporter.enabled = true` trong `hardhat.config.js`.*

Solc 0.8.24 · optimizer bật · `runs: 200`.

---

## 1. Đường nóng: `issueCertificate`

Đây là thao tác duy nhất chạy thường xuyên với khối lượng lớn, nên là con số đáng theo dõi nhất.

| Phiên bản | Gas | So với gốc | Slot storage mỗi bản ghi |
|---|---:|---:|---:|
| **V0** — bản đầu, chưa tối ưu | 117.871 | — | 4 |
| **V1** — bốn tầng quyền, struct được xếp lại | 97.267 | −17,5% | 3 |
| **V2** — sổ đăng ký dùng chung | **72.697** | **−38,3%** | **2** |

Mức giảm thêm 25,3% từ V1 sang V2 **không phải nhờ tối ưu vi mô**, mà là hệ quả của một quyết định kiến trúc:

> Khi khóa chính là `keccak256(issuer ‖ certHash)`, thì `certHash` đã nằm trong khóa.
> Lưu thêm một bản nữa trong struct là trả **20.000 gas cho một thông tin đã biết**.

V1 buộc phải lưu `certHash` riêng vì `certId` do issuer tự đặt, nên hai giá trị độc lập với nhau. Đổi cách sinh khóa làm trường đó trở nên thừa.

Bố trí trường của V2 gói đúng 2 slot:

```
slot 0: issuer (20 byte) + status (1) + issuedAt  (8) = 29/32
slot 1: holder (20 byte) +              revokedAt (8) = 28/32
```

---

## 2. Bảng đầy đủ — V2

| Hàm | Nhỏ nhất | Lớn nhất | Trung bình | Số lần gọi |
|---|---:|---:|---:|---:|
| `issueCertificate` | 72.697 | 72.697 | **72.697** | 35 |
| `revokeCertificate` | 36.571 | 41.349 | 38.164 | 12 |
| `addIssuer` | 127.019 | 161.315 | 143.512 | 123 |
| `inheritIssuer` | — | — | 138.459 | 14 |
| `removeIssuer` | — | — | 35.585 | 11 |
| `restoreIssuer` | — | — | 37.820 | 2 |
| `transferOwnership` | — | — | 47.776 | 2 |
| `acceptOwnership` | — | — | 28.450 | 1 |

Mọi hàm `view` — `verifyCertificate`, `getCertificate`, `findByHash`, `listActiveIssuers`, `certIdOf`, `governance` — **tốn 0 gas** với người gọi. Xem `EVIDENCE.md` mục 9.3 để biết độ trễ đo được, và mục 11b để biết giới hạn quy mô của hai hàm duyệt danh sách.

---

## 3. Một đánh đổi có chủ đích: `addIssuer` đắt lên

`addIssuer` tăng từ **120.965 → 143.512 gas** (+22.547, khoảng +18,6%) khi thêm `mapping(bytes32 => address) nameHolder` để cưỡng chế tên là duy nhất.

Lý do chấp nhận:

| | |
|---|---|
| **Yêu điểm** | Chặn đường lạm quyền **im lặng**: owner gọi `addIssuer` lần hai với một ví của chính mình, đặt **cùng một tên** với một trung tâm thật. Trung tâm thật vẫn hoạt động bình thường nên **không ai nhận ra** — khác hẳn `inheritIssuer`, vốn vô hiệu hóa khóa cũ nên nạn nhân biết ngay. |
| **Nhược điểm** | +22.547 gas, **một lần duy nhất cho mỗi đơn vị phát hành**, trên một thao tác quản trị hiếm. |
| **Đường nóng** | **Không đổi.** `issueCertificate` vẫn đúng 72.697 gas. |

Đổi một chi phí một-lần trên thao tác hiếm để đóng một kênh lạm quyền không thể phát hiện là đánh đổi rõ ràng có lợi. Nếu chi phí này rơi vào `issueCertificate` thì kết luận sẽ khác.

---

## 4. Lưu ý

1. **Gas không phụ thuộc mạng.** Các giá trị ở đây đúng trên mọi mạng EVM. Chỉ có *giá* mỗi đơn vị gas thay đổi theo mạng và theo thời điểm.
2. **`addIssuer` dao động 127k–161k** vì chi phí lưu chuỗi tên phụ thuộc độ dài tên: mỗi 32 byte thêm một slot storage.
3. **`revokeCertificate` dao động 36k–41k** tùy nhánh phân quyền được chạy — thu hồi bằng chính khóa đã cấp rẻ hơn thu hồi bằng khóa kế nhiệm, vì nhánh sau phải đi theo chuỗi `inheritedBy`.
4. **Số lần gọi** trong bảng là số lần bộ test gọi hàm đó, không mang ý nghĩa nghiệp vụ.
5. Kiến trúc V1 hoàn chỉnh được tác giả đo ở phiên bản cũ, chỉ được ghi lại sơ bộ trong `docs/archive`, không được push lên gitHub trong quá trình xây dựng nên có khả năng không thể tái lập.
