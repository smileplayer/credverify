# EVIDENCE — CredVerify MVP

Tệp này được sinh tự động bởi `scripts/collect-evidence.js`. Sinh lúc: 2026-08-30T10:21:52.916Z

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
| Deployment tx hash | `0xf643e0e703160eec2bd0c7b4c53f37d62787047638257f9a4a5d28af7048c089` |
| Deployment block | `1` |
| Gas deploy | `2241680` |
| Độ trễ deploy | `22.12 ms` |
| ABI | sinh ra tại `artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json` |

## 3. Tài khoản demo

Các tài khoản do `npx hardhat node` sinh ra, chỉ dùng cho mạng local. **Không có private key nào được ghi vào tệp này.**

| Vai trò | Địa chỉ |
|---|---|
| `owner` — CredVerify, đơn vị vận hành sổ đăng ký | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Trung tâm X — đơn vị phát hành, khóa bị lộ trong kịch bản | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Trung tâm Y — đơn vị phát hành thứ hai | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| Khóa mới của Trung tâm X sau khi chuyển giao | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |
| Học viên (holder) | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` |
| Ví không có quyền (dùng để test tấn công) | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` |

Lưu ý: `owner` **không** xuất hiện trong bất kỳ giao dịch cấp hay thu hồi nào ở Mục 4.

## 4. Giao dịch của luồng nghiệp vụ chính

| Bước | Thao tác | Tx hash | Block | Gas | Độ trễ (ms) | Ghi chú |
|---|---|---|---|---|---|---|
| 2 | addIssuer — CredVerify công nhận Trung tâm X và gắn tên hiển thị | `0x1cc5b6ddff48aabb2d496771fdcfa1aff18aa507d8ac01e8625504582b75d2bc` | 2 | 161315 | 9.45 | tên phải là duy nhất |
| 3 | issueCertificate — Trung tâm X cấp chứng chỉ cho học viên | `0x586b743487f398dceb9533c41980f87a1c8efbfacfcb7f03f4ce4a658c4bcc77` | 4 | 72697 | 7.24 | certId sinh tự động = keccak256(issuer ‖ certHash) |
| 4 | issueCertificate — một đơn vị KHÁC đăng ký đúng tệp đó, bản ghi độc lập | `0x139905150c28e7a29e6dbfc18fd641994685cc01100ab7f15d854f0b9ca4d7a1` | 5 | 72697 | 7.34 | certId khác vì khóa gồm cả địa chỉ issuer |
| 10 | revokeCertificate — Trung tâm X thu hồi chứng chỉ đã cấp | `0xa3ca4af41d02a4832f8204a9b75ea4ff1e6775b16a05b18d0c46f43b2667800c` | 12 | 36571 | 7.55 |  |
| 12 | issueCertificate — kẻ tấn công dùng khóa đã lộ của Trung tâm X cấp một bằng giả | `0x15aae312b28145dec7bb3c36ccf0afe5245e8201b516d396d9fdf8d968297449` | 15 | 72697 | 5.89 |  |
| 13 | inheritIssuer — chuyển giao danh tính sang khóa mới, khóa lộ bị vô hiệu tức thì | `0x1c71b1f36fc14c90332462ab762f8fc14c368bbe22c48e4aa047051775f0f115` | 16 | 138459 | 7.01 | tên được chép sang, không nhân bản |
| 15 | revokeCertificate — khóa kế nhiệm dọn bằng giả do khóa cũ đã cấp | `0x4a32211b9501f55d0b70f6f06b652bb8f6c207e2ad9934b63397e38527699f0c` | 19 | 38960 | 5.61 |  |

Cột độ trễ đo từ lúc gửi giao dịch tới khi nhận được receipt. Xem Mục 9 để biết phương pháp đo và giới hạn diễn giải của các con số này.

## 5. Event ghi nhận trên chuỗi

| Event | Tham số | Tx hash |
|---|---|---|
| `IssuerAdded` | issuerAddress=0x70997970C51812dc3A010C7d01b50e0d17dc79C8, name=Trung tam dao tao X | `0x1cc5b6ddff48aabb2d496771fdcfa1aff18aa507d8ac01e8625504582b75d2bc` |
| `CertificateIssued` | certId=0x71bf80ed7edc80f2bcd9c2a47cde0312e644bd76929df3aa3dc1b52c08fb48d4, certHash=0x4993aeefaaeea4be8d8bc14ff27af365eb03cfc93ef672e28fcda23afd2df3b9, issuer=0x70997970C51812dc3A010C7d01b50e0d17dc79C8, holder=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65, issuedAt=1788085307 | `0x586b743487f398dceb9533c41980f87a1c8efbfacfcb7f03f4ce4a658c4bcc77` |
| `CertificateRevoked` | certId=0x71bf80ed7edc80f2bcd9c2a47cde0312e644bd76929df3aa3dc1b52c08fb48d4, by=0x70997970C51812dc3A010C7d01b50e0d17dc79C8, revokedAt=1788085315 | `0xa3ca4af41d02a4832f8204a9b75ea4ff1e6775b16a05b18d0c46f43b2667800c` |
| `IssuerRemoved` | issuerAddress=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 | `0x1c71b1f36fc14c90332462ab762f8fc14c368bbe22c48e4aa047051775f0f115` |
| `IssuerAdded` | issuerAddress=0x90F79bf6EB2c4f870365E785982E1f101E93b906, name=Trung tam dao tao X | `0x1c71b1f36fc14c90332462ab762f8fc14c368bbe22c48e4aa047051775f0f115` |
| `IssuerInherited` | oldIssuer=0x70997970C51812dc3A010C7d01b50e0d17dc79C8, newIssuer=0x90F79bf6EB2c4f870365E785982E1f101E93b906, name=Trung tam dao tao X | `0x1c71b1f36fc14c90332462ab762f8fc14c368bbe22c48e4aa047051775f0f115` |

