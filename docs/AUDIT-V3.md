# AUDIT V3 — các lỗi đã tìm, đã sửa, và còn mở

Phạm vi: `contracts/CredentialRegistry.sol` (V2 → V3, qua mười đợt sửa 04–09/10/2026 — bảng dưới), giao diện `app/` (một tệp `index.html` đến đợt 3; tách `index.html` + `app.js` + `app.css` từ đợt 4 — mục 11), các script trong `scripts/`.
Ngày: 04–09/10/2026. Bản phát hành là **V3** (`package.json` 3.0.0). Trong quá trình làm, các thay đổi đi theo đợt;
các mục dưới giữ nguyên nội dung từng đợt để còn đối chiếu.

| Đợt | Thời điểm | Nội dung chính | Mục |
|---|---|---|---|
| 1 | 04–05/10 | Bản V3 đầu: sửa lỗi V2, cấp theo lô, danh tính O(1), cửa sổ khôi phục | 1–8 |
| 2 | tối 05/10 | Gỡ hàm duyệt danh bạ O(n), tên lưu theo danh tính, danh bạ từ event | 9 |
| 3 | đêm 05/10 | Kiểm toán độc lập lượt 1: khóa lộ, độ trễ chuyển giao, tra theo tên, nhiều RPC | 10 |
| 4 | sáng 06/10 | Tách giao diện thành ba tệp, CSP không script nội tuyến, SRI | 11 |
| 5 | trưa 06/10 | Kiểm toán lượt 2: danh sách cho phép tên tiếng Việt, mốc công bố lộ, cấp lô trong trình duyệt | 12 |
| 6 | chiều 06/10 | V34-01 (`revokeLeaf` chỉ nhận lá thật), thống kê kiểm toán | 13 |
| 7 | 08/10 | Khung vàng cho đơn vị ngừng hoạt động, giả định tin cậy multisig, rà soát mở rộng | 14–15 |
| 8 | tối 08/10 | V341-01 (`INHERIT_DELAY` là tham số deploy) | 16 |
| 9 | tối 08/10 | Hợp nhất thành bản V3 chính thức: bỏ số phiên bản phụ, dọn comment, gộp test | 17 |
| 10 | tối 09/10 | Kiểm toán lượt 4: đưa bộ fuzz bất biến Foundry vào repo (đóng OPS-04) | 18 |

## 0. Phương pháp và môi trường

| Hạng mục | Cách làm |
|---|---|
| Đọc mã | Đọc toàn bộ contract, giao diện, script; đối chiếu với README và bộ test |
| Xác nhận lỗi | Mỗi lỗi mức Cao có một **test PoC chạy trên V2** chứng minh lỗi có thật, trước khi sửa |
| Kiểm thử | `npx hardhat test` — **122 test pass** (69 test V2 đã cập nhật + 50 test mới của V3/đợt 2 + 3 test XSS) |
| Độ phủ | `npx hardhat coverage` — `CredentialRegistry.sol`: 100% câu lệnh, 100% hàm, 100% dòng, **98,9% nhánh** (xem 5.8) |
| Phân tích tĩnh | Slither 0.11.6, 102 detector — 6 cảnh báo `timestamp`, 0 High/Medium (mục 6) |
| Giao diện | Chạy thật trên Chromium (Playwright) với `hardhat node`: xác minh lô hợp lệ, tệp sai, biên nhận trỏ contract giả, biên nhận chứa payload XSS, biên nhận sai định dạng, chứng chỉ của khóa đã xoay |
| Gas | `scripts/gas-v3.js` — mọi số là `gasUsed` của giao dịch thật, không ngoại suy (`docs/GAS-V3.md`) |
| Trình biên dịch | solc **0.8.24** (bản solcjs từ npm, vì môi trường audit không tải được bản native). Cùng phiên bản, cùng optimizer → cùng bytecode. **Cần chạy lại `npm install && npx hardhat test` trên máy có mạng để xác nhận.** |

## 1. Bảng tổng hợp

| ID | Mức | Nội dung | Tình trạng |
|---|---|---|---|
| V2-01 | **Cao** | Một ví có thể vừa là owner vừa là issuer (qua chuyển quyền owner) | Đã sửa |
| V2-02 | **Cao** | Khắc phục khóa lộ buộc phải `restoreIssuer` khóa lộ trước → cửa sổ để kẻ tấn công thu hồi vĩnh viễn chứng chỉ thật | Đã sửa |
| V2-03 | Trung bình | R4: contract cho chuyển giao đời thứ 9+, sau đó chứng chỉ đời đầu không ai thu hồi được | Đã sửa |
| V2-04 | Thấp | Comment `removeIssuer` ("hành động bảo vệ nên tức thì") mâu thuẫn README | Đã sửa |
| UI-01 | **Chặn GĐ3** | Giao diện quét event từ block 0, lỗi bị nuốt im lặng → trên Sepolia mất cảnh báo mà không báo | Đã sửa |
| UI-02 | Thấp | Chứng chỉ của khóa đã xoay bị báo "đơn vị bị vô hiệu hóa" | Đã sửa |
| SC-01 | Thấp | `.env.example` lệch tên biến với `seed-sepolia.js`; script in khóa riêng ra màn hình | Đã sửa |
| **V3-01** | **Cao** | *(Do chính V3 gây ra, tìm ở lượt quét lại)* Owner chuyển giao được danh tính của trung tâm **đã giải thể** rồi thu hồi toàn bộ chứng chỉ của nó | Đã sửa |
| V3-02 | Trung bình | *(Tìm khi thiết kế)* `verifyInBatch` nhận lá có sẵn → đưa root làm "lá" với proof rỗng là ra `valid = true` | Đã sửa trước khi phát hành |
| V3-03 … V3-08 | Thấp | Sáu lỗi nhỏ ở giao diện/script tìm ở lượt quét lại | Đã sửa (mục 5) |
| R1, R5, R6, R7 … | — | Rủi ro đã công bố / quyết định thiết kế | **Còn mở** — mục 7 |

---

## 2. Lỗi của V2 đã sửa

### 2.1. V2-01 [Cao] — Phá bất biến "owner không cấp được"

**Lỗi.** `addIssuer` và `inheritIssuer` chặn `owner` hiện tại, nhưng:
- `transferOwnership(X)` không kiểm X có đang là issuer không, và `acceptOwnership` cũng không;
- `addIssuer` không chặn `pendingOwner`.

**PoC trên V2 (pass = lỗi có thật):**
```
addIssuer(X, "X") → transferOwnership(X) → X.acceptOwnership()
→ X vừa là owner, vừa issueCertificate được, vừa addIssuer được.

transferOwnership(X) → addIssuer(X, "X") → X.acceptOwnership() → cùng kết quả.
```
Đây là đóng góp chính của đề tài (tách quyền vận hành và quyền cấp/thu hồi), nên mức Cao.

**Sửa.**
- `transferOwnership` và `acceptOwnership`: `require(issuerStatus[addr] == None, "issuer cannot become owner")`.
  Một địa chỉ **từng** là issuer (kể cả đã bị gỡ) không bao giờ thành owner.
- `addIssuer` và `inheritIssuer`: `_requireNotOwnerSide()` chặn cả `owner` lẫn `pendingOwner`.
- Kiểm tra trong `acceptOwnership` hiện **không đến được** (hai chặn trên đã đủ), giữ lại làm phòng thủ chiều sâu (5.8).

**Test:** `CredentialRegistryV3.test.js` mục **A** (7 test), gồm cả kịch bản đề cử X → đổi đề cử sang Y → công nhận X → X cố nhận quyền.

### 2.2. V2-02 [Cao] — Cửa sổ `restoreIssuer` → `inheritIssuer`

**Lỗi.** V2 chỉ cho `inheritIssuer` từ khóa **Active**. Nếu owner đã `removeIssuer` khóa lộ (phản xạ tự nhiên), cách duy nhất để chuyển giao là `restoreIssuer` (khóa lộ Active lại) rồi `inheritIssuer` — **hai giao dịch**. Ở giữa, kẻ giữ khóa lộ (đang theo dõi mempool) chen vào được:
- thu hồi **vĩnh viễn** chứng chỉ thật của trung tâm (không đảo ngược được);
- cấp thêm bằng giả.

Test V2 gọi đường này là "KHÔNG CÓ NGÕ CỤT" — đúng về khả năng, sai về an toàn.

**PoC trên V2:** `removeIssuer(X) → restoreIssuer(X) → X.revokeCertificate(chứng chỉ thật) → inheritIssuer(X, K2)` → chứng chỉ thật đã `Revoked`.

**Sửa.** `inheritIssuer` chấp nhận khóa cũ **Active hoặc Disabled** (miễn chưa từng được kế nhiệm và còn trong cửa sổ khôi phục — xem V3-01). Không còn lý do để `restoreIssuer` một khóa lộ. Quy trình mới: gỡ quyền ngay → chuyển giao. Giao diện và README ghi rõ "không bao giờ bật lại một khóa nghi bị lộ".

**Test:** bộ V2 nhóm 10 (hai test thay thế "BẪY VẬN HÀNH" và "KHÔNG CÓ NGÕ CỤT"), bộ V3 mục **B**.

### 2.3. V2-03 [TB] — R4: trần 8 đời chỉ ghi nhận, không cưỡng chế

**Lỗi.** `_inheritsFrom` đi bộ tối đa 8 bước theo `inheritedBy`, nhưng `inheritIssuer` không chặn đời thứ 9. Sau 9 lần xoay, chứng chỉ của khóa gốc vĩnh viễn không ai thu hồi được.

**Sửa.** Bỏ vòng lặp. Thêm `identityOf[key]` (= khóa gốc của chuỗi) và `latestKeyOf[identity]`. Quyền thu hồi: người gọi **Active** và `identityOf[caller] == identityOf[issuer gốc]` — O(1), không trần.
Vì `inheritIssuer` luôn tắt khóa cũ và `restoreIssuer` từ chối khóa đã được kế nhiệm, **mỗi danh tính có nhiều nhất một khóa Active**, và đó luôn là khóa mới nhất → tính chất "kế nhiệm chỉ chảy xuôi" của V2 vẫn giữ (test "BẤT BIẾN: tối đa MỘT khóa Active cho mỗi danh tính, qua 12 lần xoay").
Thêm `currentKeyOf(key)` cho giao diện.

**Giá:** `addIssuer` +46.516 gas, `inheritIssuer` +31.772 gas (ghi thêm 2 slot) — `docs/GAS-V3.md`.

### 2.4. V2-04 [Thấp] — Comment mâu thuẫn

Comment `removeIssuer` nói "hành động BẢO VỆ nên tức thì", README nói "gần như không bao giờ là nước đi đầu tiên". Sau V2-02 thì gỡ quyền ngay **là** đúng; comment, README và giao diện đã viết lại thống nhất.

### 2.5. UI-01 [Chặn GĐ3] — Quét event từ block 0, lỗi bị nuốt

**Lỗi.** `queryLogsChunked` lùi từ block mới nhất về **0**, bước 10.000. Trên Sepolia (~10 triệu block) là >1.000 lời gọi RPC mỗi bộ lọc; RPC công khai sẽ chặn. Lỗi bị `catch {}` nuốt → cảnh báo "đơn vị vừa được công nhận" và cột chuỗi khóa **biến mất mà không báo**.

**Sửa.**
- Hằng `DEPLOY_BLOCK` (neo thứ ba, cạnh `CONTRACT_ADDRESS` và `EXPECTED_CHAIN_ID`); chỉ áp dụng cho contract chính thức. `scripts/deploy.js` và `seed-sepolia.js` in ra giá trị cần điền và kiểm tra lệch.
- Lỗi đọc event được ghi vào `DIR.logsError` và **hiện banner đỏ** ở kết quả xác minh và danh bạ.

### 2.6. UI-02 [Thấp] — Báo nhầm chứng chỉ của khóa đã xoay

`issuerState = Disabled` cho cả "đơn vị bị gỡ" và "đơn vị đã xoay khóa". Giao diện giờ đọc `currentKeyOf` và hiện "**Đơn vị đã xoay sang khóa mới** (khóa hiện tại …)" khi khóa hiện hành còn hoạt động. Đã kiểm tra thật trên Chromium.

### 2.7. SC-01 [Thấp] — Script testnet

- `.env.example` dùng `DEMO_ISSUER_ADDRESS`, script đọc `DEMO_ISSUER_PRIVATE_KEY` → thống nhất `DEMO_ISSUER_PRIVATE_KEY`.
- `seed-sepolia.js` **không còn in khóa riêng** ra màn hình; ghi vào `demo-issuer.key` (quyền 600, đã có trong `.gitignore`).

---

## 3. Tính năng mới của V3

### 3.1. Cấp theo lô trong sổ chung (Đ1)

| Thành phần | Thiết kế | Vì sao |
|---|---|---|
| `publishBatch(root, leafCount)` | `onlyActiveIssuer`; `batchId = keccak256(abi.encode(issuer, root))` | Gắn issuer vào khóa: không ai "chiếm trước" lô của ai; issuer khác đăng cùng root là lô khác (tránh lỗi IET 2026: ai cũng đăng root được) |
| Lá | `keccak256(bytes.concat(keccak256(abi.encode(certHash, holder, salt))))` | Chuẩn OpenZeppelin `StandardMerkleTree`; **băm hai lần** để lá và nút trong khác miền (chống second-preimage); `salt` 32 byte ngẫu nhiên mật mã cho từng chứng chỉ (R7) |
| `verifyInBatch(issuer, root, certHash, holder, salt, proof)` | Kiểm Merkle proof **trên chuỗi**, tự tính lá | Gọi thẳng Etherscan là đủ; không phụ thuộc mã giao diện (tránh lỗi IET 2026: kết quả kiểm proof bị bỏ qua) — xem V3-02 |
| Biên nhận JSON | `scripts/lib/batch.js`, `scripts/issue-batch.js` | Học viên giữ, nộp kèm tệp. Không IPFS, không dữ liệu cá nhân ở đâu cả (tránh lỗi IET/Cần Thơ) |
| Event | `BatchPublished` không chứa địa chỉ học viên | R6 cho đường lô |

