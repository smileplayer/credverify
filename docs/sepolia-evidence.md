# Bằng chứng trên testnet công khai (Sepolia, 11/10/2026)

Sinh bởi `npx hardhat run scripts/seed-sepolia.js --network sepolia`; mã nguồn đã xác minh trên Etherscan
(**Exact Match**, solc 0.8.24, optimizer 200, constructor `inheritDelay = 60`). `INHERIT_DELAY` = 60 giây là
**cấu hình demo** để trình diễn chuyển giao danh tính trong buổi bảo vệ; thiết kế production là 48 giờ
(`scripts/lib/delay.js` từ chối < 24 giờ trên mạng thật).

| Hạng mục | Giá trị |
|---|---|
| Mạng | sepolia |
| Chain ID | `11155111` |
| Contract address | `0x672e08DBF5Ce118a235E36C235b53Fa251dDe7F6` |
| Block deploy (DEPLOY_BLOCK) | 11890480 |
| INHERIT_DELAY (bất biến) | 60 giây (1 phút) — đọc lại: `INHERIT_DELAY()` = 60 |
| Xem trên explorer | https://sepolia.etherscan.io/address/0x672e08DBF5Ce118a235E36C235b53Fa251dDe7F6 |
| Ví owner (CredVerify) | `0x103E419e5e9fB70a55F66dF261661ACf498Ee2dA` |
| Ví đơn vị phát hành | `0x4B89a5fEa7727707b2Db99298Ba8AE59FCb2727A` |
| Ví học viên | `0xCf422cb92CcE4A922F80785DeD766F357744aB0F` |

| # | Thao tác | Tx hash | Block | Gas |
|---|---|---|---|---|
| 1 | Deploy CredentialRegistry | `0xcb1a3e642d1c2cab42463b54046286e44eb4324a9e4f4da3b759ad1c3fb1c10a` | 11890480 | 22497316 |
| 2 | Chuyển 0,01 ETH sang ví issuer | `0xbdfbf891bc999b25dd1aee76b88c116b27718523f69ffce60c055a897068345b` | 11890482 | 21000 |
| 3 | addIssuer — owner công nhận "Trung tam dao tao Demo" | `0xc25fe0f341edc1a588c499f9c12b7d7598628dc022ce5c578e01eeca18e318c0` | 11890484 | 689885 |
| 4 | issueCertificate — cấp chứng chỉ CÒN HIỆU LỰC | `0xdf9cbed2c0433dcf7d7b4c48d7174e3c0bc38e55ad7dfd82a27999b22ac118e6` | 11890486 | 242795 |
| 5 | issueCertificate — cấp chứng chỉ thứ hai | `0x1a4b8a7aed41abd58002ba56a93346979e11e23de371a5f63435b81e4f59d5f0` | 11890488 | 242783 |
| 6 | revokeCertificate — thu hồi chứng chỉ thứ hai | `0x584af9f2d08e051e1f8880b71ca8533d619a7f798de94f3f211fd363f3edbf80` | 11890490 | 157473 |
| 7 | publishBatch — đăng lô 4 chứng chỉ bằng một Merkle root | `0x4b69a8ce8e1b4d70c8e7f56a26f9356bfcf8d665f121863598b9870bd3e2dfe5` | 11890492 | 242182 |
| 8 | revokeLeaf — thu hồi MỘT chứng chỉ trong lô (kèm Merkle proof) | `0x613240748260b39b4d915666d35b20541672ed26c92f517b7e67433a1046350f` | 11890494 | 141828 |

Trạng thái đọc lại từ chuỗi công khai sau khi chạy xong:

| Bản ghi | valid | status | Đơn vị cấp |
|---|---|---|---|
| Chứng chỉ 1 (`Demo/DemoCert.pdf`) | true | 1 (Issued) | Trung tam dao tao Demo |
| Chứng chỉ 2 (đã thu hồi) | false | 2 (Revoked) | Trung tam dao tao Demo |

Lô `0xd3a5c833a8818b3ca72d9734702d4b8933c022f5ff5f38dd55291caf46c77e7c` (root `0x124f9509936beb4eebc46514508a6205eb25906164906cda6d6265a2ff1e8c75`, 4 chứng chỉ), xác minh bằng `verifyInBatch`:

| Bản ghi | valid | inBatch | leafRevoked |
|---|---|---|---|
| `Demo/DemoCert2.pdf` | true | true | false |
| `lo-demo-3.txt` (đã thu hồi lá) | false | true | true |

Biên nhận của lô ghi ở `receipts/sepolia-demo/` (không commit — chứa salt).

