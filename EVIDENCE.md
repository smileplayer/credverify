# EVIDENCE — CredVerify MVP

Tệp này được sinh tự động bởi `scripts/collect-evidence.js`. Sinh lúc: 2026-08-19T18:38:30.700Z

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
| Deployment tx hash | `0x1b7e9de91284ccc0297536367697fa4a793437ad828a678f46446fcb17f6b0a2` |
| Deployment block | `1` |
| Gas deploy | `1098124` |
| Độ trễ deploy | `11.58 ms` |
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

| Bước | Thao tác | Tx hash | Block | Gas | Độ trễ (ms) | Ghi chú |
|---|---|---|---|---|---|---|
| 2 | addIssuer — chủ sở hữu cấp quyền phát hành cho đơn vị đào tạo | `0x8e0be88fa02ee91a97b607a2a66c7e7ec5d8a27ccc63a82a0cd5292ad8d5ecf3` | 2 | 47519 | 5.65 |  |
| 3 | issueCertificate — đơn vị đào tạo cấp chứng chỉ cho học viên | `0x81811cce0781a8f9b9bd1fb973b3a0d32b5d4c142782c54316e7e3c6e125c74f` | 3 | 117830 | 5.32 | mã: KHOAHOC-2026-0001 |
| 7 | revokeCertificate — đơn vị đào tạo thu hồi chứng chỉ đã cấp | `0xbde6697be0fe427d33416af77489a7cc65fb8fd71c3b66d446f8077f699c7f2d` | 6 | 31642 | 4.06 | mã: KHOAHOC-2026-0001 |

Cột độ trễ đo từ lúc gửi giao dịch tới khi nhận được receipt. Xem Mục 9 để biết phương pháp đo và giới hạn diễn giải của các con số này.

## 5. Event ghi nhận trên chuỗi

| Event | Tham số | Tx hash |
|---|---|---|
| `IssuerAdded` | issuerAddress=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 | `0x8e0be88fa02ee91a97b607a2a66c7e7ec5d8a27ccc63a82a0cd5292ad8d5ecf3` |
| `CertificateIssued` | certId=0x92e119322cf727f0624ffd2e2c3d2aa610ebd27d138837a9263304bdd2847dc9, certHash=0x4993aeefaaeea4be8d8bc14ff27af365eb03cfc93ef672e28fcda23afd2df3b9, issuer=0x70997970C51812dc3A010C7d01b50e0d17dc79C8, holder=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, issuedAt=1787164712 | `0x81811cce0781a8f9b9bd1fb973b3a0d32b5d4c142782c54316e7e3c6e125c74f` |
| `CertificateRevoked` | certId=0x92e119322cf727f0624ffd2e2c3d2aa610ebd27d138837a9263304bdd2847dc9, issuer=0x70997970C51812dc3A010C7d01b50e0d17dc79C8, revokedAt=1787164715 | `0xbde6697be0fe427d33416af77489a7cc65fb8fd71c3b66d446f8077f699c7f2d` |

## 6. Thay đổi trạng thái (state change)

Chứng chỉ `KHOAHOC-2026-0001` — certId `0x92e119322cf727f0624ffd2e2c3d2aa610ebd27d138837a9263304bdd2847dc9`

| Thời điểm | valid | status | Ý nghĩa |
|---|---|---|---|
| Sau khi cấp | true | 1 | Issued (còn hiệu lực) |
| Sau khi thu hồi | false | 2 | Revoked (đã thu hồi) |

Trạng thái chuyển một chiều `Issued -> Revoked`, không có đường quay lại. Hash tệp vẫn khớp sau khi thu hồi nhưng `valid` trả về false — chứng minh trạng thái được kiểm tra độc lập với tính toàn vẹn của tệp.

## 7. Hành vi sai bị chặn

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
| Xác minh → nút Xác minh (có nhập mã) | `verifyCertificate(bytes32,bytes32)` | Chỉ đọc, không phát sinh giao dịch |
| Xác minh → nút Xác minh (bỏ trống mã) | Truy vấn event `CertificateIssued` lọc theo `certHash` để tra `certId`, rồi `verifyCertificate` | Chỉ đọc, không phát sinh giao dịch |
| Chứng chỉ của tôi → mở tab | Truy vấn event `CertificateIssued` lọc theo `holder`, rồi `certificates(bytes32)` | Chỉ đọc, không phát sinh giao dịch |
| Tra cứu & thu hồi → nút Thu hồi | `revokeCertificate(bytes32)` | `status` Issued → Revoked, event `CertificateRevoked` |