**Quyết định về `holder` trong lá** (bạn chưa chốt, mình chọn mặc định để không chặn tiến độ): `holder` **có mặt** trong lá nhưng **được phép là `address(0)`**. Đơn vị muốn ràng buộc chứng chỉ với ví thì điền ví; học viên không có ví thì để 0. Nếu muốn bỏ hẳn, chỉ cần đổi kiểu lá thành `["bytes32","bytes32"]` ở contract và `scripts/lib/batch.js`.

### 3.2. Thu hồi lá và thu hồi cả lô (Đ2)

- `revokeLeaf(batchId, root, leaf, proof)` — **bắt buộc kèm proof**, nên mỗi bản ghi thu hồi trỏ tới một lá có thật trong lô. *(Đợt 6: nhận định này sai với nút trong — nay đổi thành `revokeLeaf(batchId, root, inner, proof)`, xem mục 13.)*
- `revokeBatch(batchId)` — một giao dịch cho cả lô, bất kể kích thước (35.881 gas). Kịch bản test: khóa lộ đăng 3 lô giả → gỡ → chuyển giao → khóa mới thu hồi 3 lô bằng 3 giao dịch.
- Cả hai: chỉ khóa Active cùng danh tính; owner không gọi được; vĩnh viễn. `verifyInBatch` trả mốc thu hồi **sớm nhất** giữa lá và lô.

### 3.3. Issuer là ví multisig (Đ5, một phần)

`contracts/test/MultiSigIssuerMock.sol` (2-trên-3) đăng và thu hồi lô; một chữ ký không đủ. Contract không cần sửa gì vì chỉ nhìn `msg.sender`. Đây là khuyến nghị chống gian lận nội bộ của Cerberus. Thực tế nên dùng ví đã kiểm toán (Safe).

### 3.4. Số đo chính (`docs/GAS-V3.md`)

| n chứng chỉ | Cấp lẻ × n (n giao dịch thật) | Một lô | Tiết kiệm |
|---:|---:|---:|---:|
| 1 | 72.698 | 71.999 | 0,97% |
| 10 | 726.968 | 71.987 | 90,10% |
| 100 | 7.269.668 | 71.999 | 99,01% |
| 500 | 36.348.316 | 72.011 | 99,81% |

So với IET 2026: một lần đăng lô của V3 (~72.000) rẻ hơn một lần đăng lô của họ (90.487 theo bài báo), và cột "cấp lẻ × n" ở đây là **đo thật**, không phải nhân lên.

## 4. Đánh đổi của đường cấp theo lô (ghi vào bài báo)

- **Mất biên nhận = không xác minh được.** Salt và proof chỉ nằm trong biên nhận. Đơn vị nên lưu bản sao để cấp lại.
- `findByHash` và tab **Chứng chỉ của tôi** chỉ áp dụng cho chứng chỉ cấp lẻ.
- `leafCount` do đơn vị **tự khai**; contract không kiểm được.
- `revokeLeaf` chấp nhận cả một **nút trong** của cây kèm proof cấp trên (Merkle hợp lệ về cấu trúc). Vô hại: chỉ issuer gọi được, và không có `(certHash, holder, salt)` nào cho ra nút trong, nên không chứng chỉ nào bị ảnh hưởng. Có test ghim. *(Đợt 6: đánh giá lại là KHÔNG vô hại — bản ghi thu hồi giả lệch với `verifyInBatch`; đã sửa, mục 13.)*
- Deploy V3 đắt hơn V2 (3,22M so với 2,24M gas) — chi phí một lần.

---

## 5. Lượt quét lại sau khi sửa

### 5.1. V3-01 [Cao] — Cướp danh tính của trung tâm đã giải thể *(do V3 gây ra)*

**Lỗi.** Sửa V2-02 bằng cách cho `inheritIssuer` chạy từ trạng thái Disabled đã mở một đường mới: trung tâm giải thể → owner `removeIssuer` → **nhiều tháng sau**, owner `inheritIssuer(trung tâm, ví của owner)` → ví đó thu hồi được **toàn bộ** chứng chỉ của trung tâm, mà không còn ai để phát hiện. Như vậy là phá luận điểm (c) của bài: "xác minh được sau khi đơn vị cấp giải thể".

V2 cũng có đường tương tự qua `restoreIssuer` không giới hạn thời gian (gỡ → nhiều năm sau bật lại → chuyển giao), chỉ là ít lộ hơn.

**Sửa.** `disabledAt[key]` ghi lúc `removeIssuer`; hằng `RECOVERY_WINDOW = 7 days`. `restoreIssuer` và `inheritIssuer`-từ-Disabled chỉ chạy trong cửa sổ đó. Hết hạn → danh tính **đóng băng vĩnh viễn**: không ai, kể cả owner, cấp/thu hồi/chuyển giao được nhân danh nó.

**Test:** "BẤT BIẾN: quá RECOVERY_WINDOW sau khi gỡ, danh tính ĐÓNG BĂNG" (chứng chỉ lẻ và lô của trung tâm đã giải thể vẫn hợp lệ), "trong RECOVERY_WINDOW (sát hạn) vẫn bật lại / chuyển giao được", "CHỦ ĐÍCH: khóa ĐANG hoạt động thì chuyển giao không bị giới hạn thời gian (R1 vẫn còn)".

**Rủi ro còn lại:** owner gỡ/bật lại luân phiên dưới 7 ngày để giữ danh tính "sống" — mỗi lần là một event công khai, và trong lúc bật lại thì trung tâm cấp được bình thường. Thuộc R1 (owner là neo tin cậy).

### 5.2. V3-02 [TB] — `verifyInBatch` nhận lá có sẵn

Thiết kế ban đầu là `verifyInBatch(issuer, root, leaf, proof)`. Với lô một phần tử, root = lá, nên gọi `verifyInBatch(issuer, root, root, [])` là ra `valid = true` mà không cần tệp. Với lô nhiều phần tử, ai gọi thẳng qua Etherscan cũng dễ nhập nhầm. Đã đổi sang nhận `(certHash, holder, salt)` và **tự tính lá trên chuỗi**. Có test.

### 5.3. V3-03 [Thấp] — Ô "Đơn vị đã cấp" bị bỏ qua khi có biên nhận
Ô bị vô hiệu hóa khi đã nạp biên nhận, để người dùng không tưởng lựa chọn của mình có tác dụng.

### 5.4. V3-04 [Thấp] — Hướng dẫn cấp lô thiếu bước công nhận đơn vị
Thêm `scripts/add-issuer.js` và bước tương ứng trong README.

### 5.5. V3-05 [Thấp] — Kịch bản EVIDENCE revert sai lý do
Bước "khóa đã gỡ cố thu hồi" revert vì chứng chỉ đã bị thu hồi từ trước, không phải vì khóa bị gỡ. Đã đổi sang một chứng chỉ còn hiệu lực.

### 5.6. V3-06 [Thấp] — `seed-sepolia.js` ghi `docs/sepolia-evidence.md` cả khi chạy local
Đã chặn khi chainId = 31337, để không lẫn với bằng chứng testnet.

### 5.7. V3-07 [Thấp] — Nhật ký công khai không hiện lô
Tab **Đơn vị phát hành** giờ liệt kê cả `BatchPublished`/`BatchRevoked`. Một khóa bị lộ đăng hàng loạt lô là thứ người theo dõi cần thấy ngay.

### 5.8. V3-08 — Nhánh chưa phủ
Nhánh duy nhất chưa phủ: `require(issuerStatus[msg.sender] == None)` trong `acceptOwnership`. Với mã hiện tại không thể đi tới (chứng minh ở 2.1). Giữ lại làm phòng thủ chiều sâu, có comment giải thích. Đây là lý do độ phủ nhánh là 98,9% (Đợt 2) thay vì 100%.

## 6. Slither

`docs/slither-report.txt` — 6 cảnh báo, đều thuộc detector `timestamp`, mức Low:
- **5 dương tính giả** (`issueCertificate`, `revokeCertificate`, `publishBatch`, `revokeLeaf`, `revokeBatch`): các phép so sánh bị liệt kê là `enum`, `address`, hoặc cờ `revokedAt == 0`. Detector đánh dấu cả hàm chỉ vì hàm có **ghi** `block.timestamp`.
- **1 so sánh thời gian thật** (`_requireInRecoveryWindow`): người đề xuất block lệch được vài giây, không đáng kể so với 7 ngày. Chấp nhận.

---

## 7. CÒN MỞ — cần bạn biết hoặc quyết

| # | Vấn đề | Vì sao chưa làm | Đề xuất |
|---|---|---|---|
| 1 | **R1** — owner vẫn chuyển giao được danh tính một trung tâm **đang hoạt động** | Timelock/2-of-N cho `inheritIssuer` (Đ5 phần quản trị) chưa làm | Làm nếu kịp ở GĐ2; nếu không, ghi rõ trong bài là ranh giới tin cậy |
| 2 | ~~**R5** — `findByHash`, `listActiveIssuers` vẫn O(n)~~ | **Đã xử lý ở đợt 2** (mục 9) | Chi phí chuyển sang số lời gọi `eth_getLogs` của giao diện — xem mục 9.5 |
| 3 | **R6** — đường cấp lẻ vẫn index `holder` trong event | Bỏ index thì tab **Chứng chỉ của tôi** mất tác dụng | Bài viết: đường lô đã không lộ holder; đường lẻ giữ vì tính năng |
| 4 | **R7** — đường cấp lẻ không có salt | `certHash` là hash của **cả tệp PDF**, entropy cao: không đoán được nếu không có tệp. Salt chỉ thêm được ở đường lô | Ghi vào bài; không sửa |
| 5 | Owner gỡ/bật lại luân phiên để giữ danh tính sống (5.1) | Thuộc R1 | Ghi vào bài |
| 6 | Bằng chứng danh tính khi `addIssuer` (Đ6) | Tùy chọn, chưa làm | Chỉ làm nếu dư thời gian |
| 7 | `holder` trong lá: mặc định "có, được để 0" (3.1) | Bạn chưa chốt | Xác nhận hoặc bảo mình đổi |
| 8 | `RECOVERY_WINDOW = 7 ngày` | Con số do mình chọn | Có thể đổi (ví dụ 14 hay 30 ngày) — cửa sổ càng dài càng dễ xử lý sự cố, nhưng owner có càng nhiều thời gian để cướp danh tính đã nghỉ |
| 8b | Hệ quả của cửa sổ: gỡ **nhầm** mà quá 7 ngày mới phát hiện thì danh tính đóng băng; **tên** vẫn thuộc khóa cũ (tên không bao giờ được trả tự do), nên trung tâm phải được công nhận lại bằng khóa mới **dưới tên khác** | Đánh đổi có chủ đích: tên không trả tự do là để chặn owner đổi danh tính im lặng (V2) | Ghi vào quy trình vận hành: kiểm tra mọi lần gỡ quyền trong vòng 7 ngày |
| 9 | Chưa chạy test bằng solc native | Môi trường audit chặn tải compiler | Bạn chạy `npm install && npx hardhat test` trên máy |
| 10 | `EVIDENCE.md` đã sinh lại với V3, nhưng **chưa** có phần bằng chứng cho lô và thí nghiệm Block.co | Đúng lộ trình: GĐ3 | GĐ3 |
| 11 | `Demo/DemoCert.pdf` (mẫu jokeinvoice, "Sharingan"), GVHD trong `CONTRIBUTIONS.md` (MSSV đã gỡ ở đợt 3) | Ngoài phạm vi GĐ2 | GĐ5 |
| 12 | `docs/GAS-BASELINE.md` là số đo lịch sử V0–V2 | Giữ nguyên làm tư liệu | — |

## 8. Tệp thay đổi

| Tệp | Thay đổi |
|---|---|
| `contracts/CredentialRegistry.sol` | V3: sửa V2-01..04, V3-01; thêm lô, danh tính, cửa sổ khôi phục |
| `contracts/legacy/CredentialRegistryV2.sol` | **Mới** — bản V2 nguyên vẹn, chỉ để đo gas |
| `contracts/test/MultiSigIssuerMock.sol` | **Mới** — ví 2-trên-3 cho test |
| `test/CredentialRegistry.test.js` | Cập nhật 5 test theo hành vi V3 |
| `test/CredentialRegistryV3.test.js` | **Mới** — 50 test |
| `app/index.html` | ABI V3, `DEPLOY_BLOCK`, banner lỗi event, xác minh bằng biên nhận, ghi chú xoay khóa, nhật ký lô, chữ ở tab quản trị |
| `scripts/lib/batch.js`, `scripts/lib/anchor.js` | **Mới** — dựng cây/biên nhận; đọc hằng neo |
| `scripts/issue-batch.js`, `verify-receipt.js`, `add-issuer.js`, `gas-v3.js` | **Mới** |
| `scripts/deploy.js`, `seed-sepolia.js`, `scale-probe.js`, `collect-evidence.js` | Cập nhật cho V3 |
| `docs/GAS-V3.md`, `docs/AUDIT-V3.md` | **Mới** |
| `docs/SCALE-NAMES.md`, `scripts/scale-names.js`, `scripts/lib/directory.js` | **Mới (Đợt 2)** — đo lưu tên; dựng danh bạ từ event |
| `docs/slither-report.txt`, `EVIDENCE.md`, `README.md` | Sinh lại / cập nhật |
| `package.json` | 3.0.0; thêm `@openzeppelin/contracts` (dependency), `@openzeppelin/merkle-tree` (dev); script `gas`, `issue-batch` → **cần `npm install`** |
| `.env.example`, `.gitignore` | Biến `DEMO_ISSUER_PRIVATE_KEY`; bỏ qua `receipts/`, `demo-issuer.key` |

---

## 9. Đợt 2 (tối 05/10/2026) — theo đề xuất của tác giả

### 9.1. Gỡ `findByHash` (đề xuất của tác giả)

**Lập luận.** Người được cấp bằng biết bằng của mình do trung tâm nào cấp — tên in ngay trên tệp PDF. Đường "không biết đơn vị nào cấp" là thừa.

**Lưu ý về "giảm chi phí".** `findByHash` là hàm `view`, người gọi vốn đã trả 0 gas, nên gỡ nó **không** làm rẻ giao dịch nào. Cái lợi thật là:
- bỏ một vòng lặp O(n) mà RPC sẽ từ chối khi danh bạ đủ lớn (~8.800 đơn vị với trần `eth_call` 50 triệu gas; ~1.700 với trần 10 triệu);
- bytecode nhỏ hơn: deploy giảm (cùng các thay đổi 9.2: 3.216.196 → 2.685.487 gas).