**Cập nhật `app/app.js` trước khi phát hành trang, rồi chạy `node scripts/page-integrity.js --release`:**

```js
const CONTRACT_ADDRESS  = "0x672e08DBF5Ce118a235E36C235b53Fa251dDe7F6";
const EXPECTED_CHAIN_ID = 11155111n;
const DEPLOY_BLOCK = 11890480;
const RPC_URLS = ["https://ethereum-sepolia-rpc.publicnode.com", "<RPC độc lập thứ hai>"];   // đối chiếu ≥ 2 nhà cung cấp
```

## Đối chiếu gas: Sepolia (sau Glamsterdam) và luật hiện hành của mainnet

Sepolia bật nâng cấp **Glamsterdam** ngày 06/10/2026 (13:53:36 UTC). Nâng cấp này gồm **EIP-8037**: tạo state mới
(tài khoản, ô storage, bytecode contract) tính theo một đồng hồ gas riêng, khoảng 1.530 gas mỗi byte state
(bản nháp, EIP còn ở trạng thái Review). Mainnet **chưa** có ngày kích hoạt. Hardhat 2.29 mặc định hardfork
**Osaka (Fusaka)** — đúng luật mainnet đang chạy — nên cột "Hardhat local" là chi phí trên mainnet hiện nay.

Cột "Hardhat local" đo bằng chính kịch bản này trên mạng Hardhat trong tiến trình (cùng 8 thao tác, cùng
`INHERIT_DELAY` = 60): `INHERIT_DELAY_SECONDS=60 npx hardhat run scripts/seed-sepolia.js`.

| # | Thao tác | Hardhat local (Osaka) | Sepolia (Glamsterdam) | Tỉ lệ |
|---|---|---|---|---|
| 1 | Deploy CredentialRegistry | 3.177.142 | 22.497.316 | ×7,08 |
| 2 | Chuyển 0,01 ETH sang ví issuer | 21.000 | 21.000 | ×1,00 |
| 3 | `addIssuer` | 167.765 | 689.885 | ×4,11 |
| 4 | `issueCertificate` (chứng chỉ 1) | 72.755 | 242.795 | ×3,34 |
| 5 | `issueCertificate` (chứng chỉ 2) | 72.743 | 242.783 | ×3,34 |
| 6 | `revokeCertificate` | 61.053 | 157.473 | ×2,58 |
| 7 | `publishBatch` (lô 4 chứng chỉ) | 72.142 | 242.182 | ×3,36 |
| 8 | `revokeLeaf` | 59.797 | 141.828 | ×2,37 |

Đọc bảng:

- **Deploy tăng nhiều nhất** vì toàn bộ 14.342 byte bytecode là state mới: 14.342 × 1.530 ≈ 21,9 triệu gas,
  khớp con số đo. Đây là chi phí một lần.
- **Chuyển ETH không đổi** (ví issuer đã tồn tại trên Sepolia, không tạo tài khoản mới).
- **Các thao tác ghi tăng 2,4–4,1 lần**: công nhận đơn vị và cấp (ghi nhiều ô storage mới) tăng 3,3–4,1 lần; hai thao tác thu hồi tăng 2,4–2,6 lần.
- **Lô Merkle:** tỉ lệ tiết kiệm so với cấp lẻ không đổi (một lô 4 chứng chỉ ≈ giá một lần cấp lẻ ở cả hai
  luật), nhưng **số gas tiết kiệm tuyệt đối lớn hơn**: mỗi chứng chỉ trong lô rẻ hơn cấp lẻ ≈ 54,7 nghìn gas
  theo luật hiện hành và ≈ 182,2 nghìn gas theo luật Glamsterdam.
- Gas trong `EVIDENCE.md`, `docs/GAS-V3.md` và bài báo là luật hiện hành của mainnet. Số Sepolia ở đây chỉ để
  chứng minh hệ thống chạy thật trên mạng công khai và để nhìn trước chi phí khi mainnet nâng cấp.

Nguồn: [Glamsterdam Testnet Announcement — Ethereum Foundation, 17/09/2026](https://blog.ethereum.org/2026/09/17/glamsterdam-testnet-announcement);
[Glamsterdam Gives Ethereum a Second Gas Meter — Reactive Network](https://blog.reactive.network/glamsterdam-gives-ethereum-a-second-gas-meter/);
giao dịch deploy: [Etherscan](https://sepolia.etherscan.io/tx/0xcb1a3e642d1c2cab42463b54046286e44eb4324a9e4f4da3b759ad1c3fb1c10a).