Giao diện băm tệp bằng `keccak256` ngay trên máy người dùng; tệp gốc không được tải lên. Giá trị đưa lên chuỗi chỉ gồm certId, hash tệp và địa chỉ ví.

## 9. Độ trễ và chi phí

### 9.1. Phương pháp đo

| Hạng mục | Cách làm |
|---|---|
| Đồng hồ | `process.hrtime.bigint()` — độ phân giải nano giây, không bị lệch khi đồng hồ hệ thống đồng bộ lại |
| Thao tác ghi | Đo từ lúc gửi giao dịch tới khi `tx.wait()` trả về receipt |
| Thao tác đọc | 30 mẫu mỗi thao tác, có một lần gọi khởi động bị loại bỏ trước khi đo |
| Thống kê | Báo cả trung vị và p95 thay vì chỉ trung bình, vì trung bình bị kéo lệch bởi vài mẫu ngoại lai |
| Máy đo | Node.js v24.19.0 trên mạng local Hardhat |

### 9.2. Thao tác ghi — gas và độ trễ

| Thao tác | Gas | Độ trễ (ms) |
|---|---|---|
| Deploy contract | 1098124 | 11.58 |
| addIssuer | 47519 | 5.65 |
| issueCertificate | 117830 | 5.32 |
| revokeCertificate | 31642 | 4.06 |

### 9.3. Thao tác đọc — độ trễ

Các thao tác dưới đây không phát sinh giao dịch nên **chi phí gas bằng 0**.

| Thao tác | Mẫu | Nhỏ nhất | Trung vị | Trung bình | p95 | Lớn nhất |
|---|---|---|---|---|---|---|
| verifyCertificate — nhà tuyển dụng xác minh một chứng chỉ | 30 | 1.02 | 1.19 | 1.24 | 1.51 | 1.60 |
| certificates — giao diện làm mới trạng thái một chứng chỉ | 30 | 0.97 | 1.12 | 1.11 | 1.27 | 1.33 |
| isIssuer — kiểm tra quyền phát hành của một ví | 30 | 0.81 | 0.95 | 0.96 | 1.16 | 1.16 |
| keccak256 — băm tệp PDF trên máy người dùng (5 KB) | 30 | 0.27 | 0.28 | 0.29 | 0.32 | 0.41 |

### 9.4. Giới hạn diễn giải của các số đo này

1. **Mạng local Hardhat đào block tức thì.** Không có thời gian chờ đồng thuận, không có hàng đợi giao dịch, không có cạnh tranh phí. Độ trễ ghi đo được ở đây gần như chỉ là thời gian vòng tròn của lời gọi RPC nội bộ, **không đại diện cho mạng thật**. Trên Ethereum mainnet, một block mất khoảng 12 giây, nên độ trễ ghi thực tế sẽ lớn hơn nhiều bậc.
2. **Độ trễ đọc thì có ý nghĩa hơn.** Thao tác `view` không cần đồng thuận nên số đo ở đây phản ánh đúng bản chất: xác minh là thao tác rẻ và nhanh. Trên mạng thật, phần tăng thêm chủ yếu là độ trễ mạng tới node RPC, không phải chi phí tính toán.
3. **Gas thì không phụ thuộc mạng.** Lượng gas ở Mục 9.2 đúng trên mọi mạng EVM; chỉ có *giá* mỗi đơn vị gas là thay đổi theo mạng và theo thời điểm.
4. **Số đo phụ thuộc máy chạy.** Chạy lại trên máy khác sẽ ra con số khác. Đây là lý do bảng trên báo trung vị và p95 thay vì một giá trị đơn lẻ.

## 10. Kết quả kiểm thử tự động

Lệnh: `npx hardhat test`. Mỗi test deploy một contract mới qua `beforeEach` nên các test độc lập hoàn toàn.

**Kết quả: 26/26 passing (699ms), 0 failing.**

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
    ✔ Học viên truy vấn được đúng danh sách chứng chỉ của chính mình qua event
    ✔ Danh sách của học viên không lẫn chứng chỉ của ví khác
    ✔ Xác minh không cần mã: tra ngược được certId từ hash của tệp
    ✔ Xác minh không cần mã: tệp chưa từng đăng ký thì không tra ra bản ghi nào
    ✔ issuer tuy không còn indexed nhưng vẫn đọc được đầy đủ từ dữ liệu event

  26 passing (699ms)