**Hệ quả phải xử lý — và đã xử lý.** Khi không còn `findByHash`, người xác minh **bắt buộc** chọn đơn vị. Danh sách cũ lấy từ `listActiveIssuers` chỉ có đơn vị **đang hoạt động**, nên không chọn được trung tâm **đã giải thể** — phá luận điểm (c). Danh sách mới dựng từ event, gồm cả đơn vị đã ngừng và khóa cũ đã xoay (9.3).

### 9.2. Rủi ro lưu tên trung tâm — đo đạc (`docs/SCALE-NAMES.md`, `scripts/scale-names.js`)

| Câu hỏi | Số đo | Kết luận |
|---|---|---|
| Ghi tên tốn bao nhiêu? | +~23.000 gas mỗi 32 byte ở `addIssuer`; tên tiếng Việt điển hình 83 byte: 231.744 gas | Chi phí **một lần** mỗi đơn vị, owner trả, không ảnh hưởng cấp chứng chỉ |
| Xoay khóa có chép tên không? | bản V3 đầu (Đợt 1): có (+25.000 gas/32 byte). Đợt 2: không (+2.830 gas/32 byte, chỉ do calldata/event) | **Sửa:** tên lưu theo danh tính (`_identityName[identity]`, đọc qua `issuerName(key)`) |
| Hàm nào vỡ trước khi danh bạ lớn? | `listActiveIssuers` (trả kèm tên): ~15.600 gas/đơn vị, ~192 byte/đơn vị → vỡ ở **~3.200** (trần 50 triệu) / **~630** (trần 10 triệu). Tệ hơn `findByHash` (~5.700 gas/đơn vị) | **Sửa:** gỡ `listActiveIssuers`, `knownIssuers` và mảng `_knownIssuers` |
| Tên dài vô hạn? | Không có giới hạn ở bản V3 đầu (Đợt 1) | **Sửa:** `MAX_NAME_BYTES = 256` byte UTF-8 (tên Việt dài nhất đã thử: 175 byte) |

Trần 50 triệu gas là mặc định `--rpc.gascap` của geth; trần 2^24 gas/giao dịch của EIP-7825 (Fusaka) **không** áp cho `eth_call` theo blog.ethereum.org (21/10/2025). Hardhat (EDR) lại áp trần đó cho cả `estimateGas`, nên phần B đo tới 1.000 đơn vị rồi ngoại suy tuyến tính — vòng lặp có cấu trúc tuyến tính chính xác.

**Gas sau đợt 2** (`docs/GAS-V3.md`): `addIssuer` 207.713 → **163.510** (ngang V2: 161.219); `inheritIssuer` từ khóa Active 170.231 → **120.465** (rẻ hơn V2: 138.459); deploy 3.216.196 → **2.685.487**. Mọi thao tác trên chuỗi giờ là O(1) theo số đơn vị (`scripts/scale-probe.js`: `addIssuer`, `verifyCertificate`, `issueCertificate` không đổi từ 10 tới 400 đơn vị).

### 9.3. Danh bạ dựng từ event, có đối chiếu

`app/index.html` (`loadDirectory`) và `scripts/lib/directory.js` dùng chung thuật toán: phát lại `IssuerAdded/Removed/Restored/Inherited` theo (block, logIndex), rồi **so số đơn vị Active với `activeIssuerCount()` trên chuỗi**. Lệch → banner đỏ "danh bạ không khớp với chuỗi". Test: "BẤT BIẾN: số đơn vị Active dựng từ event KHỚP activeIssuerCount trên chuỗi, qua mọi thao tác quản trị".

Cũng trong lượt này:
- Ô chọn đơn vị có hai nhóm *Đang hoạt động* / *Đã ngừng hoạt động / khóa cũ đã xoay*, và **đánh dấu ⚠ những đơn vị có tên trông giống nhau** ngay trong ô chọn — chỗ người xác minh dễ bị lừa nhất khi phải tự chọn đơn vị.
- Nhật ký quản trị và danh bạ quét event **một lần cho mọi loại event** (OR theo topic0) thay vì một lần cho mỗi loại (trước đây 4–7 lần).
- Timestamp "được công nhận lúc" chỉ lấy khi cần hiển thị, không gọi `getBlock` cho mọi đơn vị.

### 9.4. Bỏ mục "Nâng cao — dành cho lập trình viên" (đề xuất của tác giả)

Bỏ ô nhập địa chỉ contract, banner cảnh báo override, khóa `localStorage` tương ứng (và xóa giá trị cũ còn lưu trong trình duyệt). Địa chỉ chỉ còn nằm trong mã nguồn. Đây là bề mặt lừa đảo ("dán địa chỉ này vào ô Nâng cao") nên bỏ là đúng. Lập trình viên thử contract riêng thì sửa `CONTRACT_ADDRESS`/`EXPECTED_CHAIN_ID`/`DEPLOY_BLOCK`.

### 9.5. Còn mở sau đợt 2

| # | Vấn đề | Đề xuất |
|---|---|---|
| 1 | Danh bạ trên giao diện tốn **~263 lời gọi `eth_getLogs` cho mỗi năm tuổi contract** (khúc 10.000 block, block 12 giây). Tăng theo tuổi contract, không theo số đơn vị | Nhiều RPC cho khúc lớn hơn 10.000 block; bản triển khai thật dùng indexer (The Graph). Ghi vào bài như đánh đổi của việc bỏ hàm view O(n) |
| 2 | Người xác minh phải tự chọn đúng đơn vị. Nếu tên trên PDF bị làm giả thành tên một trung tâm *khác có thật*, kết quả "không tìm thấy" vẫn đúng, nhưng người xác minh cần đọc kỹ thông báo | Thông báo "không tìm thấy" đã nhắc kiểm tra lại đơn vị đã chọn |
| 3 | Đối chiếu `activeIssuerCount` chỉ bắt được **thiếu/thừa số lượng**, không bắt được RPC trả event giả nhưng đủ số | Đợt 3: kết quả xác minh đối chiếu nhiều RPC (10.5); danh bạ vẫn đọc một RPC |
| 4 | 11 ảnh trong `picture/screenshots/` (EVIDENCE mục 12) chụp **giao diện V2**: còn mục "Nâng cao", ô "Tôi không biết — tra tất cả đơn vị" | Chụp lại ở GĐ3, khi chạy trên testnet |

## 10. Đợt 3 (đêm 05/10/2026) — theo bản kiểm toán độc lập lượt hai

Nguồn: bản kiểm toán độc lập "Báo cáo kiểm toán CredVerify — Bảo mật, khả năng ứng dụng & định hướng sửa chữa" (05/10/2026), viết cho **bản V3 đầu (Đợt 1)**. Tác giả quyết định: giữ `holder` trong lá Merkle; **đổi bất biến thu hồi**; làm toàn bộ đề xuất đợt 3; bỏ MSSV khỏi repo công khai; commit để sau.

### 10.1. Đối chiếu phát hiện → trạng thái

| ID | Mức | Phát hiện (tóm tắt) | Trạng thái đợt 3 |
|---|---|---|---|
| SC-01 | Cao | Khóa lộ thu hồi vĩnh viễn chứng chỉ thật, khóa kế nhiệm không khôi phục được | **Đã sửa** — 10.2 |
| SC-02 | Cao | Bằng giả do khóa lộ cấp vẫn `valid = true` sau xoay khóa | **Đã sửa** — cờ `issuedAfterCompromise` (10.2) |
| SC-03 | Cao | Owner EOA, chuyển giao có hiệu lực ngay (R1) | **Sửa một phần** — độ trễ 48 giờ trên chuỗi (10.3); Safe 2-trên-3 làm khi deploy GĐ3 |
| SC-04 | TB | Đăng ký trùng hash phá đường "tra toàn bộ" | **Không còn áp dụng** — `findByHash` gỡ ở đợt 2; PoC F-02 chuyển thành test khẳng định |
| SC-05 | TB | Owner đóng băng trung tâm hợp pháp (gỡ rồi chờ 7 ngày) | **Còn mở** — giảm nhẹ bằng multisig; đường EIP-712 "khóa cũ đồng ý" chưa làm |
| SC-06 | Thấp | NatSpec `revokeLeaf` nói sai ("luôn trỏ tới lá có thật") | **Đã sửa** — NatSpec + chú thích event `LeafRevoked`. *Đợt 6: nâng mức thành V34-01 và sửa tận gốc ở contract (mục 13)* |
| SC-07 | Info | Pragma nổi; không hủy được `pendingOwner`; tên không giới hạn; O(n); chuỗi revert | **Đã sửa** — ghim `0.8.24`, `cancelOwnershipTransfer`, custom error (giới hạn tên + O(n) đã xong ở đợt 2) |
| PR-01 | TB | Đường cấp lẻ ghi certHash không salt | **Ghi nhận** — giao diện và NatSpec khuyến nghị cấp theo lô kể cả n = 1; cấp lô trong trình duyệt chưa làm (chỉ có script) |
| PR-02 | TB | `holder` + certHash vĩnh viễn trên chuỗi vs quyền xóa dữ liệu | **Ghi nhận** — xem 10.6 về `holder` |
| PR-03 | Thấp | Biên nhận chứa tên tệp gốc | **Đã sửa** — 10.6 |
| PR-04 | Thấp | `localStorage` không mã hóa | Như cũ (đã công bố, có nút xóa) |
| KEY-01 | TB | Issuer dùng ví nóng | Khuyến nghị vận hành (README); không phải lỗi mã |
| FE-01 | TB | Kết luận phụ thuộc một RPC | **Đã sửa** — đối chiếu nhiều RPC cùng block (10.5) |
| FE-02 | TB | Không chứng minh người nộp là chủ ví | **Đã sửa** — ký nonce, 0 gas (10.5) |
| FE-03 | Thấp | CSP `'unsafe-inline'`, `connect-src *`, Google Fonts | **Đã sửa** — hash sha256, `connect-src` theo `RPC_URLS`, bỏ Google Fonts |
| FE-04 | Thấp | "Tra toàn bộ" từ chối kết luận | **Không còn áp dụng** (Đợt 2) |
| FE-05 | Info | Chưa có bản Sepolia | GĐ3 |
| OPS-01 | Cao | V3 chưa commit | **Để sau** theo quyết định tác giả |
| OPS-02 | TB | MSSV trong repo công khai | **Đã sửa** — xóa khỏi `CONTRIBUTIONS.md` (lịch sử git cũ vẫn còn nếu đã push) |
| OPS-03/04 | TB | Không CI; không fuzz/invariant | Còn mở |
| APP-01…06 | — | Băm nguyên PDF, chưa VC, chọn chuỗi, AA, indexer, hết hạn | Còn mở — phần thảo luận của bài |

### 10.2. SC-01 + SC-02: mốc lộ khóa, vô hiệu thu hồi tự động

**Bất biến phát biểu lại.** Thu hồi do một khóa **hợp lệ** là vĩnh viễn. Thu hồi do một khóa đã được tuyên bố **lộ**, thực hiện **từ mốc lộ trở đi**, bị **vô hiệu**. Lịch sử không bị xóa: bản ghi lưu trữ vẫn `Revoked`, event `CertificateRevoked`/`BatchRevoked`/`LeafRevoked` gốc vẫn còn; việc tuyên bố lộ là event công khai `KeyCompromised`.

**Cơ chế.**
- `proposeInherit(old, new, compromisedSince)` — `compromisedSince = 0` là xoay định kỳ; khác 0 thì phải `≤ now` và `≥ now − MAX_COMPROMISE_LOOKBACK` (30 ngày). Khi `executeInherit`, ghi `compromisedAt[old]`.
- Mỗi lần thu hồi ghi **khóa đã thu hồi**: `certRevokedBy[certId]` (slot mới, vì struct `Certificate` chỉ còn 4 byte trống), `Batch.revokedBy` (vừa khít slot còn trống của struct `Batch`), `leafRevocation[batchId][leaf] = {at, by}` (một slot).
- **Vô hiệu tự động, trong hàm xác minh** — không cần giao dịch cho từng chứng chỉ: `_voided(by, at) = compromisedAt[by] ≠ 0 && at ≥ compromisedAt[by]`. `verifyCertificate`/`verifyInBatch` trả trạng thái **hiệu lực** và thêm `revocationVoided`.
- Khóa hợp lệ **thu hồi lại** được một chứng chỉ có lần thu hồi đã bị vô hiệu (`revokeCertificate`, `revokeLeaf`, `revokeBatch` đều chấp nhận trạng thái "đã thu hồi nhưng bị vô hiệu").
- `issuedAfterCompromise = issuedAt ≥ compromisedAt[khóa cấp]`.

**Khác đề xuất của bản kiểm toán, có chủ đích.** Bản kiểm toán đề xuất hàm `reinstate(certId)` / `reinstateBatch`. Đợt 3 vô hiệu **tự động trong view** thay vì bằng giao dịch: kẻ gian thu hồi rải rác hàng nghìn chứng chỉ lẻ thì trung tâm không phải gửi hàng nghìn giao dịch khôi phục. Ít hàm ghi hơn, ít bề mặt hơn.

**Quyết định: `valid` không tự tắt khi `issuedAfterCompromise`.** Nếu contract tự đặt `valid = false`, owner (người chọn mốc lộ) có quyền vô hiệu chứng chỉ thật trong 30 ngày trước đó — trái nguyên tắc "owner không thu hồi". Contract trả **sự thật** (bản ghi tồn tại, chưa thu hồi, nhưng do khóa lộ cấp sau mốc lộ), giao diện và `verify-receipt.js` hiện thành **"KHÔNG ĐÁNG TIN"**. Người gọi thẳng qua Etherscan phải đọc cờ — ghi trong README mục 11.

**Quyền còn lại của owner (ghi vào bài).** Qua mốc lộ, owner có thể vô hiệu một lần thu hồi hợp pháp, hoặc gắn cờ chứng chỉ thật — nhưng chỉ trong 30 ngày trước, qua đề xuất công khai, sau 48 giờ chờ, và để lại event `KeyCompromised`. Vẫn đúng lời hứa "không nói dối một cách vô hình".

### 10.3. SC-03: chuyển giao qua độ trễ

