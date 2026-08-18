# EVIDENCE — CredVerify MVP

Tệp này được sinh tự động bởi `scripts/collect-evidence.js`. Sinh lúc: 2026-08-18T15:04:07.872Z

Tái chạy toàn bộ: `npx hardhat node` (terminal 1), sau đó `npx hardhat run scripts/collect-evidence.js --network localhost` (terminal 2).

## 1. Môi trường triển khai

| Hạng mục | Giá trị |
|---|---|
| Tên mạng | `localhost` |
| Chain ID | `31337` |
| Endpoint | `http://127.0.0.1:8545` |
| Lệnh khởi tạo mạng | `npx hardhat node` |
| Phiên bản Solidity | `0.8.24` |
| Hardhat | `^2.29.0` |
| Node.js | `v24.19.0` |

## 2. Hợp đồng đã triển khai

| Hạng mục | Giá trị |
|---|---|
| Tên contract | `CredentialRegistry` |
| Contract address | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| Deployment tx hash | `0x799a5f679d79b98358067ac8267ba489a42da2ac3cd230ee190023f49e33173a` |
| Deployment block | `1` |
| Gas deploy | `1126200` |
| ABI | sinh ra tại `artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json` |

## 3. Tài khoản demo

Các tài khoản do `npx hardhat node` sinh ra, chỉ dùng cho mạng local. **Không có private key nào được ghi vào tệp này.**

| Vai trò | Địa chỉ |
|---|---|
| Chủ sở hữu contract | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Đơn vị đào tạo (issuer) | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Học viên (holder) | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| Ví không có quyền (dùng để test tấn công) | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |

## 4. Giao dịch của luồng nghiệp vụ chính

| Bước | Thao tác | Tx hash | Block | Gas | Ghi chú |
|---|---|---|---|---|---|
| 2 | addIssuer — chủ sở hữu cấp quyền phát hành cho đơn vị đào tạo | `0x78fe85a9c9100e2b084404820184252fda71cf2c1cea4cdd97bab44062d51d37` | 2 | 47530 |  |
| 3 | issueCertificate — đơn vị đào tạo cấp chứng chỉ cho học viên | `0x404adf5c946c8b8944af0ce9670e13ae5750c88df8ef9bea1bf54b6aa8b3387b` | 3 | 117816 | mã: KHOAHOC-2026-0001 |
| 7 | revokeCertificate — đơn vị đào tạo thu hồi chứng chỉ đã cấp | `0x5d1e4f68cbb631a81a6e118a1ad0c93b2f941c0ae8f0c767e283e2efc2ab5045` | 6 | 31654 | mã: KHOAHOC-2026-0001 |

## 5. Event ghi nhận trên chuỗi

| Event | Tham số | Tx hash |
|---|---|---|
| `IssuerAdded` | issuerAddress=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 | `0x78fe85a9c9100e2b084404820184252fda71cf2c1cea4cdd97bab44062d51d37` |
| `CertificateIssued` | certId=0x92e119322cf727f0624ffd2e2c3d2aa610ebd27d138837a9263304bdd2847dc9, certHash=0x2e6165733c7ca14b247264d5eb3b6fb787e55668f8231cf868e3527a28e7717f, issuer=0x70997970C51812dc3A010C7d01b50e0d17dc79C8, holder=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, issuedAt=1787065449 | `0x404adf5c946c8b8944af0ce9670e13ae5750c88df8ef9bea1bf54b6aa8b3387b` |
| `CertificateRevoked` | certId=0x92e119322cf727f0624ffd2e2c3d2aa610ebd27d138837a9263304bdd2847dc9, issuer=0x70997970C51812dc3A010C7d01b50e0d17dc79C8, revokedAt=1787065452 | `0x5d1e4f68cbb631a81a6e118a1ad0c93b2f941c0ae8f0c767e283e2efc2ab5045` |

## 6. Thay đổi trạng thái (state change)

Chứng chỉ `KHOAHOC-2026-0001` — certId `0x92e119322cf727f0624ffd2e2c3d2aa610ebd27d138837a9263304bdd2847dc9`

| Thời điểm | valid | status | Ý nghĩa |
|---|---|---|---|
| Sau khi cấp | true | 1 | Issued (còn hiệu lực) |
| Sau khi thu hồi | false | 2 | Revoked (đã thu hồi) |

Trạng thái chuyển một chiều `Issued -> Revoked`, không có đường quay lại. Hash tệp vẫn khớp sau khi thu hồi nhưng `valid` trả về false — chứng minh trạng thái được kiểm tra độc lập với tính toàn vẹn của tệp.

## 7. Hành vi sai bị chặn (M7)

