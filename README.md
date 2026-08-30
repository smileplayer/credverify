# CredVerify - MVP

Hệ thống cấp, xác minh và thu hồi chứng chỉ khóa học trên blockchain. MVP gồm bốn phần:

- Smart contract `CredentialRegistry` — **một sổ đăng ký dùng chung** cho mọi đơn vị phát hành
- Bộ kiểm thử tự động **71 test** — phủ luồng thuận, hành vi sai bị chặn, và kịch bản phục hồi sự cố
- Ứng dụng web một tệp với 6 tab; **ba tab chạy không cần ví**
- Script tự chạy kịch bản nghiệm thu và sinh `EVIDENCE.md` kèm số đo thật

Blockchain chỉ lưu hash của tệp và địa chỉ ví. Tệp gốc và thông tin cá nhân **không bao giờ rời
khỏi máy người dùng** — việc băm tệp diễn ra ngay trong trình duyệt.

**Vì sao một sổ chung thay vì một contract cho mỗi đơn vị:** để chỉ có **đúng một địa chỉ** cần
công bố. Một địa chỉ thì in được lên báo cáo, lên chính tấm bằng, lên Etherscan; mười nghìn địa
chỉ thì không. Nếu trang web này biến mất, `verifyCertificate` vẫn gọi được thẳng từ Etherscan.

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

Bộ test có **71 test** trong hai tệp, đạt **100% độ phủ câu lệnh, nhánh và hàm**
trên `CredentialRegistry.sol` (`npx hardhat coverage`):

| Tệp | Nội dung |
|---|---|
| `test/CredentialRegistry.test.js` | 10 nhóm: công nhận đơn vị · người không có quyền · tên là duy nhất · cấp · không gian tên riêng · thu hồi · xoay khóa · xác minh · khả kiến · chuyển quyền owner · ranh giới quyền owner · dọn dẹp sau sự cố |
| `test/XssViaRevertString.test.js` | Bằng chứng cho lỗ hổng XSS qua chuỗi revert của contract, và chứng minh `esc()` vô hiệu hóa nó |

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

Loại contract tấn công khỏi phạm vi quét — nó là bằng chứng cho M7, không phải một phần hệ thống:

```bash
slither . --filter-paths "contracts/attack" --exclude-dependencies
```

Log gốc của lần chạy gần nhất lưu ở `docs/slither-report.txt`. Kết quả: **2 phát hiện trên 102
detector — 0 High, 0 Medium**, cả hai là false positive của detector `timestamp`.

Lưu ý khi đọc log trên Windows: Slither ghi output ra luồng `stderr`, PowerShell hiển thị nội
dung đó theo định dạng lỗi kèm `NativeCommandError`. Đó không phải lỗi chạy — dòng cuối
`analyzed (2 contracts with 102 detectors)` xác nhận phân tích đã hoàn tất.

Lưu ý: tác giả đã thay đổi đường dẫn trong `docs/slither-report.txt` để tránh thông tin cá nhân.

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

**Bước 4** — mở `app/index.html` bằng trình duyệt (chạy bằng localhost), rồi bấm **Kết nối ví**.

Giao diện **không nhận địa chỉ contract từ người dùng nữa**. Địa chỉ và chainId được ghi cố định
trong mã nguồn trang (`CONTRACT_ADDRESS`, `EXPECTED_CHAIN_ID`).

Trên mạng Hardhat local, địa chỉ deploy là **tất định** nên giá trị mặc định đúng ngay. Nếu deploy
ra địa chỉ khác, `scripts/deploy.js` sẽ in ra đúng dòng cần sửa trong `app/index.html`.
Ô nhập địa chỉ vẫn còn trong mục **Nâng cao — dành cho lập trình viên**, kèm cảnh báo đỏ khi
đang trỏ tới một sổ đăng ký không chính thức.

### Sáu tab