## 6. Thay đổi trạng thái (state change)

### 6.1. Vòng đời một chứng chỉ

certId `0x71bf80ed7edc80f2bcd9c2a47cde0312e644bd76929df3aa3dc1b52c08fb48d4` — Trung tâm X, tệp `Demo/DemoCert.pdf`

| Thời điểm | valid | status | Ý nghĩa |
|---|---|---|---|
| Sau khi cấp | true | 1 | Issued (còn hiệu lực) |
| Sau khi thu hồi | false | 2 | Revoked (đã thu hồi) |

Trạng thái chuyển một chiều `Issued -> Revoked`, **không có đường quay lại**. Hash tệp vẫn khớp sau khi thu hồi nhưng `valid` trả về false — chứng minh trạng thái được kiểm tra độc lập với tính toàn vẹn của tệp. Mục 7 có một dòng chứng minh việc **cấp lại** tệp đã thu hồi bị contract từ chối: đó là bất biến chống "nói hai lời".

### 6.2. Không gian tên riêng trong sổ chung

Trung tâm Y đăng ký **đúng tệp** mà Trung tâm X đã cấp (Bước 4). Hai bản ghi hoàn toàn độc lập:

| Bản ghi | valid | Ví học viên |
|---|---|---|
| Của Trung tâm X | true | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` |
| Của Trung tâm Y | true | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` |

Nếu khóa chính là hash tệp trần thì lời gọi thứ hai sẽ **khóa cửa** Trung tâm X khỏi chính chứng chỉ của mình, và bản ghi trên chuỗi sẽ ghi tên kẻ tấn công là đơn vị cấp. Khóa `keccak256(issuer ‖ certHash)` cho mỗi đơn vị một không gian tên riêng bên trong một sổ chung, nên đòn này vô hại.

### 6.3. Dọn hậu quả sau khi khóa cấp bị lộ

Bằng giả do khóa đã lộ cấp, sau khi khóa kế nhiệm dọn dẹp: `valid = false`, trạng thái Revoked (đã thu hồi).

Xem ở mục 7 các thao tác: khóa đã bị chuyển giao **không cấp được nữa** và **không thu hồi được nữa**, còn `inheritIssuer` sau khi đã `removeIssuer` thì **bị chặn**. Dòng cuối là một **bẫy vận hành**, không phải lỗi thiết kế: phản xạ tự nhiên khi phát hiện sự cố là gỡ quyền , nhưng chính nước đi đó đóng cánh cửa chuyển giao. Quy trình đúng là chuyển giao NGAY — `inheritIssuer` đã tự vô hiệu hóa khóa cũ, nên nó làm luôn việc của `removeIssuer`.

## 7. Hành vi sai bị chặn

| # | Hành vi | Kỳ vọng | Kết quả thực tế |
|---|---|---|---|
| 1 | issueCertificate gọi từ ví chưa được công nhận là đơn vị phát hành | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with reason string 'CredentialRegistry: caller is not an active issuer' |
| 2 | issueCertificate gọi từ chính OWNER — đơn vị vận hành không được cấp chứng chỉ | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with reason string 'CredentialRegistry: caller is not an active issuer' |
| 3 | revokeCertificate gọi từ OWNER — đơn vị vận hành không được thu hồi | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with reason string 'CredentialRegistry: caller is not an active issuer' |
| 4 | revokeCertificate gọi từ một đơn vị phát hành KHÁC (Trung tâm Y) | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with reason string 'CredentialRegistry: not the issuing key or its successor' |
| 5 | addIssuer với tên TRÙNG một đơn vị đã có — đường lạm quyền im lặng | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with reason string 'CredentialRegistry: name already taken' |
| 6 | issueCertificate cùng một tệp hai lần bởi cùng một đơn vị | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with reason string 'CredentialRegistry: certificate already exists for this issuer and file' |
| 7 | verifyCertificate với tệp đã bị chỉnh sửa (hash không khớp) | Kết quả phải là false | Hàm read-only trả về valid = false (không phát sinh giao dịch) |
| 8 | issueCertificate CẤP LẠI một tệp đã bị thu hồi — bất biến chống 'nói hai lời' | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with reason string 'CredentialRegistry: certificate already exists for this issuer and file' |
| 9 | revokeCertificate lần hai trên cùng một chứng chỉ | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with reason string 'CredentialRegistry: certificate not in Issued state' |
| 10 | khóa đã lộ cố cấp thêm chứng chỉ sau khi bị chuyển giao | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with reason string 'CredentialRegistry: caller is not an active issuer' |
| 11 | khóa đã lộ cố thu hồi bậy một chứng chỉ hợp lệ | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with reason string 'CredentialRegistry: caller is not an active issuer' |
| 12 | inheritIssuer sau khi đã gỡ quyền — BẪY THỨ TỰ THAO TÁC khi xử lý sự cố | Giao dịch phải revert (phải bật lại trước khi chuyển giao) | Error: VM Exception while processing transaction: reverted with reason string 'CredentialRegistry: old address is not an active issuer' |

## 8. Đối chiếu thao tác giao diện với giao dịch trên chuỗi

