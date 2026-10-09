# EVIDENCE — CredVerify MVP

Tệp này được sinh tự động bởi `scripts/collect-evidence.js`. Sinh lúc: 2026-10-08T15:25:56.657Z

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
| Node.js | `v22.22.0` |

## 2. Hợp đồng đã triển khai

| Hạng mục | Giá trị |
|---|---|
| Tên contract | `CredentialRegistry` |
| Contract address | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| Deployment tx hash | `0x622f7a9abc5f14bddbca7f33c48f3667d9a6a67f70791ee80b5e1d623f68b7e1` |
| Deployment block | `1` |
| Gas deploy | `3177154` |
| Độ trễ deploy | `32.02 ms` |
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
| 2 | addIssuer — CredVerify công nhận Trung tâm X và gắn tên hiển thị | `0xf85b661a1d5bb40d0a4c4e54a89b15a3cd6359f98283d8471dec1b6be57b329a` | 2 | 167219 | 15.98 | tên phải là duy nhất |
| 3 | issueCertificate — Trung tâm X cấp chứng chỉ cho học viên | `0x4b7e1b0be1a6723177efb7bed64456e4d8a4fdf89fe1ab18debe2bc89a709666` | 4 | 72755 | 10.74 | certId sinh tự động = keccak256(issuer ‖ certHash) |
| 4 | issueCertificate — một đơn vị KHÁC đăng ký đúng tệp đó, bản ghi độc lập | `0xa8774897d342da0eadf850ed48cd32c890e1296d93393c802e66bef5c217e055` | 5 | 72755 | 12.23 | certId khác vì khóa gồm cả địa chỉ issuer |
| 10 | revokeCertificate — Trung tâm X thu hồi chứng chỉ đã cấp | `0x663f3074be76118534345b81095e05206cb6dca4b244b042323b2c6590291dcd` | 12 | 61053 | 6.86 |  |
| 12 | issueCertificate — kẻ tấn công dùng khóa đã lộ của Trung tâm X cấp một bằng giả | `0x915ddfe7cf386d6c0dea63d6206bcf6145671af038af8b7666fcd8025faed863` | 16 | 72755 | 11.41 |  |
| 13 | revokeCertificate — kẻ tấn công thu hồi phá hoại một chứng chỉ THẬT | `0xc072e5040ce7efefeab7710ed72c14e865840736ebd201cea6f775773b34f58f` | 17 | 61053 | 8.98 |  |
| 14 | removeIssuer — chặn khóa lộ NGAY, không chờ | `0x1d4514e9b9a9290e140f4c8f1826099bd26ade9b84906af46f35b5c33a58466b` | 18 | 57849 | 9.04 | hành động bảo vệ không qua độ trễ |
| 15 | proposeInherit — đề xuất CÔNG KHAI chuyển danh tính sang khóa mới, kèm mốc lộ khóa | `0x35cd6dc3bf6405fc698430563d9c57d885eaf588939b0ab9aa9696eed71cc0ab` | 20 | 83647 | 16.52 | phải chờ INHERIT_DELAY (tham số deploy; bằng chứng này dùng 48 giờ như production) |
| 16 | executeInherit — sau INHERIT_DELAY: khóa mới nhận danh tính, ghi compromisedAt cho khóa lộ | `0x4617cb21cde2e110041da871db0ff22634daab2bfb4c15c744c56669d8ca4e9b` | 23 | 190795 | 13.70 | tên đi theo danh tính, không chép chuỗi |
| 17 | revokeCertificate — khóa kế nhiệm dọn bằng giả do khóa cũ đã cấp | `0x23a051d84f7c5b0bfe3a00f52858b50d13c2ca9191428b7ebf367981bcaa2955` | 25 | 63053 | 6.21 |  |

Cột độ trễ đo từ lúc gửi giao dịch tới khi nhận được receipt. Xem Mục 9 để biết phương pháp đo và giới hạn diễn giải của các con số này.

## 5. Event ghi nhận trên chuỗi

| Event | Tham số | Tx hash |
|---|---|---|
| `IssuerAdded` | issuerAddress=0x70997970C51812dc3A010C7d01b50e0d17dc79C8, name=Trung tam dao tao X | `0xf85b661a1d5bb40d0a4c4e54a89b15a3cd6359f98283d8471dec1b6be57b329a` |
| `CertificateIssued` | certId=0x0ba7ce87a6a098f2d3835b9c0ea70c3b67c26507ae64d973aecfac18da38244f, certHash=0x1719cc0ead2014d37a7c8ecd3890963023443e2ffde3ba38bbcb7cf3701a2c5e, issuer=0x70997970C51812dc3A010C7d01b50e0d17dc79C8, holder=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65, issuedAt=1791473133 | `0x4b7e1b0be1a6723177efb7bed64456e4d8a4fdf89fe1ab18debe2bc89a709666` |
| `CertificateRevoked` | certId=0x0ba7ce87a6a098f2d3835b9c0ea70c3b67c26507ae64d973aecfac18da38244f, by=0x70997970C51812dc3A010C7d01b50e0d17dc79C8, revokedAt=1791473143 | `0x663f3074be76118534345b81095e05206cb6dca4b244b042323b2c6590291dcd` |
| `InheritProposed` | oldIssuer=0x70997970C51812dc3A010C7d01b50e0d17dc79C8, newIssuer=0x90F79bf6EB2c4f870365E785982E1f101E93b906, compromisedSince=1791473147, eta=1791645951 | `0x35cd6dc3bf6405fc698430563d9c57d885eaf588939b0ab9aa9696eed71cc0ab` |
| `KeyCompromised` | key=0x70997970C51812dc3A010C7d01b50e0d17dc79C8, since=1791473147 | `0x4617cb21cde2e110041da871db0ff22634daab2bfb4c15c744c56669d8ca4e9b` |
| `IssuerAdded` | issuerAddress=0x90F79bf6EB2c4f870365E785982E1f101E93b906, name=Trung tam dao tao X | `0x4617cb21cde2e110041da871db0ff22634daab2bfb4c15c744c56669d8ca4e9b` |
| `IssuerInherited` | oldIssuer=0x70997970C51812dc3A010C7d01b50e0d17dc79C8, newIssuer=0x90F79bf6EB2c4f870365E785982E1f101E93b906, name=Trung tam dao tao X | `0x4617cb21cde2e110041da871db0ff22634daab2bfb4c15c744c56669d8ca4e9b` |

## 6. Thay đổi trạng thái (state change)

### 6.1. Vòng đời một chứng chỉ

certId `0x0ba7ce87a6a098f2d3835b9c0ea70c3b67c26507ae64d973aecfac18da38244f` — Trung tâm X, tệp `Demo/DemoCert.pdf`

| Thời điểm | valid | status | Ý nghĩa |
|---|---|---|---|
| Sau khi cấp | true | 1 | Issued (còn hiệu lực) |
| Sau khi thu hồi | false | 2 | Revoked (đã thu hồi) |

Trạng thái chuyển một chiều `Issued -> Revoked`: thu hồi bởi một khóa hợp lệ **không có đường quay lại** (ngoại lệ duy nhất: lần thu hồi do một khóa đã bị tuyên bố lộ thực hiện bị vô hiệu — Mục 6.3). Hash tệp vẫn khớp sau khi thu hồi nhưng `valid` trả về false — chứng minh trạng thái được kiểm tra độc lập với tính toàn vẹn của tệp. Mục 7 có một dòng chứng minh việc **cấp lại** tệp đã thu hồi bị contract từ chối: đó là bất biến chống "nói hai lời".

### 6.2. Không gian tên riêng trong sổ chung

Trung tâm Y đăng ký **đúng tệp** mà Trung tâm X đã cấp (Bước 4). Hai bản ghi hoàn toàn độc lập:

| Bản ghi | valid | Ví học viên |
|---|---|---|
| Của Trung tâm X | true | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` |
| Của Trung tâm Y | true | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` |

Nếu khóa chính là hash tệp trần thì lời gọi thứ hai sẽ **khóa cửa** Trung tâm X khỏi chính chứng chỉ của mình, và bản ghi trên chuỗi sẽ ghi tên kẻ tấn công là đơn vị cấp. Khóa `keccak256(issuer ‖ certHash)` cho mỗi đơn vị một không gian tên riêng bên trong một sổ chung, nên đòn này vô hại.

### 6.3. Dọn hậu quả sau khi khóa cấp bị lộ

Kẻ gian giữ khóa của Trung tâm X cấp một bằng giả (#12) và thu hồi phá hoại một chứng chỉ thật (#13). Owner gỡ quyền khóa lộ ngay (#14), đề xuất chuyển giao kèm mốc lộ `compromisedSince = 1791473147` (#15), chờ INHERIT_DELAY rồi thực thi (#16).

| Bản ghi | Thời điểm | valid | status | revocationVoided | issuedAfterCompromise |
|---|---|---|---|---|---|
| Chứng chỉ thật bị thu hồi phá hoại | sau #13 | false | 2 | false | false |
| Chứng chỉ thật bị thu hồi phá hoại | sau #16 | true | 1 | true | false |
| Bằng giả do khóa lộ cấp | sau #16 | true | 1 | false | true |
| Bằng giả do khóa lộ cấp | sau #17 (khóa mới thu hồi) | false | 2 | false | true |

Lần thu hồi phá hoại bị **vô hiệu tự động** trong hàm xác minh — không cần giao dịch nào cho từng chứng chỉ, và bản ghi gốc vẫn nằm nguyên trên chuỗi. Bằng giả được gắn cờ `issuedAfterCompromise` ngay khi chuyển giao xong, trước cả khi khóa mới kịp thu hồi nó. Xem `docs/AUDIT-V3.md`.

## 7. Hành vi sai bị chặn

| # | Hành vi | Kỳ vọng | Kết quả thực tế |
|---|---|---|---|
| 1 | issueCertificate gọi từ ví chưa được công nhận là đơn vị phát hành | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with custom error 'NotActiveIssuer()' |
| 2 | issueCertificate gọi từ chính OWNER — đơn vị vận hành không được cấp chứng chỉ | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with custom error 'NotActiveIssuer()' |
| 3 | revokeCertificate gọi từ OWNER — đơn vị vận hành không được thu hồi | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with custom error 'NotActiveIssuer()' |
| 4 | revokeCertificate gọi từ một đơn vị phát hành KHÁC (Trung tâm Y) | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with custom error 'NotIssuingKeyOrSuccessor()' |
| 5 | addIssuer với tên TRÙNG một đơn vị đã có — đường lạm quyền im lặng | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with custom error 'NameTaken()' |
| 6 | issueCertificate cùng một tệp hai lần bởi cùng một đơn vị | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with custom error 'CertificateExists()' |
| 7 | verifyCertificate với tệp đã bị chỉnh sửa (hash không khớp) | Kết quả phải là false | Hàm read-only trả về valid = false (không phát sinh giao dịch) |
| 8 | issueCertificate CẤP LẠI một tệp đã bị thu hồi — bất biến chống 'nói hai lời' | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with custom error 'CertificateExists()' |
| 9 | revokeCertificate lần hai trên cùng một chứng chỉ | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with custom error 'NotRevocable()' |
| 10 | khóa đã lộ cố cấp thêm chứng chỉ sau khi bị gỡ quyền | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with custom error 'NotActiveIssuer()' |
| 11 | executeInherit ngay sau khi đề xuất, chưa hết INHERIT_DELAY | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with custom error 'TimelockNotElapsed()' |
| 12 | khóa đã lộ cố thu hồi bậy một chứng chỉ hợp lệ sau khi bị chuyển giao | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with custom error 'NotActiveIssuer()' |
| 13 | transferOwnership cho một issuer đang hoạt động | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with custom error 'IssuerCannotBeOwner()' |
| 14 | addIssuer cho chính owner đang được đề cử | Giao dịch phải revert | Error: VM Exception while processing transaction: reverted with custom error 'PendingOwnerCannotBeIssuer()' |

## 8. Đối chiếu thao tác giao diện với giao dịch trên chuỗi

| Thao tác trên giao diện `app/` | Hàm contract | Thay đổi trạng thái |
|---|---|---|
| Quản trị → Công nhận | `addIssuer(address,string)` | `issuerStatus` None→Active, `nameHolder[keccak(tên)]`, event `IssuerAdded` |
| Quản trị → Gỡ quyền / Bật lại | `removeIssuer` / `restoreIssuer` | `issuerStatus` Active↔Disabled |
| Quản trị → Đề xuất / Thực thi / Hủy chuyển giao | `proposeInherit(old,new,compromisedSince)` → INHERIT_DELAY → `executeInherit(old)`; `cancelInherit(old)` | `inheritProposals[old]`; khi thực thi: khóa cũ→Disabled, khóa mới→Active, `inheritedBy`, `identityOf`, `latestKeyOf`, `compromisedAt` + `compromiseDeclaredAt` (nếu khóa lộ) |
| Quản trị → Chuyển/Hủy đề cử/Nhận quyền owner | `transferOwnership` / `cancelOwnershipTransfer` / `acceptOwnership` | `pendingOwner` rồi `owner` |
| Cấp chứng chỉ → nút Cấp | `issueCertificate(bytes32,address)` | `certificates[certId].status` None→Issued, event `CertificateIssued` |
| Tra cứu & thu hồi → nút Thu hồi | `revokeCertificate(bytes32)` | `status` Issued→Revoked, event `CertificateRevoked` |
| Xác minh → có chọn đơn vị cấp | `verifyCertificate(address,bytes32)` | Chỉ đọc, **một** lời gọi view |
| Xác minh → gõ tên in trên chứng chỉ (không cần event) | `issuerByName(string)` | Chỉ đọc trạng thái |
| Xác minh → yêu cầu ứng viên chứng minh chủ ví | — (chữ ký `personal_sign`, 0 gas) | Không ghi gì lên chuỗi |
| Xác minh → **bắt buộc** chọn đơn vị ghi trên chứng chỉ | — | Danh sách chọn gồm cả đơn vị đã ngừng, dựng từ event |
| Xác minh → có biên nhận lô | `verifyInBatch(issuer, root, certHash, holder, salt, proof)` | Chỉ đọc, Merkle proof kiểm **trên chuỗi** |
| (script) Cấp theo lô — `scripts/issue-batch.js` | `publishBatch(bytes32,uint32)` | `batches[batchId]`, event `BatchPublished` |
| (script/Etherscan) Thu hồi trong lô | `revokeLeaf` / `revokeBatch` | `leafRevocation` / `batches[batchId].revokedAt, revokedBy` |
| Chứng chỉ của tôi | event `CertificateIssued` lọc theo `holder`, rồi `verifyCertificate` (trạng thái hiệu lực) | Chỉ đọc |
| Đơn vị phát hành → danh bạ | event `IssuerAdded/Removed/Restored/Inherited`, đối chiếu `activeIssuerCount()` | Chỉ đọc |
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
| **Ghi chú xoay khóa** — phân biệt "đơn vị đã xoay sang khóa mới" với "đơn vị bị gỡ" | Contract trả `issuerState = Disabled` cho cả hai; giao diện đọc thêm `currentKeyOf` để nói đúng chuyện gì đã xảy ra |

**Giới hạn phải nói rõ:** mọi cảnh báo trên chỉ bảo vệ người đang dùng đúng trang này. Kẻ tấn công dựng trang riêng, hoặc gọi thẳng contract qua Etherscan. Đây là lớp phòng vệ chống **nhầm lẫn**, không phải lớp phòng vệ chống **tấn công**.

## 9. Độ trễ và chi phí

### 9.1. Phương pháp đo

| Hạng mục | Cách làm |
|---|---|
| Đồng hồ | `process.hrtime.bigint()` — độ phân giải nano giây, không bị lệch khi đồng hồ hệ thống đồng bộ lại |
| Thao tác ghi | Đo từ lúc gửi giao dịch tới khi `tx.wait()` trả về receipt |
| Thao tác đọc | 30 mẫu mỗi thao tác, có một lần gọi khởi động bị loại bỏ trước khi đo |
| Thống kê | Báo cả trung vị và p95 thay vì chỉ trung bình, vì trung bình bị kéo lệch bởi vài mẫu ngoại lai |
| Máy đo | Node.js v22.22.0 trên mạng local Hardhat |

### 9.2. Thao tác ghi — gas và độ trễ

| Thao tác | Gas | Độ trễ (ms) |
|---|---|---|
| Deploy contract | 3177154 | 32.02 |
| addIssuer | 167219 | 15.98 |
| issueCertificate | 72755 | 10.74 |
| issueCertificate | 72755 | 12.23 |
| revokeCertificate | 61053 | 6.86 |
| issueCertificate | 72755 | 11.41 |
| revokeCertificate | 61053 | 8.98 |
| removeIssuer | 57849 | 9.04 |
| proposeInherit | 83647 | 16.52 |
| executeInherit | 190795 | 13.70 |
| revokeCertificate | 63053 | 6.21 |

### 9.3. Thao tác đọc — độ trễ

Các thao tác dưới đây không phát sinh giao dịch nên **chi phí gas bằng 0**.

| Thao tác | Mẫu | Nhỏ nhất | Trung vị | Trung bình | p95 | Lớn nhất |
|---|---|---|---|---|---|---|
| verifyCertificate — nhà tuyển dụng xác minh khi ĐÃ BIẾT đơn vị cấp (đường O(1)) | 30 | 2.16 | 4.01 | 3.91 | 5.61 | 6.33 |
| effectiveStatus — giao diện làm mới trạng thái HIỆU LỰC một chứng chỉ | 30 | 1.74 | 2.41 | 2.64 | 3.64 | 6.90 |
| buildDirectory — giao diện dựng danh bạ đơn vị phát hành từ event | 30 | 4.74 | 6.87 | 7.02 | 10.75 | 11.50 |
| keccak256 — băm tệp PDF trên máy người dùng (776 KB) | 30 | 55.47 | 58.04 | 69.19 | 115.03 | 115.88 |

### 9.4. Giới hạn diễn giải của các số đo này

1. **Mạng local Hardhat đào block tức thì.** Không có thời gian chờ đồng thuận, không có hàng đợi giao dịch, không có cạnh tranh phí. Độ trễ ghi đo được ở đây gần như chỉ là thời gian vòng tròn của lời gọi RPC nội bộ, **không đại diện cho mạng thật**. Trên Ethereum mainnet, một block mất khoảng 12 giây, nên độ trễ ghi thực tế sẽ lớn hơn nhiều bậc.
2. **Độ trễ đọc thì có ý nghĩa hơn.** Thao tác `view` không cần đồng thuận nên số đo ở đây phản ánh đúng bản chất: xác minh là thao tác rẻ và nhanh. Trên mạng thật, phần tăng thêm chủ yếu là độ trễ mạng tới node RPC, không phải chi phí tính toán.
3. **Gas thì không phụ thuộc mạng.** Lượng gas ở Mục 9.2 đúng trên mọi mạng EVM; chỉ có *giá* mỗi đơn vị gas là thay đổi theo mạng và theo thời điểm.
4. **Số đo phụ thuộc máy chạy.** Chạy lại trên máy khác sẽ ra con số khác. Đây là lý do bảng trên báo trung vị và p95 thay vì một giá trị đơn lẻ.

## 10. Kết quả kiểm thử tự động

Lệnh: `npx hardhat test`. Mỗi test deploy một contract mới qua `beforeEach` nên các test độc lập hoàn toàn.

**Kết quả: 191 passing, 0 failing** (20259.65 ms).

```
CredentialRegistry (bộ test V2, cập nhật cho V3)
    1. Công nhận đơn vị phát hành
      ✔ owner công nhận được một trung tâm, kèm tên hiển thị (296ms)
      ✔ BỊ CHẶN: người ngoài không công nhận được ai (90ms)
      ✔ BỊ CHẶN: owner không tự cấp quyền phát hành cho chính địa chỉ owner (135ms)
      ✔ BỊ CHẶN: tên rỗng (86ms)
      ✔ BỊ CHẶN: một địa chỉ đã dùng thì không công nhận lại được dưới tên khác (79ms)
      ✔ BẤT BIẾN: bật lại một khóa đã gỡ thì GIỮ NGUYÊN tên cũ (100ms)
      ✔ BỊ CHẶN: không bật lại được một khóa đã chuyển giao cho người kế nhiệm (119ms)
    1a. Người không có quyền gọi hàm quản trị
      ✔ BỊ CHẶN: người ngoài không gỡ quyền được ai (87ms)
      ✔ BỊ CHẶN: người ngoài không bật lại được ai (119ms)
      ✔ BỊ CHẶN: người ngoài không chuyển quyền owner được (91ms)
      ✔ BỊ CHẶN: công nhận địa chỉ 0 làm đơn vị phát hành (64ms)
      ✔ BỊ CHẶN: gỡ quyền một địa chỉ vốn không đang hoạt động (51ms)
      ✔ BỊ CHẶN: bật lại một đơn vị vốn đang hoạt động (62ms)
      ✔ BỊ CHẶN: chuyển giao danh tính sang địa chỉ 0 (48ms)
      ✔ BỊ CHẶN: chuyển giao danh tính sang chính ví owner (89ms)
    1b. Tên là duy nhất — chặn đường lạm quyền IM LẶNG
      ✔ BỊ CHẶN: hai ví khác nhau KHÔNG mang được cùng một tên (64ms)
      ✔ BẤT BIẾN: gỡ quyền một trung tâm KHÔNG trả tên đó lại cho người khác (92ms)
      ✔ chuyển giao thì TÊN ĐI THEO khóa mới, và vẫn chỉ một chủ (97ms)
      ✔ issuerByName() trả về địa chỉ 0 cho tên chưa ai đăng ký (74ms)
      ✔ BẤT BIẾN: danh sách khả kiến không còn hai dòng trùng tên (89ms)
      ✔ GIỚI HẠN ĐÃ BIẾT: tên khác chữ hoa/thường vẫn đăng ký được — so khớp theo byte (Kirin bị chặn) (123ms)
    2. Cấp chứng chỉ
      ✔ HAPPY PATH: trung tâm cấp, bản ghi đúng, event đúng (62ms)
      ✔ certIdOf() trên chuỗi khớp với giá trị client tự tính (59ms)
      ✔ BỊ CHẶN: ví không có quyền cấp (61ms)
      ✔ BỊ CHẶN: khóa đã bị gỡ quyền không cấp được nữa (69ms)
      ✔ BỊ CHẶN: owner KHÔNG cấp được chứng chỉ — không có đường nào dẫn tới (52ms)
      ✔ BỊ CHẶN: hash rỗng (55ms)
      ✔ BỊ CHẶN: học viên là địa chỉ 0 (63ms)
      ✔ BỊ CHẶN: cùng một issuer cấp trùng một tệp hai lần (63ms)
    3. Không gian tên riêng trong sổ chung
      ✔ BẤT BIẾN: issuer bất lương KHÔNG khóa cửa được trung tâm thật bằng cách đăng ký trước (80ms)
      ✔ BẤT BIẾN: issuer khác KHÔNG thu hồi được chứng chỉ của trung tâm thật (68ms)
      ✔ verifier chọn ĐÚNG đơn vị ghi trên chứng chỉ thì thấy đúng bản ghi của đơn vị đó (81ms)
      ✔ CHỦ ĐÍCH: findByHash đã bị gỡ — không còn hàm view nào duyệt toàn bộ danh bạ (69ms)
    4. Thu hồi
      ✔ HAPPY PATH: đúng khóa đã cấp thì thu hồi được, có dấu thời gian (82ms)
      ✔ BẤT BIẾN: thu hồi là VĨNH VIỄN — không cấp lại được cùng tệp đó (108ms)
      ✔ BỊ CHẶN: thu hồi hai lần (99ms)
      ✔ BỊ CHẶN: thu hồi một chứng chỉ chưa từng tồn tại (66ms)
      ✔ BỊ CHẶN: owner KHÔNG thu hồi được — quyền này không thuộc về đơn vị vận hành (66ms)
      ✔ BỊ CHẶN: người lạ không thu hồi được (62ms)
      ✔ BỊ CHẶN: khóa ĐÃ BỊ GỠ QUYỀN mất luôn quyền thu hồi (81ms)
    5. Xoay khóa khi bị lộ
      ✔ khóa kế nhiệm thu hồi được chứng chỉ do khóa cũ đã cấp (83ms)
      ✔ chuyển giao chép TÊN sang khóa mới — trung tâm không mất danh tính (94ms)
      ✔ BỊ CHẶN: khóa kế nhiệm ĐÃ BỊ GỠ cũng mất quyền thu hồi (91ms)
      ✔ BỊ CHẶN: chỉ owner chuyển giao được danh tính issuer (77ms)
      ✔ BỊ CHẶN: không chuyển giao sang một địa chỉ đã dùng làm issuer (59ms)
      ✔ chuỗi kế nhiệm hai bậc: X -> K2 -> K3, K3 vẫn dọn được hậu quả của X (129ms)
      ✔ CHỦ ĐÍCH: kế nhiệm chỉ chảy XUÔI — khóa cũ không thu hồi hộ khóa mới (77ms)
      ✔ KỊCH BẢN ĐẦU-CUỐI: lộ khóa -> chuyển giao -> khóa cũ tê liệt -> khóa mới dọn hậu quả (100ms)
    6. Xác minh
      ✔ tệp đúng, chưa thu hồi -> hợp lệ, kèm tên đơn vị cấp (52ms)
      ✔ tệp bị sửa một byte -> hash lệch -> KHÔNG hợp lệ (63ms)
      ✔ đã thu hồi -> không hợp lệ, nhưng vẫn trả về MỐC THỜI GIAN thu hồi (64ms)
      ✔ CHỦ ĐÍCH: xác minh KHÔNG bị chặn khi đơn vị cấp đã bị gỡ quyền (77ms)
      ✔ BẤT BIẾN: người lạ không cần ví, không cần quyền gì để xác minh (68ms)
    7. Khả kiến — issuer thêm lén không còn vô hình
      ✔ danh bạ dựng từ event trả về địa chỉ KÈM tên (57ms)
      ✔ owner thêm một issuer lén thì nó HIỆN NGAY trong danh bạ (event IssuerAdded vĩnh viễn) (64ms)
      ✔ danh bạ từ event giữ cả khóa đã gỡ và chuỗi kế nhiệm, phục vụ kiểm toán (110ms)
      ✔ BẤT BIẾN: số đơn vị Active dựng từ event KHỚP activeIssuerCount trên chuỗi, qua mọi thao tác quản trị (225ms)
      ✔ governance() trả về toàn bộ trạng thái quản trị trong một lời gọi (61ms)
    8. Chuyển quyền owner
      ✔ hai bước: đề nghị rồi bên nhận phải chấp nhận (72ms)
      ✔ BỊ CHẶN: người không được chỉ định không nhận được quyền (47ms)
      ✔ BỊ CHẶN: chuyển quyền cho địa chỉ 0 (49ms)
    9. Ranh giới quyền của đơn vị vận hành (đề bài mục 3 & 5.2)
      ✔ BẤT BIẾN: owner gỡ quyền một trung tâm nhưng KHÔNG làm mất hiệu lực chứng chỉ đã cấp (51ms)
      ✔ BẤT BIẾN: owner không có MỘT hàm nào ghi vào `certificates` (49ms)
      ✔ RỦI RO CÒN LẠI: owner cướp được danh tính một trung tâm đang hoạt động (67ms)
    10. Dọn dẹp sau sự cố — THỨ TỰ THAO TÁC QUYẾT ĐỊNH KẾT QUẢ
      ✔ QUY TRÌNH ĐÚNG: chuyển giao (propose→execute) khi khóa xấu CÒN Active -> khóa dọn dẹp thu hồi được (87ms)
      ✔ V3 — HẾT BẪY VẬN HÀNH: removeIssuer TRƯỚC rồi chuyển giao (propose→execute) vẫn chạy, khóa mới dọn được (94ms)
      ✔ V3 — KHÔNG CẦN restoreIssuer: khóa lộ KHÔNG BAO GIỜ Active trở lại trong quá trình dọn (85ms)
      ✔ R4 ĐÃ ĐÓNG: sau 9 lần chuyển giao, khóa mới nhất vẫn thu hồi được chứng chỉ đời đầu (234ms)
      ✔ GIỚI HẠN (đường cấp lẻ): thu hồi TỪNG chứng chỉ một — cấp theo lô thì có revokeBatch (85ms)

  CredentialRegistry V3 — tách quyền, xoay khóa, danh tính, lô, multisig (A–E)
    A. Bất biến owner ≠ issuer qua mọi lần chuyển quyền
      ✔ BỊ CHẶN: transferOwnership cho một issuer đang hoạt động (47ms)
      ✔ BỊ CHẶN: transferOwnership cho một khóa issuer đã bị gỡ (Disabled) (55ms)
      ✔ BỊ CHẶN: addIssuer cho chính owner được đề cử (pendingOwner) (60ms)
      ✔ BỊ CHẶN: chuyển giao (propose→execute) sang owner được đề cử (54ms)
      ✔ BỊ CHẶN: đề cử X, đổi đề cử sang Y, công nhận X làm issuer, rồi X cố nhận quyền (77ms)
      ✔ BẤT BIẾN: sau khi chuyển quyền hợp lệ, owner mới không cấp được và owner cũ thành người ngoài (94ms)
      ✔ CHỦ ĐÍCH: owner cũ (đã chuyển quyền) CÓ THỂ được công nhận làm issuer (58ms)
    B. Xoay khóa từ trạng thái Disabled
      ✔ chuyển giao (propose→execute) từ khóa Disabled: khóa mới Active, tên đi theo, đếm Active tăng 1 (96ms)
      ✔ chuyển giao (propose→execute) từ khóa Active: đếm Active KHÔNG đổi, phát IssuerRemoved cho khóa cũ (75ms)
      ✔ BỊ CHẶN: kế nhiệm một khóa đã từng được kế nhiệm (kể cả khi nó Disabled) (72ms)
      ✔ BỊ CHẶN: kế nhiệm một địa chỉ chưa từng là issuer (49ms)
      ✔ BẤT BIẾN: quá RECOVERY_WINDOW sau khi gỡ, danh tính ĐÓNG BĂNG — owner không bật lại, không chuyển giao được (122ms)
      ✔ trong RECOVERY_WINDOW (sát hạn) vẫn bật lại / chuyển giao được (71ms)
      ✔ CHỦ ĐÍCH: khóa ĐANG hoạt động thì chuyển giao không bị giới hạn thời gian (nhưng luôn qua độ trễ INHERIT_DELAY) (56ms)
      ✔ BỊ CHẶN: restoreIssuer một khóa đã được kế nhiệm từ trạng thái Disabled (62ms)
    C. Danh tính issuer — O(1), không trần
      ✔ identityOf / currentKeyOf đi theo chuỗi kế nhiệm (97ms)
      ✔ tên lưu theo danh tính — mọi khóa trong chuỗi đọc ra cùng một tên, không chép chuỗi (79ms)
      ✔ issuerName trả về chuỗi rỗng cho địa chỉ chưa từng là issuer (39ms)
      ✔ BỊ CHẶN: tên dài hơn MAX_NAME_BYTES (256 byte UTF-8); đúng 256 byte thì được (68ms)
      ✔ currentKeyOf trả về address(0) cho địa chỉ chưa từng là issuer (54ms)
      ✔ BẤT BIẾN: hai danh tính khác nhau không thu hồi hộ nhau, kể cả sau khi xoay khóa (87ms)
      ✔ BẤT BIẾN: tối đa MỘT khóa Active cho mỗi danh tính, qua 12 lần xoay (256ms)
    D1. Cấp theo lô — đăng và xác minh
      ✔ leafOf() trên chuỗi khớp StandardMerkleTree của OpenZeppelin (off-chain) (64ms)
      ✔ HAPPY PATH: đăng lô 8 chứng chỉ, mọi chứng chỉ xác minh hợp lệ trên chuỗi (94ms)
      ✔ lô MỘT chứng chỉ: proof rỗng, vẫn xác minh được (56ms)
      ✔ tệp bị sửa (certHash khác) -> KHÔNG hợp lệ (55ms)
      ✔ sai salt hoặc sai holder -> KHÔNG hợp lệ (68ms)
      ✔ proof của lá khác -> KHÔNG hợp lệ (62ms)
      ✔ lô chưa đăng -> batchExists=false, valid=false (66ms)
      ✔ BẤT BIẾN: lô của X tra dưới tên Y -> không tồn tại (không gian tên riêng) (65ms)
      ✔ BẤT BIẾN: issuer khác đăng TRƯỚC cùng root cũng không chặn được trung tâm thật (60ms)
      ✔ BẤT BIẾN: không thể dùng root làm 'lá' với proof rỗng (verifyInBatch tự tính lá) (46ms)
      ✔ BẤT BIẾN: nút trong của cây không dùng làm lá được (băm hai lần) — chặn cả ở revokeLeaf (72ms)
    D2. Cấp theo lô — các trường hợp bị chặn
      ✔ BỊ CHẶN: người không phải issuer đăng lô (51ms)
      ✔ BỊ CHẶN: owner đăng lô (60ms)
      ✔ BỊ CHẶN: khóa đã bị gỡ đăng lô (56ms)
      ✔ BỊ CHẶN: root rỗng / lô rỗng / đăng trùng (64ms)
    D3. Thu hồi trong lô
      ✔ HAPPY PATH: thu hồi một lá — lá đó mất hiệu lực, các lá khác vẫn hợp lệ (70ms)
      ✔ HAPPY PATH: thu hồi cả lô — mọi lá mất hiệu lực (85ms)
      ✔ revokedAt lấy mốc SỚM NHẤT khi lá bị thu hồi trước rồi cả lô bị thu hồi sau (81ms)
      ✔ BỊ CHẶN: thu hồi lá không thuộc lô (proof sai) (51ms)
      ✔ BỊ CHẶN: root không khớp batchId (67ms)
      ✔ BỊ CHẶN: lô không tồn tại (66ms)
      ✔ BỊ CHẶN: thu hồi lá hai lần / thu hồi lô hai lần / thu hồi lá sau khi cả lô đã thu hồi (93ms)
      ✔ BỊ CHẶN: owner KHÔNG thu hồi được lá hay lô (70ms)
      ✔ BỊ CHẶN: issuer khác KHÔNG thu hồi được lô của trung tâm thật (72ms)
      ✔ BỊ CHẶN: khóa đã bị gỡ mất quyền thu hồi lô của chính mình (75ms)
      ✔ KỊCH BẢN: khóa lộ đăng 3 lô giả -> gỡ -> chuyển giao -> khóa mới thu hồi 3 lô bằng 3 giao dịch (229ms)
      ✔ CHỦ ĐÍCH: lô của khóa bị gỡ (không lộ) VẪN hợp lệ — gỡ quyền không viết lại quá khứ (65ms)
    E. Issuer là một contract multisig (khuyến nghị chống gian lận nội bộ)
      ✔ ví 2-trên-3 đăng lô và thu hồi lô; một chữ ký thì không đủ (114ms)

  CredentialRegistry V3 — khóa lộ, độ trễ chuyển giao, tên dạng chuẩn (S1–S7)
    PoC của bản kiểm toán — sau khi sửa
      ✔ F-01 ĐÃ SỬA: khóa lộ thu hồi chứng chỉ thật; sau khi tuyên bố lộ, các lần thu hồi đó bị VÔ HIỆU (92ms)
      ✔ F-02 KHÔNG CÒN ÁP DỤNG: findByHash đã gỡ; bản ghi trùng hash của issuer khác nằm trong không gian tên riêng (65ms)
      ✔ F-03 ĐÃ SỬA: bằng giả do khóa lộ cấp sau mốc lộ bị gắn cờ issuedAfterCompromise (66ms)
    S1. Vô hiệu thu hồi do khóa lộ
      ✔ CHỦ ĐÍCH: thu hồi TRƯỚC mốc lộ (khóa còn trong tay chủ) giữ nguyên hiệu lực (98ms)
      ✔ thu hồi của KHÓA KẾ NHIỆM (hợp lệ) không bị vô hiệu (73ms)
      ✔ khóa hợp lệ thu hồi LẠI được một chứng chỉ có lần thu hồi đã bị vô hiệu (86ms)
      ✔ lá: thu hồi lá do khóa lộ bị vô hiệu; khóa mới thu hồi lại được lá đó (97ms)
      ✔ lô: thu hồi cả lô do khóa lộ bị vô hiệu; sau đó khóa mới thu hồi lá, rồi thu hồi lại cả lô (152ms)
      ✔ revokedAt: lô thu hồi trước, lá thu hồi sau (khi lần thu hồi lô đã bị vô hiệu rồi lô bị thu hồi lại) (95ms)
    S2. Cờ issuedAfterCompromise
      ✔ lô cấp trước mốc lộ: cờ false; lô cấp sau mốc lộ: cờ true (89ms)
      ✔ xoay khóa ĐỊNH KỲ (compromisedSince = 0): không gắn cờ, không vô hiệu gì, không phát KeyCompromised (68ms)
      ✔ chứng chỉ không tồn tại / lô không tồn tại: cờ luôn false (107ms)
      ✔ executeInherit phát KeyCompromised và ghi compromisedAt (52ms)
      ✔ BỊ CHẶN: mốc lộ ở tương lai, hoặc lùi quá MAX_COMPROMISE_LOOKBACK (30 ngày) (61ms)
    S3. Độ trễ chuyển giao danh tính (R1 / SC-03)
      ✔ BỊ CHẶN: thực thi trước INHERIT_DELAY; đúng hạn thì chạy (84ms)
      ✔ BỊ CHẶN: đề xuất quá PROPOSAL_TTL sau eta thì hết hiệu lực (53ms)
      ✔ trong lúc chờ, khóa cũ VẪN hoạt động cho tới khi owner gỡ — gỡ quyền thì tức thì (81ms)
      ✔ hủy đề xuất: phát InheritCancelled, không thực thi được nữa, đề xuất lại được (84ms)
      ✔ BỊ CHẶN: người ngoài / issuer không đề xuất, thực thi hay hủy được (62ms)
      ✔ kiểm lại lúc thực thi: khóa mới đã bị dùng làm issuer trong lúc chờ -> BỊ CHẶN (58ms)
      ✔ kiểm lại lúc thực thi: khóa mới đã thành owner được đề cử trong lúc chờ -> BỊ CHẶN (54ms)
      ✔ đề xuất tạo trong RECOVERY_WINDOW vẫn thực thi được dù lúc thực thi cửa sổ đã đóng (giới hạn bởi PROPOSAL_TTL) (62ms)
    S7. Vệ sinh mã
      ✔ cancelOwnershipTransfer: xóa đề cử, địa chỉ đó lại được làm issuer (80ms)
      ✔ BỊ CHẶN: tên không ở dạng chuẩn — khoảng trắng đầu (44ms)
      ✔ BỊ CHẶN: tên không ở dạng chuẩn — khoảng trắng cuối (51ms)
      ✔ BỊ CHẶN: tên không ở dạng chuẩn — hai khoảng trắng liền nhau (47ms)
      ✔ BỊ CHẶN: tên không ở dạng chuẩn — ký tự xuống dòng (47ms)
      ✔ BỊ CHẶN: tên không ở dạng chuẩn — tab (52ms)
      ✔ BỊ CHẶN: tên không ở dạng chuẩn — DEL (0x7f) (52ms)
      ✔ tên tiếng Việt có dấu (UTF-8 nhiều byte) và một ký tự đơn được chấp nhận; tra ngược theo tên chạy (55ms)
      ✔ predecessorOf: từ khóa mới nhất (issuerByName) đi ngược được về khóa gốc chỉ bằng trạng thái (62ms)
      ✔ pragma được ghim (0.8.24), không còn ^

  CredentialRegistry V3 — danh sách cho phép tên, mốc công bố lộ, effectiveStatus (W–G)
    W. Danh sách cho phép tên tiếng Việt (V32-02)
      ✔ nhận đủ 134 chữ có dấu tiếng Việt (dựng sẵn), chữ số, dấu cách, ( ) , - (51ms)
      ✔ BỊ CHẶN: NBSP, ký tự vô hình, NFD, Kirin, Hy Lạp, dấu chấm, ký tự đặc biệt, gạch dài, tab (153ms)
      ✔ BỊ CHẶN: chuỗi UTF-8 cụt hoặc byte tiếp nối ngoài dải (gửi byte thô) (112ms)
      ✔ KHỚP: nameProblem() của script/giao diện và contract cho cùng kết luận trên 300 tên ngẫu nhiên (4497ms)
      ✔ chuẩn hóa: tên dán từ PDF (NFD, NBSP, gạch dài, zero-width) ra đúng tên đã công nhận (51ms)
    D. Độ trễ chuyển giao — bản thử nghiệm
      ✔ INHERIT_DELAY = 60 giây, khớp helper của bộ test (45ms)
    C. Thời điểm công bố lộ khóa
      ✔ ghi lúc executeInherit; trả trong verifyCertificate và verifyInBatch cùng mốc lộ (102ms)
      ✔ xoay khóa định kỳ (không khai lộ): cả hai mốc bằng 0 (65ms)
    E. effectiveStatus (V32-04)
      ✔ None / Issued / Revoked hợp lệ giữ nguyên; thu hồi do khóa lộ -> Issued; getCertificate vẫn THÔ (99ms)
    G. PoC lượt 2
      ✔ G-03 (RỦI RO GHIM, chấp nhận): owner vẫn 'hồi sinh' được thu hồi hợp pháp và gắn cờ bằng thật trong 30 ngày — nhưng mốc công bố lộ ra độ lùi (74ms)
      ✔ G-04 (ĐÃ SỬA): NBSP, ZWSP, NFD không còn tạo được tên trông y hệt (46ms)
      ✔ G-05 (GIỚI HẠN GHIM): bằng giả cấp trước mốc lookback 30 ngày không bị gắn cờ (65ms)
      ✔ G-06 (ĐÃ SỬA một phần): getCertificate vẫn THÔ, nhưng effectiveStatus và verifyCertificate cho kết luận đúng (78ms)

  CredentialRegistry V3 — thu hồi trong lô chỉ nhận lá thật (V34-01)
    V34-01. revokeLeaf chỉ thu hồi được LÁ THẬT
      ✔ leafInnerOf khớp cách tính ngoài chuỗi; leafOf = keccak(leafInnerOf) = lá của OpenZeppelin (67ms)
      ✔ nút trong ở MỌI tầng (kể cả root với proof rỗng) đều bị từ chối LeafNotInBatch (73ms)
      ✔ gửi chính LÁ thay cho inner cũng bị từ chối — không ghi nhầm (57ms)
      ✔ inner thật: thu hồi đúng chứng chỉ, sự kiện mang lá thật, các lá khác không đổi (99ms)
      ✔ lô một chứng chỉ: root = lá; inner với proof rỗng thu hồi được, gửi root thì không (53ms)
      ✔ inner KHÔNG lộ certHash/holder: không có muối thì không dò ngược được từ dữ liệu công khai (48ms)

  CredentialRegistry V3 — INHERIT_DELAY là tham số deploy (V341-01)
    ✔ constructor nhận đúng khoảng [1 phút, 7 ngày] và lưu giá trị bất biến (208ms)
    ✔ deploy 48 giờ: thực thi sớm bị chặn, đủ 48 giờ thì thực thi được (60ms)
    ✔ độ trễ tối đa (7 ngày) vẫn thực thi được với đề xuất tạo trong RECOVERY_WINDOW sau khi gỡ (63ms)
    scripts/lib/delay.js — quy tắc chọn độ trễ khi deploy
      ✔ mặc định 48 giờ trên mọi mạng
      ✔ mạng thử nghiệm cho phép độ trễ demo (60 giây, 1 giờ)
      ✔ mạng thật (mainnet, Base…) từ chối dưới 24 giờ — đúng lỗi V341-01 cảnh báo
      ✔ giá trị sai định dạng hoặc ngoài khoảng của contract bị từ chối trước khi gửi giao dịch
      ✔ humanDelay đọc được

  CSP và SRI của giao diện
    ✔ không có vấn đề: connect-src khớp RPC_URLS, không script nội tuyến, integrity (nếu có) khớp
    ✔ script-src không 'unsafe-inline'; không connect-src *; không Google Fonts
    ✔ --release gắn SRI đúng; sửa app.js sau đó thì --check bắt được integrity cũ
    ✔ phát hiện khối script nội tuyến bị thêm vào

  Giao diện và script dùng cùng quy tắc
    ✔ chuẩn hóa tên và danh sách cho phép: app.js giống hệt scripts/lib/name.js
    ✔ cây Merkle dựng trong trình duyệt cho đúng root, lá và proof như OpenZeppelin StandardMerkleTree (846ms)
    ✔ lá của trình duyệt khớp leafOf của contract; proof qua được verifyInBatch (88ms)
    ✔ certId tính ở trình duyệt khớp certIdOf của contract
    ✔ thống kê theo đơn vị dựng từ event: gom theo danh tính, đếm thu hồi bị vô hiệu như contract (133ms)

  XSS qua chuỗi lỗi từ RPC / revert
    ✔ revert Error(string) mang payload: tới được client, nhưng reasonOf() thật chỉ hiện tên lỗi
    ✔ RPC độc hại trả lỗi JSON-RPC chứa payload: reasonOf() trả nguyên chuỗi — lớp chặn là chỗ hiển thị
    ✔ mọi nơi dùng reasonOf() trong app.js đều đi qua bannerText / esc / alert (không chèn thẳng vào innerHTML)
    ✔ esc() vô hiệu hóa payload

  191 passing (19s)
```

> Khối kết quả trên được sinh bằng cách **chạy lại `npx hardhat test` ngay trong script này**

### 10.1. Nhóm kiểm thử

| Nhóm | Mục đích |
|---|---|
| 1. Công nhận đơn vị phát hành | Chỉ owner công nhận được; một địa chỉ ứng với đúng một danh tính |
| 1b. Tên là duy nhất | Chặn đường lạm quyền **im lặng**: hai ví cùng một tên |
| 2. Cấp chứng chỉ | Happy path và mọi cách gọi sai đều bị chặn, kể cả từ owner |
| 3. Không gian tên riêng | Đòn đăng ký trước bị vô hiệu; mỗi đơn vị một bản ghi độc lập, tra theo đơn vị |
| 4. Thu hồi | Thu hồi bởi khóa hợp lệ là vĩnh viễn; owner không thu hồi được |
| 5. Xoay khóa khi bị lộ | Chuyển giao chép tên, khóa cũ tê liệt hoàn toàn |
| 6. Xác minh | Không bao giờ bị chặn, kể cả khi đơn vị cấp đã bị vô hiệu hóa |
| 7. Khả kiến | Đơn vị thêm lén hiện ngay trong danh sách |
| 8. Chuyển quyền owner | Hai bước, gõ nhầm không mất quyền vĩnh viễn |
| 9. Ranh giới quyền owner | Liệt kê tường minh 14 hàm ghi; không hàm nào của owner chạm vào `certificates` |
| 10. Dọn dẹp sau sự cố | Ghim **thứ tự thao tác đúng** và bẫy vận hành đi kèm |
| A–E | Owner ≠ issuer qua chuyển quyền; xoay khóa từ Disabled; danh tính O(1); cấp/thu hồi theo lô; issuer multisig |
| PoC, S1–S7 | Ba PoC của bản kiểm toán (đảo kỳ vọng); vô hiệu thu hồi do khóa lộ; cờ `issuedAfterCompromise`; độ trễ chuyển giao; tên dạng chuẩn; hủy đề cử owner |
| W, D, C, E, G | Danh sách cho phép tên tiếng Việt (khớp `scripts/lib/name.js` trên 300 tên ngẫu nhiên); `INHERIT_DELAY` của bộ test; mốc công bố lộ; `effectiveStatus`; PoC lượt 2 (G-03, G-05 ghim rủi ro; G-04, G-06 đã sửa) |
| V34-01 | `revokeLeaf` nhận `inner`, tự băm thành lá: nút trong ở mọi tầng (kể cả root) và cách gọi cũ (gửi lá) đều bị từ chối; `leafInnerOf` ≡ ngoài chuỗi; thống kê kiểm toán theo đơn vị của giao diện ≡ contract |
| V341-01 | `INHERIT_DELAY` là tham số constructor trong [1 phút, 7 ngày], bất biến; `scripts/lib/delay.js` mặc định 48 giờ, từ chối < 24 giờ trên mạng không phải local/testnet; deploy 48 giờ: thực thi sớm bị chặn, đủ hạn thì chạy |
| XSS qua chuỗi lỗi từ RPC / revert (frontend) | Chuỗi lỗi do kẻ tấn công (RPC độc hại hoặc revert) kiểm soát tới được client, nhưng `reasonOf()`/`esc()` THẬT của giao diện không để nó tới chỗ hiển thị; mọi chỗ dùng `reasonOf()` trong `app.js` đều qua `bannerText`/`esc`/`alert` |
| CSP/SRI và quy tắc chung (frontend) | CSP khớp `RPC_URLS`, không script nội tuyến, SRI phát hành bắt được `app.js` bị sửa; chuẩn hóa tên và `certId` của giao diện ≡ script/contract |

Trọng tâm của bộ kiểm thử là **hành vi sai bị chặn** và **kịch bản phục hồi sự cố**, không chỉ chứng minh luồng thuận chạy được.

### 10.2. Ba test khẳng định rủi ro thay vì vá

Ba test dưới đây **pass** để ghim một rủi ro còn lại, không phải để tuyên bố đã xử lý. Nếu một phiên bản sau vô tình vá chúng, test sẽ vỡ và buộc người sửa phải đọc lại lý do.

| Test | Khẳng định điều gì |
|---|---|
| *GIỚI HẠN ĐÃ BIẾT: tên khác chữ hoa/thường vẫn đăng ký được* | `nameHolder` so khớp theo byte. Danh sách cho phép chặn chữ Kirin/Hy Lạp, ký tự vô hình, NFD, dấu chấm và ký tự đặc biệt; còn lại khác chữ hoa/thường hoặc l/I, 0/O — giao diện cảnh báo |
| *RỦI RO CHẤP NHẬN (V32-01): owner qua mốc lộ khóa ảnh hưởng hiệu lực chứng chỉ trong 30 ngày* | Hồi sinh được một lần thu hồi hợp pháp và gắn cờ bằng thật cấp sau mốc lộ — công khai, sau INHERIT_DELAY. Contract ghi và trả thời điểm công bố để người xác minh thấy mốc bị lùi bao xa (test G-03) |
| *RỦI RO CÒN LẠI: owner cướp được danh tính một trung tâm đang hoạt động* | Chuyển giao là quyền nguy hiểm nhất của owner; contract buộc nó qua đề xuất công khai + INHERIT_DELAY chờ (48 giờ ở production), nhưng owner một mình vẫn làm được — ví đa chữ ký là future work |
| *CHỦ ĐÍCH: lô của khóa bị gỡ (không lộ) VẪN hợp lệ* | Gỡ quyền không viết lại quá khứ — áp dụng cho cả đường cấp theo lô |

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
| `_requireCanRevoke` — cùng `identityOf`, đang Active | *BỊ CHẶN: issuer khác không thu hồi được*, *chuỗi kế nhiệm hai bậc*, *9 lần chuyển giao* |
| `transferOwnership`/`acceptOwnership` từ chối issuer; `addIssuer`/`proposeInherit`/`executeInherit` từ chối `pendingOwner` | *A. Bất biến owner ≠ issuer* (7 test), *S3. kiểm lại lúc thực thi* |
| `INHERIT_DELAY`, `PROPOSAL_TTL` — chuyển giao qua độ trễ, đề xuất có hạn | *S3. Độ trễ chuyển giao danh tính* |
| `compromisedAt` + `_voided` — thu hồi do khóa lộ bị vô hiệu; cờ `issuedAfterCompromise`; `MAX_COMPROMISE_LOOKBACK` | *PoC F-01, F-03*, *S1*, *S2* |
| `_requireCanonicalName` — tên dạng chuẩn | *S7. BỊ CHẶN: tên không ở dạng chuẩn* (6 test) |
| `RECOVERY_WINDOW` — quá 7 ngày sau khi gỡ thì không bật lại/chuyển giao được | *BẤT BIẾN: quá RECOVERY_WINDOW sau khi gỡ, danh tính ĐÓNG BĂNG* |
| `publishBatch` — `onlyActiveIssuer`, root ≠ 0, lô không rỗng, không trùng | *D2. Cấp theo lô — các trường hợp bị chặn* |
| `revokeLeaf` — kèm Merkle proof, khớp root, lô chưa thu hồi | *D3. Thu hồi trong lô* |
| `revokeLeaf` nhận `inner`, lá = keccak(inner) — chỉ lá thật của cây thu hồi được (V34-01) | *V34-01. revokeLeaf chỉ thu hồi được LÁ THẬT* (6 test), *BẤT BIẾN: nút trong của cây không dùng làm lá được* |
| `acceptOwnership` hai bước | *BỊ CHẶN: người không được chỉ định không nhận được quyền* |

Mọi điều kiện revert (custom error) và `modifier` trong contract đều có ít nhất một test tương ứng.

### 10.4. Độ phủ kiểm thử (coverage)

Lệnh: `npx hardhat coverage` (solidity-coverage). Số dưới đây được script này **đọc lại từ `coverage.json`** và tính lại, không phải chép tay.

| Tệp | % câu lệnh | % nhánh | % hàm |
|---|---:|---:|---:|
| `contracts/CredentialRegistry.sol` | 100.00 | 99.26 | 100.00 |
| `legacy/CredentialRegistryV2.sol` | 0.00 | 0.00 | 0.00 |
| `test/MultiSigIssuerMock.sol` | 100.00 | 61.11 | 100.00 |

`contracts/test/MultiSigIssuerMock.sol` là ví mẫu chỉ dùng trong test; `contracts/legacy/CredentialRegistryV2.sol` chỉ dùng để đo gas so sánh. Nhánh duy nhất chưa phủ trong `CredentialRegistry.sol` là kiểm tra thừa trong `acceptOwnership` — phòng thủ chiều sâu, không đến được với mã hiện tại (xem `docs/AUDIT-V3.md`).

## 11. Phân tích tĩnh — Slither

Lưu ý: toàn bộ mục này là hằng số trong script, phải cập nhật tay sau mỗi lần chạy Slither.

| Hạng mục | Giá trị |
|---|---|
| Công cụ | Slither `slither-analyzer` 0.11.6 |
| Lệnh | `slither . --compile-force-framework hardhat --filter-paths "contracts/attack|contracts/test|contracts/legacy|node_modules" --exclude-dependencies` |
| Log gốc | `docs/slither-report.txt` |
| Phạm vi | `contracts/CredentialRegistry.sol`, 102 detector |
| Kết quả | **10 phát hiện — 0 High, 0 Medium, 3 Low (`timestamp`), 7 Informational (`assembly`, `cyclomatic-complexity`, 4 × `too-many-digits`, `naming-convention`)** |

`contracts/attack/` (dành cho contract đối chứng/tấn công, không thuộc hệ thống), `contracts/test/` và `contracts/legacy/` bị loại khỏi phạm vi quét.

### 11.1. Bảng phát hiện

| # | Detector | Mức | Vị trí | So sánh | Kết luận |
|---|---|---|---|---|---|
| 1 | `timestamp` | Low | `proposeInherit` | mốc lộ khóa ≤ bây giờ và ≥ bây giờ − 30 ngày | **So sánh thời gian có chủ đích — chấp nhận** |
| 2 | `timestamp` | Low | `executeInherit` | bây giờ ≥ eta (INHERIT_DELAY) và ≤ eta + 7 ngày | **So sánh thời gian có chủ đích — chấp nhận** |
| 3 | `timestamp` | Low | `_requireInRecoveryWindow` | bây giờ ≤ lúc gỡ + 7 ngày | **So sánh thời gian có chủ đích — chấp nhận** |
| 4 | `assembly` | Informational | `_requireCanonicalName` | — | **Có chủ đích**: vòng kiểm tên theo danh sách cho phép, chỉ đọc calldata; test W phủ đủ 134 chữ, mọi biên và chuỗi UTF-8 cụt |
| 5 | `cyclomatic-complexity` | Informational | `_requireCanonicalName` | 16 nhánh | **Có chủ đích**: mỗi nhánh là một dải byte UTF-8 của chữ tiếng Việt |
| 6–9 | `too-many-digits` | Informational | hằng `_ASCII_OK`, `_C4_OK`, `_C5_OK`, `_C6_OK` | — | **Có chủ đích**: mặt nạ bit của danh sách cho phép; chú thích ngay trên từng hằng |
| 10 | `naming-convention` | Informational | `INHERIT_DELAY` (immutable) | — | **Có chủ đích**: giữ tên viết hoa như một hằng cấu hình; getter `INHERIT_DELAY()` là tên giao diện và script dùng |

### 11.2. Vì sao chấp nhận

Cả ba là ranh giới thời gian **thiết kế có chủ đích**: cửa sổ khôi phục 7 ngày, độ trễ chuyển giao (tham số deploy: 48 giờ production, có thể ngắn hơn ở bản demo), hạn đề xuất 7 ngày và giới hạn lùi mốc lộ khóa 30 ngày. Người đề xuất block chỉ lệch được timestamp vài giây — không đáng kể so với các cửa sổ tính bằng giờ và ngày ở production (riêng độ trễ 1 phút nếu bản demo chọn thì vài giây là đáng kể, nhưng đó chỉ là cấu hình demo), và lệch theo chiều nào cũng chỉ dời ranh giới vài giây. **Không sửa.**

## 11b. Giới hạn khi mở rộng — số đo

V2 có ba hàm `view` duyệt toàn bộ danh bạ (`findByHash`, `listActiveIssuers`, `knownIssuers`). Người gọi trả 0 gas, nhưng RPC từ chối lời gọi vượt trần gas của `eth_call`. Đo trên bản V2: `listActiveIssuers` — hàm trả kèm **tên** — tốn ~15.600 gas/đơn vị, vỡ ở **~3.200 đơn vị** với trần 50 triệu gas và **~630** với trần 10 triệu. Số liệu đầy đủ: `docs/SCALE-NAMES.md` (`npx hardhat run scripts/scale-names.js`).

**V3 không có ba hàm này.** Mọi thao tác trên chuỗi là O(1) theo số đơn vị — bảng dưới đo trên chính contract V3:

| Số đơn vị phát hành | `verifyCertificate` (gas) | `addIssuer` đơn vị thứ N (gas) |
|---|---|---|
| 10 | 40706 | 147935 |
| 50 | 40706 | 147935 |
| 100 | 40706 | 147935 |

Danh bạ trên giao diện dựng từ event (một lần quét cho mọi loại event, từ `DEPLOY_BLOCK`), rồi **đối chiếu với `activeIssuerCount()`** trên chuỗi — lệch thì giao diện báo đỏ. Chi phí chuyển sang số lời gọi `eth_getLogs`: tỉ lệ với **tuổi contract tính bằng block**, không tỉ lệ với số đơn vị. Bản triển khai thật nên dùng indexer (ví dụ The Graph) đọc cùng các event này.

Người xác minh **phải** chọn đơn vị ghi trên chứng chỉ (tên đơn vị in trên chính tệp PDF) — đường đi là `verifyCertificate(đơn vị, hash)`, một lời gọi.

## 12. Ảnh chụp màn hình

Bộ 11 ảnh cũ chụp **giao diện V2** (còn mục "Nâng cao", ô "tra tất cả đơn vị", chuỗi revert thay vì custom error) nên đã được gỡ khỏi repo vì không còn khớp giao diện V3. Ảnh mới sẽ chụp trên bản triển khai Sepolia (README mục 12.0) và đặt ở `picture/screenshots/`. Trong lúc chờ, bằng chứng giao diện là các kịch bản e2e chạy thật trên Chromium ghi ở `docs/AUDIT-V3.md`.

## 13. So sánh với baseline tập trung (Proposal mục 2.1 và mục 6)

### 13.1. So sánh định lượng — thời gian xác minh một chứng chỉ

| Bước trong một lượt xác minh | MVP CredVerify | Baseline thủ công |
|---|---|---|
| Băm tệp trên máy nhà tuyển dụng | 58.04 ms | Không có bước này |
| Tra cứu và đối chiếu | 4.01 ms (đọc on-chain) | Gửi văn bản / email cho đơn vị cấp rồi chờ phản hồi |
| **Tổng thời gian** | **62.06 ms** (đo thực tế) | **Vài ngày tới hơn một tuần** (ước lượng từ nguồn thứ cấp — xem 13.2) |
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
