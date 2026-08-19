# CredVerify - MVP

Hệ thống cấp, xác minh và thu hồi chứng chỉ khóa học trên blockchain. MVP gồm bốn phần:

- Smart contract `CredentialRegistry` — thành phần on-chain
- Bộ kiểm thử tự động 26 test — phủ cả luồng thuận lẫn các hành vi sai phải bị chặn
- Ứng dụng web một tệp với 5 màn hình cho ba vai trò issuer / holder / verifier
- Script tự chạy kịch bản nghiệm thu và sinh `EVIDENCE.md` kèm số đo thật

Blockchain chỉ lưu mã chứng chỉ đã băm, hash của tệp và địa chỉ ví. Tệp gốc và thông tin
cá nhân không bao giờ rời khỏi máy người dùng.

## 1. Yêu cầu môi trường

- Node.js >= 18 (kiểm tra bằng `node -v`)
- npm (đi kèm Node.js)
- Kết nối internet (lần đầu chạy `hardhat compile`, Hardhat sẽ tự tải trình biên dịch Solidity)
- MetaMask trong trình duyệt — chỉ cần khi chạy ứng dụng web ở Mục 7
- Python 3.8+ — chỉ cần khi chạy phân tích tĩnh ở Mục 5

## 2. Cài đặt

```bash
npm install
```

## 3. Biên dịch smart contract

```bash
npx hardhat compile
```

Lần đầu chạy sẽ mất thêm thời gian vì Hardhat tải bộ biên dịch Solidity 0.8.24 về máy.

## 4. Chạy test tự động

```bash
npx hardhat test
```

Bộ test trong `test/CredentialRegistry.test.js` có **26 test**, chia thành năm nhóm:

| Nhóm | Số lượng | Nội dung |
|---|---|---|
| Happy path | 4 | Cấp chứng chỉ, xác minh đúng hash, thu hồi, nhiều issuer cùng hoạt động |
| Hành vi sai bị chặn | 12 | Không phải issuer cố cấp, issuer sai cố thu hồi, cấp trùng id, thu hồi hai lần, không phải owner cố phân quyền, zero address… |
| Bất biến nghiệp vụ | 3 | Thu hồi không xóa lịch sử, chứng chỉ cũ vẫn hợp lệ sau khi issuer bị gỡ quyền, hai chứng chỉ độc lập nhau |
| Quyết định thiết kế có chủ đích | 2 | Ghim lại hành vi dễ bị hiểu nhầm là lỗ hổng, kèm ranh giới rủi ro |
| Truy vấn qua event | 5 | Lọc theo `holder` và `certHash` — nền tảng của màn hình học viên và xác minh không cần mã |

Mỗi test deploy một contract mới qua `beforeEach` nên các test độc lập hoàn toàn, đổi thứ tự
chạy không ảnh hưởng kết quả. Nếu tất cả hiện chữ xanh (passing), logic lõi đúng như thiết kế.

## 5. Phân tích tĩnh (Slither)

```bash
pip install slither-analyzer
slither .
```

Slither tự gọi `hardhat clean` và `hardhat compile --force` trước khi phân tích. Nếu báo lỗi
không tìm thấy trình biên dịch:

```bash
pip install solc-select
solc-select install 0.8.24
solc-select use 0.8.24
```

Log gốc của lần chạy gần nhất lưu ở `docs/slither-report.txt`. Kết quả: **3 phát hiện trên 102
detector — 0 High, 0 Medium**. Phân tích từng phát hiện, giải thích false positive và lập luận
cho phát hiện không áp dụng nằm ở Mục 11 của `EVIDENCE.md`.

Lưu ý khi đọc log trên Windows: Slither ghi output ra luồng `stderr`, PowerShell hiển thị nội
dung đó theo định dạng lỗi kèm `NativeCommandError`. Đó không phải lỗi chạy — dòng cuối
`analyzed (1 contracts with 102 detectors)` xác nhận phân tích đã hoàn tất.

## 6. Chạy thử trên mạng local (để xem giao dịch thật)

Mở 2 terminal:

**Terminal 1** — khởi động mạng blockchain local:
```bash
npx hardhat node
```
Terminal này sẽ hiện ra danh sách 20 tài khoản demo kèm private key (chỉ dùng để test,
không bao giờ dùng các key này cho tài khoản thật, và không chụp màn hình cửa sổ này).

**Terminal 2** — deploy contract lên mạng local vừa chạy:
```bash
npx hardhat run scripts/deploy.js --network localhost
```
Kết quả in ra sẽ có địa chỉ contract (contract address).

## 7. Chạy ứng dụng web (frontend)

Cần MetaMask cài trong trình duyệt.

**Bước 1** — chạy mạng local và deploy (Mục 6 ở trên). Ghi lại địa chỉ contract in ra.

**Bước 2** — thêm mạng local vào MetaMask:
- Network name: `Hardhat local`
- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Currency symbol: `ETH`

**Bước 3** — nhập một tài khoản demo vào MetaMask bằng private key mà `npx hardhat node`
in ra ở terminal. Các key này là công khai, chỉ dùng cho mạng local, **không bao giờ**
dùng cho tài khoản thật và không commit vào repo.