| Thao tác trên giao diện `app/index.html` | Hàm contract | Thay đổi trạng thái |
|---|---|---|
| Quản trị → Công nhận | `addIssuer(address,string)` | `issuerStatus` None→Active, `nameHolder[keccak(tên)]`, event `IssuerAdded` |
| Quản trị → Gỡ quyền / Bật lại | `removeIssuer` / `restoreIssuer` | `issuerStatus` Active↔Disabled |
| Quản trị → Chuyển giao danh tính | `inheritIssuer(address,address)` | khóa cũ→Disabled, khóa mới→Active, tên chuyển sang, `inheritedBy` |
| Quản trị → Chuyển/Nhận quyền owner | `transferOwnership` / `acceptOwnership` | `pendingOwner` rồi `owner` |
| Cấp chứng chỉ → nút Cấp | `issueCertificate(bytes32,address)` | `certificates[certId].status` None→Issued, event `CertificateIssued` |
| Tra cứu & thu hồi → nút Thu hồi | `revokeCertificate(bytes32)` | `status` Issued→Revoked, event `CertificateRevoked` |
| Xác minh → có chọn đơn vị cấp | `verifyCertificate(address,bytes32)` | Chỉ đọc, **một** lời gọi view |
| Xác minh → không biết đơn vị cấp | `findByHash(bytes32)` rồi `verifyCertificate` | Chỉ đọc, quét O(n) theo số đơn vị |
| Chứng chỉ của tôi | event `CertificateIssued` lọc theo `holder`, rồi `getCertificate` | Chỉ đọc |
| Đơn vị phát hành → danh bạ | `listActiveIssuers()` | Chỉ đọc |
| Đơn vị phát hành → nhật ký quản trị | event `IssuerAdded/Removed/Restored/Inherited` | Chỉ đọc |
| Xác minh, Chứng chỉ của tôi, Đơn vị phát hành | qua `JsonRpcProvider` | **không cần ví** |

`certId` **không** do người dùng nhập. Giao diện tính tại chỗ bằng `solidityPackedKeccak256(["address","bytes32"], [ví, hash])`, đúng công thức của hàm `pure certIdOf` trên chuỗi, nên không tốn một vòng RPC nào.

Giao diện băm tệp bằng `keccak256` ngay trên máy người dùng; **tệp gốc không bao giờ rời máy**. Giá trị đưa lên chuỗi chỉ gồm hash tệp và địa chỉ ví.

## 8b. Ba việc giao diện làm mà contract không làm được

Nguyên tắc phân chia: **contract cưỡng chế cái gì phải ĐÚNG, giao diện cung cấp cái gì phải được NHÌN THẤY.**

| Cải tiến ở giao diện | Vì sao contract không làm được |
|---|---|
| **Cảnh báo tuổi khóa cấp** — hiện đơn vị được công nhận từ bao giờ, cách thời điểm cấp bao lâu | Trên chuỗi, "đơn vị hợp pháp vừa được công nhận" và "ví giả được thêm 3 phút trước" giống hệt nhau từng byte. Không `require` nào tách được hai cái đó; một con người có ngữ cảnh thì tách được ngay |
| **Cảnh báo tên gần giống** — chuẩn hóa NFKC + gộp khoảng trắng + bỏ dấu rồi so | `nameHolder` chặn trùng tên y hệt theo byte; chuẩn hóa Unicode trong Solidity thì không có giá hợp lý |
| **Đồng hồ đo đời khóa** — hiện "đời thứ N/8" | Contract chỉ biết chặn ở hop thứ 9; nó không có chỗ nào để cảnh báo trước |

**Giới hạn phải nói rõ:** mọi cảnh báo trên chỉ bảo vệ người đang dùng đúng trang này. Kẻ tấn công dựng trang riêng, hoặc gọi thẳng contract qua Etherscan. Đây là lớp phòng vệ chống **nhầm lẫn**, không phải lớp phòng vệ chống **tấn công**.

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
| Deploy contract | 2241680 | 22.12 |
| addIssuer | 161315 | 9.45 |
| issueCertificate | 72697 | 7.24 |
| issueCertificate | 72697 | 7.34 |
| revokeCertificate | 36571 | 7.55 |
| issueCertificate | 72697 | 5.89 |
| inheritIssuer | 138459 | 7.01 |
| revokeCertificate | 38960 | 5.61 |

### 9.3. Thao tác đọc — độ trễ

Các thao tác dưới đây không phát sinh giao dịch nên **chi phí gas bằng 0**.

| Thao tác | Mẫu | Nhỏ nhất | Trung vị | Trung bình | p95 | Lớn nhất |
|---|---|---|---|---|---|---|
| verifyCertificate — nhà tuyển dụng xác minh khi ĐÃ BIẾT đơn vị cấp (đường O(1)) | 30 | 1.82 | 2.27 | 2.38 | 3.35 | 3.91 |
| findByHash — nhà tuyển dụng KHÔNG biết đơn vị cấp (đường dự phòng O(n)) | 30 | 1.73 | 1.96 | 2.03 | 2.53 | 2.75 |
| getCertificate — giao diện làm mới trạng thái một chứng chỉ | 30 | 1.30 | 1.53 | 1.53 | 1.87 | 1.91 |
| listActiveIssuers — giao diện dựng danh bạ đơn vị phát hành | 30 | 1.39 | 1.69 | 1.72 | 2.15 | 2.28 |
| keccak256 — băm tệp PDF trên máy người dùng (5 KB) | 30 | 0.35 | 0.40 | 0.41 | 0.53 | 0.93 |

### 9.4. Giới hạn diễn giải của các số đo này

1. **Mạng local Hardhat đào block tức thì.** Không có thời gian chờ đồng thuận, không có hàng đợi giao dịch, không có cạnh tranh phí. Độ trễ ghi đo được ở đây gần như chỉ là thời gian vòng tròn của lời gọi RPC nội bộ, **không đại diện cho mạng thật**. Trên Ethereum mainnet, một block mất khoảng 12 giây, nên độ trễ ghi thực tế sẽ lớn hơn nhiều bậc.
2. **Độ trễ đọc thì có ý nghĩa hơn.** Thao tác `view` không cần đồng thuận nên số đo ở đây phản ánh đúng bản chất: xác minh là thao tác rẻ và nhanh. Trên mạng thật, phần tăng thêm chủ yếu là độ trễ mạng tới node RPC, không phải chi phí tính toán.
3. **Gas thì không phụ thuộc mạng.** Lượng gas ở Mục 9.2 đúng trên mọi mạng EVM; chỉ có *giá* mỗi đơn vị gas là thay đổi theo mạng và theo thời điểm.
4. **Số đo phụ thuộc máy chạy.** Chạy lại trên máy khác sẽ ra con số khác. Đây là lý do bảng trên báo trung vị và p95 thay vì một giá trị đơn lẻ.