| Tab | Vai trò | Việc làm được | Cần kết nối ví? |
|---|---|---|---|
| **Xác minh** | Nhà tuyển dụng | Nộp tệp, chọn đơn vị cấp (hoặc để hệ thống tra toàn bộ), đối chiếu hash và trạng thái | **Không** |
| Cấp chứng chỉ | Đơn vị phát hành | Chọn tệp PDF, hệ thống băm ngay trên máy, ghi hash + ví học viên lên chuỗi | Có |
| **Chứng chỉ của tôi** | Học viên | Xem chứng chỉ của một địa chỉ ví — dán địa chỉ là đủ | **Không** |
| Tra cứu & thu hồi | Đơn vị phát hành | Xem danh sách đã cấp, thu hồi, xóa dữ liệu off-chain | Có (để thu hồi) |
| **Đơn vị phát hành** | Bất kỳ ai | Danh bạ công khai + **nhật ký quản trị** + cảnh báo tên gần giống | **Không** |
| Quản trị sổ đăng ký | `owner` (CredVerify) | Công nhận / gỡ / bật lại / chuyển giao đơn vị, chuyển quyền owner | Có |

**Ba trong sáu tab chạy không cần ví.** `verifyCertificate` là hàm `view` — không gas, không chữ
ký. Chúng chạy trên một `JsonRpcProvider` chỉ-đọc, nên nhà tuyển dụng mở trang là dùng được ngay.
Bắt họ cài ví để *xem* một tấm bằng vừa vi phạm yêu cầu phi chức năng của đề tài, vừa là rào cản
áp dụng lớn nhất ngoài đời.

### Không phải nhập mã chứng chỉ nữa

`certId` **không do người dùng đặt**. Nó được sinh bằng `keccak256(địa chỉ issuer ‖ hash tệp)`,
và giao diện tính giá trị đó **ngay tại máy** bằng `solidityPackedKeccak256`, đúng công thức của
hàm `pure certIdOf` trên chuỗi — không tốn một vòng RPC nào.

Khi xác minh, có hai đường:

| Tình huống | Cách chạy | Chi phí |
|---|---|---|
| Biết đơn vị nào cấp (chọn từ danh sách) | `certIdOf` tính tại client → `getCertificate` | **O(1)**, một lời gọi |
| Không biết đơn vị nào cấp | `findByHash(certHash)` quét toàn bộ danh bạ | O(n) theo số đơn vị — xem giới hạn ở Mục 11b `EVIDENCE.md` |

### Cảnh báo giao diện làm mà contract không làm được

> **Contract cưỡng chế cái gì phải ĐÚNG. Giao diện cung cấp cái gì phải được NHÌN THẤY.**

1. **Tuổi khóa cấp.** Kết quả xác minh hiện đơn vị cấp được công nhận từ bao giờ, cách thời điểm
   cấp bao lâu. Nếu dưới 24 giờ thì hiện băng đỏ. Trên chuỗi, *"đơn vị hợp pháp vừa được công
   nhận"* và *"ví giả thêm 3 phút trước"* giống hệt nhau từng byte — không `require` nào tách được
   hai cái đó, nhưng một con người có ngữ cảnh thì tách được ngay.
2. **Tên gần giống.** Contract chặn trùng tên **y hệt theo byte** — và khi trùng y hệt thì giao
   diện *không* hỏi gì cả, cứ gửi giao dịch để người dùng thấy đúng chuỗi revert của contract.
   Giao diện chỉ can thiệp ở chỗ contract **không** bắt được: chuẩn hóa **NFKC → xóa ký tự vô
   hình → bảng confusables Kirin/Hy Lạp → bỏ dấu → gộp khoảng trắng**, rồi hỏi lại nếu hai đơn vị
   đang hoạt động trùng nhau sau chuẩn hóa.

   > **NFKC một mình là KHÔNG đủ**. NFKC gộp *tương đương tương thích*
   > (`ﬁ`→`fi`, `①`→`1`, `Ａ`→`A`) chứ **không** gộp homoglyph: `а` Kirin (U+0430) và `a` Latin
   > (U+0061) là hai ký tự khác nhau thật sự, chỉ trông giống. Đòn nặng nhất lại là **ký tự vô
   > hình** — chèn một ZWSP hay soft hyphen vào giữa chữ thì hai tên hiển thị **giống hệt 100%**
   > trên màn hình mà khác chuỗi byte. Cả hai đều cần xử lý riêng.
