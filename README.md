# CredVerify - MVP (giai đoạn 1: smart contract lõi)

Đây là phần khởi đầu của MVP: smart contract `CredentialRegistry` cấp/xác minh/thu hồi
chứng chỉ khóa học, cùng bộ test tự động. Frontend và backend off-chain sẽ được thêm ở
giai đoạn sau (xem TODO cuối file).

## 1. Yêu cầu môi trường

- Node.js >= 18 (kiểm tra bằng `node -v`)
- npm (đi kèm Node.js)
- Kết nối internet (lần đầu chạy `hardhat compile`, Hardhat sẽ tự tải trình biên dịch Solidity)

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

Bộ test trong `test/CredentialRegistry.test.js` gồm:
- **Happy path**: cấp chứng chỉ, xác minh đúng, thu hồi chứng chỉ.
- **Negative/adversarial tests** (hành vi sai bị chặn): người không phải issuer cố cấp
  chứng chỉ, issuer sai cố thu hồi chứng chỉ của issuer khác, cấp trùng id, thu hồi 2 lần,
  người không phải owner cố thêm issuer mới.

Nếu tất cả test hiện chữ xanh (passing), nghĩa là logic lõi đã đúng như thiết kế.

## 5. Chạy thử trên mạng local (tùy chọn, để xem giao dịch thật)

Mở 2 terminal:

**Terminal 1** - khởi động mạng blockchain local:
```bash
npx hardhat node
```
Terminal này sẽ hiện ra danh sách 20 tài khoản demo kèm private key (chỉ dùng để test,
không bao giờ dùng các key này cho tài khoản thật).

**Terminal 2** - deploy contract lên mạng local vừa chạy:
```bash
npx hardhat run scripts/deploy.js --network localhost
```
Kết quả in ra sẽ có địa chỉ contract (contract address)

## 6. Chạy ứng dụng web (frontend)

Cần MetaMask cài trong trình duyệt.

**Bước 1** — chạy mạng local và deploy (mục 5 ở trên). Ghi lại địa chỉ contract in ra.

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

### Bốn tab

| Tab | Vai trò | Việc làm được |
|---|---|---|
| Cấp chứng chỉ | Đơn vị phát hành | Chọn tệp PDF, hệ thống băm tệp ngay trên máy, ghi mã + hash + ví học viên lên chuỗi |
| Xác minh | Nhà tuyển dụng | Nhập mã và nộp tệp, đối chiếu hash và trạng thái |
| Tra cứu & thu hồi | Đơn vị phát hành | Xem danh sách đã cấp, thu hồi chứng chỉ |
| Quản trị đơn vị phát hành | Chủ sở hữu | Cấp/thu quyền phát hành cho một ví |

### Nhật ký bằng chứng

Bảng bên phải ghi lại mọi giao dịch (tx hash, block, gas) và mọi thao tác bị chặn kèm lý do
revert. Nút **Xuất EVIDENCE.md** tải về tệp markdown dùng làm nguyên liệu cho D8.

**Lưu ý về lưu trữ off-chain:** tên học viên, tên khóa học và danh sách chứng chỉ hiện được
giữ trong `localStorage` của trình duyệt để mô phỏng cơ sở dữ liệu của đơn vị đào tạo. Đây là
giới hạn của MVP — hệ thống thật cần máy chủ có kiểm soát truy cập, mã hóa và chính sách lưu 
trữ theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15.

## 7. Sinh EVIDENCE.md tự động

```bash
# Terminal 1
npx hardhat node

# Terminal 2
npx hardhat run scripts/collect-evidence.js --network localhost
```

Script chạy trọn kịch bản nghiệm thu ở Mục 10.1 của đề bài rồi ghi `EVIDENCE.md` ở thư mục
gốc, gồm: chain ID, phiên bản compiler, contract address, deployment tx, 3 giao dịch chính,
4 hành vi bị chặn, bảng event, bảng thay đổi trạng thái và bảng đối chiếu thao tác giao diện
với hàm contract.

Lưu ý: script deploy một contract **mới** mỗi lần chạy, nên địa chỉ sinh ra sẽ khác địa chỉ
đang dùng trong giao diện web. 

## 8. Cấu trúc thư mục

```
contracts/CredentialRegistry.sol   -> smart contract lõi (thành phần on-chain)
test/CredentialRegistry.test.js    -> test tự động (M8)
scripts/deploy.js                  -> script deploy (M9 - khả năng tái lập)
scripts/collect-evidence.js        -> chạy kịch bản demo và sinh EVIDENCE.md (D8)
app/index.html                     -> ứng dụng web, chạy trực tiếp trong trình duyệt (M10)
hardhat.config.js                  -> cấu hình Hardhat
```

## 9. Giải thích nhanh state machine

```
None ---issueCertificate()---> Issued ---revokeCertificate()---> Revoked
```

- Chỉ địa chỉ được cấp quyền `isIssuer` mới gọi được `issueCertificate`.
- Chỉ đúng issuer đã cấp một chứng chỉ mới thu hồi được chứng chỉ đó.
- Không có đường quay lại từ `Revoked`.

## 10. TODO tiếp theo

- [x] Smart contract lõi + test tự động
- [x] Frontend web với 4 màn hình và nhật ký bằng chứng (M10)
- [x] `EVIDENCE.md` sinh tự động qua `scripts/collect-evidence.js` (D8)
- [ ] Điền phần "Cần bổ sung thủ công" cuối EVIDENCE.md
- [ ] Thay `localStorage` bằng backend thật, hoặc nêu rõ đây là giới hạn MVP trong báo cáo (M4)
- [ ] Static analysis (Slither hoặc tương đương) cho contract (mục 5.2 đề bài)
- [ ] Đo gas/độ trễ và bảng so sánh với baseline tập trung (mục 4.4)