## 10. Kết quả kiểm thử tự động

Lệnh: `npx hardhat test`. Mỗi test deploy một contract mới qua `beforeEach` nên các test độc lập hoàn toàn.

**Kết quả: 71 passing, 0 failing** (5523.28 ms).

```
CredentialRegistry V2
    1. Công nhận đơn vị phát hành
      ✔ owner công nhận được một trung tâm, kèm tên hiển thị (201ms)
      ✔ BỊ CHẶN: người ngoài không công nhận được ai (73ms)
      ✔ BỊ CHẶN: owner không tự cấp quyền phát hành cho chính địa chỉ owner (56ms)
      ✔ BỊ CHẶN: tên rỗng (44ms)
      ✔ BỊ CHẶN: một địa chỉ đã dùng thì không công nhận lại được dưới tên khác (56ms)
      ✔ BẤT BIẾN: bật lại một khóa đã gỡ thì GIỮ NGUYÊN tên cũ (58ms)
      ✔ BỊ CHẶN: không bật lại được một khóa đã chuyển giao cho người kế nhiệm (52ms)
    1a. Người không có quyền gọi hàm quản trị
      ✔ BỊ CHẶN: người ngoài không gỡ quyền được ai (45ms)
      ✔ BỊ CHẶN: người ngoài không bật lại được ai (57ms)
      ✔ BỊ CHẶN: người ngoài không chuyển quyền owner được (44ms)
      ✔ BỊ CHẶN: công nhận địa chỉ 0 làm đơn vị phát hành (41ms)
      ✔ BỊ CHẶN: gỡ quyền một địa chỉ vốn không đang hoạt động (54ms)
      ✔ BỊ CHẶN: bật lại một đơn vị vốn đang hoạt động (40ms)
      ✔ BỊ CHẶN: chuyển giao danh tính sang địa chỉ 0 (38ms)
      ✔ BỊ CHẶN: chuyển giao danh tính sang chính ví owner (46ms)
    1b. Tên là duy nhất — chặn đường lạm quyền IM LẶNG
      ✔ BỊ CHẶN: hai ví khác nhau KHÔNG mang được cùng một tên (45ms)
      ✔ BẤT BIẾN: gỡ quyền một trung tâm KHÔNG trả tên đó lại cho người khác (51ms)
      ✔ chuyển giao thì TÊN ĐI THEO khóa mới, và vẫn chỉ một chủ (43ms)
      ✔ issuerByName() trả về địa chỉ 0 cho tên chưa ai đăng ký (42ms)
      ✔ BẤT BIẾN: danh sách khả kiến không còn hai dòng trùng tên (48ms)
      ✔ GIỚI HẠN ĐÃ BIẾT: tên GẦN GIỐNG vẫn đăng ký được — so khớp theo byte (49ms)
    2. Cấp chứng chỉ
      ✔ HAPPY PATH: trung tâm cấp, bản ghi đúng, event đúng (49ms)
      ✔ certIdOf() trên chuỗi khớp với giá trị client tự tính (40ms)
      ✔ BỊ CHẶN: ví không có quyền cấp (48ms)
      ✔ BỊ CHẶN: khóa đã bị gỡ quyền không cấp được nữa (44ms)
      ✔ BỊ CHẶN: owner KHÔNG cấp được chứng chỉ — không có đường nào dẫn tới (39ms)
      ✔ BỊ CHẶN: hash rỗng (40ms)
      ✔ BỊ CHẶN: học viên là địa chỉ 0 (39ms)
      ✔ BỊ CHẶN: cùng một issuer cấp trùng một tệp hai lần (51ms)
    3. Không gian tên riêng trong sổ chung
      ✔ BẤT BIẾN: issuer bất lương KHÔNG khóa cửa được trung tâm thật bằng cách đăng ký trước (51ms)
      ✔ BẤT BIẾN: issuer khác KHÔNG thu hồi được chứng chỉ của trung tâm thật (45ms)
      ✔ findByHash() cho verifier thấy CẢ HAI bản ghi và ai đã cấp (56ms)
      ✔ findByHash() trả về rỗng cho một tệp chưa từng đăng ký
    4. Thu hồi
      ✔ HAPPY PATH: đúng khóa đã cấp thì thu hồi được, có dấu thời gian (49ms)
      ✔ BẤT BIẾN: thu hồi là VĨNH VIỄN — không cấp lại được cùng tệp đó (47ms)
      ✔ BỊ CHẶN: thu hồi hai lần (46ms)
      ✔ BỊ CHẶN: thu hồi một chứng chỉ chưa từng tồn tại (39ms)
      ✔ BỊ CHẶN: owner KHÔNG thu hồi được — quyền này không thuộc về đơn vị vận hành (49ms)
      ✔ BỊ CHẶN: người lạ không thu hồi được (41ms)
      ✔ BỊ CHẶN: khóa ĐÃ BỊ GỠ QUYỀN mất luôn quyền thu hồi (46ms)
    5. Xoay khóa khi bị lộ
      ✔ khóa kế nhiệm thu hồi được chứng chỉ do khóa cũ đã cấp (46ms)
      ✔ chuyển giao chép TÊN sang khóa mới — trung tâm không mất danh tính (45ms)
      ✔ BỊ CHẶN: khóa kế nhiệm ĐÃ BỊ GỠ cũng mất quyền thu hồi (67ms)
      ✔ BỊ CHẶN: chỉ owner chuyển giao được danh tính issuer (40ms)
      ✔ BỊ CHẶN: không chuyển giao sang một địa chỉ đã dùng làm issuer (38ms)
      ✔ chuỗi kế nhiệm hai bậc: X -> K2 -> K3, K3 vẫn dọn được hậu quả của X (51ms)
      ✔ CHỦ ĐÍCH: kế nhiệm chỉ chảy XUÔI — khóa cũ không thu hồi hộ khóa mới (49ms)
      ✔ KỊCH BẢN ĐẦU-CUỐI: lộ khóa -> chuyển giao -> khóa cũ tê liệt -> khóa mới dọn hậu quả (65ms)
    6. Xác minh
      ✔ tệp đúng, chưa thu hồi -> hợp lệ, kèm tên đơn vị cấp (48ms)
      ✔ tệp bị sửa một byte -> hash lệch -> KHÔNG hợp lệ (42ms)
      ✔ đã thu hồi -> không hợp lệ, nhưng vẫn trả về MỐC THỜI GIAN thu hồi (45ms)
      ✔ CHỦ ĐÍCH: xác minh KHÔNG bị chặn khi đơn vị cấp đã bị gỡ quyền (44ms)
      ✔ BẤT BIẾN: người lạ không cần ví, không cần quyền gì để xác minh (46ms)
    7. Khả kiến — issuer thêm lén không còn vô hình
      ✔ listActiveIssuers() trả về địa chỉ KÈM tên
      ✔ owner thêm một issuer lén thì nó HIỆN NGAY trong danh sách (41ms)
      ✔ knownIssuers() giữ cả khóa đã bị gỡ, phục vụ kiểm toán (43ms)
      ✔ governance() trả về toàn bộ trạng thái quản trị trong một lời gọi (40ms)
    8. Chuyển quyền owner
      ✔ hai bước: đề nghị rồi bên nhận phải chấp nhận (49ms)
      ✔ BỊ CHẶN: người không được chỉ định không nhận được quyền (44ms)
      ✔ BỊ CHẶN: chuyển quyền cho địa chỉ 0 (39ms)
    9. Ranh giới quyền của đơn vị vận hành (đề bài mục 3 & 5.2)
      ✔ BẤT BIẾN: owner gỡ quyền một trung tâm nhưng KHÔNG làm mất hiệu lực chứng chỉ đã cấp (42ms)
      ✔ BẤT BIẾN: owner không có MỘT hàm nào ghi vào `certificates` (41ms)
      ✔ RỦI RO CÒN LẠI: owner cướp được danh tính một trung tâm đang hoạt động (54ms)
    10. Dọn dẹp sau sự cố — THỨ TỰ THAO TÁC QUYẾT ĐỊNH KẾT QUẢ
      ✔ QUY TRÌNH ĐÚNG: inheritIssuer khi khóa xấu CÒN Active -> khóa dọn dẹp thu hồi được (61ms)
      ✔ BẪY VẬN HÀNH: gọi removeIssuer TRƯỚC thì inheritIssuer revert (57ms)
      ✔ KHÔNG CÓ NGÕ CỤT: restoreIssuer -> inheritIssuer -> thu hồi, vẫn cứu được (60ms)
      ✔ R4 — CHUỖI KẾ NHIỆM CẠN SAU 8 ĐỜI: chứng chỉ đời đầu mất khả năng thu hồi (94ms)
      ✔ GIỚI HẠN THẬT: thu hồi TỪNG chứng chỉ một — không có thu hồi hàng loạt (52ms)

  XSS qua chuỗi revert của contract
    ✔ chuỗi revert do kẻ tấn công chọn tới được client nguyên vẹn
    ✔ Deploy contract giả
    ✔ esc() vô hiệu hóa payload

  71 passing (3s)
```