3. **Đời khóa.** Hiện "đời thứ N/8" trong chuỗi chuyển giao, biến giới hạn 8 hop từ một vách đá
   thành một đồng hồ đo.
4. **Canh ví đổi mạng / đổi tài khoản.** Trang nghe `chainChanged` và `accountsChanged`. Đổi
   sang sai mạng thì băng đỏ hiện **ngay**, chip Mạng và Vai trò bị xóa, và **toàn bộ quyền ghi
   bị ngắt** — nhưng ba tab đọc **vẫn chạy**, vì chúng không đi qua ví. Kiểm `chainId` một lần
   lúc kết nối là cần nhưng không đủ: trạng thái ví đổi được bất cứ lúc nào.

> ⚠ **Giới hạn:** mọi cảnh báo trên chỉ bảo vệ người đang dùng **đúng trang này**.
> Kẻ tấn công dựng trang riêng, hoặc gọi thẳng contract qua Etherscan. Đây là lớp phòng vệ chống
> **nhầm lẫn**, không phải lớp phòng vệ chống **tấn công**. Mọi ràng buộc phân quyền nằm trong
> contract và ở lại đó.

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
npx hardhat coverage 
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
| 10 | Kết quả kiểm thử tự động | **Chạy thật lúc sinh tệp** |
| 11 | Phân tích tĩnh Slither, giải thích từng phát hiện | Hằng số trong script |
| 12 | Ảnh chụp màn hình | Tệp trong `picture/screenshots/` |
| 13 | So sánh với baseline tập trung, kèm nguồn trích dẫn | Nửa đo nửa trích dẫn |
| 14 | Cam kết an toàn dữ liệu | Cố định |

**Kết quả kiểm thử nay được sinh từ một lần chạy thật.** Script tự gọi `npx hardhat test` rồi
đọc kết quả, không còn hằng số dán tay nào. Riêng Slither vẫn phải chạy thủ công (`slither .`) và cập nhật Mục 11.

Lưu ý: script deploy một contract **mới** mỗi lần chạy, nên địa chỉ sinh ra có thể sẽ khác địa chỉ đang dùng trong giao diện web.

## 9. Cấu trúc thư mục

```
contracts/CredentialRegistry.sol   -> smart contract lõi (thành phần on-chain)
test/CredentialRegistry.test.js    -> bộ test chính
test/XssViaRevertString.test.js    -> bằng chứng lỗ hổng XSS qua chuỗi revert
contracts/attack/EvilRegistry.sol  -> contract GIẢ chỉ dùng làm bằng chứng, KHÔNG thuộc hệ thống
scripts/deploy.js                  -> script deploy
scripts/collect-evidence.js        -> chạy kịch bản demo và sinh EVIDENCE.md
scripts/seed-demo.js               -> dựng dữ liệu demo để kiểm thử giao diện
scripts/scale-probe.js             -> đo chi phí truy vấn theo số đơn vị phát hành
app/index.html                     -> ứng dụng web 6 tab, chạy thẳng trong trình duyệt
hardhat.config.js                  -> cấu hình Hardhat
docs/slither-report.txt            -> log gốc của lần chạy Slither gần nhất
docs/GAS-BASELINE.md               -> số đo gas qua ba phiên bản kiến trúc
docs/archive/                      -> kiến trúc V1 đã bị bác bỏ: contract, 57 test
.env.example                       -> mẫu biến môi trường
picture/screenshots/               -> ảnh chụp màn hình nhúng vào EVIDENCE.md Mục 12
Demo/DemoCert.pdf                  -> tệp PDF mẫu dùng cho kịch bản nghiệm thu
picture/logo                       -> logo
EVIDENCE.md                        -> bằng chứng sinh tự động
CONTRIBUTIONS.md                   -> phân rã công việc và cam kết
```