`inheritIssuer` (một bước, hiệu lực ngay) được thay bằng `proposeInherit` → chờ `INHERIT_DELAY = 48 giờ` → `executeInherit`; owner có `cancelInherit`. Đề xuất hết hạn sau `PROPOSAL_TTL = 7 ngày` kể từ eta. `executeInherit` **kiểm lại** mọi điều kiện (khóa mới chưa bị dùng, không phải owner/pendingOwner, khóa cũ chưa bị kế nhiệm). `RECOVERY_WINDOW` chỉ kiểm lúc **đề xuất** — đề xuất tạo trong cửa sổ thì thực thi được dù lúc thực thi cửa sổ đã đóng, với trần tổng ≤ 7 + 2 + 7 ngày sau khi gỡ.

`removeIssuer` vẫn **tức thì**: hành động bảo vệ không qua độ trễ. Quy trình sự cố giờ là *gỡ ngay → đề xuất kèm mốc lộ → 48 giờ → thực thi* (README mục 10). Giao diện hiện **băng đỏ** "đề xuất chuyển giao đang chờ" ở tab **Đơn vị phát hành** — 48 giờ chỉ có ích nếu trung tâm thật nhìn thấy.

### 10.4. Tên: chuỗi là nguồn sự thật, website là bộ đệm

Quyết định của tác giả (thảo luận 05/10): tên đơn vị là mắt xích quyết định người xác minh tra ở sổ nào, nên **giữ trong storage trên chuỗi**. Lưu ở website thì đơn vị vận hành sửa được ánh xạ tên → ví không để lại dấu vết, ràng buộc "một tên, một chủ" không kiểm chứng được từ bên ngoài, và website chết thì tên mất theo — đúng lỗi khiến V1 bị bác bỏ. Tên nằm trong **trạng thái** (không chỉ trong event / lịch sử), nên đọc được kể cả khi node bỏ lịch sử cũ.

Đợt 3 thêm:
- `predecessorOf[khóa mới] = khóa cũ` (ghi trong `executeInherit`): từ `issuerByName(tên)` (khóa mới nhất) lần ngược được mọi khóa cũ **chỉ bằng trạng thái**.
- Tab Xác minh có ô **gõ tên in trên chứng chỉ**: chuẩn hóa → `issuerByName` → lần ngược `predecessorOf` → `verifyCertificate` ở từng khóa; từ chối nếu tên trên chuỗi khác tên đã gõ. Đường này không cần event, không cần website của CredVerify.
- **Dạng chuẩn của tên.** Quy tắc chung (`scripts/lib/name.js`, chép y hệt trong giao diện): Unicode NFC, gộp mọi khoảng trắng thành một dấu cách, bỏ đầu/cuối; giữ chữ hoa/thường và dấu. Contract kiểm phần rẻ (`_requireCanonicalName`: không khoảng trắng đầu/cuối, không hai dấu cách liền, không ký tự điều khiển ASCII); NFC là quy ước ngoài chuỗi ai cũng tự kiểm được. Script `add-issuer.js` và nút **Công nhận** chuẩn hóa trước khi gửi.

Chi phí: tên tiếng Việt điển hình 83 byte tốn **243.271 gas** khi công nhận (Đợt 2: 231.744) — chênh do vòng kiểm dạng chuẩn. Vòng lặp viết bằng assembly (chỉ đọc calldata) vì bản Solidity tốn gấp đôi (~285 so với ~135 gas/byte, đo bằng `scripts/scale-names.js`). So với tên 8 byte: **+78.320 gas**, tức ~0,02 USD ở 0,111 gwei và ~4,3 USD ở 20 gwei (ETH ≈ 2.711 USD) — một lần cho mỗi đơn vị.

### 10.5. Frontend

- **FE-01 — nhiều RPC.** `RPC_URLS` liệt kê các RPC độc lập; `crossCall` gọi cùng hàm view trên tất cả **tại cùng một block** và chỉ kết luận khi mọi RPC trả cùng kết quả, lệch thì băng đỏ "CÁC RPC TRẢ KẾT QUẢ KHÁC NHAU". Block = độ cao **lớn nhất** các RPC báo, trừ 2 khi có nhiều RPC; RPC nào chưa tới block đó bị coi là lỗi. (Lượt quét lại phát hiện bản đầu dùng độ cao **nhỏ nhất** — một RPC gian báo độ cao thấp là kéo mọi RPC về đọc trạng thái **trước** một lần thu hồi. Đã sửa.) Bản local có một RPC và trang ghi rõ điều đó.
- **FE-02 — chủ ví.** Sau kết quả hợp lệ (có `holder`, không bị gắn cờ, các RPC khớp), nhà tuyển dụng tạo thông điệp gồm tiêu đề cố định, mã chứng chỉ, tên nhà tuyển dụng, ví cần ký, địa chỉ hợp đồng + chainId, nonce 16 byte, hạn 10 phút. Ứng viên ký ở tab **Chứng chỉ của tôi** (`personal_sign`, 0 gas; trang từ chối ký thông điệp sai tiêu đề hoặc sai hợp đồng). Trang kiểm `verifyMessage(...) == holder` và hạn. Chứng chỉ lô có `holder = 0` thì không hiện hộp này.
- **FE-03 — CSP.** `script-src 'self' 'sha256-…' https://cdn.jsdelivr.net` (bỏ `'unsafe-inline'`); `connect-src` = đúng các origin trong `RPC_URLS`; bỏ Google Fonts (dùng font hệ thống). `scripts/csp-hash.js` tính lại hash + `connect-src`; `test/Csp.test.js` vỡ nếu quên chạy. (Lượt quét lại phát hiện bản đầu của `csp-hash.js` thay `connect-src` **trong một dòng chú thích** thay vì trong thẻ meta. Đã sửa: chỉ sửa bên trong thẻ meta.)
- **Custom error** được dịch sang tiếng Việt (`ERR_VI`). Lỗi đi qua ví có khi tới tay ethers ở dạng "unknown custom error" — trang tự tìm dữ liệu revert trong lỗi rồi giải mã bằng ABI (phát hiện khi chạy e2e với ví giả nối node Hardhat; đã sửa).
- Kết quả xác minh hiện **"KHÔNG ĐÁNG TIN"** khi `issuedAfterCompromise`, ghi chú khi `revocationVoided`; tab **Chứng chỉ của tôi** và **Tra cứu & thu hồi** hiện trạng thái **hiệu lực** (đọc `verifyCertificate` thay vì bản ghi thô).
- Tab Quản trị: Đề xuất / Thực thi / Hủy chuyển giao, ô "khóa bị lộ" + thời điểm; nút Hủy đề cử owner.

### 10.6. `holder`, biên nhận, MSSV

- **Giữ `holder`** trong lá Merkle và trong bản ghi cấp lẻ — FE-02 cần nó mới có nghĩa. **Không** bỏ `indexed` khỏi `holder` trong `CertificateIssued` (khác đề xuất PR-02 của bản kiểm toán): `holder` vẫn nằm trong storage công khai (`certificates[certId].holder`) và trong dữ liệu event, nên bỏ `indexed` chỉ làm khó việc lọc chứ không giấu được gì, lại làm hỏng tab **Chứng chỉ của tôi**. Đường riêng tư thật là cấp theo lô: ví học viên chỉ nằm trong biên nhận, trên chuỗi chỉ có commitment có salt.
- **PR-03:** biên nhận không còn trường `certificate.file`; tệp biên nhận đặt tên `NNN-<8 hex của certHash>.receipt.json`, kèm `index.csv` (tệp gốc → biên nhận) chỉ để đơn vị cấp giữ trên máy (`writeReceipts` trong `scripts/lib/batch.js`).
- **OPS-02:** xóa dòng MSSV khỏi `CONTRIBUTIONS.md`. Đã quét lại toàn repo (văn bản và PDF, trừ `node_modules`/`artifacts`/`cache`): không còn MSSV. **Lưu ý:** nếu repo đã từng push bản có MSSV lên GitHub, lịch sử git vẫn giữ nó.

### 10.7. Lượt quét lại sau khi sửa

| Kiểm tra | Kết quả |
|---|---|
| `npx hardhat test` | **156 passing** (V2 69 · V3 50 · đợt 3: 32 · CSP 2 · XSS 3) |
| `npx hardhat coverage` — `CredentialRegistry.sol` | **100% câu lệnh · 99,23% nhánh · 100% hàm · 100% dòng**. Nhánh duy nhất chưa phủ: kiểm tra thừa trong `acceptOwnership` (như 5.8) |
| Slither 0.11.6 | **0 High, 0 Medium, 3 Low** (`timestamp` — so sánh thời gian thật với cửa sổ 48 giờ / 7 ngày / 30 ngày), **1 Informational** (`assembly` — vòng kiểm tên). 5 dương tính giả `timestamp` của đợt 2 không còn xuất hiện |
| e2e trình duyệt (Chromium, CSP bật) — đọc | 19/19: danh bạ tải dưới CSP hash · tra theo tên có khoảng trắng thừa, đi qua 2 khóa · tên sai dấu → gợi ý tên gần giống · thu hồi phá hoại → hợp lệ + ghi chú vô hiệu · bằng giả → KHÔNG ĐÁNG TIN · FE-02 với chữ ký đúng / ví khác / thông điệp bị sửa · băng đỏ đề xuất đang chờ · nhật ký có đề xuất + tuyên bố lộ · 2 RPC lệch → không kết luận · 0 vi phạm CSP |
| e2e trình duyệt — ghi (ví giả EIP-1193 nối node Hardhat) | 14/14: đề xuất trùng → lỗi tiếng Việt · thực thi sớm → "Chưa đủ 48 giờ" · hủy đề xuất · công nhận tên có khoảng trắng thừa → lưu dạng chuẩn · khóa lộ thiếu thời điểm → nhắc · holder ký bằng ví → "Đúng chủ chứng chỉ" · từ chối ký thông điệp lạ · 0 vi phạm CSP |
| Dữ liệu cá nhân trong `credverify` | Không còn MSSV; không private key; biên nhận không còn tên tệp |

**Lỗi tìm thấy trong lượt quét lại và đã sửa:** (1) `crossCall` lấy độ cao nhỏ nhất → RPC gian ép đọc trạng thái cũ; (2) `csp-hash.js` sửa nhầm chú thích; (3) lỗi revert qua ví không giải mã được; (4) vòng kiểm tên bản Solidity tốn ~285 gas/byte → assembly; (5) `GAS-V3.md` ghi `Batch` "1 slot" (thật ra 2 slot) và ghi chuyển giao đợt 3 rẻ hơn V2 (sai sau khi thêm `predecessorOf`).

### 10.8. Số đo chính (`docs/GAS-V3.md`, `docs/SCALE-NAMES.md`)

| Thao tác | Đợt 2 | Đợt 3 |
|---|---:|---:|
| Deploy | 2.685.487 | 2.969.896 |
| `addIssuer` (tên ngắn) | 163.510 | 165.389 |
| Chuyển giao từ khóa Active | 120.465 (một bước) | 58.962 + 145.564 = 204.526 (hai bước) |
| Chuyển giao khi khóa lộ | — | 79.054 + 167.264 = 246.318 |
| `revokeCertificate` | — | 61.075 (ghi thêm `certRevokedBy`) |
| `publishBatch` (bất kể n) | ≈ 72.000 | 72.130 |
| `revokeBatch` | ≈ 35.900 | 36.098 |

### 10.9. Còn mở sau đợt 3

| # | Vấn đề | Đề xuất |
|---|---|---|
| 1 | Owner một mình vẫn chuyển giao được (sau 48 giờ) và chọn được mốc lộ trong 30 ngày | Owner Sepolia là Safe 2-trên-3 (GĐ3), ghi địa chỉ Safe vào EVIDENCE |
| 2 | SC-05: owner đóng băng trung tâm hợp pháp | Đường "khóa cũ đồng ý" bằng chữ ký EIP-712 — công việc tiếp theo |
| 3 | Khai báo khóa lộ **chỉ** làm được lúc chuyển giao; khóa đã xoay định kỳ rồi mới phát hiện lộ thì không khai báo bổ sung được | Ghi vào bài như giới hạn; nếu cần, thêm hàm khai báo muộn có cùng ràng buộc 30 ngày + độ trễ |
| 4 | Cấp theo lô chỉ có ở script; giao diện cấp lẻ (không salt) | Dựng cây Merkle trong trình duyệt — chưa làm |
| 5 | OPS-01 commit, OPS-03 CI, OPS-04 fuzz/invariant | Commit theo quyết định tác giả; CI + Foundry invariant nếu còn thời gian |
| 6 | Danh bạ vẫn dựng từ event (~263 `eth_getLogs`/năm tuổi contract); đối chiếu nhiều RPC mới áp cho **kết quả xác minh**, chưa cho danh bạ | Danh bạ chỉ để gợi ý; đường gõ tên đã không cần event. Indexer khi triển khai thật |
| 7 | Ảnh chụp màn hình vẫn là giao diện V2 | Chụp lại ở GĐ3 |
| 8 | Báo cáo Lab 1 (docx, thư mục riêng) mô tả V2 | Cập nhật sau theo quyết định tác giả |

### 10.10. Sửa giao diện sau khi tác giả chạy thử (06/10/2026)

| # | Lỗi | Sửa |
|---|---|---|
| UI-03 | Thông báo về **ví** (đổi tài khoản, quay lại đúng mạng, lỗi kết nối) ghi vào ô kết quả của tab *Quản trị* / *Cấp chứng chỉ* (`adminOut`, `issueOut`) — người dùng ở tab khác không thấy, và thông báo cũ nằm lại trong tab sau khi đã kết nối lại | Băng chung `#walletBanner` đặt cạnh `#chainBanner`, ngoài mọi tab; tự ẩn khi kết nối lại thành công hoặc khi băng sai mạng đã hiện |
| UI-04 | Nhật ký đánh **✕** khi ví quay lại *đúng* mạng và không đánh khi sang *sai* mạng (điều kiện đảo) | `ok: id === EXPECTED_CHAIN_ID` |
| UI-05 | Tiêu đề tiếng Việt lệch dấu ("Câ´p", "bă`ng") sau khi bỏ Google Fonts (FE-03): font dự phòng Georgia thiếu glyph tiếng Việt dựng sẵn, trình duyệt tách dấu | Bỏ Georgia khỏi mọi chuỗi font; dùng `Cambria, 'Noto Serif', 'Times New Roman'` — đều có đủ tiếng Việt |