> Khối kết quả trên được sinh bằng cách **chạy lại `npx hardhat test` ngay trong script này**

### 10.1. Nhóm kiểm thử

| Nhóm | Mục đích |
|---|---|
| 1. Công nhận đơn vị phát hành | Chỉ owner công nhận được; một địa chỉ ứng với đúng một danh tính |
| 1b. Tên là duy nhất | Chặn đường lạm quyền **im lặng**: hai ví cùng một tên |
| 2. Cấp chứng chỉ | Happy path và mọi cách gọi sai đều bị chặn, kể cả từ owner |
| 3. Không gian tên riêng | Đòn đăng ký trước bị vô hiệu; `findByHash` trả về đúng nhiều bản ghi |
| 4. Thu hồi | Bất biến **thu hồi là vĩnh viễn**; owner không thu hồi được |
| 5. Xoay khóa khi bị lộ | Chuyển giao chép tên, khóa cũ tê liệt hoàn toàn |
| 6. Xác minh | Không bao giờ bị chặn, kể cả khi đơn vị cấp đã bị vô hiệu hóa |
| 7. Khả kiến | Đơn vị thêm lén hiện ngay trong danh sách |
| 8. Chuyển quyền owner | Hai bước, gõ nhầm không mất quyền vĩnh viễn |
| 9. Ranh giới quyền owner | Liệt kê tường minh 8 hàm ghi; không hàm nào của owner chạm vào `certificates` |
| 10. Dọn dẹp sau sự cố | Ghim **thứ tự thao tác đúng** và bẫy vận hành đi kèm |
| XSS qua chuỗi revert (frontend) | Dữ liệu do kẻ tấn công kiểm soát tới được client |

Trọng tâm của bộ kiểm thử là **hành vi sai bị chặn** và **kịch bản phục hồi sự cố**, không chỉ chứng minh luồng thuận chạy được.

### 10.2. Ba test khẳng định rủi ro thay vì vá

Ba test dưới đây **pass** để ghim một rủi ro còn lại, không phải để tuyên bố đã xử lý. Nếu một phiên bản sau vô tình vá chúng, test sẽ vỡ và buộc người sửa phải đọc lại lý do.