**Về `Demo/DemoCert.pdf` và `Demo/DemoCert2.pdf`:** đây là chứng chỉ giả, không chứa dữ liệu cá nhân thật. 
Nếu thay bằng tệp khác, phải đảm bảo tệp đó cũng không có tên thật, số căn cước hay bất kỳ thông tin định 
danh nào — repo này công khai, và `CONTRIBUTIONS.md` cam kết không có dữ liệu cá nhân thật.

## 10. State machine, ba bên và hai bất biến

```
None ---issueCertificate()---> Issued ---revokeCertificate()---> Revoked
```

- **Không có đường quay lại từ `Revoked`**, và **không cấp lại được cùng một tệp** sau khi đã thu hồi.
- `verifyCertificate` là hàm `view`: ai cũng gọi được, miễn phí, **không bao giờ bị chặn** — kể cả khi đơn vị cấp đã bị gỡ quyền.

### Ba bên, ba quyền tách rời

| Bên | Được làm | **Không được làm** |
|---|---|---|
| **CredVerify** (`owner`) | công nhận đơn vị phát hành, đặt tên, chuyển giao danh tính issuer | **cấp** · **thu hồi** · sửa/xóa bản ghi đã có |
| **Trung tâm** (`issuer`) | cấp và thu hồi chứng chỉ *của chính mình* | tự công nhận mình · đụng vào chứng chỉ của trung tâm khác |
| **Nhà tuyển dụng** | đọc và xác minh, không cần xin phép ai, không cần ví | ghi bất cứ thứ gì |

Lời hứa phát biểu chính xác: CredVerify **nói dối được** về *ai là ai*; nó **không nói dối được** về *ai đã làm gì*; và nó **không nói dối được vô hình** — mọi `addIssuer` là một event vĩnh viễn, công khai, hiện ngay trong tab **Đơn vị phát hành**. Đây là lời hứa **quy trách nhiệm**, không phải lời hứa **ngăn chặn**.

Ranh giới này được cưỡng chế **bằng test**: bộ kiểm thử có một test liệt kê tường minh cả 8 hàm ghi của contract, nên thêm bất kỳ hàm mới nào là test vỡ ngay.

### Hai bất biến nghiệp vụ

**(1) Thu hồi là VĨNH VIỄN.** Cho phép cấp lại một bản ghi đã `Revoked` chính là cài đặt một quyền
ghi lại lịch sử: nhà tuyển dụng tra tháng 3 thấy *Revoked*, tra lại tháng 8 thấy *Issued*. Chứng
chỉ sửa lại là một **tệp** khác, nên là một **hash** khác, nên là một bản ghi khác.

**(2) Mỗi issuer có KHÔNG GIAN TÊN RIÊNG** nhờ `certId = keccak256(issuer ‖ certHash)`, và **tên
hiển thị là duy nhất** nhờ `nameHolder`. Tên **không bao giờ được trả tự do**, kể cả khi gỡ quyền —
nếu trả lại thì `removeIssuer` + `addIssuer` thành đường vòng để owner đổi danh tính một địa chỉ
mà không ai thấy.

### Quy trình xử lý sự cố lộ khóa — THỨ TỰ QUYẾT ĐỊNH KẾT QUẢ

> **`removeIssuer` gần như không bao giờ là nước đi đầu tiên khi có sự cố.**
> `inheritIssuer` đã tự vô hiệu hóa khóa cũ — nó làm luôn việc của `removeIssuer`, đồng thời
> chuyển quyền thu hồi sang khóa sạch. `removeIssuer` là để **cho nghỉ có trật tự**, không phải
> để **chữa cháy**.