Kiểm lại: 156 test; e2e đọc 19/19, ghi 14/14, thêm 13 kiểm tra cho băng ví và nhật ký (đổi tài khoản ở tab Xác minh → băng hiện ở mọi tab; sai mạng → chỉ một băng; quay lại đúng mạng → không ✕; kết nối lại → băng biến mất; 0 vi phạm CSP).


## 11. Đợt 4 (sáng 06/10/2026) — tách giao diện thành ba tệp

Contract **không đổi** (cùng bytecode đợt 3). Chỉ tổ chức lại giao diện và công cụ đi kèm.

### 11.1. Đã làm

| Hạng mục | Trước | Sau |
|---|---|---|
| Giao diện | `app/index.html` 2.312 dòng (markup + CSS + JS) | `index.html` 350 dòng (markup + CSP) · `app.js` 1.493 dòng · `app.css` 469 dòng. Dời nguyên văn, chỉ bỏ 4 dấu cách thụt lề (đã kiểm: không có template literal nhiều dòng nào bị đổi nội dung). Nạp bằng `<script src="app.js">` thường (không ES module, không bước build), cùng vị trí cuối `<body>` như khối cũ |
| CSP | `script-src 'self' 'sha256-…'` — sửa một ký tự JS mà quên chạy `csp-hash.js` là trang chết trắng | `script-src 'self' https://cdn.jsdelivr.net` — không script nội tuyến, không `'unsafe-inline'`, sửa `app.js` không cần tính lại gì |
| Toàn vẹn trang (FE-01) | Hash của một tệp | `node scripts/page-integrity.js --release` gắn `integrity="sha384-…"` cho `app.js` và `app.css` → hash của riêng `index.html` (hoặc CID IPFS) vẫn bao trọn cả trang. Khi phát triển không cần SRI (`--dev` gỡ) |
| `scripts/csp-hash.js` | Tính hash khối script + `connect-src` | **Thay bằng** `scripts/page-integrity.js`: đồng bộ `connect-src` theo `RPC_URLS`; `--release` / `--dev` / `--check`. `--check` báo lỗi khi còn script nội tuyến, khi `script-src` có `'unsafe-inline'`/hash thừa, và khi integrity đã cũ (trang sẽ bị chặn) |
| Hằng số neo | Trong `index.html` | Trong `app.js`. Đã chuyển `scripts/lib/anchor.js`, `deploy.js`, `issue-batch.js`, `verify-receipt.js`, `seed-sepolia.js`, `lib/directory.js`, `collect-evidence.js`, `.env.example`, README |
| Test đọc mã giao diện | `XssViaRevertString.test.js` **chép tay** `reasonOf()` / `esc()` | `test/uiSource.js` phân tích `app.js` bằng acorn (thêm `acorn` vào devDependencies — trước đó chỉ là phụ thuộc gián tiếp) và nạp **hàm thật** vào sandbox. Thêm `test/UiShared.test.js`: chuẩn hóa tên của giao diện ≡ `scripts/lib/name.js`; `certIdOf` của giao diện ≡ contract |

### 11.2. Lỗi tìm thấy khi làm và đã sửa

| # | Lỗi | Sửa |
|---|---|---|
| T-01 | `XssViaRevertString.test.js` kiểm một **bản chép cũ** của `reasonOf()` (từ trước đợt 3). Hàm thật từ đợt 3 giải mã lỗi theo ABI: `Error(string)` hiện thành "Contract từ chối (Error)", chuỗi của contract **không** tới chỗ hiển thị. Test cũ vẫn pass nhưng không còn kiểm mã đang chạy | Test dùng hàm thật; khẳng định cả hai điều: payload tới được đối tượng lỗi (mối đe dọa có thật), và `reasonOf()` không hiển thị nó; `esc()` vẫn là lớp thứ hai |
| S-01 | `seed-sepolia.js` in hướng dẫn `const RPC_URL = …` — tên hằng cũ, giao diện từ đợt 3 dùng mảng `RPC_URLS`; `.env.example` cũng vậy. Làm theo là trang lỗi | In `const RPC_URLS = [rpc1, "<RPC độc lập thứ hai>"]` kèm nhắc `page-integrity.js --release` |

### 11.3. Quét lại

| Kiểm tra | Kết quả |
|---|---|
| `npx hardhat test` | **160 passing** (V2 69 · V3 50 · đợt 3: 32 · CSP/SRI 4 · giao diện ≡ script 2 · XSS 3) |
| Coverage `CredentialRegistry.sol` | 100% câu lệnh · 99,23% nhánh · 100% hàm · 100% dòng (không đổi) |
| Slither 0.11.6 | Không đổi: 0 High/Medium, 3 Low `timestamp`, 1 Informational `assembly` |
| So ảnh trước/sau | 6 tab chụp ở 1400×1000 trên bản một tệp và bản ba tệp: **0 pixel khác** ở cả 6 tab |
| e2e đọc / ghi / băng ví | 19/19 · 14/14 · 13/13 trên bản ba tệp, 0 vi phạm CSP |
| e2e phát hành | Bản có SRI chạy bình thường qua HTTP; **sửa lén `app.js` → trình duyệt chặn** ("Failed to find a valid digest in the 'integrity' attribute") |
| Mở bằng `file://` | Bản phát triển: chạy. Bản phát hành (có SRI): **bị chặn** — trình duyệt không kiểm SRI cho `file://`. README ghi rõ: luôn phục vụ qua HTTP |
| `EVIDENCE.md` | Sinh lại trên node mới: 160 passing, 10 giao dịch, 14 hành vi bị chặn |
| Dữ liệu cá nhân trong repo | Không MSSV, không khóa riêng; còn họ tên tác giả ở `LICENSE`, `package.json`, `CONTRIBUTIONS.md` (ghi công — giữ có chủ đích) |

### 11.4. Lưu ý vận hành

- Sửa `app.js` khi đang có `integrity` (bản phát hành) mà không chạy lại `--release` thì trang chết — `test/Csp.test.js` vỡ để báo. Quy ước: trong repo giữ bản **không** SRI; chỉ gắn SRI ở bước phát hành (GĐ3).
- `style-src` vẫn `'unsafe-inline'` vì còn 67 thuộc tính `style=` trong markup và trong HTML do JS sinh ra — không đổi so với đợt 3.
- Báo cáo Lab 1 (thư mục riêng) mô tả "ứng dụng một tệp HTML" — sửa khi cập nhật báo cáo.


## 12. Đợt 5 (trưa 06/10/2026) — theo bản kiểm toán độc lập lượt 2 và quyết định của tác giả

Nguồn: bản kiểm toán lượt 2 (đánh giá đợt 3, 6 PoC G-01…G-06 lưu ở thư mục báo cáo riêng). Tác giả đã
quyết từng điểm trước khi sửa; dưới đây ghi cả chỗ **cố ý không sửa**.

### 12.1. Đối chiếu phát hiện lượt 2 → trạng thái đợt 5

| ID | Mức | Phát hiện | Quyết định / trạng thái |
|---|---|---|---|
| V32-01 | TB | Owner qua mốc lộ khóa "hồi sinh" được thu hồi hợp pháp và gắn cờ bằng thật trong 30 ngày; trung tâm không hủy được đề xuất | **Chấp nhận, ghi vào bài.** Không cho khóa Active tự hủy đề xuất (quyết định tác giả). Bù bằng **minh bạch**: lưu `compromiseDeclaredAt` (lúc công bố) và trả cùng `compromisedSince` trong `verifyCertificate`/`verifyInBatch`; giao diện hiện "công bố lúc X, lùi về Y (lùi N ngày)". Test G-03 ghim rủi ro, khẳng định độ lùi đọc được |
| V32-02 | TB | Kiểm tên chỉ xét ASCII — NBSP, ký tự vô hình, NFD lọt qua | **Đã sửa** — danh sách cho phép chữ tiếng Việt trên chuỗi (12.2). G-04 đảo kỳ vọng |
| V32-03 | Thấp | Mốc lộ tối đa 30 ngày; chỉ khai được lúc chuyển giao | **Ghi nhận là giới hạn** (G-05 ghim). Không thêm `declareCompromise` vì sẽ tăng quyền owner |
| V32-04 | Thấp | `getCertificate`/`leafRevokedAt` trả trạng thái thô | **Đã sửa** — thêm `effectiveStatus(certId)`; NatSpec ghi rõ "THÔ"; giao diện bỏ nhánh dự phòng dùng `getCertificate`. G-06 đảo kỳ vọng một phần (bản ghi thô vẫn `Revoked` — có chủ đích, lịch sử không xóa) |
| V32-05 | Thấp | Lần ngược `predecessorOf` và danh bạ đọc qua một RPC | **Sửa phần lần ngược**: mỗi bước gọi qua `crossCall`, RPC lệch thì không kết luận. **Danh bạ chấp nhận** đọc một RPC (chỉ để gợi ý; chọn mục giả thì bước xác minh nhiều RPC vẫn trả "Không tìm thấy") |
| V32-06 | Thấp | Chứng minh chủ ví chỉ đúng với EOA; nên dùng EIP-712 | Future work |
| V32-07 | Info | `frame-ancestors` cần HTTP header; nhắc "chỉ 1 RPC" | Nhắc "chỉ 1 RPC" **đã có sẵn** từ đợt 3 (`rpcNote`). Header: chọn host hỗ trợ header (Cloudflare Pages/Netlify) ở GĐ3 |
| PR-01 | TB | Đường cấp lẻ không salt; trình duyệt chỉ cấp lẻ | **Đã sửa phần giao diện** — cấp theo lô ngay trong trình duyệt (12.4) |
| SC-03 / owner multisig | — | Owner là một ví | **Future work** (quyết định tác giả): contract không cần sửa (kiểm `msg.sender`, chuyển quyền hai bước); chỉ thiếu test owner-multisig và giao diện đề xuất qua Safe. Issuer multisig: contract hỗ trợ (test nhóm E), giao diện chưa |
| APP-01 (QR) | Cao | Bản giấy / PDF lưu lại không xác minh được | **Future work** — ưu tiên lên testnet |
| OPS-01 | Cao | Chưa commit | Tác giả tự lưu bản sao; không commit trong đợt này |

### 12.2. Danh sách cho phép tên tiếng Việt (V32-02)

- **Contract** (`_requireCanonicalName`, assembly, chỉ đọc calldata): nhận chữ cái ASCII, chữ số, dấu cách, `( ) , -`, và **134 chữ có dấu tiếng Việt ở dạng dựng sẵn** — `C3 xx` (à á â ã è é ê ì í ò ó ô õ ù ú ý và chữ hoa), `C4/C5/C6 xx` (ă đ ĩ ũ ơ ư), `E1 BA A0–BF`, `E1 BB 80–B9` (U+1EA0–U+1EF9). Mỗi chuỗi nhiều byte được kiểm đủ độ dài và từng byte tiếp nối. Không dấu cách đầu/cuối, không hai dấu cách liền nhau.
- **Hệ quả:** NBSP, ký tự vô hình, BOM, dấu kết hợp rời (NFD), chữ Kirin/Hy Lạp, dấu chấm và mọi ký tự đặc biệt (`& # % ' /` …), gạch dài bị **từ chối trên chuỗi**. Tên viết tắt có dấu chấm ("TP.", "Cty.") phải viết đầy đủ — quyết định tác giả.
- **Chuẩn hóa ngoài chuỗi** (`scripts/lib/name.js` ≡ `app/app.js`, áp dụng **cả lúc công nhận lẫn lúc tra**): NFC → bỏ ký tự vô hình → "‐ ‑ ‒ – — ― −" thành "-" → gộp khoảng trắng → bỏ đầu/cuối. Tên dán từ PDF (thường ra NFD, NBSP, gạch dài) vẫn tra ra đúng đơn vị (test W5, e2e).
- **Giới hạn còn lại:** tên khác chữ hoa/thường, `l`/`I`, `0`/`O` — giao diện cảnh báo; test V2 nhóm 1b ghim.
- **Kiểm chứng khớp ba nơi:** test W4 sinh 300 tên ngẫu nhiên (trộn chữ hợp lệ và ký tự cấm), khẳng định `nameProblem()` của script và contract **cho cùng kết luận** trên từng tên; `test/UiShared.test.js` khẳng định `app.js` ≡ `scripts/lib/name.js`.

### 12.3. Độ trễ chuyển giao: bản thử nghiệm 1 phút

`INHERIT_DELAY = 1 minutes` (ghi cứng, quyết định tác giả — để demo trực tiếp trên local/testnet). **Thiết kế production là 48 giờ**; đổi hằng số trước khi triển khai thật. Giao diện **đọc giá trị từ hợp đồng** (`INHERIT_DELAY()`), không còn chữ "48 giờ" ghi cứng; thông báo lỗi `TimelockNotElapsed` đổi thành "Chưa hết thời gian chờ chuyển giao". Script đo gas/thang đo đọc độ trễ từ hợp đồng. Lưu ý: ở 1 phút, độ lệch timestamp vài giây của validator là đáng kể — chấp nhận vì chỉ là cấu hình demo.

### 12.4. Cấp theo lô trong trình duyệt (PR-01)

- Tab **Cấp chứng chỉ** có thêm mục "Cấp theo lô": chọn nhiều tệp, mỗi tệp một ô ví học viên (trống = vô danh), salt sinh bằng `crypto.getRandomValues`, cây Merkle dựng trên máy, một giao dịch `publishBatch`.
- **Cây Merkle tự viết** (khoảng 25 dòng, dùng ethers sẵn có — không nạp thêm thư viện/CDN): tái hiện đúng OpenZeppelin StandardMerkleTree v1.0.8. `test/UiShared.test.js` so **root, lá và proof** với thư viện OpenZeppelin cho n = 1, 2, 3, 5, 8, 13, 50, và khẳng định lá ≡ `leafOf` của contract, proof qua được `verifyInBatch`.
- **Biên nhận** cùng định dạng với `scripts/issue-batch.js` (`CredVerifyBatchReceipt` v1), tên tệp `NNN-<8 hex>.receipt.json`, **không** chứa tên tệp gốc. Tải từng tệp hoặc "Tải tất cả".
- **Bản sao** lưu trong `localStorage` (khóa `credverify.receipts`, kèm tên tệp gốc — chỉ trên máy đơn vị cấp). Tab **Tra cứu & thu hồi** liệt kê các lô: trạng thái từng chứng chỉ qua `verifyInBatch` (đã áp quy tắc vô hiệu thu hồi), tải lại biên nhận, **thu hồi từng chứng chỉ** (`revokeLeaf`) hoặc **cả lô** (`revokeBatch`). Nút "Xóa dữ liệu off-chain" xóa cả bản sao, kèm cảnh báo.
- Mặc định: cấp lẻ vẫn ở mục trên (không cần biên nhận); chọn nhiều tệp thì dùng mục lô; một tệp vẫn cấp theo lô được (riêng tư hơn, phải giữ biên nhận).