**Bước 4** — mở `app/index.html` bằng trình duyệt (chạy bằng localhost).
Dán địa chỉ contract vào ô trên cùng, bấm **Lưu địa chỉ contract**, rồi **Kết nối ví**.

### Năm tab

| Tab | Vai trò | Việc làm được |
|---|---|---|
| Cấp chứng chỉ | Đơn vị phát hành | Chọn tệp PDF, hệ thống băm tệp ngay trên máy, ghi mã + hash + ví học viên lên chuỗi |
| Xác minh | Nhà tuyển dụng | Nộp tệp là đủ; hệ thống tra ngược bản ghi rồi đối chiếu hash và trạng thái |
| Chứng chỉ của tôi | Học viên | Xem chứng chỉ thuộc về ví đang kết nối |
| Tra cứu & thu hồi | Đơn vị phát hành | Xem danh sách đã cấp, thu hồi chứng chỉ |
| Quản trị đơn vị phát hành | Chủ sở hữu | Cấp/thu quyền phát hành cho một ví |

Tab **Chứng chỉ của tôi** đọc dữ liệu từ event `CertificateIssued` trên chuỗi (lọc theo tham số
`holder` đã được khai báo `indexed`), không đọc từ `localStorage`. Nhờ vậy học viên mở trang trên
máy bất kỳ vẫn thấy chứng chỉ của mình, miễn là kết nối đúng ví. Đây là điểm khác biệt so với tab
**Tra cứu & thu hồi** — tab đó chỉ liệt kê những chứng chỉ đã cấp từ chính trình duyệt đang dùng.

Giới hạn của tab này: nếu trình duyệt đang dùng không phải nơi đã cấp chứng chỉ, học viên chỉ
đọc được `certId` chứ không thấy tên khóa học, vì mã gốc bị băm trước khi ghi lên chuỗi nên
không suy ngược lại được. Phân tích đầy đủ phạm vi đạt được của F2 ở Mục 10.4 `EVIDENCE.md`.

### Vì sao xác minh không cần biết mã chứng chỉ

Nhà tuyển dụng thường chỉ có tệp PDF trong tay, không có mã. Tham số `certHash` của event
`CertificateIssued` được khai báo `indexed` nên tra ngược được từ hash của tệp ra `certId`, rồi
mới gọi `verifyCertificate`. Ô nhập mã vẫn giữ lại cho trường hợp tờ chứng chỉ có in mã — khi đó
tra trực tiếp, không phải truy vấn log.

Event không ẩn danh trong Solidity chỉ được tối đa **3 tham số `indexed`**. Ba suất đó được dành
cho `certId`, `certHash` và `holder` vì đây là ba khóa tra cứu thực sự dùng tới. `issuer` cố ý
không index: giá trị vẫn nằm đầy đủ trong phần data của event nên khả năng truy vết công khai
không mất, chỉ là muốn liệt kê "mọi chứng chỉ do địa chỉ X cấp" thì phải quét log thay vì để node
lọc — thao tác kiểm toán hiếm gặp, chấp nhận chậm hơn để đổi lấy tốc độ cho đường đi nóng.

### Nhật ký bằng chứng

Bảng bên phải ghi lại mọi giao dịch (tx hash, block, gas) và mọi thao tác bị chặn kèm lý do
revert. Nút **Xuất EVIDENCE.md** tải về tệp markdown ghi lại nhật ký của phiên làm việc.

Đây là bản xuất nhanh từ giao diện, khác với `EVIDENCE.md` đầy đủ do script ở Mục 8 sinh ra.

**Lưu ý về lưu trữ off-chain:** tên học viên, tên khóa học và danh sách chứng chỉ hiện được
giữ trong `localStorage` của trình duyệt để mô phỏng cơ sở dữ liệu của đơn vị đào tạo. Đây là
giới hạn của MVP — hệ thống thật cần máy chủ có kiểm soát truy cập, mã hóa và chính sách lưu
trữ theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15.

## 8. Sinh EVIDENCE.md tự động

```bash
# Terminal 1
npx hardhat node

# Terminal 2
npx hardhat run scripts/collect-evidence.js --network localhost
```

Script chạy trọn kịch bản nghiệm thu ở Mục 10.1 của đề bài — khởi tạo, cấp quyền, cấp chứng chỉ,
xác minh, các hành vi bị chặn, thu hồi, xác minh lại — rồi ghi `EVIDENCE.md` ở thư mục gốc với
14 mục:

| Mục | Nội dung | Nguồn |
|---|---|---|
| 1–3 | Môi trường, contract đã deploy, tài khoản demo | Đo lúc chạy |
| 4–7 | Giao dịch chính, event, thay đổi trạng thái, hành vi bị chặn | Đo lúc chạy |
| 8 | Đối chiếu thao tác giao diện với hàm contract | Cố định |
| 9 | Độ trễ và chi phí — gas, latency ghi/đọc, 30 mẫu mỗi thao tác | Đo lúc chạy |
| 10 | Kết quả kiểm thử tự động, đối chiếu test với F1–F5 và với từng lớp phòng thủ | Hằng số trong script |
| 11 | Phân tích tĩnh Slither, giải thích từng phát hiện | Hằng số trong script |
| 12 | Ảnh chụp màn hình | Tệp trong `docs/screenshots/` |
| 13 | So sánh với baseline tập trung, kèm nguồn trích dẫn | Nửa đo nửa trích dẫn |
| 14 | Cam kết an toàn dữ liệu | Cố định |