| # | Hành vi | Kỳ vọng | Kết quả thực tế |
|---|---|---|---|
| 1 | issueCertificate gọi từ ví không được cấp quyền phát hành | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with reason string 'CredentialRegistry: caller is not an authorized issuer' |
| 2 | revokeCertificate gọi từ issuer hợp lệ nhưng không phải bên đã cấp | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with reason string 'CredentialRegistry: only the issuing address can revoke' |
| 3 | verifyCertificate với tệp đã bị chỉnh sửa (hash không khớp) | Kết quả phải là false | Hàm read-only trả về valid = false (không phát sinh giao dịch) |
| 4 | revokeCertificate lần hai trên cùng một chứng chỉ (double revoke) | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with reason string 'CredentialRegistry: certificate not in Issued state' |

## 8. Đối chiếu thao tác giao diện với giao dịch trên chuỗi

| Thao tác trên giao diện `index.html` | Hàm contract | Thay đổi trạng thái |
|---|---|---|
| Quản trị đơn vị phát hành → Cấp quyền phát hành | `addIssuer(address)` | `isIssuer[addr]` = true, event `IssuerAdded` |
| Cấp chứng chỉ → nút Cấp chứng chỉ | `issueCertificate(bytes32,bytes32,address)` | `certificates[certId].status` None → Issued, event `CertificateIssued` |
| Xác minh → nút Xác minh | `verifyCertificate(bytes32,bytes32)` | Chỉ đọc, không phát sinh giao dịch |
| Tra cứu & thu hồi → nút Thu hồi | `revokeCertificate(bytes32)` | `status` Issued → Revoked, event `CertificateRevoked` |

Giao diện băm tệp bằng `keccak256` ngay trên máy người dùng; tệp gốc không được tải lên. Giá trị đưa lên chuỗi chỉ gồm certId, hash tệp và địa chỉ ví.

## 9. Kết quả kiểm thử tự động (M8)

Lệnh: `npx hardhat test` — chạy trên mạng Hardhat in-memory, mỗi test deploy một contract mới qua `beforeEach` nên các test độc lập hoàn toàn.

**Kết quả: 21/21 passing (636 ms), 0 failing.**

```
  CredentialRegistry
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

  21 passing (636ms)
```

### 9.1. Phân loại test

| Nhóm | Số lượng | Mục đích |
|---|---|---|
| Happy path | 4 | Xác nhận luồng đúng hoạt động đúng |
| Hành vi sai bị chặn | 12 | Xác nhận truy cập trái phép và trạng thái sai đều bị từ chối |
| Bất biến nghiệp vụ | 3 | Xác nhận dữ liệu lịch sử không bị mất khi trạng thái đổi |
| Quyết định thiết kế có chủ đích | 2 | Ghim lại hành vi dễ bị hiểu nhầm là lỗ hổng, kèm ranh giới rủi ro |

### 9.2. Đối chiếu test với yêu cầu chức năng (Proposal mục 3.1)

| Mã | Yêu cầu | Test tương ứng | Trạng thái |
|---|---|---|---|
| F1 | Issuer cấp chứng chỉ mới, ghi hash + metadata lên contract | Test 1, 15 | Đạt |
| F2 | Holder xem danh sách/chi tiết chứng chỉ mình sở hữu | — | **Chưa đạt** |
| F3 | Verifier đối chiếu hash và trạng thái | Test 2, 3, 11 | Đạt |
| F4 | Issuer thu hồi chứng chỉ đã cấp | Test 4, 8, 12, 17, 19 | Đạt |
| F5 | Từ chối yêu cầu cấp từ địa chỉ không được ủy quyền | Test 5, 10 | Đạt |

### 9.3. Đối chiếu test với lớp phòng thủ trong contract

| Lớp phòng thủ | Dòng contract | Test xác nhận |
|---|---|---|
| `onlyOwner` — chỉ chủ sở hữu phân quyền | 57–60 | Test 9 |
| `onlyIssuer` — chỉ issuer được ủy quyền cấp | 62–65 | Test 5, 10 |
| Chặn zero address khi thêm issuer | 79 | Test 14 |
| Chặn zero address cho holder | 93 | Test 13 |
| Chặn trùng certId / hồi sinh cert đã thu hồi | 94 | Test 7, 17 |
| Chặn thu hồi cert chưa cấp / thu hồi hai lần | 110 | Test 8, 12 |
| Chỉ đúng issuer đã cấp mới thu hồi được | 111 | Test 6, 20 |

Mọi `require` và `modifier` trong contract đều có ít nhất một test tương ứng.

## 10. Phân tích tĩnh — Slither (Proposal mục 6, đề bài mục 5.2)

| Hạng mục | Giá trị |
|---|---|
| Công cụ | Slither (`slither-analyzer`) |
| Lệnh | `slither .` chạy tại thư mục gốc (tự gọi `hardhat clean` + `compile --force`) |
| Phạm vi | 1 contract, 102 detector |
| Kết quả | **3 phát hiện — 0 High, 0 Medium, 2 Low, 1 Optimization** |