### 12.5. Thay đổi khác

- `effectiveStatus(certId)`; `compromiseDeclaredAt` (mapping công khai) và hai trường `compromisedSince`, `compromiseDeclaredAt` trong `VerifyResult`/`BatchVerifyResult`. `scripts/verify-receipt.js` in cả hai mốc.
- `scripts/seed-demo.js` **đã xóa** (đọc tệp ở đường dẫn cố định, deploy contract mới lệch địa chỉ, dùng tên Kirin mà đợt 5 chặn) — `collect-evidence.js` đã phủ kịch bản.
- Mẫu tên trong `scale-names.js` đổi "–" thành "-" (81/173 byte thay vì 83/175).
- Mã nguồn test: ký tự vô hình/Kirin/NFD trong chuỗi test viết dạng `\uXXXX` để đọc được.
- `add-issuer.js` từ chối tên ngoài danh sách cho phép trước khi gửi.

### 12.6. Quét lại

| Kiểm tra | Kết quả |
|---|---|
| `npx hardhat test` | **175 passing** (V2 69 · V3 50 · đợt 3: 32 · đợt 5: 13 · CSP/SRI 4 · giao diện ≡ script 4 · XSS 3) |
| Coverage `CredentialRegistry.sol` | **100% câu lệnh · 99,24% nhánh · 100% hàm · 100% dòng** — nhánh duy nhất chưa phủ vẫn là kiểm tra thừa trong `acceptOwnership` |
| Slither 0.11.6 | **0 High/Medium**, 3 Low `timestamp` (như đợt 3), 6 Informational đều ở vòng kiểm tên mới: `assembly`, `cyclomatic-complexity` (16), 4 × `too-many-digits` (hằng mặt nạ bit) — có chủ đích |
| e2e trình duyệt | đọc 19/19 · ghi 15/15 · băng ví 13/13 · **lô + tên + mốc công bố 16/16** (đăng lô 2 tệp, ví sai bị chặn, tải 2 biên nhận đúng tên/định dạng, bản sao trong localStorage, xác minh tệp + biên nhận hợp lệ, thu hồi một chứng chỉ trong lô ở tab Tra cứu → "Đã bị thu hồi", bằng giả hiện "công bố … lùi về", tên có dấu chấm bị chặn trước khi gửi, gạch dài tự đổi và tra theo tên gõ gạch dài vẫn ra) · bản phát hành SRI chặn `app.js` bị sửa; 0 vi phạm CSP |
| Số đo | Deploy 3.126.009 gas (Đợt 3: 2.969.896); `addIssuer` tên ngắn 165.763; tên VN 81 byte 245.039; mỗi 32 byte tên ≈ 28.408 gas; chuyển giao khi khóa lộ 79.054 + 189.437; `publishBatch` 72.120 bất kể n |
| `EVIDENCE.md` | Sinh lại: 175 passing, 10 giao dịch, 14 hành vi bị chặn; thêm dòng rủi ro chấp nhận V32-01 |
| Dữ liệu cá nhân | Không MSSV, không khóa riêng; họ tên tác giả ở `LICENSE`, `package.json`, `CONTRIBUTIONS.md` (ghi công) |

**Lỗi tìm thấy trong lượt quét lại và đã sửa:** (1) e2e ghi dựa vào thời gian chờ cố định — với độ trễ 1 phút, đề xuất dựng sẵn đã đủ hạn và thao tác "thực thi sớm" có thể chạy thật; e2e nay hủy rồi đề xuất mới và chờ kết quả thay vì ngủ cố định. (2) `EVIDENCE.md` ghi tab "Chứng chỉ của tôi" dùng `getCertificate` (thật ra là `verifyCertificate`) và còn câu "không chặn được chữ Kirin" — đã sửa nguồn trong `collect-evidence.js`. (3) Tên test V3 còn "48 giờ".

### 12.7. Còn mở sau đợt 5

| # | Vấn đề | Hướng |
|---|---|---|
| 1 | V32-01 (owner qua mốc lộ) | Chấp nhận; viết vào mô hình tin cậy của bài, kèm số liệu từ G-03 |
| 2 | Owner/issuer multisig, EIP-712 / EIP-1271 cho chứng minh chủ ví | Future work |
| 3 | Mã QR chứa biên nhận (APP-01), khai báo khóa lộ muộn (V32-03) | Future work / giới hạn |
| 4 | `INHERIT_DELAY` 1 phút | Đổi về 48 giờ trước khi triển khai thật |
| 5 | Danh bạ đọc một RPC, ~263 `eth_getLogs`/năm | Chấp nhận (chỉ gợi ý); indexer khi vận hành thật |
| 6 | CI, fuzz/invariant | Nếu còn thời gian |
| 7 | Ảnh chụp màn hình V2; báo cáo Lab 1 mô tả V2 | GĐ3 / GĐ5 |

---

## 13. Đợt 6 (chiều 06/10/2026) — `revokeLeaf` chỉ nhận lá thật; thống kê kiểm toán theo đơn vị

Nguồn: tác giả tự phát hiện (V34-01) khi rà lại đường thu hồi trong lô; mục thống kê lấy từ phần "kế thừa từ
các bài tham khảo kiến trúc" (đếm công khai theo đơn vị phát hành). Quyết định của tác giả: **làm** V34-01 và
thống kê; **không làm** `evidenceHash` / chứng thư X.509 cho đơn vị phát hành (để future work).

### 13.1. V34-01 (Cao) — nút trong của cây được ghi nhận là "lá đã thu hồi"

**Phát hiện.** `revokeLeaf(batchId, root, leaf, proof)` chỉ kiểm `MerkleProof.verify(proof, root, leaf)`.
Một **nút trong** của cây, gửi kèm phần proof phía trên nó, cũng thỏa điều kiện đó. Giao dịch thành công,
ghi `leafRevocation[batchId][nút]`, phát `LeafRevoked` — nhưng `verifyInBatch` tính lá từ tệp và biên nhận
nên **không bao giờ** trùng nút trong: chứng chỉ vẫn `valid = true`, `leafRevoked = false`.

**Vì sao nâng từ Thấp (SC-06) lên Cao.** Lượt trước coi là "vô hại vì không chứng chỉ nào bị ảnh hưởng".
Nhưng hệ quả là **bản ghi công khai nói một đằng, kết quả xác minh nói một nẻo**:
- Đơn vị (hoặc client lỗi) tưởng đã thu hồi một chứng chỉ — có tx, có event — mà chứng chỉ vẫn hợp lệ.
- Người theo dõi event (nhật ký, thống kê) đếm được một lần thu hồi không hề có hiệu lực.
- Một nút trong ở tầng cao "che" nhiều lá: nhìn event tưởng thu hồi cả nhánh, thật ra không thu hồi gì.

PoC (ngoài repo, thư mục báo cáo): thu hồi nút trong → `LeafRevoked` phát ra, `verifyInBatch` vẫn hợp lệ;
đồng thời khẳng định keccak(nút trong) không nằm trong cây — cơ sở của cách sửa.

**Sửa.** `revokeLeaf(batchId, root, inner, proof)`: người gọi gửi `inner = keccak256(abi.encode(certHash,
holder, salt))`, contract **tự tính** `leaf = keccak256(bytes.concat(inner))` rồi mới kiểm proof. Nút trong là
keccak của 64 byte; để nó thành một lá hợp lệ phải có `inner` với keccak(inner) = nút trong ⇒ tìm tiền ảnh
keccak, bất khả thi. Thêm `leafInnerOf(certHash, holder, salt)`; `leafOf` viết lại qua `leafInnerOf`.

**Các phương án đã cân nhắc.**

| Phương án | Vì sao không chọn |
|---|---|
| Gửi tiền ảnh của lá `(certHash, holder, salt)` | Lộ `certHash` và ví học viên trong calldata — phá tính riêng tư của đường lô |
| Kiểm proof có độ dài đúng độ sâu cây / kiểm mọi tổ tiên | Contract không biết độ sâu thật (`leafCount` tự khai); thêm gas; vẫn phải tin dữ liệu ngoài chuỗi |
| **Gửi `inner` (đã chọn)** | `inner` có muối nên không dò ngược được tệp hay ví; khớp đúng cách `verifyInBatch` tính lá; chỉ thêm một keccak (~40 gas) |

**Tương thích.** Chữ ký hàm giữ nguyên kiểu `(bytes32, bytes32, bytes32, bytes32[])` nên selector **không đổi**
— một client cũ còn gửi *lá* sẽ bị từ chối `LeafNotInBatch` (keccak(lá) không nằm trong cây), không ghi nhầm.
Đã cập nhật mọi nơi gọi: `app/app.js` (ABI + `merkleInner`), `scripts/lib/batch.js` (thêm trường `inner`
trong entries), `scripts/seed-sepolia.js`, `scripts/gas-v3.js`, các test V3/đợt 3. Biên nhận không đổi định dạng
(`inner` tính lại được từ `certificate.{certHash, holder, salt}`).

**Test** (nhóm V34-01 trong `test/CredentialRegistryV3.test.js`, 6 test): nút trong ở **mọi tầng** kể cả root với proof rỗng
bị từ chối; gửi chính lá (cách gọi cũ) bị từ chối; `inner` thật thu hồi đúng một chứng chỉ, event mang **lá thật**
(= `leafOf`), các lá khác không đổi, gọi lại báo `LeafAlreadyRevoked`; lô một chứng chỉ (root = lá);
`leafInnerOf` ≡ cách tính ngoài chuỗi. Test V3 "nút trong không dùng làm lá được" **đảo kỳ vọng**: trước
`staticCall` thành công, nay revert `LeafNotInBatch`. `test/UiShared.test.js` khẳng định `merkleInner` của
giao diện ≡ `leafInnerOf` và thu hồi bằng nó thì `verifyInBatch` thấy ngay.

### 13.2. Thống kê kiểm toán theo đơn vị (tab Đơn vị phát hành)

- Bảng mới "Thống kê kiểm toán theo đơn vị", dựng **hoàn toàn từ event**, không đổi contract, không thêm lời
  gọi RPC (dùng chung lượt quét với nhật ký quản trị).
- Gom theo **danh tính** (khóa gốc của chuỗi kế nhiệm), không theo ví — xoay khóa không xóa lịch sử của một trung tâm.
  Đơn vị đã công nhận mà chưa làm gì vẫn có dòng toàn số 0.
- Cột: cấp lẻ · số lô · Σ chứng chỉ trong lô (**tự khai**) · cấp sau mốc lộ · thu hồi lẻ · thu hồi trong lô ·
  thu hồi cả lô · thu hồi bị vô hiệu. Hai cột cảnh báo tô đỏ khi > 0.
- "Thu hồi bị vô hiệu" và "cấp sau mốc lộ" áp **đúng quy tắc `_voided` của contract** (khóa K đã bị tuyên bố lộ
  từ mốc c, thao tác tại t ≥ c), đọc mốc từ event `KeyCompromised`.
- **Giới hạn ghi trên trang và vào bài:** số lần cấp lẻ, số lô, số lần thu hồi là **chính xác** (mỗi số là một
  event); Σ chứng chỉ trong lô là `leafCount` do đơn vị tự khai — contract không đếm được số lá thật của cây.
  Thống kê đọc qua một RPC (như danh bạ — chỉ để quan sát, không dùng để kết luận một chứng chỉ).
- Kiểm chứng: `test/UiShared.test.js` dựng kịch bản khóa bị đánh cắp (thu hồi + cấp giả sau mốc lộ, rồi chuyển
  giao và khóa mới thu hồi lô) và khẳng định từng con số của `issuerStats()` thật trong `app.js`; e2e so bảng
  trên trang với một phép đếm **độc lập** viết lại trong script e2e, đọc log thẳng từ node.

### 13.3. Sửa giao diện phát hiện khi quét lại

- **Trang cuộn ngang trên điện thoại** ở tab Đơn vị phát hành (166 px, có từ trước đợt 6: địa chỉ ví đầy đủ trong bảng
  và băng cảnh báo) và tab Quản trị (12 px). Nguyên nhân: phần tử con của grid mặc định `min-width: auto`.
  Sửa: `main > * { min-width: 0 }`, chuỗi hex trong bảng/băng được ngắt (`overflow-wrap: anywhere`); bảng thống kê
  9 cột cuộn trong khung riêng (`.scroll-x`). Đo lại ở 390 px: 0 px cuộn ngang ở cả 6 tab.

### 13.4. Quét lại

| Kiểm tra | Kết quả |
|---|---|
| `npx hardhat test` | **182 passing** (V2 69 · V3 50 · đợt 3: 32 · đợt 5: 13 · **đợt 6: 6** · CSP/SRI 4 · giao diện ≡ script **5** · XSS 3) |
| Coverage `CredentialRegistry.sol` | **100% câu lệnh · 99,24% nhánh · 100% hàm · 100% dòng** (không đổi) |
| Slither 0.11.6 | Không cảnh báo mới — vẫn 9 kết quả, 0 High/Medium (3 Low `timestamp`, 6 Info ở vòng kiểm tên) |
| e2e trình duyệt (fixture mới) | đọc 19/19 · ghi 15/15 · băng ví 13/13 · lô + tên + mốc công bố 16/16 (thu hồi trong lô qua `inner`) · **thống kê 10/10** (khớp phép đếm độc lập, gộp chuỗi khóa thành một dòng, dòng toàn 0 cho đơn vị chưa cấp, không cuộn ngang ở 390 px) · bản phát hành SRI 3/3; 0 vi phạm CSP |
| Số đo | Deploy **3.147.866** gas (Đợt 5: 3.126.009, +21.857 do `leafInnerOf`); `revokeLeaf` 61–65 nghìn (theo độ dài proof, như trước) |
| `EVIDENCE.md`, `docs/GAS-V3.md`, `docs/slither-report.txt` | Sinh lại |
| Dữ liệu cá nhân | Không MSSV, không khóa riêng, không đường dẫn máy cá nhân trong tệp sinh ra |