| Test | Khẳng định điều gì |
|---|---|
| *GIỚI HẠN ĐÃ BIẾT: tên GẦN GIỐNG vẫn đăng ký được* | `nameHolder` so khớp theo byte, không chặn được chữ Kirin trông giống Latin hay khoảng trắng thừa |
| *RỦI RO CÒN LẠI: owner cướp được danh tính một trung tâm đang hoạt động* | `inheritIssuer` là quyền nguy hiểm nhất của owner; cơ chế bù duy nhất là tính công khai của event |
| *BẪY VẬN HÀNH: gọi removeIssuer TRƯỚC thì inheritIssuer revert* | Thứ tự thao tác khi xử lý sự cố quyết định việc dọn dẹp có khả thi hay không |

### 10.3. Đối chiếu test với lớp phòng thủ trong contract

| Lớp phòng thủ | Test xác nhận |
|---|---|
| `onlyOwner` — chỉ CredVerify công nhận được đơn vị | *BỊ CHẶN: người ngoài không công nhận được ai* |
| `onlyActiveIssuer` — chỉ đơn vị đang hoạt động mới cấp được | *BỊ CHẶN: ví không có quyền cấp*, *khóa đã bị gỡ quyền không cấp được nữa* |
| `require(issuerAddress != owner)` | *BỊ CHẶN: owner không tự cấp quyền phát hành cho chính địa chỉ owner* |
| `require(nameHolder[nameKey] == 0)` | *BỊ CHẶN: hai ví khác nhau KHÔNG mang được cùng một tên* |
| Tên không được trả tự do khi gỡ quyền | *BẤT BIẾN: gỡ quyền KHÔNG trả tên đó lại cho người khác* |
| `require(certHash != 0)` | *BỊ CHẶN: hash rỗng* |
| `require(holder != address(0))` | *BỊ CHẶN: học viên là địa chỉ 0* |
| `require(status == None)` — chặn trùng VÀ chặn cấp lại sau thu hồi | *BỊ CHẶN: cấp trùng*, *BẤT BIẾN: thu hồi là VĨNH VIỄN* |
| `require(issuerStatus[msg.sender] == Active)` trong `revokeCertificate` | *Khóa đã bị gỡ quyền mất luôn quyền thu hồi*, *Knhiệm đã bị gỡ cũng mất quyền* |
| `_inheritsFrom` — chỉ khóa đã cấp hoặc người kế nhiệm | *BỊ CHẶN: issuer khác không thu hồi được*, *chuỗi kế nhiệm hai bậc* |
| `acceptOwnership` hai bước | *BỊ CHẶN: người không được chỉ định không nhận được quyền* |

Mọi `require` và `modifier` trong contract đều có ít nhất một test tương ứng.

### 10.4. Độ phủ kiểm thử (coverage)

Lệnh: `npx hardhat coverage` (solidity-coverage). Số dưới đây được script này **đọc lại từ `coverage.json`** và tính lại, không phải chép tay.

| Tệp | % câu lệnh | % nhánh | % hàm |
|---|---:|---:|---:|
| `attack/EvilRegistry.sol` | 50.00 | 100.00 | 50.00 |
| `contracts/CredentialRegistry.sol` | 100.00 | 100.00 | 100.00 |

`contracts/attack/EvilRegistry.sol` có độ phủ thấp là **đúng như thiết kế**: đó là contract tấn công dựng làm bằng chứng cho M7, chỉ một hàm của nó được gọi trong kịch bản XSS. Nó không thuộc hệ thống và không nên tính vào độ phủ của sản phẩm.

## 11. Phân tích tĩnh — Slither

Lưu ý: toàn bộ mục này là hằng số trong script, phải cập nhật tay sau mỗi lần chạy Slither.

| Hạng mục | Giá trị |
|---|---|
| Công cụ | Slither `slither-analyzer` 0.11.6 |
| Lệnh | `slither . --filter-paths "contracts/attack" --exclude-dependencies` |
| Log gốc | `docs/slither-report.txt` |
| Phạm vi | `contracts/CredentialRegistry.sol`, 102 detector |
| Kết quả | **2 phát hiện — 0 High, 0 Medium, 2 Low, 0 Optimization** |

`contracts/attack/EvilRegistry.sol` bị loại khỏi phạm vi quét: đó là contract **tấn công** dựng làm bằng chứng cho M7, không phải một phần của hệ thống.

### 11.1. Bảng phát hiện

| # | Detector | Mức | Vị trí | Kết luận |
|---|---|---|---|---|
| 1 | `timestamp` | Low | `issueCertificate` | **False positive** |
| 2 | `timestamp` | Low | `revokeCertificate` | **False positive** |

### 11.2. Cả hai phát hiện đều là false positive

Slither báo hai hàm *"uses timestamp for comparisons"*. Các so sánh bị liệt kê là:

```
- require(certificates[certId].status == Status.None, "...already exists...")
- require(cert.status == Status.Issued, "...not in Issued state")
- require(_inheritsFrom(cert.issuer, msg.sender), "...not the issuing key or its successor")
```

**Không so sánh nào liên quan tới thời gian.** Hai dòng đầu so sánh giá trị `enum Status`; dòng thứ ba kiểm một giá trị `bool` trả về từ hàm `view` `_inheritsFrom`, vốn chỉ đi theo chuỗi `inheritedBy` và so sánh `address`. Nguyên nhân báo nhầm: detector `timestamp` hoạt động ở **mức hàm**. Nó đánh dấu bất kỳ hàm nào có ĐỌC `block.timestamp`, rồi liệt kê TOÀN BỘ phép so sánh trong hàm đó là "dangerous comparisons", không phân tích xem giá trị timestamp có thật sự chảy vào phép so sánh hay không. Trong hai hàm này `block.timestamp` chỉ được **ghi** vào `issuedAt` / `revokedAt` và phát ra trong event — không có nhánh logic nào rẽ theo nó.