Không có phát hiện nào ở mức High hoặc Medium.

### 10.1. Bảng phát hiện

| # | Detector | Mức | Vị trí | Kết luận |
|---|---|---|---|---|
| 1 | `timestamp` | Low | `issueCertificate` — dòng 92–105 | **False positive** |
| 2 | `timestamp` | Low | `revokeCertificate` — dòng 108–115 | **False positive** |
| 3 | `immutable-states` | Optimization | `owner` — dòng 35 | Hợp lệ, **không áp dụng** (có lập luận) |

### 10.2. Phát hiện 1 và 2 — `timestamp`: false positive

Slither báo hai hàm *"uses timestamp for comparisons"* và liệt kê các so sánh sau là nguy hiểm:

```
- require(certificates[certId].status == Status.None, "...certId already used")     (dòng 94)
- require(cert.status == Status.Issued, "...certificate not in Issued state")       (dòng 110)
- require(cert.issuer == msg.sender, "...only the issuing address can revoke")      (dòng 111)
```

**Cả ba so sánh này đều không liên quan gì tới thời gian.** Dòng 94 và 110 so sánh giá trị `enum Status`; dòng 111 so sánh hai biến `address`. Không có biểu thức nào trong contract lấy `block.timestamp` làm điều kiện.

Nguyên nhân báo nhầm: detector `timestamp` của Slither hoạt động ở mức hàm — nó đánh dấu bất kỳ hàm nào có **đọc** `block.timestamp`, rồi liệt kê **toàn bộ** phép so sánh trong hàm đó là "dangerous comparisons", không phân tích xem giá trị timestamp có thật sự chảy vào phép so sánh hay không. Trong contract này, `block.timestamp` chỉ xuất hiện ở hai chỗ và cả hai đều là **ghi dữ liệu, không phải điều kiện**:

| Vị trí | Cách dùng | Có nằm trong điều kiện không? |
|---|---|---|
| Dòng 101 | `issuedAt: block.timestamp` — gán vào trường của struct | Không |
| Dòng 114 | `emit CertificateRevoked(..., block.timestamp)` — tham số event | Không |

Ngay cả bản thân cách dùng thực tế cũng vô hại. Người đào block có thể lệch timestamp trong khoảng vài giây tới vài chục giây, nhưng giá trị này chỉ dùng để ghi **ngày cấp chứng chỉ** phục vụ hiển thị và kiểm toán — không có nhánh logic nào rẽ theo nó, không có phần thưởng kinh tế nào để thao túng, và sai lệch vài giây không ảnh hưởng tới ý nghĩa nghiệp vụ của một ngày cấp.

**Kết luận: không sửa code.** Sửa để làm im cảnh báo (ví dụ bỏ `issuedAt`) sẽ làm mất một trường dữ liệu kiểm toán cần thiết mà không đổi lại được lợi ích an toàn nào.

### 10.3. Phát hiện 3 — `immutable-states`: hợp lệ nhưng không áp dụng

Slither đề xuất khai báo `address public immutable owner` vì biến này chỉ được gán một lần trong constructor và không bao giờ đổi. Đây **không phải false positive** — đề xuất đúng về mặt kỹ thuật: biến `immutable` được nhúng thẳng vào bytecode nên đọc rẻ hơn khoảng 2.100 gas so với đọc từ storage.

Quyết định: **giữ nguyên `address public owner`**, vì hai lý do.

**Thứ nhất — không muốn khóa vĩnh viễn khả năng chuyển quyền sở hữu.** Threat model (Proposal mục 5, Bảng 6) đã liệt kê "Issuer/insider bị lộ khóa quản trị" là một rủi ro tồn dư có thật. Nếu khai báo `immutable`, contract vĩnh viễn không thể bổ sung hàm `transferOwnership` ở phiên bản sau; khóa owner bị mất hoặc lộ đồng nghĩa với việc hệ thống không còn ai phân quyền được nữa. Giữ biến ở storage là chừa lại đường nâng cấp.

**Thứ hai — lợi ích gas không đáng kể.** Biến `owner` chỉ được đọc trong modifier `onlyOwner` (áp cho `addIssuer` và `removeIssuer` — hai thao tác quản trị hiếm khi gọi) và trong lời gọi read-only `owner()` từ giao diện để hiển thị vai trò. Nó không nằm trên đường đi nóng của `issueCertificate`, `revokeCertificate` hay `verifyCertificate` — tức là ba thao tác chiếm gần như toàn bộ lưu lượng thực tế.

Đánh đổi giữa "tiết kiệm ~2.100 gas cho thao tác quản trị hiếm" và "mất vĩnh viễn khả năng khôi phục quyền sở hữu" nghiêng rõ về phía không áp dụng.

### 10.4. Những lỗ hổng Slither KHÔNG phát hiện