| Bước | Thao tác |
|---|---|
| 1 | `inheritIssuer(khóa xấu, khóa sạch)` — ngay lập tức, nguyên tử trong một giao dịch |
| 2 | Khóa sạch gọi `revokeCertificate` cho từng bằng giả |
| 3 | Đối chiếu nhật ký quản trị ở tab **Đơn vị phát hành** |
| — | Nếu đã lỡ gọi `removeIssuer`: `restoreIssuer` rồi quay lại bước 1 |

Bốn test ở nhóm 10 của bộ kiểm thử ghim đúng quy trình này, kể cả cái bẫy.

## 11. Giới hạn đã biết của MVP

- **`owner` là neo tin cậy.** CredVerify chuyển giao được danh tính một trung tâm đang hoạt động
  sang ví của chính mình (`inheritIssuer`). Contract chỉ đảm bảo hành động đó **được ghi nhận công
  khai và trung tâm thật biết ngay**, không ngăn được nó. Phân biệt hai tác nhân: **insider chủ
  động lạm quyền** và **kẻ ngoài chiếm khóa**.
- **Tên issuer chưa phải bằng chứng danh tính ngoài đời.** `issuerName` là metadata do owner công
  nhận. Contract chặn trùng tên **y hệt theo byte**, không chặn được tên gần giống — giao diện bù
  bằng chuẩn hóa NFKC **cộng** bảng confusables Kirin/Hy Lạp **cộng** xóa ký tự vô hình, và có một
  test **pass** ghim đúng giới hạn này. Bảng confusables đầy đủ của Unicode (UTS #39) còn lớn hơn
  nhiều, nên đây vẫn là phòng vệ **một phần**. Lời giải đúng là buộc tên phải **chứng minh được**
  (gắn quyền kiểm soát tên miền), ngoài phạm vi MVP.
- **Chuỗi kế nhiệm giới hạn 8 đời.** Đo được: đời thứ 9 thì chứng chỉ do khóa đời đầu cấp không
  còn ai thu hồi được.
- **Truy vấn trên danh bạ chưa tối ưu cho quy mô rất lớn.** Đo được: `findByHash` tốn ~5.642 gas
  mỗi đơn vị, trần thực tế khoảng **1132 - 8862 đơn vị**. Cách xử lý rẻ nhất là **hỏi đúng câu**
  (chọn đơn vị → đường O(1)); production nên dùng indexer.
- **Ví học viên là dữ liệu công khai**, bút danh nhưng **liên kết được**; event index theo `holder`
  nên ai cũng liệt kê được toàn bộ chứng chỉ của một ví. MVP **ưu tiên auditability hơn privacy**,
  có chủ đích.
- **`localStorage` thay cho backend.** Tên học viên và tên khóa học nằm trong bộ nhớ trình duyệt.
  Có nút **Xóa dữ liệu off-chain**. Hệ thống thật cần máy chủ có kiểm soát truy cập và mã hóa theo
  Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15.
- **CSP chưa chặn được XSS.** Ứng dụng cố ý gói trong một tệp nên `script-src` vẫn phải cho
  `'unsafe-inline'`. Lớp phòng thủ thật là `esc()` và `bannerText()` — có test chứng minh ở
  `test/XssViaRevertString.test.js`. `frame-ancestors` đã được gỡ khỏi thẻ `<meta>` vì trình duyệt
  bỏ qua nó ở đó; phải đặt bằng HTTP header khi phát hành.
- **Số đo độ trễ lấy trên mạng local.** Hardhat đào block tức thì nên độ trễ **ghi** không đại diện cho mạng thật; độ trễ **đọc** thì vẫn có ý nghĩa. Giải thích ở Mục 9.4 `EVIDENCE.md`.
- **Không công kiến trúc V1 hoàn chỉnh.** Kiến trúc V1 hoàn chỉnh được tác giả đo ở phiên bản cũ, chỉ được ghi lại sơ bộ trong `docs/archive`, không được push lên gitHub trong quá trình xây dựng nên có khả năng không thể tái lập.