Người đào block làm lệch được timestamp vài giây tới vài chục giây, nhưng giá trị này chỉ dùng để ghi **ngày cấp** và **ngày thu hồi** phục vụ hiển thị và kiểm toán. Không có phần thưởng kinh tế nào để thao túng, và sai lệch vài giây không đổi ý nghĩa nghiệp vụ của một ngày cấp.

**Kết luận: không sửa code.** Bỏ `issuedAt`/`revokedAt` để làm im cảnh báo sẽ mất dữ liệu kiểm toán cần thiết — chính là dữ liệu trả lời câu *"lúc tuyển tháng 3, tấm bằng này còn hiệu lực không?"* — mà không đổi lại được lợi ích an toàn nào.

## 11b. Giới hạn khi mở rộng — số đo

`findByHash` và `listActiveIssuers` duyệt toàn bộ tập đơn vị phát hành. Cả hai là hàm `view` nên **chi phí gas bằng 0** với người gọi, nhưng RPC công khai đặt trần cho `eth_call`, nên vẫn có một giới hạn quy mô thật.

| Số đơn vị phát hành | `findByHash` (gas) | `listActiveIssuers` (gas) |
|---|---|---|
| 10 | 81287 | 112286 |
| 50 | 306857 | 465359 |
| 100 | 589060 | 907264 |

Chi phí tăng **tuyến tính**: khoảng 5642 gas mỗi đơn vị với `findByHash` và 8833 gas mỗi đơn vị với `listActiveIssuers`. Với trần `eth_call` phổ biến 10M–50M gas, trần thực tế rơi vào khoảng **1132 – 8862 đơn vị phát hành**.

Con số này **không phải giả định xa vời**: Việt Nam có thể có vài nghìn trung tâm đào tạo.

Ba cách xử lý, theo thứ tự nên làm:

1. **Hỏi đúng câu.** `findByHash` chỉ cần khi verifier KHÔNG biết đơn vị nào cấp. Giao diện hỏi "tấm bằng này của trung tâm nào?" thì đường đi là `certIdOf` tính tại client rồi `getCertificate` — **O(1)**, không chạm vòng lặp. Đường O(n) lùi về vai trò dự phòng. Đây là cách xử lý **không tốn một dòng contract nào**.
2. **Indexer.** Bản triển khai thật nên đẩy phần tìm kiếm sang một indexer (ví dụ The Graph) đọc event, thay vì duyệt storage trong hàm `view`.
3. **Phân trang.** Thêm `listIssuers(offset, limit)` nếu vẫn muốn giữ mọi thứ on-chain. Cố ý **không** làm trong MVP: nó thêm bề mặt cho một bài toán mà cách 1 đã xử lý gần hết.

Script sinh lại bảng này ở quy mô lớn hơn: `npx hardhat run scripts/scale-probe.js`.

## 12. Ảnh chụp màn hình

Chụp từ một phiên chạy thật với MetaMask trên mạng Hardhat local (chainId 31337). Đường dẫn: `picture/screenshots/`.

| # | Ảnh | Chứng minh điều gì |
|---|---|---|
| 1 | `01-cong-nhan-trung-tam-A.png` | Owner công nhận đơn vị phát hành, nhật ký hiện tx hash + block + gas |
| 2 | `02-cong-nhan-trung-tam-B.png` | Đơn vị thứ hai — điều kiện để minh họa **không gian tên riêng** ở Mục 6.2 |
| 3 | `03-hop-xac-nhan-ten-gan-giong.png` | Hộp xác nhận hiện **TRƯỚC KHI** gửi giao dịch, cho tên khác byte nhưng trông giống |
| 4 | `04-doi-vi.png` | Đổi ví trong MetaMask → chip Vai trò bị xóa, nhật ký ghi *Ví đổi tài khoản* |
| 5 | `05-cap-chung-chi-thanh-cong.png` | Cấp chứng chỉ thành công; khung *Mã bản ghi* hiện `certId` **tính tại client**, không nhập tay |
| 6 | `06-xac-minh-hop-le.jpeg` | Nộp đúng tệp gốc → hợp lệ, kèm **tên đơn vị cấp** và thời điểm đơn vị được công nhận |
| 7 | `07-cap-chung-chi-bi-chan.jpeg` | Ví chưa được công nhận cố cấp → revert `caller is not an active issuer`, chuỗi lý do lấy **thẳng từ `require`** |
| 8 | `08-thu-hoi-chung-chi.jpeg` | Thu hồi thành công, kèm cảnh báo *thu hồi là VĨNH VIỄN* |
| 9 | `09-xac-minh-da-thu-hoi.jpeg` | Xác minh lại bằng **đúng tệp gốc**: hash vẫn khớp nhưng **không hợp lệ**, kèm ngày thu hồi |
| 10 | `10-danh-ba-canh-bao-ten.jpeg` | Tab Đơn vị phát hành: danh bạ + nhật ký quản trị + **băng đỏ cảnh báo tên gần giống** |
| 11 | `11-chung-chi-cua-toi.jpeg` | Màn hình học viên, dựng từ event trên chuỗi, **không cần ví** |

**Cặp ảnh 6 và 9 là bằng chứng trực quan**: cùng một tệp, cùng một hash, hai kết quả khác nhau trước và sau khi thu hồi. Nó cho thấy trạng thái được kiểm tra **độc lập** với tính toàn vẹn của tệp — state machine một chiều ở Mục 6.1.

**Ảnh 3, 4 và 10** là bằng chứng cho Mục 8b — những việc giao diện làm mà contract không làm được. **Ảnh 7** đáng chú ý vì nó bắt được hai thứ trong một khung hình: giao dịch bị chặn với đúng chuỗi revert của contract, VÀ dòng *Ví đổi tài khoản* trong nhật ký ngay phía trên.