### 13.5. Còn mở sau đợt 6

| # | Vấn đề | Hướng |
|---|---|---|
| 1 | `evidenceHash` / chứng thư X.509 khi công nhận đơn vị | Không làm (quyết định tác giả) — future work |
| 2 | V32-01, multisig, QR, EIP-712 | Như 12.7 |
| 3 | `INHERIT_DELAY` 1 phút | Đổi về 48 giờ trước khi triển khai thật |
| 4 | Thống kê và danh bạ đọc một RPC | Chấp nhận (quan sát, không kết luận); indexer khi vận hành thật |

---

## 14. Đợt 7 (08/10/2026) — đơn vị bị gỡ không xoay khóa; giả định tin cậy multisig

Chỉ sửa **giao diện** và tài liệu; contract giữ nguyên đợt 6 (bytecode không đổi).

### 14.1. Bối cảnh: đơn vị bị gỡ vì gian lận

Câu hỏi: một đơn vị bị gỡ quyền vì gian lận thì các chứng chỉ (hoặc lô) gian lận nó đã cấp có bị chặn không?

- **Đường xử lý đã có:** trong `RECOVERY_WINDOW` (7 ngày sau `removeIssuer`), owner `proposeInherit` danh tính
  sang một khóa sạch, chờ `INHERIT_DELAY`, `executeInherit`, rồi dùng khóa đó `revokeCertificate` / `revokeBatch`
  các chứng chỉ, lô gian lận. Trường hợp "gỡ vì gian lận" **xử lý được nếu hành động kịp**.
- **Quá 7 ngày:** danh tính đóng băng. Không ai, kể cả owner, thu hồi được gì nhân danh khóa đó nữa.
  **Quyết định của tác giả: chấp nhận, đây là đánh đổi có chủ ý.** Đó là điều kiện để lời hứa "vẫn xác minh được
  sau khi trung tâm giải thể" đứng vững (V3-01), vì nếu không có hạn, owner thu hồi được toàn bộ chứng chỉ của một
  trung tâm đã giải thể. Liên quan SC-05 (owner đóng băng trung tâm hợp pháp): vẫn ghi nhận như mục 10.9.
- **Hệ quả vận hành:** quy trình xử lý gian lận phải hoàn tất trong 7 ngày kể từ lúc gỡ. Với giả định owner là ví
  đa chữ ký (14.3), k người ký phải phối hợp được trong khoảng đó.

### 14.2. Sửa giao diện: khung vàng khi đơn vị cấp đã ngừng hoạt động mà không xoay khóa

**Vấn đề:** trước đợt 7, chứng chỉ của một khóa đã bị gỡ (Disabled) và **không** được chuyển sang khóa mới vẫn hiện
khung **xanh** "Chứng chỉ hợp lệ". Băng xám "Đơn vị cấp nay đã bị vô hiệu hóa" nằm bên dưới, dễ bị bỏ qua. Người xác
minh không phân biệt được trung tâm đang hoạt động với một trung tâm đã giải thể, hoặc bị gỡ vì gian lận mà chưa ai thu hồi.

**Sửa** (`app/app.js`, `app/app.css`, vài dòng, không đụng hợp đồng):
- `orphanedIssuer(issuer, issuerState, currentKey)` trả đúng khi khóa cấp ở trạng thái Disabled **và** danh tính không
  có khóa hiện hành nào đang Active.
- Trạng thái của khóa hiện hành đọc **thẳng từ hợp đồng**: `currentKeySafe` gọi thêm `issuerStatus(currentKey)`.
  Danh bạ dựng từ event chỉ là dự phòng, nên kết quả không sai khi RPC không trả được event.
- `renderVerdict` và `renderBatchVerdict`: khi `valid` và `orphanedIssuer`, khung dùng lớp `caution` (viền và tiêu đề
  màu `--pending`, nền vàng nhạt). Tiêu đề là "Hợp lệ trên chuỗi — nhưng đơn vị cấp đã ngừng hoạt động". Phần giải thích
  nêu: đơn vị có thể đã giải thể, hoặc bị gỡ vì khóa lộ / gian lận mà chưa được xử lý; không còn ai thu hồi được chứng chỉ
  của khóa này, trừ khi CredVerify chuyển danh tính sang khóa mới trong 7 ngày sau khi gỡ; người xác minh nên đối chiếu
  trực tiếp với đơn vị đào tạo hoặc CredVerify trước khi chấp nhận. Băng xám cũ không lặp lại trong trường hợp này.
- **Không đổi:** trạng thái chứng chỉ vẫn "Còn hiệu lực" (owner không viết lại quá khứ). Đơn vị đã xoay sang khóa mới đang
  hoạt động vẫn hiện khung xanh kèm băng "đã xoay sang khóa mới". Bằng cấp sau mốc lộ vẫn hiện khung đỏ "KHÔNG ĐÁNG TIN"
  (ưu tiên cao hơn khung vàng).
- `issuerStateNote` dùng cùng cách kiểm khóa hiện hành (trước đây chỉ dựa vào danh bạ từ event).

**e2e mới (`run10`, 10/10):** đơn vị mới cấp một chứng chỉ lẻ và một lô, sau đó bị gỡ mà không xoay khóa. Kiểm tra:
- chứng chỉ lẻ (tra theo tên) và chứng chỉ trong lô (nộp biên nhận) đều hiện **khung vàng**, viền đúng màu `#8A6A1F`;
- trạng thái vẫn "Còn hiệu lực" và không có băng lặp;
- owner chuyển danh tính sang khóa sạch trong `RECOVERY_WINDOW`, xác minh lại thì cả hai trở về **khung xanh** kèm
  "đã xoay sang khóa mới";
- không có lỗi trang, không vi phạm CSP.

### 14.3. Giả định tin cậy: owner và issuer là ví đa chữ ký

Phân tích an toàn của đề tài **giả định** rằng khi triển khai thật:

| Vai trò | Giả định | Contract có cần sửa không |
|---|---|---|
| `owner` (CredVerify) | Ví đa chữ ký k-trên-n (ví dụ Safe, khuyến nghị 2-trên-3), các khóa ký do những người khác nhau giữ trên thiết bị khác nhau | Không. Mọi kiểm quyền dùng `msg.sender`, `transferOwnership`/`acceptOwnership` hai bước (Safe gọi `acceptOwnership`). Chưa có test owner-multisig (future work) |
| Mỗi `issuer` | Ví đa chữ ký k-trên-n của đơn vị đào tạo | Không. Issuer là contract đã có test nhóm E (`MultiSigIssuerMock`) |

**Giả định bịt được:**
- **Kẻ ngoài chiếm một khóa:** một khóa ký bị lộ không đủ để cấp, thu hồi, đề xuất chuyển giao hay khai báo mốc lộ.
  Các kịch bản SC-01/SC-02 ("khóa issuer bị lộ") khó xảy ra hơn; cơ chế mốc lộ của đợt 3 trở thành lớp phòng thủ thứ hai.
- **Một người trong cuộc lạm quyền:** V32-01 (owner chọn mốc lộ), SC-03 (owner cướp danh tính một trung tâm đang hoạt
  động) và SC-05 (owner gỡ rồi để đóng băng) đều cần **k người ký cùng đồng ý**, và vẫn công khai qua event cùng `INHERIT_DELAY`.

**Giả định KHÔNG bịt được:**
- k người ký cùng thông đồng;
- người giữ khóa ký bị ép buộc;
- quy trình quản trị nội bộ của chính ví đa chữ ký (ai được thêm hoặc bớt làm người ký);
- lỗi của contract ví.

Các rủi ro chấp nhận ở trên được đánh giá **dưới giả định này**.

**Bản MVP/demo** (local, testnet) dùng ví một khóa cho cả owner lẫn issuer, và `INHERIT_DELAY` = 1 phút. Ở bản demo,
mọi rủi ro trên cao hơn mô hình giả định. Đó là cấu hình trình diễn, không phải cấu hình triển khai.

**Hệ quả cho bài báo:** mục "Mô hình tin cậy" phải nêu giả định này tường minh, tách hai tác nhân (kẻ ngoài chiếm khóa;
người trong cuộc lạm quyền) và nêu rõ phần không bịt được. Phần hiện thực multisig (test owner-multisig, giao diện đề xuất
qua Safe) là future work.

### 14.4. Quét lại

| Kiểm tra | Kết quả |
|---|---|
| `npx hardhat test` | 182 passing (contract không đổi) |
| `page-integrity --check` | CSP/SRI khớp |
| e2e (fixture mới) | đọc 19/19 · ghi 15/15 · băng ví 13/13 · lô 16/16 · thống kê 10/10 · **đơn vị ngừng hoạt động 10/10** · bản phát hành SRI 3/3 |
| README | Thêm mục giao diện 5 (khung vàng) và gạch đầu dòng "Giả định tin cậy" ở mục 11; sửa câu cũ "đời thứ N/8" thành "đời thứ N" |
| Phiên bản | `package.json` 3.4.1 |

### 14.5. Bỏ contract tấn công `EvilRegistry` (08/10, theo đề xuất của tác giả)

- **Lý do:** `EvilRegistry` mô phỏng kịch bản thời V2: kẻ gian đưa cho nạn nhân một địa chỉ contract giả, rồi dùng chuỗi
  revert để chèn mã vào giao diện. Từ V3, địa chỉ hợp đồng **ghi cứng** trong `app/app.js` (cùng hằng số neo), nên kịch bản
  đó không còn áp dụng.
- **Phần đe dọa vẫn còn:** chuỗi lỗi đến từ **RPC**. Một RPC độc hại hoặc bị chiếm trả được bất kỳ thông điệp lỗi nào,
  bất kể địa chỉ hợp đồng; khi đó `reasonOf()` trả nguyên chuỗi. Lớp chặn là **chỗ hiển thị**.
- **Viết lại `test/XssViaRevertString.test.js`, không cần contract** (4 test, trước đây 3):
  1. Dựng lỗi `CALL_EXCEPTION` mang revert `Error(string)` chứa payload → giao diện chỉ hiện "Contract từ chối (Error)".
  2. Dựng lỗi JSON-RPC chứa payload → `reasonOf()` trả nguyên chuỗi và `esc()` vô hiệu hóa được nó.
  3. **Mới:** quét mã nguồn `app.js`, khẳng định **mọi** chỗ dùng `reasonOf()` đều đi qua `bannerText` (textContent),
     `esc` (sổ nhật ký, `DIR.logsError`) hoặc `alert`; không chỗ nào chèn thẳng vào `innerHTML`.
  4. `esc()` vô hiệu hóa payload.

  Bỏ test "deploy contract giả qua được kiểm tra getCode/chainId", vì nó thuộc kịch bản nhập địa chỉ đã không còn.
- **Đã cập nhật theo:** `collect-evidence.js` (bỏ đoạn giải thích độ phủ của `EvilRegistry`), README (bảng test, cấu trúc
  thư mục), `EVIDENCE.md` và coverage được sinh lại khi không có `contracts/attack/`.
- **Giữ nguyên:** bộ lọc `contracts/attack` trong lệnh Slither (vô hại, và GĐ3 sẽ đặt contract đối chứng kiểu IET ở đó).
- **Không bỏ:**
  - `contracts/test/MultiSigIssuerMock.sol`: test nhóm E, là bằng chứng cho giả định issuer đa chữ ký (14.3).
  - `contracts/legacy/CredentialRegistryV2.sol`: dùng để đo gas so sánh và cho `scale-names.js`.
- **Quét lại:** `npx hardhat test` **183 passing** khi không có `contracts/attack/`. Coverage của `CredentialRegistry.sol`
  không đổi (100 / 99,24 / 100 / 100).

---

## 15. Rà soát khả năng mở rộng (08/10/2026)