**Khi nào phải cập nhật script:** kết quả `npx hardhat test` và Slither không tự chạy được từ
script, nên chúng được lưu thành hằng số ở đầu `scripts/collect-evidence.js`. Sửa bộ test thì
cập nhật `TEST_OUTPUT`, `TEST_PASSING`, `TEST_DURATION`; sửa contract thì chạy lại Slither và
kiểm tra các số dòng trích dẫn ở Mục 11 còn đúng không.

Lưu ý: script deploy một contract **mới** mỗi lần chạy, nên địa chỉ sinh ra sẽ khác địa chỉ
đang dùng trong giao diện web.

## 9. Cấu trúc thư mục

```
contracts/CredentialRegistry.sol   -> smart contract lõi (thành phần on-chain)
test/CredentialRegistry.test.js    -> 26 test tự động (M8)
scripts/deploy.js                  -> script deploy (M9 - khả năng tái lập)
scripts/collect-evidence.js        -> chạy kịch bản demo và sinh EVIDENCE.md (D8)
app/index.html                     -> ứng dụng web 5 màn hình, chạy thẳng trong trình duyệt (M10)
hardhat.config.js                  -> cấu hình Hardhat
docs/slither-report.txt            -> log gốc của lần chạy Slither gần nhất
docs/screenshots/                  -> ảnh chụp màn hình nhúng vào EVIDENCE.md Mục 12
Demo/DemoCert.pdf                  -> tệp PDF mẫu dùng cho kịch bản nghiệm thu
picture/                           -> logo
EVIDENCE.md                        -> bằng chứng sinh tự động (D8)
CONTRIBUTIONS.md                   -> phân rã công việc và cam kết
```

**Về `Demo/DemoCert.pdf`:** đây là chứng chỉ giả, không chứa dữ liệu cá nhân thật. Nếu thay bằng tệp khác, 
phải đảm bảo tệp đó cũng không có tên thật, số căn cước hay bất kỳ thông tin định danh nào — repo này công khai, 
và `CONTRIBUTIONS.md` cam kết không có dữ liệu cá nhân thật.

## 10. Giải thích nhanh state machine

```
None ---issueCertificate()---> Issued ---revokeCertificate()---> Revoked
```

- Chỉ địa chỉ được cấp quyền `isIssuer` mới gọi được `issueCertificate`.
- Chỉ đúng issuer đã cấp một chứng chỉ mới thu hồi được chứng chỉ đó.
- Không có đường quay lại từ `Revoked`, và không cấp lại được bằng cùng `certId`.
- `verifyCertificate` là hàm `view`: ai cũng gọi được, miễn phí, không phát sinh giao dịch.

## 11. Tình trạng hoàn thành

- [x] Smart contract lõi + 26 test tự động
- [x] Frontend web với 5 màn hình và nhật ký bằng chứng (M10)
- [x] `EVIDENCE.md` sinh tự động qua `scripts/collect-evidence.js` (D8)
- [x] Static analysis bằng Slither, kèm giải thích false positive (mục 5.2 đề bài)
- [x] Đo gas và độ trễ cho từng thao tác chính (mục 4.4)
- [x] Bảng so sánh với baseline tập trung, có dẫn nguồn
- [ ] Chụp đủ 6 ảnh màn hình vào `docs/screenshots/`
- [ ] Khảo sát thực tế thời gian phản hồi của trung tâm đào tạo, để cột baseline ở Mục 13.1
      thành số đo của đề tài thay vì trích dẫn nguồn thứ cấp *(tùy chọn)*

### Giới hạn đã biết của MVP

- **`localStorage` thay cho backend.** Tên học viên, tên khóa học và danh sách chứng chỉ nằm
  trong bộ nhớ trình duyệt. Hệ thống thật cần máy chủ có kiểm soát truy cập và mã hóa.
- **Học viên mất tệp gốc thì chỉ đọc được `certId`.** Hệ quả trực tiếp của việc chỉ đưa hash
  lên chuỗi. Hướng khắc phục: phát tên khóa học vào event, hoặc theo chuẩn W3C Verifiable
  Credentials như EBSI. Cả hai đều có đánh đổi, phân tích ở Mục 10.4 `EVIDENCE.md`.
- **Quét log không co giãn.** Tra cứu theo `certHash` và `holder` dùng `queryFilter` từ block 0,
  đủ nhanh ở quy mô MVP nhưng quy mô thật cần dịch vụ lập chỉ mục riêng.
- **Số đo độ trễ lấy trên mạng local.** Hardhat đào block tức thì nên độ trễ ghi không đại diện
  cho mạng thật; độ trễ đọc thì vẫn có ý nghĩa. Giải thích ở Mục 9.4 `EVIDENCE.md`.