## 13. So sánh với baseline tập trung (Proposal mục 2.1 và mục 6)

### 13.1. So sánh định lượng — thời gian xác minh một chứng chỉ

| Bước trong một lượt xác minh | MVP CredVerify | Baseline thủ công |
|---|---|---|
| Băm tệp trên máy nhà tuyển dụng | 0.40 ms | Không có bước này |
| Tra cứu và đối chiếu | 2.27 ms (đọc on-chain) | Gửi văn bản / email cho đơn vị cấp rồi chờ phản hồi |
| **Tổng thời gian** | **2.66 ms** (đo thực tế) | **Vài ngày tới hơn một tuần** (ước lượng từ nguồn thứ cấp — xem 13.2) |
| Chi phí mỗi lượt xác minh | 0 gas (hàm `view`) | Nhân lực hai phía |
| Kết quả có chắc chắn nhận được không? | Có — hàm luôn trả về một trong ba trạng thái | **Không** — có thể không nhận được phản hồi nào |
| Cần đơn vị cấp còn hoạt động? | Không | Có |
| Xác minh được ngoài giờ hành chính? | Có | Không |

Dòng "kết quả có chắc chắn nhận được không" đáng chú ý hơn cả dòng thời gian. Khác biệt giữa hai phương án không chỉ là nhanh hay chậm, mà là **có kết quả xác định** hay **có thể không có kết quả nào**.

### 13.2. Nguồn của con số baseline và giới hạn của nó

**Cảnh báo về cách đọc:** cột MVP ở Mục 13.1 là **số đo thực tế** của đề tài này. Cột baseline **không phải số đo** — đề tài không tự khảo sát được thời gian phản hồi của các trung tâm đào tạo. Đó là ước lượng tổng hợp từ nguồn thứ cấp, và phải được trình bày đúng như vậy trong báo cáo.

**Bối cảnh Việt Nam.** Báo Tuổi Trẻ (02/12/2023) ghi nhận quy trình xác minh văn bằng truyền thống "tốn nhiều thời gian", dữ liệu các trường "không đầy đủ" và mỗi trường "làm một kiểu". Ông Thái Phương Triều, giám đốc Công ty Talent, được dẫn lời: *"Nếu chỉ gửi văn bản hay email rồi ngồi đợi thì chưa chắc đơn vị tuyển dụng nhận được phản hồi, nếu có thì cũng rất lâu."* Ông Trần Ngọc Phú, giám đốc Công ty PVAcons, cho biết nhiều hồ sơ văn bằng "chưa được số hóa, mất nhiều thời gian, công sức để xác minh".

**So sánh quốc tế.** Ngành sàng lọc nhân sự Hoa Kỳ công bố thời gian xác minh học vấn trung bình khoảng **2–5 ngày làm việc**, nhanh nhất khoảng 72 giờ khi trường có tham gia hệ thống tra cứu tập trung (National Student Clearinghouse). Con số này là **cận dưới lạc quan** cho bối cảnh Việt Nam, vì nó giả định có hạ tầng tra cứu tập trung mà các trung tâm đào tạo ngắn hạn ở Việt Nam chưa có.

**Vì sao không có thời hạn pháp lý để trích dẫn.** Thông tư 21/2019/TT-BGDĐT và các văn bản liên quan có quy định thời hạn cho một số thủ tục hành chính (ví dụ 03 ngày làm việc cho việc chỉnh sửa nội dung văn bằng; tối đa 20 ngày làm việc cho công nhận văn bằng do nước ngoài cấp). Nhưng **không có thời hạn nào ràng buộc việc một doanh nghiệp gửi yêu cầu xác minh tới đơn vị cấp** — đây là trao đổi ngoài thủ tục hành chính. Chính khoảng trống đó giải thích vì sao thời gian phản hồi không xác định được, và vì sao khả năng "không nhận được phản hồi nào" là có thật.

**Phạm vi áp dụng còn hẹp hơn nữa với đề tài này.** Các hệ thống tra cứu văn bằng hiện có ở Việt Nam chủ yếu phủ văn bằng chính quy của trường đại học, cao đẳng, và thường chỉ từ một mốc năm nhất định trở đi. **Chứng chỉ khóa học ngắn hạn do trung tâm đào tạo cấp — chính là đối tượng của đề tài này — gần như nằm ngoài mọi hệ thống tra cứu tập trung.** Với nhóm này, baseline thực tế không phải "tra cứu chậm" mà là "không có kênh tra cứu nào".

Nguồn tham khảo:

- Trần Huỳnh, *"Vụ giảng viên dùng bằng tiến sĩ giả: Cần khắc phục lỗ hổng tra cứu văn bằng"*, Tuổi Trẻ Online, 02/12/2023. https://tuoitre.vn/vu-giang-vien-dung-bang-tien-si-gia-can-khac-phuc-lo-hong-tra-cuu-van-bang-20231202081544234.htm
- Thông tư 21/2019/TT-BGDĐT — Quy chế quản lý văn bằng, chứng chỉ của hệ thống giáo dục quốc dân. https://luatvietnam.vn/giao-duc/thong-tu-21-2019-tt-bgddt-quy-che-quan-ly-bang-tot-nghiep-178752-d1.html
- GoodHire, *"How Long Do Background Checks Take?"*. https://www.goodhire.com/blog/how-long-do-background-checks-take/
- First Advantage, *"How Long Does a Background Check Take?"*. https://fadv.com/article/how-long-does-a-background-check-take/

## 14. Cam kết an toàn dữ liệu

- Không có private key, seed phrase hay access token nào trong tệp này.
- Không có dữ liệu cá nhân thật; tên học viên trong demo là dữ liệu giả.
- Các địa chỉ ví ở Mục 3 là tài khoản mặc định của mạng local Hardhat, công khai theo thiết kế.