```

> Khối kết quả trên được dán từ lần chạy thực tế và lưu trong `scripts/collect-evidence.js`. Nếu bộ test thay đổi, cập nhật hằng số `TEST_OUTPUT` trong script rồi sinh lại tệp này.

### 10.1. Phân loại test

| Nhóm | Số lượng | Mục đích |
|---|---|---|
| Happy path | 4 | Xác nhận luồng đúng hoạt động đúng |
| Hành vi sai bị chặn | 12 | Xác nhận truy cập trái phép và trạng thái sai đều bị từ chối |
| Bất biến nghiệp vụ | 3 | Xác nhận dữ liệu lịch sử không mất khi trạng thái đổi |
| Quyết định thiết kế có chủ đích | 2 | Ghim lại hành vi dễ bị hiểu nhầm là lỗ hổng, kèm ranh giới rủi ro |
| Truy vấn qua event | 5 | Xác nhận lọc theo `holder` và `certHash` chạy đúng — nền tảng của F2 và xác minh không cần mã |

Test âm bản chiếm 12/26 — phù hợp với trọng tâm của đề tài là chứng minh access control và state machine được cưỡng chế đúng, không chỉ chứng minh luồng thuận chạy được.

Nhóm cuối ghim lại khả năng lọc event theo tham số `indexed`.

### 10.2. Đối chiếu test với yêu cầu chức năng

| Mã | Yêu cầu | Test tương ứng | Trạng thái |
|---|---|---|---|
| F1 | Issuer cấp chứng chỉ mới, ghi hash + metadata lên contract | Test 1, 15 | Đạt |
| F2 | Holder xem danh sách/chi tiết chứng chỉ mình sở hữu | Test 22, 23 | Đạt một phần — xem Mục 10.4 |
| F3 | Verifier đối chiếu hash và trạng thái | Test 2, 3, 11, 24, 25 | Đạt |
| F4 | Issuer thu hồi chứng chỉ đã cấp | Test 4, 8, 12, 17, 19 | Đạt |
| F5 | Từ chối yêu cầu cấp từ địa chỉ không được ủy quyền | Test 5, 10 | Đạt |

### 10.3. Đối chiếu test với lớp phòng thủ trong contract

| Lớp phòng thủ | Dòng contract | Test xác nhận |
|---|---|---|
| `onlyOwner` — chỉ chủ sở hữu phân quyền | 58–61 | Test 9 |
| `onlyIssuer` — chỉ issuer được ủy quyền cấp | 63–66 | Test 5, 10 |
| Chặn zero address khi thêm issuer | 80 | Test 14 |
| Chặn zero address cho holder | 94 | Test 13 |
| Chặn trùng certId / hồi sinh cert đã thu hồi | 95 | Test 7, 17 |
| Chặn thu hồi cert chưa cấp / thu hồi hai lần | 111 | Test 8, 12 |
| Chỉ đúng issuer đã cấp mới thu hồi được | 112 | Test 6, 20 |

Mọi `require` và `modifier` trong contract đều có ít nhất một test tương ứng.

### 10.4. Phạm vi đạt được của yêu cầu F2

F2 được đánh giá là **đạt một phần**. Học viên biết được gì tùy vào việc họ có tệp gốc hay không:

| Tình huống | Học viên thấy được |
|---|---|
| Chỉ kết nối ví, không có tệp | Số lượng chứng chỉ, ngày cấp, địa chỉ đơn vị cấp, và **trạng thái còn hiệu lực hay đã thu hồi** |
| Có tệp gốc | Thêm: xác minh được tệp nào ứng với bản ghi nào (qua tab Xác minh) |
| Dùng đúng trình duyệt đã cấp | Thêm: mã chứng chỉ gốc và tên khóa học, lấy từ `localStorage` |

Phần **chưa đạt**: học viên không có tệp gốc thì chỉ đọc được `certId` — một giá trị băm, không suy ngược ra tên khóa học. Đây là hệ quả trực tiếp của quyết định chỉ đưa hash lên chuỗi (Proposal mục 4, Bảng 5), không phải thiếu sót khi lập trình.

Vẫn giữ nguyên thiết kế này vì việc theo dõi được trạng thái thu hồi đã là năng lực có giá trị: học viên tự phát hiện chứng chỉ của mình bị thu hồi mà không phụ thuộc vào việc đơn vị cấp có thông báo hay không — đúng với abuse case "Issuer/insider" trong threat model (Proposal mục 5, Bảng 6).

Hai hướng khắc phục đã cân nhắc, xếp vào công việc tiếp theo:

1. **Phát tên khóa học vào event** (không lưu vào storage nên chỉ tốn vài trăm gas). Đổi lại, tên khóa học trở thành dữ liệu công khai vĩnh viễn, làm nặng thêm rủi ro tồn dư ở dòng cuối Bảng 6 và nới lỏng so với phân loại dữ liệu đã đăng ký ở Bảng 5.
2. **Chuẩn W3C Verifiable Credentials** như EBSI đang dùng (Proposal mục 2, mục 8) — giải quyết triệt để nhưng vượt phạm vi một MVP cá nhân trong một tháng.

Phương án mã hóa tên khóa học bằng khóa công khai của học viên đã bị loại: MetaMask đã gỡ bỏ `eth_getEncryptionPublicKey` và `eth_decrypt`, nên không thực hiện được trong trình duyệt nếu không dựng thêm hạ tầng quản lý khóa riêng.

## 11. Phân tích tĩnh — Slither

| Hạng mục | Giá trị |
|---|---|
| Công cụ | Slither (`slither-analyzer`) |
| Lệnh | `slither .` chạy tại thư mục gốc (tự gọi `hardhat clean` + `compile --force`) |
| Log gốc | `docs/slither-report.txt` |
| Phạm vi | 1 contract, 102 detector |
| Kết quả | **3 phát hiện — 0 High, 0 Medium, 2 Low, 1 Optimization** |

Không có phát hiện nào ở mức High hoặc Medium.

### 11.1. Bảng phát hiện

| # | Detector | Mức | Vị trí | Kết luận |
|---|---|---|---|---|
| 1 | `timestamp` | Low | `issueCertificate` — dòng 93–106 | **False positive** |
| 2 | `timestamp` | Low | `revokeCertificate` — dòng 109–116 | **False positive** |
| 3 | `immutable-states` | Optimization | `owner` — dòng 35 | Hợp lệ, **không áp dụng** (có lập luận) |

### 11.2. Phát hiện 1 và 2 — `timestamp`: false positive

Slither báo hai hàm *"uses timestamp for comparisons"* và liệt kê các so sánh sau là nguy hiểm:

```
- require(certificates[certId].status == Status.None, "...certId already used")     (dòng 95)
- require(cert.status == Status.Issued, "...certificate not in Issued state")       (dòng 111)
- require(cert.issuer == msg.sender, "...only the issuing address can revoke")      (dòng 112)
```

**Cả ba so sánh này đều không liên quan tới thời gian.** Dòng 95 và 111 so sánh giá trị `enum Status`; dòng 112 so sánh hai biến `address`. Không có biểu thức nào trong contract lấy `block.timestamp` làm điều kiện.

Nguyên nhân báo nhầm: detector `timestamp` hoạt động ở mức hàm — nó đánh dấu bất kỳ hàm nào có **đọc** `block.timestamp`, rồi liệt kê **toàn bộ** phép so sánh trong hàm đó là "dangerous comparisons", không phân tích xem giá trị timestamp có thật sự chảy vào phép so sánh hay không. Trong contract này, `block.timestamp` chỉ xuất hiện ở hai chỗ và cả hai đều là **ghi dữ liệu, không phải điều kiện**:

| Vị trí | Cách dùng | Có nằm trong điều kiện không? |
|---|---|---|
| Dòng 102 | `issuedAt: block.timestamp` — gán vào trường của struct | Không |
| Dòng 115 | `emit CertificateRevoked(..., block.timestamp)` — tham số event | Không |

Ngay cả cách dùng thực tế cũng vô hại. Người đào block có thể làm lệch timestamp trong khoảng vài giây tới vài chục giây, nhưng giá trị này chỉ dùng để ghi **ngày cấp chứng chỉ** phục vụ hiển thị và kiểm toán — không có nhánh logic nào rẽ theo nó, không có phần thưởng kinh tế nào để thao túng, và sai lệch vài giây không đổi ý nghĩa nghiệp vụ của một ngày cấp.

**Kết luận: không sửa code.** Sửa để làm im cảnh báo (ví dụ bỏ trường `issuedAt`) sẽ làm mất một dữ liệu kiểm toán cần thiết mà không đổi lại được lợi ích an toàn nào.

### 11.3. Phát hiện 3 — `immutable-states`: hợp lệ nhưng không áp dụng

Slither đề xuất khai báo `address public immutable owner` vì biến này chỉ được gán một lần trong constructor và không bao giờ đổi. Đây **không phải false positive** — đề xuất đúng về mặt kỹ thuật: biến `immutable` được nhúng thẳng vào bytecode nên đọc rẻ hơn khoảng 2.100 gas so với đọc từ storage.

Quyết định: **giữ nguyên `address public owner`**, vì hai lý do.

**Thứ nhất — không khóa vĩnh viễn khả năng chuyển quyền sở hữu.** Threat model (Proposal mục 5, Bảng 6) đã liệt kê "Issuer/insider bị lộ khóa quản trị" là một rủi ro tồn dư có thật. Nếu khai báo `immutable`, contract vĩnh viễn không thể bổ sung hàm `transferOwnership` ở phiên bản sau; khóa owner bị mất hoặc lộ đồng nghĩa với việc không còn ai phân quyền được nữa. Giữ biến ở storage là chừa lại đường nâng cấp.

**Thứ hai — lợi ích gas không đáng kể.** Biến `owner` chỉ được đọc trong modifier `onlyOwner` (áp cho `addIssuer` và `removeIssuer` — hai thao tác quản trị hiếm khi gọi) và trong lời gọi read-only `owner()` từ giao diện để hiển thị vai trò. Nó không nằm trên đường đi nóng của `issueCertificate`, `revokeCertificate` hay `verifyCertificate` — ba thao tác chiếm gần như toàn bộ lưu lượng thực tế.

Đánh đổi giữa "tiết kiệm ~2.100 gas cho thao tác quản trị hiếm" và "mất vĩnh viễn khả năng khôi phục quyền sở hữu" nghiêng rõ về phía không áp dụng.

### 11.4. Những lỗ hổng Slither KHÔNG phát hiện

Kết quả âm tính cũng là bằng chứng cần ghi nhận. Trong 102 detector đã chạy, các nhóm sau không có phát hiện nào:

| Nhóm lỗ hổng | Kết quả | Lý do về mặt thiết kế |
|---|---|---|
| Reentrancy (mọi biến thể) | Không có | Contract không thực hiện bất kỳ lời gọi ngoài nào (`call`, `transfer`, `delegatecall`) |
| Access control (`suicidal`, `unprotected-upgrade`, `arbitrary-send`) | Không có | Mọi hàm ghi đều qua `modifier` hoặc `require` kiểm tra `msg.sender` |
| `tx.origin` dùng để xác thực | Không có | Contract chỉ dùng `msg.sender` |
| `delegatecall` / `selfdestruct` | Không có | Contract không dùng |
| Tràn số nguyên | Không áp dụng | Solidity 0.8.24 tự kiểm tra overflow/underflow ở mức compiler |
| Biến chưa khởi tạo, shadowing | Không có | — |

### 11.5. Ghi chú khi đọc log gốc

Trong `docs/slither-report.txt` có một khối văn bản trông như lỗi PowerShell (`slither.exe : INFO:Detectors:` kèm `NativeCommandError`). Đây **không phải lỗi chạy Slither**. Slither ghi toàn bộ output chẩn đoán ra luồng `stderr` theo thiết kế; PowerShell mặc định bọc mọi nội dung `stderr` của chương trình ngoài thành đối tượng lỗi rồi in ra theo định dạng lỗi. Dòng cuối `INFO:Slither:. analyzed (1 contracts with 102 detectors), 3 result(s) found` xác nhận quá trình phân tích đã hoàn tất bình thường.

## 12. Ảnh chụp màn hình

**12.1. Cấp chứng chỉ thành công** — banner xác nhận và mục nhật ký kèm tx hash, số block, lượng gas.

![Cấp chứng chỉ thành công](docs/screenshots/01-cap-thanh-cong.png)

**12.2. Xác minh hợp lệ** — nộp đúng tệp gốc, hash khớp và trạng thái còn hiệu lực.

![Xác minh hợp lệ](docs/screenshots/02-xac-minh-hop-le.png)

**12.3. Thao tác bị chặn** — ví không được cấp quyền phát hành cố cấp chứng chỉ; giao dịch revert với lý do lấy trực tiếp từ `require` trong contract.

![Thao tác bị chặn](docs/screenshots/03-bi-chan.png)

**12.4. Chứng chỉ đã bị thu hồi** — xác minh lại bằng **đúng tệp gốc** sau khi thu hồi: hash vẫn khớp nhưng kết quả trả về không hợp lệ. Minh chứng trực quan cho state machine một chiều `Issued → Revoked` ở Mục 6.

![Chứng chỉ đã bị thu hồi](docs/screenshots/04-da-thu-hoi.png)

**12.5. Tệp bị chỉnh sửa không khớp** — nộp tệp PDF đã sửa nội dung: mã chứng chỉ vẫn tồn tại và còn hiệu lực nhưng hash không khớp. Minh chứng cho abuse case "Holder gian lận" trong threat model (Proposal mục 5, Bảng 6).

![Tệp không khớp](docs/screenshots/05-tep-khong-khop.png)

**12.6. Màn hình học viên (F2)** — ví học viên kết nối và thấy danh sách chứng chỉ của chính mình, dựng từ event trên chuỗi nên hoạt động trên bất kỳ máy nào.

![Chứng chỉ của tôi](docs/screenshots/06-chung-chi-cua-toi.png)

## 13. So sánh với baseline tập trung (Proposal mục 2.1 và mục 6)

### 13.1. So sánh định lượng — thời gian xác minh một chứng chỉ

| Bước trong một lượt xác minh | MVP CredVerify | Baseline thủ công |
|---|---|---|
| Băm tệp trên máy nhà tuyển dụng | 0.28 ms | Không có bước này |
| Tra cứu và đối chiếu | 1.19 ms (đọc on-chain) | Gửi văn bản / email cho đơn vị cấp rồi chờ phản hồi |
| **Tổng thời gian** | **1.47 ms** (đo thực tế) | **Vài ngày tới hơn một tuần** (ước lượng từ nguồn thứ cấp — xem 13.3) |
| Chi phí mỗi lượt xác minh | 0 gas (hàm `view`) | Nhân lực hai phía |
| Kết quả có chắc chắn nhận được không? | Có — hàm luôn trả về một trong ba trạng thái | **Không** — có thể không nhận được phản hồi nào |
| Cần đơn vị cấp còn hoạt động? | Không | Có |
| Xác minh được ngoài giờ hành chính? | Có | Không |

Dòng "kết quả có chắc chắn nhận được không" đáng chú ý hơn cả dòng thời gian. Khác biệt giữa hai phương án không chỉ là nhanh hay chậm, mà là **có kết quả xác định** hay **có thể không có kết quả nào**.

### 13.2. So sánh định tính (rút từ Proposal mục 2.1, đã kiểm chứng bằng MVP)

| Tiêu chí | CSDL tập trung (baseline) | CredVerify | Bằng chứng trong tệp này |
|---|---|---|---|
| Trust | Verifier phải tin tuyệt đối vào issuer | Xác minh độc lập qua hash công khai | Mục 6, Mục 12.2 |
| Khả dụng dài hạn | Mất tra cứu nếu issuer ngừng vận hành | Bản ghi vẫn còn trên chuỗi | Mục 10.2 (test 16) |
| Auditability | Issuer sửa/xóa được, không để dấu vết | Lịch sử Issue/Revoke bất biến, truy vết công khai | Mục 5, Mục 6 |
| Chi phí vận hành | Thấp: server + CSDL | Cao hơn: gas khi ghi, đọc thì miễn phí | Mục 9.2, 9.3 |
| Độ phức tạp triển khai | Thấp | Cao hơn: cần kiến thức smart contract | — |
| Độ trễ xác minh | Nhanh nếu server còn sống | Nhanh, không phụ thuộc server của issuer | Mục 9.3 |

### 13.3. Nguồn của con số baseline và giới hạn của nó

**Cảnh báo về cách đọc:** cột MVP ở Mục 13.1 là **số đo thực tế** của đề tài này. Cột baseline **không phải số đo** — đề tài không tự khảo sát được thời gian phản hồi của các trung tâm đào tạo. Đó là ước lượng tổng hợp từ nguồn thứ cấp, và phải được trình bày đúng như vậy trong báo cáo.

**Bối cảnh Việt Nam.** Báo Tuổi Trẻ (02/12/2023) ghi nhận quy trình xác minh văn bằng truyền thống "tốn nhiều thời gian", dữ liệu các trường "không đầy đủ" và mỗi trường "làm một kiểu". Ông Thái Phương Triều, giám đốc Công ty Talent, được dẫn lời: *"Nếu chỉ gửi văn bản hay email rồi ngồi đợi thì chưa chắc đơn vị tuyển dụng nhận được phản hồi, nếu có thì cũng rất lâu."* Ông Trần Ngọc Phú, giám đốc Công ty PVAcons, cho biết nhiều hồ sơ văn bằng "chưa được số hóa, mất nhiều thời gian, công sức để xác minh".

**So sánh quốc tế.** Ngành sàng lọc nhân sự Hoa Kỳ công bố thời gian xác minh học vấn trung bình khoảng **2–5 ngày làm việc**, nhanh nhất khoảng 72 giờ khi trường có tham gia hệ thống tra cứu tập trung (National Student Clearinghouse). Con số này là **cận dưới lạc quan** cho bối cảnh Việt Nam, vì nó giả định có hạ tầng tra cứu tập trung mà các trung tâm đào tạo ngắn hạn ở Việt Nam chưa có.

**Vì sao không có thời hạn pháp lý để trích dẫn.** Thông tư 21/2019/TT-BGDĐT và các văn bản liên quan có quy định thời hạn cho một số thủ tục hành chính (ví dụ 03 ngày làm việc cho việc chỉnh sửa nội dung văn bằng; tối đa 20 ngày làm việc cho công nhận văn bằng do nước ngoài cấp). Nhưng **không có thời hạn nào ràng buộc việc một doanh nghiệp gửi yêu cầu xác minh tới đơn vị cấp** — đây là trao đổi ngoài thủ tục hành chính. Chính khoảng trống đó giải thích vì sao thời gian phản hồi không xác định được, và vì sao khả năng "không nhận được phản hồi nào" là có thật.

**Phạm vi áp dụng còn hẹp hơn nữa với đề tài này.** Các hệ thống tra cứu văn bằng hiện có ở Việt Nam chủ yếu phủ văn bằng chính quy của trường đại học, cao đẳng, và thường chỉ từ một mốc năm nhất định trở đi. **Chứng chỉ khóa học ngắn hạn do trung tâm đào tạo cấp — chính là đối tượng của đề tài này — gần như nằm ngoài mọi hệ thống tra cứu tập trung.** Với nhóm này, baseline thực tế không phải "tra cứu chậm" mà là "không có kênh tra cứu nào".

**Nếu muốn nâng chất lượng bằng chứng**, cách làm chuẩn là gửi yêu cầu xác minh thử tới 3–5 trung tâm đào tạo, ghi lại thời điểm gửi và thời điểm nhận phản hồi, rồi báo cáo cả số trường hợp **không phản hồi**. Khi đó cột baseline mới trở thành số đo của đề tài thay vì trích dẫn.

Nguồn tham khảo:

- Trần Huỳnh, *"Vụ giảng viên dùng bằng tiến sĩ giả: Cần khắc phục lỗ hổng tra cứu văn bằng"*, Tuổi Trẻ Online, 02/12/2023. https://tuoitre.vn/vu-giang-vien-dung-bang-tien-si-gia-can-khac-phuc-lo-hong-tra-cuu-van-bang-20231202081544234.htm
- Thông tư 21/2019/TT-BGDĐT — Quy chế quản lý văn bằng, chứng chỉ của hệ thống giáo dục quốc dân. https://luatvietnam.vn/giao-duc/thong-tu-21-2019-tt-bgddt-quy-che-quan-ly-bang-tot-nghiep-178752-d1.html
- GoodHire, *"How Long Do Background Checks Take?"*. https://www.goodhire.com/blog/how-long-do-background-checks-take/
- First Advantage, *"How Long Does a Background Check Take?"*. https://fadv.com/article/how-long-does-a-background-check-take/

## 14. Cam kết an toàn dữ liệu

- Không có private key, seed phrase hay access token nào trong tệp này.
- Không có dữ liệu cá nhân thật; tên học viên trong demo là dữ liệu giả.
- Các địa chỉ ví ở Mục 3 là tài khoản mặc định của mạng local Hardhat, công khai theo thiết kế.
