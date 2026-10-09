# CredVerify - MVP

Hệ thống cấp, xác minh và thu hồi chứng chỉ khóa học trên blockchain. MVP gồm bốn phần:

- Smart contract `CredentialRegistry` (V3) — **một sổ đăng ký dùng chung** cho mọi đơn vị phát hành,
  cấp **lẻ từng tệp** hoặc **theo lô bằng một Merkle root**, thu hồi từng chứng chỉ hoặc cả lô;
  xử lý **khóa bị lộ** (thu hồi phá hoại bị vô hiệu, bằng giả bị gắn cờ) và chuyển giao danh tính
  qua **độ trễ chuyển giao** (tham số lúc deploy, bất biến: mặc định 48 giờ; bản demo có thể đặt 1 phút); tên đơn vị
  kiểm trên chuỗi theo **danh sách cho phép chữ tiếng Việt**; thu hồi trong lô chỉ nhận **lá thật** của cây
- Bộ kiểm thử tự động **191 test** — phủ luồng thuận, hành vi sai bị chặn, và kịch bản phục hồi sự cố — cộng một bộ **fuzz bất biến** Foundry (10 bất biến, 80.000 lời gọi ngẫu nhiên mỗi lần chạy)
- Ứng dụng web tĩnh (`index.html` + `app.js` + `app.css`, không backend, không bước build) với 6 tab; **ba tab chạy không cần ví**
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
- [Foundry](https://book.getfoundry.sh/getting-started/installation) — chỉ cần khi chạy fuzz bất biến ở Mục 4

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

Bộ test có **191 test** trong năm tệp. Trên `CredentialRegistry.sol` (`npx hardhat coverage`):
**100% câu lệnh, 100% hàm, 100% dòng, 99,26% nhánh** — nhánh duy nhất chưa phủ là một kiểm tra
phòng thủ chiều sâu trong `acceptOwnership` mà mã hiện tại không thể đi tới (giải thích trong
`docs/AUDIT-V3.md`).

| Tệp | Nội dung |
|---|---|
| `test/CredentialRegistry.test.js` | Bộ test kế thừa từ V2 (69 test), cập nhật cho V3 — 10 nhóm: công nhận đơn vị · người không có quyền · tên là duy nhất · cấp · không gian tên riêng · thu hồi · xoay khóa · xác minh · khả kiến · chuyển quyền owner · ranh giới quyền owner · dọn dẹp sau sự cố |
| `test/CredentialRegistryV3.test.js` | 109 test cho phần của V3, chia năm nhóm: **A–E** bất biến owner ≠ issuer qua chuyển quyền · xoay khóa từ Disabled và cửa sổ khôi phục 7 ngày · danh tính O(1) · cấp theo lô (đăng, xác minh, bị chặn, thu hồi lá / cả lô) · tên lưu theo danh tính, giới hạn 256 byte · issuer là ví multisig. **S1–S7** ba PoC của kiểm toán lượt 1 (đảo kỳ vọng) · thu hồi do khóa lộ bị vô hiệu · cờ `issuedAfterCompromise` · độ trễ chuyển giao, hạn đề xuất, hủy, kiểm lại lúc thực thi · `predecessorOf` · tên dạng chuẩn · hủy đề cử owner. **W–G** danh sách cho phép tên tiếng Việt (đủ 134 chữ; chặn NBSP, ký tự vô hình, NFD, Kirin, Hy Lạp, dấu chấm, ký tự đặc biệt, gạch dài; **khớp `scripts/lib/name.js` trên 300 tên ngẫu nhiên**) · mốc công bố lộ khóa · `effectiveStatus` · PoC lượt 2. **V34-01** `revokeLeaf` chỉ nhận lá thật. **V341-01** `INHERIT_DELAY` là tham số deploy, quy tắc của `scripts/lib/delay.js` |
| `test/Csp.test.js` | CSP/SRI của giao diện: `connect-src` khớp `RPC_URLS`, không script nội tuyến, không `'unsafe-inline'` cho script, integrity (nếu có) khớp `app.js`/`app.css`, không Google Fonts |
| `test/UiShared.test.js` | Giao diện và script dùng cùng quy tắc — đọc thẳng hàm thật trong `app/app.js`: chuẩn hóa tên và danh sách cho phép (`app.js` ≡ `scripts/lib/name.js`), **cây Merkle dựng trong trình duyệt ≡ OpenZeppelin** (root, lá, proof với n = 1…50) và qua được `verifyInBatch`, `inner` ≡ `leafInnerOf` (thu hồi trong lô), `certId` ≡ contract, **thống kê kiểm toán theo đơn vị** khớp kịch bản khóa bị đánh cắp |
| `test/XssViaRevertString.test.js` | Bằng chứng cho XSS qua chuỗi lỗi: dựng thẳng đối tượng lỗi như một RPC độc hại hoặc một revert `Error(string)` trả về (không cần contract tấn công), dùng **đúng** `reasonOf()` và `esc()` của giao diện (đọc từ `app/app.js`), và kiểm **mọi** chỗ dùng `reasonOf()` trong `app.js` đều qua `bannerText`/`esc`/`alert` |

Mỗi test deploy một contract mới qua `beforeEach` nên các test độc lập hoàn toàn, đổi thứ tự
chạy không ảnh hưởng kết quả. Nếu tất cả hiện chữ xanh (passing), logic lõi đúng như thiết kế.

### Fuzz bất biến (Foundry)

Test đơn vị kiểm những kịch bản đã nghĩ ra trước. `test/foundry/Invariants.t.sol` làm ngược lại: một
*handler* đóng vai owner, sáu khóa issuer, ba ví có thể làm owner và ba học viên, gọi **ngẫu nhiên** mọi
hàm ghi của contract (kể cả gọi sai vai), tua thời gian, và sau **mỗi** lời gọi kiểm 10 bất biến:

| Mã | Bất biến |
|---|---|
| I1 | Một danh tính không bao giờ có hai khóa Active cùng lúc |
| I2 | Owner và owner đang chờ nhận không bao giờ là issuer |
| I3 | Thu hồi hợp lệ — kể cả thu hồi trước mốc lộ khóa — không bao giờ bị vô hiệu |
| I4 | `compromisedAt` chỉ ghi một lần và không muộn hơn lúc công bố |
| I5 | Danh tính đã đóng băng không sống lại, hiệu lực chứng chỉ của nó không đổi |
| I6 | `activeIssuerCount` khớp số issuer Active thực tế |
| I7 | Ví lạ không gọi được `addIssuer`, `removeIssuer`, `proposeInherit`, `executeInherit` |
| I8 | Thu hồi không làm chứng chỉ có hiệu lực trở lại; chuyển giao và thao tác không liên quan không đổi hiệu lực chứng chỉ |
| I9 | Khóa của danh tính khác và owner không thu hồi được chứng chỉ, lá hay lô |
| I10 | Không thực thi chuyển giao trước `INHERIT_DELAY` |

Ngoài ra handler thử `revokeLeaf` bằng lá thay cho `inner` và bằng root thay cho lá (V34-01) — cả hai phải luôn thất bại.

```bash
npm install            # kéo forge-std về node_modules (devDependency)
forge test -vv         # INHERIT_DELAY = 48 giờ (mặc định); hoặc: npm run fuzz
DELAY=60 forge test    # INHERIT_DELAY = 60 giây (PowerShell: $env:DELAY=60; forge test)
```

Cấu hình trong `foundry.toml`: 1000 lượt × độ sâu 80, hạt giống cố định `0x20261009` để chạy lại ra
cùng chuỗi lời gọi. Foundry chỉ dùng cho fuzz — biên dịch, test đơn vị và deploy vẫn chạy bằng Hardhat.
Mỗi lượt ghi một dòng vào `cache-foundry/invariant-stats.txt` cho biết fuzz đã đi tới các nhánh khó
(chuyển giao sau lộ khóa, thu hồi bị vô hiệu, danh tính đóng băng) hay chưa.

Kết quả lần chạy gần nhất (09/10/2026, log gốc ở `docs/fuzz-report.txt`): **cả hai cấu hình đều pass**, mỗi cấu hình
1000 lượt × 80 = 80.000 lời gọi, không bất biến nào bị phá. Số lượt (trên 1000) đi tới nhánh khó — 48 giờ:
chuyển giao sau lộ khóa 395, thu hồi bị vô hiệu 315, danh tính đóng băng 782; 60 giây: 583 / 457 / 730.
Bộ fuzz do kiểm toán độc lập lượt 4 viết; khi cài lại 8 lỗi giả (gồm các lỗi cũ V2-01, V3-01, V34-01,
SC-03) vào contract, fuzz bắt được cả 8 — chi tiết ở `docs/AUDIT-V3.md` mục 18.

### Cấp theo lô

```bash
# terminal 1
npx hardhat node
# terminal 2 — deploy, công nhận một đơn vị, rồi cấp cả thư mục Demo/ thành MỘT lô
# (INHERIT_DELAY_SECONDS=60 trong .env để demo chuyển giao trong 1 phút — xem Mục 6)
npx hardhat run scripts/deploy.js --network localhost
npx hardhat run scripts/add-issuer.js --network localhost
BATCH_DIR=Demo npx hardhat run scripts/issue-batch.js --network localhost
# xác minh không cần trang web
FILE=Demo/DemoCert.pdf RECEIPT=receipts/<root>/001-xxxxxxxx.receipt.json \
  npx hardhat run scripts/verify-receipt.js --network localhost
```

Mỗi chứng chỉ trong lô có một **biên nhận** `.json` (root, salt, Merkle proof). Biên nhận
**không ghi tên tệp gốc** (thường là họ tên học viên); tệp biên nhận đặt tên theo số thứ tự + hash, kèm
`index.csv` ánh xạ tệp gốc → biên nhận chỉ để đơn vị cấp giữ trên máy mình. Học viên giữ biên
nhận và nộp kèm tệp; tab **Xác minh** có ô chọn biên nhận. Lá Merkle là
`keccak256(keccak256(abi.encode(certHash, holder, salt)))` — chuẩn OpenZeppelin `StandardMerkleTree`.
`holder` có thể là địa chỉ 0 khi học viên không có ví. Merkle proof được kiểm **trên chuỗi** trong
`verifyInBatch`, nên gọi thẳng qua Etherscan cũng đủ. Số đo gas: `docs/GAS-V3.md`
(`npx hardhat run scripts/gas-v3.js`).

## 5. Phân tích tĩnh (Slither)

```bash
pip install slither-analyzer
slither . --compile-force-framework hardhat
```

Cờ `--compile-force-framework hardhat` cần thiết vì repo có thêm `foundry.toml` (cho fuzz, mục 4); thiếu cờ này Slither sẽ chọn Foundry. Slither tự gọi `hardhat clean` và `hardhat compile --force` trước khi phân tích. Nếu báo lỗi
không tìm thấy trình biên dịch:

```bash
pip install solc-select
solc-select install 0.8.24
solc-select use 0.8.24
```

Loại contract tấn công, ví multisig mẫu, bản V2 lưu để đo gas và thư viện OpenZeppelin khỏi phạm vi quét:

```bash
slither . --compile-force-framework hardhat --filter-paths "contracts/attack|contracts/test|contracts/legacy|node_modules" --exclude-dependencies
```

Log gốc của lần chạy gần nhất lưu ở `docs/slither-report.txt`. Kết quả: **10 phát hiện trên 102
detector — 0 High, 0 Medium**. Ba cảnh báo `timestamp` (Low) là so sánh thời gian có chủ đích với cửa sổ
INHERIT_DELAY / 7 ngày / 30 ngày — lệch vài giây của người đề xuất block không đáng kể. Bảy cảnh báo
Informational đều có chủ đích: sáu ở vòng kiểm tên bằng assembly (`assembly`, `cyclomatic-complexity`,
4 × `too-many-digits` cho các mặt nạ bit) và một `naming-convention` cho `INHERIT_DELAY` (immutable,
giữ tên viết hoa như một hằng cấu hình).

Lưu ý khi đọc log trên Windows: Slither ghi output ra luồng `stderr`, PowerShell hiển thị nội
dung đó theo định dạng lỗi kèm `NativeCommandError`. Đó không phải lỗi chạy — dòng cuối
`analyzed (... contracts with 102 detectors)` xác nhận phân tích đã hoàn tất.

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
Kết quả in ra sẽ có địa chỉ contract (contract address) và độ trễ chuyển giao đã đặt.

**Độ trễ chuyển giao.** `INHERIT_DELAY` là tham số constructor, **bất biến** sau khi deploy.
`scripts/deploy.js` mặc định **48 giờ** (thiết kế production). Muốn demo chuyển giao ngay trong buổi
trình bày, thêm dòng `INHERIT_DELAY_SECONDS=60` vào `.env` trước khi deploy; `3600` là 1 giờ. Contract
nhận giá trị trong [60 giây, 7 ngày]. Trên mạng không phải local/testnet, script từ chối mọi giá trị
dưới 24 giờ.

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

**Bước 4** — phục vụ thư mục `app/` bằng localhost (ví dụ `npx http-server app -p 8080` hoặc
`python -m http.server 8080 -d app`), mở `http://localhost:8080`, rồi bấm **Kết nối ví**. Mở thẳng
`app/index.html` bằng `file://` cũng chạy với bản phát triển; **bản phát hành** (có SRI) thì trình
duyệt chặn trên `file://` — luôn phục vụ qua HTTP.

Giao diện **không nhận địa chỉ contract từ người dùng**. Địa chỉ, chainId và block deploy được ghi
cố định trong mã nguồn trang — `app/app.js` (`CONTRACT_ADDRESS`, `EXPECTED_CHAIN_ID`, `DEPLOY_BLOCK`).

Trên mạng Hardhat local, địa chỉ deploy là **tất định** nên giá trị mặc định đúng ngay. Nếu deploy
ra địa chỉ khác, `scripts/deploy.js` sẽ in ra đúng dòng cần sửa trong `app/app.js`.
Không có cách nào trỏ trang sang một contract khác ngoài sửa mã nguồn. Lập trình viên thử contract riêng thì sửa ba hằng số trên.

### Sáu tab

| Tab | Vai trò | Việc làm được | Cần kết nối ví? |
|---|---|---|---|
| **Xác minh** | Nhà tuyển dụng | Nộp tệp, **chọn đơn vị in trên chứng chỉ** (danh sách gồm cả đơn vị đã ngừng) **hoặc gõ tên** (tra thẳng `issuerByName`, không cần event), đối chiếu hash và trạng thái trên **nhiều RPC**; với chứng chỉ cấp theo lô thì nộp kèm biên nhận; **yêu cầu ứng viên ký** để chứng minh mình giữ ví ghi trên chứng chỉ | **Không** |
| Cấp chứng chỉ | Đơn vị phát hành | **Cấp lẻ**: chọn tệp PDF, băm ngay trên máy, ghi hash + ví học viên lên chuỗi. **Cấp theo lô**: chọn nhiều tệp, trang dựng cây Merkle, đăng một root, tải biên nhận cho từng học viên (bản sao lưu trên máy) | Có |
| **Chứng chỉ của tôi** | Học viên | Xem chứng chỉ của một địa chỉ ví — dán địa chỉ là đủ; **ký thông điệp xác nhận** cho nhà tuyển dụng | **Không** (ký thì cần) |
| Tra cứu & thu hồi | Đơn vị phát hành | Xem danh sách đã cấp, thu hồi, xóa dữ liệu off-chain | Có (để thu hồi) |
| **Đơn vị phát hành** | Bất kỳ ai | Danh bạ công khai dựng từ event (đang hoạt động + đã ngừng), đối chiếu `activeIssuerCount()` + **băng đỏ đề xuất chuyển giao đang chờ** + **thống kê kiểm toán theo đơn vị** (cấp, lô, thu hồi, thu hồi bị vô hiệu) + **nhật ký quản trị & đăng lô** + cảnh báo tên gần giống | **Không** |
| Quản trị sổ đăng ký | `owner` (CredVerify) | Công nhận / gỡ / bật lại đơn vị; **đề xuất → (INHERIT_DELAY, đọc từ hợp đồng) → thực thi / hủy** chuyển giao, khai báo khóa lộ; chuyển / hủy đề cử quyền owner | Có |

**Ba trong sáu tab chạy không cần ví.** `verifyCertificate` là hàm `view` — không gas, không chữ
ký. Chúng chạy trên một `JsonRpcProvider` chỉ-đọc, nên nhà tuyển dụng mở trang là dùng được ngay.
Bắt họ cài ví để *xem* một tấm bằng vừa vi phạm yêu cầu phi chức năng của đề tài, vừa là rào cản
áp dụng lớn nhất ngoài đời.

### Không phải nhập mã chứng chỉ nữa

`certId` **không do người dùng đặt**. Nó được sinh bằng `keccak256(địa chỉ issuer ‖ hash tệp)`,
và giao diện tính giá trị đó **ngay tại máy** bằng `solidityPackedKeccak256`, đúng công thức của
hàm `pure certIdOf` trên chuỗi — không tốn một vòng RPC nào.

Khi xác minh, người xác minh chọn đơn vị in trên chứng chỉ, trang gọi
`verifyCertificate(đơn vị, hash)` — **O(1)**, một lời gọi. Có thêm đường **gõ tên**: trang
chuẩn hóa tên (NFC, bỏ ký tự vô hình, đổi "–"/"—" thành "-", gộp khoảng trắng — cùng quy tắc
`scripts/lib/name.js` dùng khi công nhận, nên tên dán từ PDF vẫn khớp), gọi `issuerByName` ra khóa mới
nhất, rồi lần ngược `predecessorOf` về các khóa cũ — **mỗi bước đối chiếu mọi RPC**. Đường này **chỉ đọc
trạng thái hợp đồng** — chạy được cả khi RPC không còn trả event cũ và khi không còn website nào của
CredVerify. **Chuỗi là nguồn sự thật, website là bộ đệm:** tên nằm trong storage trên chuỗi; danh bạ
dựng từ event chỉ để gợi ý và sắp xếp.

Kết quả xác minh được đọc **cùng một block trên mọi RPC trong `RPC_URLS`** và chỉ hiện "Hợp lệ" khi
tất cả khớp — một RPC bị chiếm không tự quyết được kết luận. Bản local có một RPC; khi triển khai
công khai, liệt kê 2–3 nhà cung cấp độc lập (và chạy `node scripts/page-integrity.js --release` để CSP cho
phép đúng các host đó và gắn SRI). V3 không có đường "không biết đơn vị nào
cấp" (`findByHash` của V2, quét O(n) toàn bộ danh bạ): tên đơn vị cấp có sẵn trên chính tệp PDF, còn
vòng lặp O(n) thì vỡ khi số đơn vị đủ lớn (`docs/SCALE-NAMES.md`). Ô chọn đơn vị đánh dấu ⚠ những
đơn vị có tên trông giống nhau.

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
3. **Đời khóa.** Hiện "đời thứ N" trong chuỗi chuyển giao (từ V3 không còn trần 8 đời — quyền thu
   hồi kiểm bằng `identityOf`, O(1)).
4. **Canh ví đổi mạng / đổi tài khoản.** Trang nghe `chainChanged` và `accountsChanged`. Đổi
   sang sai mạng thì băng đỏ hiện **ngay**, chip Mạng và Vai trò bị xóa, và **toàn bộ quyền ghi
   bị ngắt** — nhưng ba tab đọc **vẫn chạy**, vì chúng không đi qua ví. Kiểm `chainId` một lần
   lúc kết nối là cần nhưng không đủ: trạng thái ví đổi được bất cứ lúc nào.
5. **Đơn vị cấp đã ngừng hoạt động mà không xoay khóa.** Khóa đã cấp bị gỡ quyền và danh
   tính **không** được chuyển sang một khóa đang hoạt động (đọc thẳng `currentKeyOf` + `issuerStatus`
   từ hợp đồng) → khung kết quả **màu vàng**, tiêu đề "Hợp lệ trên chuỗi — nhưng đơn vị cấp đã ngừng
   hoạt động", kèm giải thích: đơn vị có thể đã giải thể, hoặc bị gỡ vì khóa lộ / gian lận mà chưa
   xử lý; không còn ai thu hồi được chứng chỉ của khóa này (trừ khi CredVerify chuyển danh tính sang
   khóa sạch trong 7 ngày sau khi gỡ). Contract vẫn trả `valid = true` — owner không viết lại quá
   khứ; giao diện chỉ làm cho tình trạng đó **nhìn thấy được**. Áp dụng cả cấp lẻ lẫn cấp theo lô.

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
| 12 | Ảnh chụp màn hình | Ảnh giao diện V2 đã gỡ; chụp lại trên bản Sepolia |
| 13 | So sánh với baseline tập trung, kèm nguồn trích dẫn | Nửa đo nửa trích dẫn |
| 14 | Cam kết an toàn dữ liệu | Cố định |

**Kết quả kiểm thử nay được sinh từ một lần chạy thật.** Script tự gọi `npx hardhat test` rồi
đọc kết quả, không còn hằng số dán tay nào. Riêng Slither vẫn phải chạy thủ công (`slither .`) và cập nhật Mục 11.

Lưu ý: script deploy một contract **mới** mỗi lần chạy, nên địa chỉ sinh ra có thể sẽ khác địa chỉ đang dùng trong giao diện web.

## 9. Cấu trúc thư mục

```
contracts/CredentialRegistry.sol   -> smart contract lõi V3 (thành phần on-chain)
contracts/legacy/CredentialRegistryV2.sol -> bản V2 giữ nguyên, CHỈ để đo gas so sánh
contracts/test/MultiSigIssuerMock.sol     -> ví đa chữ ký tối giản, CHỈ dùng trong test
test/CredentialRegistry.test.js    -> bộ test V2, cập nhật cho V3
test/CredentialRegistryV3.test.js  -> bộ test phần mới của V3
test/XssViaRevertString.test.js    -> bằng chứng chống XSS qua chuỗi lỗi từ RPC / revert
test/UiShared.test.js              -> giao diện và script dùng cùng quy tắc (đọc hàm thật từ app/app.js)
test/foundry/Invariants.t.sol      -> fuzz bất biến Foundry: 10 bất biến, handler gọi ngẫu nhiên mọi hàm ghi
test/uiSource.js                   -> trích hàm của app/app.js bằng trình phân tích cú pháp, cho test
scripts/deploy.js                  -> script deploy (in ra 3 hằng số neo cần sửa trong app/app.js)
scripts/add-issuer.js              -> owner công nhận một đơn vị phát hành bằng dòng lệnh
scripts/issue-batch.js             -> cấp một thư mục tệp thành một lô, ghi biên nhận
scripts/verify-receipt.js          -> xác minh tệp + biên nhận không cần trang web
scripts/gas-v3.js                  -> đo gas thật: cấp lẻ × n so với lô, thu hồi, xoay khóa
scripts/lib/                       -> thư viện dùng chung (dựng cây Merkle, biên nhận, đọc hằng neo)
scripts/collect-evidence.js        -> chạy kịch bản demo và sinh EVIDENCE.md
scripts/seed-sepolia.js            -> dựng bằng chứng công khai trên testnet bằng một lệnh
scripts/scale-probe.js             -> chứng minh chi phí không đổi theo số đơn vị phát hành
scripts/scale-names.js             -> đo chi phí lưu tên và giới hạn của các hàm duyệt danh bạ đã gỡ
scripts/lib/directory.js           -> dựng danh bạ từ event (cùng thuật toán với giao diện)
scripts/lib/name.js                -> quy tắc tên đơn vị: chuẩn hóa + danh sách cho phép chữ tiếng Việt — dùng chung với giao diện, contract kiểm lại
scripts/page-integrity.js          -> đồng bộ connect-src theo RPC_URLS; --release gắn SRI cho app.js/app.css; --check
app/index.html                     -> khung trang 6 tab + CSP (không có script nội tuyến)
app/app.js                         -> toàn bộ mã giao diện, gồm 3 hằng số neo và RPC_URLS
app/app.css                        -> kiểu dáng
hardhat.config.js                  -> cấu hình Hardhat
foundry.toml                       -> cấu hình Foundry, chỉ cho fuzz bất biến
docs/slither-report.txt            -> log gốc của lần chạy Slither gần nhất
docs/fuzz-report.txt               -> log gốc của lần chạy fuzz bất biến gần nhất (hai cấu hình INHERIT_DELAY)
docs/GAS-BASELINE.md               -> số đo gas qua ba phiên bản kiến trúc V0–V2
docs/GAS-V3.md                     -> số đo gas V3 (sinh bởi scripts/gas-v3.js)
docs/AUDIT-V3.md                   -> nhật ký kiểm toán: lỗi đã tìm, đã sửa và còn mở của V3, theo từng đợt
docs/SCALE-NAMES.md                -> số đo khả năng mở rộng của việc lưu tên đơn vị
docs/archive/                      -> kiến trúc V1 đã bị bác bỏ: contract, 57 test
.env.example                       -> mẫu biến môi trường
picture/logo.png                   -> biểu tượng trang (ảnh chụp màn hình sẽ thêm sau khi deploy Sepolia)
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
Cấp lẻ:   None ---issueCertificate()---> Issued ---revokeCertificate()---> Revoked
Theo lô:  (không có lô) ---publishBatch(root)---> lô tồn tại
              ├─ revokeLeaf(inner + proof) -> riêng chứng chỉ đó Revoked (lá = keccak(inner))
              └─ revokeBatch()             -> mọi chứng chỉ trong lô Revoked
```

- **Không có đường quay lại từ `Revoked`** khi lần thu hồi do một khóa hợp lệ thực hiện, và **không cấp lại được cùng một tệp** sau khi đã thu hồi. Ngoại lệ duy nhất: lần thu hồi do một khóa **đã được tuyên bố lộ** thực hiện **từ mốc lộ trở đi** bị vô hiệu — tự động, trong hàm xác minh.
- `verifyCertificate` là hàm `view`: ai cũng gọi được, miễn phí, **không bao giờ bị chặn** — kể cả khi đơn vị cấp đã bị gỡ quyền.

### Ba bên, ba quyền tách rời

| Bên | Được làm | **Không được làm** |
|---|---|---|
| **CredVerify** (`owner`) | công nhận đơn vị phát hành, đặt tên, chuyển giao danh tính issuer | **cấp** · **thu hồi** · sửa/xóa bản ghi đã có · **trở thành issuer** (kể cả qua chuyển quyền owner) |
| **Trung tâm** (`issuer`) | cấp và thu hồi chứng chỉ *của chính mình* | tự công nhận mình · đụng vào chứng chỉ của trung tâm khác |
| **Nhà tuyển dụng** | đọc và xác minh, không cần xin phép ai, không cần ví | ghi bất cứ thứ gì |

Lời hứa phát biểu chính xác: CredVerify **nói dối được** về *ai là ai*; nó **không nói dối được** về *ai đã làm gì*; và nó **không nói dối được vô hình** — mọi `addIssuer` là một event vĩnh viễn, công khai, hiện ngay trong tab **Đơn vị phát hành**. Đây là lời hứa **quy trách nhiệm**, không phải lời hứa **ngăn chặn**.

Ranh giới này được cưỡng chế **bằng test**: bộ kiểm thử có một test liệt kê tường minh cả 14 hàm ghi của contract, nên thêm bất kỳ hàm mới nào là test vỡ ngay. Một địa chỉ từng là issuer không bao giờ nhận được quyền owner, và owner (kể cả owner đang được đề cử) không bao giờ được công nhận làm issuer — V2 có lỗ ở đây, xem `docs/AUDIT-V3.md`.

### Hai bất biến nghiệp vụ

**(1) Thu hồi bởi một khóa hợp lệ là VĨNH VIỄN.** Cho phép cấp lại một bản ghi đã `Revoked` chính là
cài đặt một quyền ghi lại lịch sử: nhà tuyển dụng tra tháng 3 thấy *Revoked*, tra lại tháng 8 thấy
*Issued*. Chứng chỉ sửa lại là một **tệp** khác, nên là một **hash** khác, nên là một bản ghi khác.

*Phát biểu đầy đủ:* thu hồi do một khóa **đã được tuyên bố lộ**, thực hiện từ mốc lộ trở đi, bị
**vô hiệu**. Lý do: nếu không, kẻ chiếm được khóa của một trung tâm thu hồi được toàn bộ chứng chỉ thật
trong vài giao dịch, và không ai sửa được (PoC F-01 của bản kiểm toán). Lập luận chống "nói hai lời"
vẫn giữ: lịch sử không bị xóa — bản ghi và event thu hồi gốc còn nguyên, việc tuyên bố lộ là một event
công khai (`KeyCompromised`, kèm thời điểm công bố `compromiseDeclaredAt`), mốc lộ không lùi quá
30 ngày và đi qua độ trễ chuyển giao.

**(2) Mỗi issuer có KHÔNG GIAN TÊN RIÊNG** nhờ `certId = keccak256(issuer ‖ certHash)`, và **tên
hiển thị là duy nhất** nhờ `nameHolder`. Tên **không bao giờ được trả tự do**, kể cả khi gỡ quyền —
nếu trả lại thì `removeIssuer` + `addIssuer` thành đường vòng để owner đổi danh tính một địa chỉ
mà không ai thấy.

### Quy trình xử lý sự cố lộ khóa

| Bước | Thao tác |
|---|---|
| 1 | `removeIssuer(khóa xấu)` **ngay** — tức thì cắt quyền cấp và thu hồi của khóa đó (hành động bảo vệ không qua độ trễ) |
| 2 | `proposeInherit(khóa xấu, khóa sạch, compromisedSince)` trong `RECOVERY_WINDOW` = 7 ngày kể từ lúc gỡ; `compromisedSince` = mốc sớm nhất khóa có thể đã bị lộ (không ở tương lai, không lùi quá 30 ngày) |
| 3 | Sau `INHERIT_DELAY` (tham số deploy: 48 giờ ở production; bản demo có thể 1 phút) (và trước khi đề xuất hết hạn 7 ngày sau đó): `executeInherit(khóa xấu)`. Từ đây mọi lần thu hồi do khóa xấu làm từ mốc lộ **tự động vô hiệu**, mọi chứng chỉ/lô nó cấp từ mốc lộ bị gắn cờ `issuedAfterCompromise` |
| 4 | Khóa sạch thu hồi những bằng giả đã biết (`revokeBatch` / `revokeCertificate`) và cấp lại cho học viên thật những chứng chỉ thật cấp trong khoảng từ mốc lộ tới lúc phát hiện |
| 5 | Đối chiếu nhật ký quản trị ở tab **Đơn vị phát hành** |

> **Không bao giờ `restoreIssuer` một khóa nghi bị lộ.** V2 bắt buộc bước này trước khi chuyển
> giao được, và giữa lúc bật lại với lúc chuyển giao, kẻ giữ khóa có thể thu hồi vĩnh viễn chứng
> chỉ thật. V3 đã bỏ sự bắt buộc đó; `restoreIssuer` chỉ còn dành cho trường hợp gỡ nhầm một khóa
> chắc chắn còn an toàn, và cũng chỉ trong 7 ngày.
>
> **Danh tính đã nghỉ thì đóng băng.** Quá 7 ngày sau `removeIssuer`, không ai — kể cả owner —
> bật lại, chuyển giao, hay thu hồi được gì nhân danh khóa đó. Đây là điều kiện để lời hứa "vẫn
> xác minh được sau khi trung tâm giải thể" đứng vững: nếu không có hạn, owner có thể chuyển danh
> tính của trung tâm đã giải thể sang ví của mình rồi thu hồi toàn bộ chứng chỉ của nó.

Nhóm 10 của bộ test V2 và mục B, D3 của bộ test V3 ghim đúng quy trình này.

## 11. Giới hạn đã biết của MVP

- **Giả định tin cậy: owner và issuer là ví đa chữ ký.** Phân tích an toàn của đề tài **giả định**
  khi triển khai thật, `owner` (CredVerify) và mỗi `issuer` là ví đa chữ ký (ví dụ Safe k-trên-n,
  khuyến nghị 2-trên-3), không phải một khóa riêng lẻ. Contract không cần sửa cho việc này: mọi kiểm
  quyền dựa trên `msg.sender`, chuyển quyền owner hai bước, issuer là contract đã có test (nhóm E).
  **Bản MVP/demo dùng ví một khóa**, nên các rủi ro dưới đây ở bản demo cao hơn mô hình giả định.
  Giả định này bịt "một khóa bị lộ" và "một người lạm quyền", **không** bịt việc k người ký cùng
  thông đồng. Chi tiết: `docs/AUDIT-V3.md` mục 14.
- **`owner` là neo tin cậy.** CredVerify chuyển giao được danh tính một trung tâm đang hoạt động
  sang ví của chính mình. Contract buộc việc đó qua **đề xuất công khai + thời gian chờ** (băng đỏ ở tab
  **Đơn vị phát hành**), đủ để trung tâm thật thấy và phản đối — nhưng owner một mình vẫn làm được.
  **Rủi ro chấp nhận (V32-01):** owner chọn mốc lộ khóa, nên có thể vô hiệu thu hồi hợp pháp hoặc gắn
  cờ chứng chỉ thật trong tối đa 30 ngày trước đó; trung tâm không tự hủy được đề xuất nhắm vào mình
  (quyết định thiết kế). Rủi ro này được làm **minh bạch**: kết quả xác minh trả cả mốc lộ lẫn thời
  điểm công bố, giao diện hiện "công bố lúc X, lùi về Y". **Future work:** test owner là ví đa chữ ký và
  giao diện đề xuất giao dịch qua Safe (contract đã chấp nhận địa chỉ contract làm owner/issuer; test
  nhóm E chứng minh cho issuer). Phân biệt hai tác nhân: **insider chủ
  động lạm quyền** và **kẻ ngoài chiếm khóa**.
- **Tên issuer chưa phải bằng chứng danh tính ngoài đời.** `issuerName` là metadata do owner công
  nhận. Contract chỉ nhận tên trong **danh sách cho phép** (chữ cái ASCII, chữ số, dấu cách,
  `( ) , -`, 134 chữ có dấu tiếng Việt dạng dựng sẵn) — chữ Kirin/Hy Lạp, ký tự vô hình, NFD, dấu chấm
  và ký tự đặc biệt bị từ chối ngay trên chuỗi. Còn lại tên khác nhau chỉ ở chữ hoa/thường hoặc
  l/I, 0/O: giao diện cảnh báo, và có một test **pass** ghim đúng giới hạn này. Hệ quả của danh sách
  cho phép: tên viết tắt có dấu chấm ("TP.", "Cty.") phải viết đầy đủ. Lời giải đúng là buộc tên phải **chứng minh được**
  (gắn quyền kiểm soát tên miền), ngoài phạm vi MVP.
- **Chứng chỉ theo lô cần biên nhận.** Mất biên nhận (salt + proof) thì không xác minh được chứng
  chỉ đó nữa. Giao diện lưu bản sao biên nhận trong `localStorage` của máy đơn vị cấp (tab
  **Tra cứu & thu hồi**: tải lại, thu hồi từng chứng chỉ hoặc cả lô); nút "Xóa dữ liệu off-chain" xóa
  cả bản sao này. In biên nhận thành mã QR trên chứng chỉ là future work. Tab **Chứng chỉ của tôi**
  chỉ áp dụng cho chứng chỉ cấp lẻ. `leafCount` của lô do đơn vị tự khai, contract
  không kiểm được.
- **(Đã sửa ở V3) Chuỗi kế nhiệm giới hạn 8 đời.** V3 kiểm quyền thu hồi bằng `identityOf`, O(1),
  không còn trần.
- **(Đã xử lý) Truy vấn O(n) trên danh bạ.** Đo trên V2: `listActiveIssuers` vỡ ở ~3.200
  đơn vị (trần `eth_call` 50 triệu gas) hoặc ~630 (trần 10 triệu); `findByHash` ở ~8.800 / ~1.700.
  V3 không có ba hàm duyệt danh bạ này; contract toàn O(1). **Cái giá chuyển sang giao diện:**
  danh bạ dựng từ event, số lời gọi `eth_getLogs` tăng theo tuổi contract (~263 lời gọi/năm với
  khúc 10.000 block). Bản triển khai thật nên dùng indexer — mục 12.1.
- **Tên đơn vị lưu trên chuỗi — có chủ đích.** Tên là mắt xích quyết định người xác minh tra ở sổ nào,
  nên nằm trong storage trên chuỗi chứ không ở website. Mỗi 32 byte tên thêm ~28.400 gas khi công
  nhận (một lần cho mỗi đơn vị, gồm cả bước kiểm tên dạng chuẩn); tên giới hạn 256 byte UTF-8; xoay
  khóa không chép lại tên. Contract kiểm danh sách cho phép trong một vòng assembly (chỉ đọc calldata);
  phần chuẩn hóa (NFC, đổi gạch dài, gộp khoảng trắng) là quy ước ngoài chuỗi ai cũng tự kiểm được.
  Số đo: `docs/SCALE-NAMES.md`.
- **Khai báo khóa lộ chỉ làm được lúc chuyển giao.** Nếu một khóa đã xoay định kỳ (không khai báo lộ)
  rồi sau này mới phát hiện từng bị lộ, contract không có đường khai báo bổ sung.
- **`valid` không tự tắt khi khóa lộ.** `verifyCertificate`/`verifyInBatch` vẫn trả `valid = true` cho
  chứng chỉ do khóa lộ cấp sau mốc lộ, kèm cờ `issuedAfterCompromise = true` — nếu contract tự đặt
  `valid = false` thì owner (qua mốc lộ) có quyền vô hiệu chứng chỉ thật. Người gọi thẳng qua Etherscan
  **phải đọc cờ này**; giao diện và `verify-receipt.js` đã hiện nó thành "KHÔNG ĐÁNG TIN".
- **Ví học viên là dữ liệu công khai**, bút danh nhưng **liên kết được**; event index theo `holder`
  nên ai cũng liệt kê được toàn bộ chứng chỉ của một ví. MVP **ưu tiên auditability hơn privacy**,
  có chủ đích.
- **`localStorage` thay cho backend.** Tên học viên và tên khóa học nằm trong bộ nhớ trình duyệt.
  Có nút **Xóa dữ liệu off-chain**. Hệ thống thật cần máy chủ có kiểm soát truy cập và mã hóa theo
  Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15.
- **CSP và SRI.** Không có script nội tuyến: `script-src 'self'` + CDN của ethers (có
  SRI), không `'unsafe-inline'` — sửa `app.js` không cần tính lại gì. Khi phát hành,
  `node scripts/page-integrity.js --release` gắn `integrity` cho `app.js` và `app.css`, nên hash của
  riêng `index.html` (hoặc CID IPFS) bao trọn cả trang: kẻ chiếm host sửa `app.js` thì trình duyệt từ
  chối chạy. `test/Csp.test.js` vỡ nếu `connect-src` hay integrity lệch. `connect-src`
  chỉ gồm các RPC đã khai báo; không còn Google Fonts. `style-src` vẫn `'unsafe-inline'` (thuộc tính
  `style=`). `esc()` và `bannerText()` vẫn là lớp phòng thủ chính — test ở
  `test/XssViaRevertString.test.js`. `frame-ancestors` đã được gỡ khỏi thẻ `<meta>` vì trình duyệt
  bỏ qua nó ở đó; phải đặt bằng HTTP header khi phát hành.
- **Số đo độ trễ lấy trên mạng local.** Hardhat đào block tức thì nên độ trễ **ghi** không đại diện cho mạng thật; độ trễ **đọc** thì vẫn có ý nghĩa. Giải thích ở Mục 9.4 `EVIDENCE.md`.
- **Không công kiến trúc V1 hoàn chỉnh.** Kiến trúc V1 hoàn chỉnh được tác giả đo ở phiên bản cũ, chỉ được ghi lại sơ bộ trong `docs/archive`, không được push lên gitHub trong quá trình xây dựng nên có khả năng không thể tái lập.

## 12. Hướng triển khai thật

Bản trong repo chạy ở cấu hình **thử nghiệm** (mạng local/testnet, ví một khóa, một RPC; `INHERIT_DELAY` chọn lúc deploy).
Khi đưa vào vận hành thật cần:

| Hạng mục | Bản thử nghiệm | Triển khai thật | Ghi chú |
|---|---|---|---|
| Owner, issuer | Ví một khóa | Ví đa chữ ký (Safe k-trên-n, khuyến nghị 2-trên-3) | Giả định tin cậy, mục 11 và `docs/AUDIT-V3.md` 14.3 |
| `INHERIT_DELAY` | `INHERIT_DELAY_SECONDS` trong `.env` (ví dụ 60 hoặc 3600) | Mặc định 48 giờ — để trống biến này | Tham số constructor (V341-01), bất biến; script từ chối < 24 giờ trên mạng thật |
| `RPC_URLS` | Một RPC local | 2–3 RPC độc lập | Kết quả xác minh chỉ kết luận khi các RPC khớp nhau |
| Phát hành trang | Bản phát triển, không SRI | `page-integrity.js --release` (SRI) và host đặt được HTTP header (`frame-ancestors`) | Mục 7 và 11 |
| Danh bạ, nhật ký, thống kê | Trình duyệt tự quét event | **Indexer** | Mục 12.1 |

### 12.0. Triển khai lên Sepolia (bản V3 chính thức trên testnet)

1. **Chuẩn bị `.env`** (đã nằm trong `.gitignore`), theo `.env.example`:
   - `SEPOLIA_PRIVATE_KEY`: ví **chỉ dùng cho testnet**, có khoảng 0,05 ETH Sepolia;
   - `SEPOLIA_RPC_URL`;
   - `ETHERSCAN_API_KEY`: để xác minh mã nguồn;
   - `INHERIT_DELAY_SECONDS`: để trống là 48 giờ; bản demo đặt 60 hoặc 3600.
2. **Kiểm lại toàn bộ trước:** `npx hardhat test`.
3. **Deploy và dựng dữ liệu mẫu bằng một lệnh:** `npx hardhat run scripts/seed-sepolia.js --network sepolia`.
   - Script deploy contract, công nhận một đơn vị demo, cấp lẻ, thu hồi, đăng lô, thu hồi một lá, rồi ghi
     `docs/sepolia-evidence.md`.
   - Khóa ví demo ghi vào `demo-issuer.key`, biên nhận ghi vào `receipts/sepolia-demo/`; cả hai **không commit**.
   - Chỉ cần contract trống thì dùng `scripts/deploy.js` thay cho bước này.
4. **Xác minh mã nguồn:** `npx hardhat verify --network sepolia <ĐỊA_CHỈ> <INHERIT_DELAY tính bằng giây>`.
   Tham số constructor bắt buộc, phải đúng giá trị đã deploy (script in ra).
5. **Cập nhật hằng neo trong `app/app.js`:** `CONTRACT_ADDRESS`, `EXPECTED_CHAIN_ID = 11155111n`, `DEPLOY_BLOCK`, và
   `RPC_URLS` với 2–3 RPC độc lập (script in sẵn). Chạy `node scripts/page-integrity.js --release`, rồi phát hành
   thư mục `app/` trên host đặt được header.
6. **Ghi bằng chứng:** dán `docs/sepolia-evidence.md` vào EVIDENCE hoặc bài, kèm địa chỉ trên Etherscan.

### 12.1. Indexer cho danh bạ, nhật ký và thống kê

**Vấn đề.** Contract chỉ trả lời nhanh các câu hỏi có sẵn khóa tra, ví dụ "chứng chỉ X của đơn vị Y còn hiệu lực
không". Các câu hỏi tổng hợp thì giao diện phải đọc lại toàn bộ lịch sử event từ `DEPLOY_BLOCK`, ngay trong trình
duyệt. Đó là danh bạ đơn vị, nhật ký quản trị, đề xuất chuyển giao đang chờ, thống kê kiểm toán theo đơn vị và tab
"Chứng chỉ của tôi".
- **Số lời gọi tăng theo tuổi contract.** Khúc quét 10.000 block cho ra khoảng 263 lời gọi `eth_getLogs` cho mỗi năm
  tuổi, tính cho **mỗi lượt quét**. Tab Đơn vị phát hành hiện chạy ba lượt (danh bạ, đề xuất đang chờ, nhật ký kèm
  thống kê).
- **Lượng dữ liệu tăng theo tổng số chứng chỉ cấp lẻ** (bảng thống kê). RPC công khai giới hạn số event mỗi lần trả;
  vượt giới hạn thì nhật ký và thống kê không đọc được.
- **Lịch sử cũ có thể biến mất.** Theo EIP-4444, node có thể ngừng phục vụ lịch sử cũ.

**Indexer là gì.** Một chương trình chạy liên tục trên máy chủ:
1. Đọc event của contract một lần từ `DEPLOY_BLOCK`.
2. Sau đó theo dõi block mới.
3. Ghi vào cơ sở dữ liệu, sắp sẵn theo đơn vị, theo ví học viên, theo lô.

Giao diện hỏi indexer bằng một yêu cầu thay vì hàng trăm lời gọi RPC. Lựa chọn phổ biến:
- **The Graph** (subgraph);
- **Ponder** (TypeScript, gọn — kiểm toán lượt 1 gợi ý);
- **tự viết** một script Node ghi vào SQLite/Postgres. `scripts/lib/directory.js` đã có sẵn thuật toán dựng danh bạ
  từ event, dùng lại được.

**Ranh giới tin cậy — indexer chỉ là lớp tiện lợi, không phải nguồn sự thật.**
- Chỉ dùng cho danh bạ, nhật ký, thống kê và gợi ý. **Kết luận "hợp lệ / đã thu hồi" luôn đọc thẳng contract** qua
  nhiều RPC (`crossCall`), và đường tra theo tên chỉ đọc trạng thái (`issuerByName` → `predecessorOf`). Indexer sai
  hay ngừng thì xác minh **vẫn đúng**, chỉ danh bạ và thống kê chậm lại (quay về tự quét).
- **Kiểm chéo:**
  - số đơn vị đang hoạt động phải khớp `activeIssuerCount()` trên chuỗi, như danh bạ hiện nay;
  - mỗi bản ghi kèm số block và mã giao dịch để ai cũng tra lại được;
  - dữ liệu gốc công khai, nên bất kỳ ai cũng dựng được indexer riêng để đối chiếu.
- Indexer **không** giữ dữ liệu cá nhân: chỉ lưu những gì đã công khai trên chuỗi (hash, địa chỉ ví, tên đơn vị, mốc
  thời gian). Biên nhận và tên học viên vẫn không đi qua máy chủ.

**Khi nào cần.** Chưa cần cho bản demo hay testnet (contract còn trẻ, quét trực tiếp vẫn nhanh). Cần khi contract
được khoảng một năm tuổi, hoặc khi RPC bắt đầu từ chối lượt quét. Đây là đánh đổi có chủ ý của V3: bỏ các hàm view
O(n) (vỡ ở khoảng 630–3.200 đơn vị, `docs/SCALE-NAMES.md`) để contract không có trần, đổi lại phần tổng hợp chuyển
ra ngoài chuỗi.