Rà lại `docs/SCALE-NAMES.md`, các mục 9.5, 12.7, 13.5 và ba lượt kiểm toán độc lập (lượt 3: APP-05 "đã xử lý; danh bạ
đầy đủ cần indexer"). Hai phát hiện dưới đây **không có** trong bản kiểm toán nào; tìm ra khi soát mã.

**Trên chuỗi: không có trần theo số đơn vị hay số chứng chỉ.**
- Mọi hàm O(1). Vòng lặp duy nhất là vòng kiểm tên (≤ 256 byte).
- Trần cứng còn lại đều xa thực tế: tên 256 byte; `leafCount` `uint32` (~4,29 tỷ chứng chỉ/lô); mốc thời gian `uint64`.
- Kích thước contract 14.218 byte, dưới giới hạn 24.576 byte của EIP-170 (số của kiểm toán lượt 3).
- Giới hạn thật là chi phí và thông lượng của đường cấp lẻ: mỗi chứng chỉ một giao dịch, ~72.700 gas. Đường lô ~72.000
  gas bất kể n.

| ID | Mức | Phát hiện | Trạng thái |
|---|---|---|---|
| MR-01 | **Cao** | **Mất biên nhận khi `localStorage` đầy.** Chromium cho ~5,24 triệu ký tự mỗi origin (đo thật). Mỗi biên nhận trong bản sao chiếm ~1,0–1,6 nghìn ký tự, nên đầy sau ~3.400 biên nhận cộng dồn trên một máy. `writeJSON` nuốt lỗi; `receiptTable` đọc lại từ `localStorage`. **Tái hiện (e2e, làm đầy bộ nhớ rồi đăng lô 2 tệp):** giao dịch thành công, trang vẫn báo "Bản sao đã lưu trên máy này", nhưng 0 nút tải biên nhận và `localStorage` trống. Salt và proof không còn ở đâu ⇒ **cả lô đã đăng không xác minh được** | **Mở** — đề xuất: bắt tải một tệp gói toàn bộ biên nhận **trước** khi gửi `publishBatch` (salt/proof đã biết trước giao dịch); kiểm lưu thành công, báo đỏ nếu không; "Tải tất cả" thành một tệp |
| MR-02 | Trung bình | **Thống kê đợt 6 tải mọi event cấp lẻ và thu hồi của tất cả đơn vị.** Lượng dữ liệu tăng theo tổng số chứng chỉ cấp lẻ; RPC giới hạn số event mỗi lần trả ⇒ vượt thì cả nhật ký quản trị lẫn thống kê báo "Không đọc được". Kết quả xác minh không bị ảnh hưởng | **Mở** — đề xuất: lưu đệm event đã quét, chỉ quét block mới; tự chia nhỏ khúc khi RPC từ chối; chỉ tải thống kê khi người dùng bấm xem. Triển khai thật: indexer |
| MR-03 | Thấp | **Số lời gọi `eth_getLogs` theo tuổi contract** (~263/năm/lượt quét, đã ghi từ 9.5). Tab Đơn vị phát hành chạy 3 lượt quét | Chấp nhận cho demo/testnet; indexer khi vận hành thật |
| MR-04 | Thấp | Tab Tra cứu & thu hồi gọi `verifyInBatch` **lần lượt** cho từng biên nhận mỗi lần vẽ lại; "Tải tất cả" tải từng tệp, cách nhau 0,25 giây | **Mở** — chỉ kiểm khi mở từng lô; gộp tải thành một tệp (cùng MR-01) |

**Hướng triển khai thật — indexer.** Ghi thành mục 12.1 của README: định nghĩa, lựa chọn (The Graph, Ponder, script
tự viết dùng lại `scripts/lib/directory.js`), ranh giới tin cậy, cách kiểm chéo, thời điểm cần.
- Indexer chỉ phục vụ danh bạ, nhật ký, thống kê.
- Kết luận xác minh luôn đọc thẳng contract qua nhiều RPC.
- Kiểm chéo bằng `activeIssuerCount()`.
- Không lưu dữ liệu cá nhân.

**Kiểm toán lượt 3 (08/10, đợt 7)** ghi thêm V341-01 (TB, `INHERIT_DELAY` ghi cứng 60 giây), V341-02, V341-03, V341-04
(Thấp). Các mục này **chưa xử lý**, chờ tác giả quyết.

---

## 16. Đợt 8 (tối 08/10/2026) — bản V3 chính thức đưa lên testnet và GitHub

Quyết định của tác giả (08/10):
- **Làm V341-01** theo phương án "tham số lúc deploy".
- **Để sau MR-01** (lỗi đã biết, ghi ở mục 15).
- Deploy **Sepolia, owner là một ví**, đúng giả định cấu hình demo ở 14.3.
- Bản này là **V3 chính thức** đưa lên GitHub.

### 16.1. V341-01 [TB, kiểm toán lượt 3] — `INHERIT_DELAY` thành tham số constructor

- **Contract:**
  - `uint64 public immutable INHERIT_DELAY`, đặt bằng `constructor(uint64 inheritDelay)`, bất biến sau deploy và
    đọc được trên explorer;
  - biên `MIN_INHERIT_DELAY = 1 minutes`, `MAX_INHERIT_DELAY = 7 days` (= `RECOVERY_WINDOW`); ngoài biên thì revert
    `InvalidInheritDelay`;
  - **giữ tên viết hoa** để getter `INHERIT_DELAY()` không đổi: giao diện, script và tài liệu đều gọi tên này.
- **Quy tắc chọn giá trị — `scripts/lib/delay.js`** (dùng chung cho `deploy.js` và `seed-sepolia.js`):
  - mặc định **48 giờ**;
  - `INHERIT_DELAY_SECONDS` trong `.env` đặt giá trị khác;
  - trên mạng không phải local/testnet (31337, Sepolia, Base Sepolia, Arbitrum Sepolia) **từ chối dưới 24 giờ**.

  Lỗi lượt 3 cảnh báo ("deploy bản thật với độ trễ demo, mà contract thì bất biến") nay bị chặn trước khi gửi giao
  dịch. Script in giá trị trước và sau deploy; `docs/sepolia-evidence.md` ghi lại giá trị.
- **Sàn 1 phút là có chủ ý:** contract không biết mình chạy trên mạng thật hay demo, nên sàn production nằm ở script.
  Mức phòng thủ dựa trên giá trị công khai: ai cũng đọc được `INHERIT_DELAY()` trên explorer, và giao diện hiện độ trễ
  đọc từ chuỗi.
- **Bằng chứng (`EVIDENCE.md`) và đo gas** deploy với **48 giờ** như production; script tua thời gian.
- **Test và e2e dùng giá trị nào:** bộ test và e2e deploy với 60 giây (`test/helpers.js`). Kịch bản e2e dựng sẵn,
  `scale-names.js` và `scale-probe.js` cũng dùng 60 giây.
- **Test mới — nhóm V341-01 trong `test/CredentialRegistryV3.test.js` (8 test):**
  - biên constructor (0, 59, 7 ngày + 1 bị từ chối; 60, 1 giờ, 48 giờ, 7 ngày được nhận);
  - deploy 48 giờ: thực thi sớm 2 giây thì bị chặn, đúng hạn thì chạy;
  - độ trễ tối đa vẫn thực thi được với đề xuất tạo sát hạn cửa sổ khôi phục;
  - bốn test cho quy tắc của `delay.js`.

### 16.2. Quét lại

| Kiểm tra | Kết quả |
|---|---|
| `npx hardhat test` | **191 passing** (V2 69 · V3 50 · đợt 3: 32 · đợt 5: 13 · đợt 6: 6 · **đợt 8: 8** · CSP/SRI 4 · giao diện ≡ script 5 · XSS 4) |
| Coverage `CredentialRegistry.sol` | 100% câu lệnh · **99,26% nhánh** · 100% hàm · 100% dòng |
| Slither 0.11.6 | 10 kết quả, 0 High/Medium. **Mới:** 1 Informational `naming-convention` (`INHERIT_DELAY` là immutable mà tên viết hoa), có chủ đích như trên |
| e2e trình duyệt (fixture mới) | đọc 19/19 · ghi 15/15 · băng ví 13/13 · lô 16/16 · thống kê 10/10 · đơn vị ngừng hoạt động 10/10 · bản phát hành SRI 3/3; độ trễ hiện "1 phút" đọc từ hợp đồng |
| `deploy.js` | Mặc định in "172800 giây (2 ngày)" và đọc lại đúng trên chuỗi; `INHERIT_DELAY_SECONDS=59` bị từ chối trước khi gửi |
| `seed-sepolia.js` (chạy thử trên node local, 3600 giây) | Đủ 8 bước; bảng bằng chứng có dòng `INHERIT_DELAY` |
| Số đo | Deploy **3.177.154** gas (Đợt 6: 3.147.866, +29.288) |

### 16.3. Còn mở khi phát hành đợt 8

| # | Vấn đề | Trạng thái |
|---|---|---|
| 1 | MR-01: mất biên nhận khi `localStorage` đầy (mục 15) | **Lỗi đã biết, để sau** theo quyết định tác giả; chỉ ở giao diện, sửa được mà không deploy lại contract |
| 2 | MR-02 đến MR-04 (quét event, thống kê, tab Tra cứu) | Mở; indexer khi vận hành thật (README 12.1) |
| 3 | V341-02 (dòng nhắc khi ký chứng minh chủ ví), V341-03 (CSP chỉ một URL ethers), V341-04 (`npm audit` công cụ phát triển) | Chưa làm; đều ở giao diện hoặc công cụ, không chặn deploy |
| 4 | Owner Sepolia là một ví | Đúng giả định cấu hình demo (14.3); Safe là future work |
| 5 | OPS-01: commit và tag | Tác giả commit và gắn tag khi đưa lên GitHub |
| 6 | Ảnh chụp màn hình | Tác giả đã gỡ bộ 11 ảnh giao diện V2 (không còn khớp). README, `CONTRIBUTIONS.md` và EVIDENCE mục 12 đã sửa theo; chụp lại trên bản Sepolia |
| 7 | `Demo/DemoCert.pdf` | Tác giả thay bằng mẫu Canva. Metadata Author "gamer player" là tên tài khoản, không phải dữ liệu cá nhân (kiểm toán lượt 3). Bằng chứng sinh lại với tệp này |

---

## 17. Đợt 9 (tối 08/10/2026) — hợp nhất thành bản V3 chính thức

Quyết định của tác giả: bản đưa lên GitHub là **V3**, không còn số phiên bản phụ. Lịch sử thay đổi được ghi theo đợt
và ngày (bảng đầu tệp). Mã phát hiện của kiểm toán độc lập (V32-xx, V34-01, V341-xx) **giữ nguyên**, vì báo cáo kiểm
toán đang tham chiếu chúng.

| Hạng mục | Thay đổi |
|---|---|
| Phiên bản | `package.json` **3.0.0**; tiêu đề contract "CredentialRegistry V3"; giao diện, script và tài liệu chỉ ghi V3 |
| Comment trong mã | Bỏ comment lịch sử ("V3.x: …", "trước V3.y …") và mã phát hiện trong contract, giao diện, script, test; giữ NatSpec và các giải thích về quyền, bất biến, lý do thiết kế. Bỏ đoạn xóa khóa `localStorage` cũ của bản có ô "Nâng cao" (đã không còn) |
| Test | Gộp các tệp test theo đợt vào **`test/CredentialRegistryV3.test.js`** (109 test, năm nhóm: A–E · S1–S7 · W–G · V34-01 · V341-01). Bộ test kế thừa từ V2 giữ ở `test/CredentialRegistry.test.js`. Còn 5 tệp test, tổng **191 test** — số lượng và nội dung từng test không đổi |
| Tài liệu sinh tự động | `docs/GAS-V3.md`, `docs/SCALE-NAMES.md`, `EVIDENCE.md`, `docs/slither-report.txt` sinh lại với văn bản chỉ ghi V3 |

**Quét lại:**
- **Test:** 191 passing (CredentialRegistry 69 · CredentialRegistryV3 109 · CSP/SRI 4 · giao diện ≡ script 5 · XSS 4).
- **Coverage `CredentialRegistry.sol`:** 100 / 99,26 / 100 / 100.
- **Slither:** 10 kết quả, 0 High/Medium (không đổi).
- **e2e:** đủ 7 bộ qua.
- **CSP/SRI:** `page-integrity --check` khớp.
- **Deploy:** 3.177.154 gas. Bỏ comment không đổi bytecode thực thi.

---

## 18. Đợt 10 (tối 09/10/2026) — fuzz bất biến Foundry (kiểm toán lượt 4, đóng OPS-04)

Kiểm toán độc lập lượt 4 chạy fuzz bất biến bằng Foundry 1.5.1 (480.000 lời gọi trên hai cấu hình INHERIT_DELAY)
và Aderyn 0.6.8. **Không có phát hiện mới.** Contract **không đổi** trong đợt này, nên bytecode, gas deploy
(3.177.154), coverage và kết quả Slither giữ nguyên.

**Mutation test của kiểm toán viên:** cài lại 8 lỗi giả M1–M8 vào contract — gồm các lỗi đã sửa V2-01, V3-01,
V34-01, SC-03 — fuzz bắt được cả 8, mỗi lỗi rút gọn còn 1–5 bước gọi. Bộ bất biến đủ nhạy để bắt lại đúng các
lỗi lịch sử nếu chúng tái xuất hiện.

**Aderyn:** 0 High. Bốn Low, không cần sửa contract:

| Mã | Nội dung | Xử lý |
|---|---|---|
| L-1 | Tập trung quyền: 8 hàm `onlyOwner` | Giả định tin cậy đã ghi (README mục 11); multisig là hướng phát triển |
| L-2 | Số `0x20` viết thẳng trong assembly | Chấp nhận — chỉ ảnh hưởng dễ đọc; không đổi bytecode trước deploy |
| L-3 | Trường struct `compromiseDeclaredAt` trùng tên mapping | Chấp nhận — đổi tên sẽ đổi tên trường trong ABI mà giao diện và test đang dùng |
| L-4 | Hằng mặt nạ bit bị báo không dùng | Báo nhầm — các hằng được dùng trong khối assembly kiểm tên |

**Đưa vào repo:**

| Tệp | Nội dung |
|---|---|
| `test/foundry/Invariants.t.sol` | Bộ fuzz của kiểm toán viên. Hai chỉnh sửa: đường import trỏ `contracts/`; `afterInvariant` ghi thống kê vào `cache-foundry/invariant-stats.txt` (đã gitignore) |
| `foundry.toml` | `src = contracts`, `test = test/foundry`, solc 0.8.24, optimizer 200, evm `paris` (khớp Hardhat); 1000 lượt × độ sâu 80, `fail_on_revert = false`, seed `0x20261009`; remapping OpenZeppelin và forge-std vào `node_modules` |
| `package.json` | devDependency `forge-std` 1.17.0 (từ GitHub, khóa commit trong `package-lock.json`); script `npm run fuzz` |
| `package.json`, README, `scripts/collect-evidence.js` | Lệnh Slither thêm `--compile-force-framework hardhat`: có `foundry.toml` thì Slither mặc định chọn Foundry |
| `docs/fuzz-report.txt` | Log gốc của lần chạy dưới |

Foundry chỉ dùng cho fuzz. Biên dịch, test đơn vị, coverage và deploy vẫn chạy bằng Hardhat; Hardhat không đọc
`test/foundry/`.

**Quét lại:**
- **Fuzz (`forge test`):** 48 giờ — pass, 1000 lượt, 80.000 lời gọi. 60 giây (`DELAY=60`) — pass, 80.000 lời gọi.
  Số lượt đi tới nhánh khó (trên 1000): chuyển giao sau lộ khóa 395 / 583, thu hồi bị vô hiệu 315 / 457,
  danh tính đóng băng 782 / 730. Số liệu lệch nhẹ so với báo cáo kiểm toán (405 / 327 / 738 ở cấu hình 48 giờ)
  có thể do khác phiên bản forge-std; kết luận không đổi.
- **Test Hardhat:** 191 passing (không đổi).
- **Slither:** 10 kết quả, 0 High/Medium (không đổi), chạy với `--compile-force-framework hardhat`.
- **`npm ci` sạch:** cài được `forge-std` qua HTTPS, không cần khóa SSH GitHub.

| Mã | Trạng thái sau đợt 10 |
|---|---|
| OPS-04 | **Đã đóng** — fuzz bất biến nằm trong repo, chạy bằng `npm run fuzz` |
| OPS-03 | Còn mở — chưa có CI |
| OPS-01 | **Đã đóng** — V3 đã commit và gắn tag `v3.0.0` trên GitHub |