Kết quả âm tính cũng là bằng chứng cần ghi nhận. Trong 102 detector đã chạy, các nhóm sau không có phát hiện nào:

| Nhóm lỗ hổng | Kết quả | Lý do về mặt thiết kế |
|---|---|---|
| Reentrancy (mọi biến thể) | Không có | Contract không thực hiện bất kỳ lời gọi ngoài nào (`call`, `transfer`, `delegatecall`) |
| Access control (`suicidal`, `unprotected-upgrade`, `arbitrary-send`) | Không có | Toàn bộ hàm ghi đều qua `modifier` hoặc `require` kiểm tra `msg.sender` |
| `tx.origin` dùng để xác thực | Không có | Contract chỉ dùng `msg.sender` |
| `delegatecall` / `selfdestruct` | Không có | Contract không dùng |
| Tràn số nguyên | Không áp dụng | Solidity 0.8.24 tự kiểm tra overflow/underflow ở mức compiler |
| Biến chưa khởi tạo, shadowing | Không có | — |

### 10.5. Ghi chú khi đọc log gốc

Trong `slither-report.txt` có một khối văn bản dạng lỗi PowerShell:

```
slither.exe : INFO:Detectors:
At line:1 char:1
    + CategoryInfo : NotSpecified: (INFO:Detectors::String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
```

Đây **không phải lỗi chạy Slither**. Slither ghi toàn bộ output chẩn đoán ra luồng `stderr` theo thiết kế; PowerShell mặc định bọc mọi nội dung `stderr` của chương trình ngoài thành đối tượng `NativeCommandError` rồi in ra theo định dạng lỗi. Dòng cuối `INFO:Slither:. analyzed (1 contracts with 102 detectors), 3 result(s) found` xác nhận quá trình phân tích đã hoàn tất bình thường.

## 11. Ảnh chụp màn hình

**11.1. Cấp chứng chỉ thành công** — banner xác nhận và mục nhật ký kèm tx hash, số block, lượng gas.

![Cấp chứng chỉ thành công](docs/screenshots/01-cap-thanh-cong.png)

**11.2. Xác minh hợp lệ** — nộp đúng tệp gốc, hash khớp và trạng thái còn hiệu lực.

![Xác minh hợp lệ](docs/screenshots/02-xac-minh-hop-le.png)

**11.3. Thao tác bị chặn** — ví không được cấp quyền phát hành cố cấp chứng chỉ; giao dịch revert với lý do lấy trực tiếp từ `require` trong contract.

![Thao tác bị chặn](docs/screenshots/03-bi-chan.png)

**11.4. Chứng chỉ đã bị thu hồi** — xác minh lại bằng **đúng tệp gốc** sau khi thu hồi: hash vẫn khớp nhưng kết quả trả về không hợp lệ. Đây là minh chứng trực quan cho state machine một chiều `Issued → Revoked` ở Mục 6.

![Chứng chỉ đã bị thu hồi](docs/screenshots/04-da-thu-hoi.png)

**11.5. Tệp bị chỉnh sửa không khớp** — nộp tệp PDF đã sửa nội dung: mã chứng chỉ vẫn tồn tại và còn hiệu lực nhưng hash không khớp. Đây là minh chứng cho abuse case "Holder gian lận" trong threat model (Proposal mục 5, Bảng 6).

![Tệp không khớp](docs/screenshots/05-tep-khong-khop.png)

## 12. Hạng mục còn lại

- [ ] **Đo độ trễ** cho từng thao tác chính. Chi phí gas đã có ở Mục 4; còn thiếu thời gian xác nhận giao dịch và thời gian phản hồi khi verifier tra cứu (Proposal mục 6, nhóm chỉ số Hiệu năng).
- [ ] **Bảng so sánh định lượng với baseline tập trung** — thời gian xác minh một chứng chỉ qua MVP so với quy trình liên hệ issuer thủ công (Proposal mục 2.1 và mục 6).
- [ ] **Yêu cầu F2 — màn hình cho holder.** Tab "Tra cứu & thu hồi" hiện liệt kê các chứng chỉ đã cấp **từ trình duyệt đang dùng** (đọc từ `localStorage`, góc nhìn issuer), chưa phải danh sách chứng chỉ **thuộc về ví đang kết nối**. Hướng khắc phục không cần sửa contract: truy vấn event `CertificateIssued` lọc theo tham số `holder` — tham số này đã được khai báo `indexed` sẵn ở dòng 50 của contract.

## 13. Cam kết an toàn dữ liệu

- Không có private key, seed phrase hay access token nào trong tệp này.
- Không có dữ liệu cá nhân thật; tên học viên trong demo là dữ liệu giả.
- Các địa chỉ ví ở Mục 3 là tài khoản mặc định của mạng local Hardhat, công khai theo thiết kế.
