# Phân tích độ bền của CredVerify khi triển khai trên Layer 2

**Phạm vi.** Tài liệu này phân tích, **không triển khai**, việc đặt `contracts/CredentialRegistry.sol` (bản đã deploy,
md5 LF `535d2e31a682…`) lên ba rollup: Base, Arbitrum One và Scroll. Câu hỏi nghiên cứu: các cửa sổ thời gian mà
contract dựa vào để xử lý lộ khóa còn giữ được tính chất an toàn hay không khi giao dịch phải đi qua một sequencer
tập trung, và hệ triển khai trên L2 có thêm những giả định tin cậy nào so với Ethereum L1. Bản chạy thật của đề tài
vẫn là Sepolia (L1); mọi con số về L2 dưới đây đều tra từ nguồn gốc ngày **15/10/2026** (tài liệu chính thức, đặc tả,
mã nguồn, hoặc lời gọi `eth_call` chỉ đọc tới contract trên Ethereum mainnet). Ký hiệu `[Sn]` trỏ tới bảng nguồn ở
mục 9; `[Rn]` trỏ tới tệp trong repo. Những chỗ là **suy luận của tác giả** (không có nguồn nào nói thẳng) được ghi
rõ như vậy.

## 0. Tóm tắt

1. Contract dùng **chỉ `block.timestamp`** cho mọi phép so thời gian (không dùng `block.number`) [R1], nên không bị
   ảnh hưởng bởi việc L2 đổi nhịp block (ví dụ Base Denim, 200 ms/block [S6]).
2. Với độ trễ cưỡng chế đưa giao dịch vào chuỗi (forced inclusion) đo được hôm nay — Base ≈ 12 giờ [S1][S2],
   Arbitrum One 24 giờ [S9][S12], Scroll 7 ngày [S16] — **sàn 24 giờ của `INHERIT_DELAY` có biên 0 trên Arbitrum và
   âm trên Scroll**; mặc định 48 giờ còn biên dương trên Base và Arbitrum nhưng vẫn âm trên Scroll (Bảng 1).
3. Trên Arbitrum, sequencer được phép đặt dấu thời gian **lùi tới 86.400 s (24 giờ)** so với L1 [S10][S12]; điều này
   cho phép một sequencer thông đồng với kẻ giữ khóa né cờ `issuedAfterCompromise` nếu mốc lộ khai sát thời điểm thật.
   Khuyến nghị vận hành: lùi `compromisedSince` thêm đúng biên lùi của chuỗi.
4. Triển khai trên L2 thêm một **bên tin cậy mới**: bên có quyền nâng cấp contract hệ thống của rollup. Cả ba chuỗi đều
   có đường nâng cấp không độ trễ hoặc độ trễ do multisig nắm (mục 4).
5. Về lâu dài, khả năng xác minh sau khi chuỗi ngừng hoạt động phụ thuộc vào việc còn ai giữ dữ liệu: blob chỉ bắt buộc
   phục vụ ≈ 18 ngày [S20], lịch sử block/receipt chỉ bắt buộc ≈ 63,6 ngày theo bản EIP-4444 hiện hành [S21]. Sự cố
   RPC ngày 14/10/2026 của đề tài [R2] là một quan sát thực nghiệm của hiện tượng này ngay trên L1 testnet.

## 1. Mô hình thời gian của contract

### 1.1. Hằng số (đọc từ mã, không lấy từ tài liệu)

| Hằng | Giá trị | Mốc tính | Nguồn |
|---|---|---|---|
| `INHERIT_DELAY` | immutable, đặt ở constructor, trong [`MIN_INHERIT_DELAY` = 1 phút, `MAX_INHERIT_DELAY` = 7 ngày] | từ `proposeInherit` đến `eta` | `CredentialRegistry.sol:124–128, 232–234, 332` |
| Mặc định / sàn của script deploy | 48 giờ / 24 giờ (sàn chỉ áp cho chain **không** thuộc {31337, 11155111, 84532, 421614}) | — | `scripts/lib/delay.js` |
| `RECOVERY_WINDOW` | 7 ngày | từ `disabledAt` (lúc `removeIssuer`) | `:120, :430` |
| `PROPOSAL_TTL` | 7 ngày | từ `eta` | `:132, :357` |
| `MAX_COMPROMISE_LOOKBACK` | 30 ngày | lùi từ `block.timestamp` của `proposeInherit` | `:135, :327–330` |

Các phép so có hệ quả an toàn đều dùng `block.timestamp`: vô hiệu thu hồi `_voided` (`at >= compromisedAt`,
`:610–613`), cờ `issuedAfterCompromise` (`issuedAt >= c`, `:657, :702`), và ba hạn ở bảng trên. Các thời điểm
`issuedAt`, `revokedAt`, `lr.at`, `disabledAt`, `compromiseDeclaredAt` đều là `uint64(block.timestamp)` của giao
dịch ghi chúng. Contract không đọc `block.number` ở đâu cả.

### 1.2. Những bước cần một giao dịch "kịp" lên chuỗi

Quy trình xử lý lộ khóa (README mục 10) gồm: `removeIssuer` → `proposeInherit(cũ, mới, compromisedSince)` →
chờ `INHERIT_DELAY` → `executeInherit` trước `eta + PROPOSAL_TTL`; trong lúc chờ, owner có thể `cancelInherit`.
Các bước có hạn chót:

| Bước | Hạn chót | Hậu quả nếu trễ |
|---|---|---|
| (a) `cancelInherit` khi đề xuất bị phản đối | trước khi `executeInherit` được đưa vào chuỗi, sớm nhất tại `eta` | chuyển giao danh tính sai không còn chặn được bằng contract |
| (b) `proposeInherit` cho khóa đã bị gỡ | ≤ `disabledAt + RECOVERY_WINDOW` | danh tính đóng băng vĩnh viễn (`RecoveryWindowClosed`) |
| (c) `executeInherit` | ≤ `eta + PROPOSAL_TTL` | đề xuất hết hạn, phải đề xuất lại (nếu còn trong cửa sổ khôi phục) |
| (d) `proposeInherit` với `compromisedSince` | `compromisedSince + MAX_COMPROMISE_LOOKBACK ≥ block.timestamp` lúc **được đưa vào chuỗi** | revert `InvalidCompromiseTime`; mốc lộ phải khai muộn hơn thực tế |
| (e) `removeIssuer` | không có hạn; nhưng càng trễ, khóa lộ càng cấp/thu hồi được lâu | được bù hồi tố bởi `compromisedSince` (cờ + vô hiệu thu hồi), miễn (b) và (d) còn kịp |

Trên L1, hạn chót chỉ bị đe dọa bởi việc kiểm duyệt của các proposer, mà một giao dịch trả phí bình thường thường
vượt qua trong vài slot. Trên rollup có sequencer tập trung, bên vận hành sequencer có thể trì hoãn giao dịch cho tới
khi người dùng dùng đường cưỡng chế qua L1; độ trễ tối đa của đường đó là đại lượng quyết định.

## 2. Bảng 1 — cửa sổ thời gian × độ trễ forced inclusion → biên an toàn

### 2.1. Độ trễ cưỡng chế tối đa D của từng chuỗi (tra 15/10/2026)

| Chuỗi | Cơ chế | D | Nguồn |
|---|---|---|---|
| Base | Deposit qua `OptimismPortal` trên L1. Block bỏ sót deposit là không hợp lệ; nếu sequencer không đăng batch, node chờ một *sequencing window* rồi tự dẫn xuất block, gồm cả deposit đang chờ. Sequencing window = **3.600 block L1, khoảng 12 giờ** ở nhịp 12 s | **12 giờ** | [S1], [S2]; bản cấu hình cuối của Base trong superchain-registry cũng ghi `seq_window_size = 3600` [S7] |
| Arbitrum One | Tin nhắn vào *delayed inbox* trên L1; sau cửa sổ force inclusion, bất kỳ ai gọi `forceInclusion` trên SequencerInbox. Cửa sổ = min(`delayBuffer`, `delayBlocks`), `delayBlocks` = **7.200 block (24 giờ)**, `delayBuffer` dao động 30 phút–48 giờ | **24 giờ** (khi buffer đầy) | [S9], [S11]; đọc trên chuỗi: `maxTimeVariation()` = (7200, 64, 86400, 768), `buffer()` = 14.400 block (đầy, bằng `max`), `threshold` 150 block [S12] |
| Scroll | Tin nhắn L1 (enforced transaction) vào hàng đợi. Nếu một tin nhắn L1 chưa được finalize quá `maxDelayMessageQueue`, hoặc batch cuối được finalize đã quá `maxDelayEnterEnforcedMode`, chuỗi vào *enforced batch mode*: ai cũng đăng và finalize batch được (kèm bằng chứng ZK) | **≥ 7 ngày** (604.800 s) + thời gian tự dựng batch và sinh bằng chứng | đọc trên chuỗi: `SystemConfig.enforcedBatchParameters()` = (604800, 604800) [S16]; logic ở `ScrollChain.sol` [S17]; tài liệu Euclid [S14] |
| Ethereum L1 (mốc so sánh) | Không có sequencer; kiểm duyệt phải được duy trì bởi mọi proposer | ≈ 0 (theo thang giờ) | — |

Ghi chú về D:

- D là **cận trên trong trường hợp xấu nhất** (sequencer ngừng hoặc kiểm duyệt có chủ đích), không phải độ trễ thường
  gặp.
- Base: tài liệu nêu 12 giờ cho trường hợp sequencer **không đăng batch** [S1]. *Suy luận của tác giả* từ quy tắc dẫn
  xuất [S3]: khi sequencer vẫn chạy nhưng kiểm duyệt, deposit của một block L1 bắt buộc nằm trong block L2 đầu tiên của
  epoch tương ứng, và dấu thời gian L2 không được vượt quá mốc L1 gốc cộng `max_sequencer_drift` = 1.800 s; nên một
  sequencer còn sản xuất block chỉ trì hoãn deposit được cỡ 30 phút. Bảng 1 vẫn dùng 12 giờ để bảo thủ.
- Arbitrum: `delayBlocks` đếm theo block L1; slot L1 bị bỏ trống làm thời gian thực **dài hơn** 24 giờ. Nếu
  `delayBuffer` đã bị bào mòn bởi những lần chậm trước, cửa sổ ngắn hơn (tới 30 phút) [S9]; Bảng 1 lấy trường hợp
  buffer đầy như hôm nay.
- Scroll: 7 ngày là thời điểm **bắt đầu** được tự đăng batch; người phòng thủ còn phải tự chạy phần mềm dựng batch và
  prover. Tài liệu Scroll không nêu thời gian này, nên Bảng 1 ghi biên là "≤".
- Nếu Ethereum rút slot xuống 10 s (EIP-8198, đang Draft [S23]), các cửa sổ đếm theo block L1 (Base 3.600 block,
  Arbitrum 7.200 block) co lại còn 10 giờ và 20 giờ — biên an toàn tăng; cửa sổ Scroll đếm theo giây, không đổi.

### 2.2. Bảng 1

Biên = cửa sổ − D (giờ). Biên ≤ 0 nghĩa là một sequencer kiểm duyệt có chủ đích có thể làm hết **trọn** cửa sổ
trước khi giao dịch phòng thủ vào được chuỗi. Giả định: người phòng thủ gửi giao dịch qua L1 **ngay** khi cửa sổ mở;
**chưa** trừ thời gian phát hiện sự cố và phản ứng của con người, nên biên thực tế còn nhỏ hơn.

| Cửa sổ (bước ở 1.2) | Độ dài | Base (D = 12 h) | Arbitrum One (D = 24 h) | Scroll (D ≥ 168 h) |
|---|---|---|---|---|
| `INHERIT_DELAY` mặc định — (a) | 48 h | **+36 h** | **+24 h** | **≤ −120 h** |
| `INHERIT_DELAY` = sàn script — (a) | 24 h | **+12 h** | **0 h** | **≤ −144 h** |
| `RECOVERY_WINDOW` — (b) | 168 h | +156 h | +144 h | **≤ 0 h** |
| `PROPOSAL_TTL` — (c) | 168 h | +156 h | +144 h | **≤ 0 h** |
| `MAX_COMPROMISE_LOOKBACK` — (d): độ lùi mốc lộ còn dùng được | 720 h | 708 h | 696 h (672 h nếu trừ thêm biên lùi dấu thời gian, mục 3) | ≤ 552 h |

Đọc bảng:

- **Arbitrum với sàn 24 giờ: biên 0.** Một đề xuất chuyển giao sai được đưa vào chuỗi; sequencer kiểm duyệt
  `cancelInherit` đúng 24 giờ; đường `forceInclusion` mở ra cùng lúc `eta` đến, và thứ tự giữa `cancelInherit` cưỡng
  chế và `executeInherit` lúc đó do sequencer quyết.
- **Scroll: mọi cửa sổ ≤ 7 ngày đều không chống được kiểm duyệt có chủ đích.** Kể cả `INHERIT_DELAY` ở giá trị lớn
  nhất contract cho phép (`MAX_INHERIT_DELAY` = 7 ngày) cũng chỉ có biên ≤ 0. Không có giá trị tham số deploy nào
  khắc phục được điều này mà không sửa contract.
- `RECOVERY_WINDOW` và `PROPOSAL_TTL` là hạn của **bên phòng thủ**: trễ thì mất quyền khôi phục danh tính, không sinh
  ra chứng chỉ giả. Mức độ hệ quả vì vậy thấp hơn hàng `INHERIT_DELAY`.
- Bước (e) không có trong bảng: kiểm duyệt `removeIssuer` kéo dài khoảng thời gian khóa lộ còn hoạt động thêm D, nhưng
  những gì khóa đó làm sau `compromisedSince` vẫn bị gắn cờ / vô hiệu hồi tố, miễn (b) và (d) còn kịp. Đây là một điểm
  bền của thiết kế: tính đúng không phụ thuộc vào việc chặn kịp, chỉ phụ thuộc vào việc khai mốc lộ kịp.

## 3. Dấu thời gian do sequencer đặt

### 3.1. Biên của từng chuỗi

| Chuỗi | Quy tắc | Nguồn |
|---|---|---|
| Arbitrum One | Dấu thời gian lấy theo đồng hồ sequencer, không gắn với block L1; phải ≥ block trước và nằm trong [hiện tại − 24 giờ, hiện tại + 1 giờ] theo tài liệu. Giá trị đọc trên SequencerInbox: `delaySeconds` = 86.400 s (lùi 24 giờ), `futureSeconds` = 768 s (tiến 12 phút 48 giây) — **trần tiến trên chuỗi chặt hơn con số "một giờ" trong tài liệu**. Giao dịch force-include nhận dấu thời gian = max(lúc tin nhắn vào delayed inbox, dấu thời gian block L2 trước) | [S10], [S12] |
| Base | Dấu thời gian tất định theo số block: `block.timestamp = prev_l2_timestamp + l2_block_time` (2 s), và `l1_origin.timestamp ≤ block.timestamp ≤ l1_origin.timestamp + max_sequencer_drift`; `max_sequencer_drift` là hằng 1.800 s từ Fjord. Denim (Base Sepolia 21/10/2026, mainnet dự kiến tháng 11/2026) chuyển sang 200 ms/block nhưng giữ `block.timestamp` theo giây và nói rõ logic đo bằng `block.timestamp` không bị ảnh hưởng | [S3], [S5], [S6] |
| Scroll | **Chưa tìm được nguồn gốc** nêu biên dấu thời gian của block L2 Scroll | — |

### 3.2. Hệ quả với phép so mốc lộ

Hai phép so ở 1.1 so một thời điểm do chuỗi gán (`issuedAt`, `revokedAt`) với một thời điểm do owner khai
(`compromisedSince`). Nếu sequencer gán dấu thời gian lùi B giây so với thời gian thật, một sequencer **thông đồng**
với kẻ giữ khóa có thể:

1. đặt một chứng chỉ giả cấp lúc thật T (T ≥ mốc lộ thật) vào block có dấu thời gian T − B < `compromisedSince` →
   `issuedAfterCompromise = false`;
2. tương tự với một lần thu hồi trái phép → `_voided = false`, thu hồi giữ hiệu lực vĩnh viễn.

Với Arbitrum, B tối đa là 86.400 s [S12]. Do dấu thời gian phải không giảm, muốn lùi một block 24 giờ thì sequencer phải
giữ đồng hồ của cả chuỗi lùi lại — dễ bị quan sát thấy, nhưng không bị giao thức chặn. Với Base, *suy luận của tác giả*
từ [S3]: dấu thời gian gắn cứng với số block, sequencer không chọn tùy ý được; đòn bẩy còn lại là chọn block nào chứa
giao dịch, và việc tổ chức lại các block *unsafe* chưa đăng lên L1. Người xác minh nên đọc ở tag `safe`/`finalized`.

**Khuyến nghị vận hành (không sửa contract).** Khi khai lộ khóa trên một chuỗi có biên lùi B, owner đặt
`compromisedSince = (ước tính mốc lộ) − B`, với điều kiện vẫn nằm trong 30 ngày (biên còn 30 ngày − B, xem Bảng 1). Cái
giá: các thao tác hợp lệ của chủ khóa trong khoảng B trước mốc lộ cũng bị gắn cờ / vô hiệu, và chủ khóa phải cấp lại
hoặc thu hồi lại bằng khóa mới. Giao diện đã hiện cả mốc lộ lẫn thời điểm công bố (`compromiseDeclaredAt`), nên độ lùi
thêm này minh bạch với người xác minh.

## 4. Bên tin cậy mới: quản trị nâng cấp của L2

Trên L1, an toàn của CredVerify chỉ dựa vào Ethereum và vào owner/issuer (README mục 11). Trên một rollup, bên có quyền
nâng cấp contract hệ thống (bridge, portal, hệ thống bằng chứng) có thể về nguyên tắc thay đổi trạng thái mà contract
của đề tài dựa vào. Bảng dưới chỉ ghi điều nguồn nói.

| Chuỗi | Ai nâng cấp được | Độ trễ nâng cấp | Nguồn |
|---|---|---|---|
| Base | Multisig 2-trên-2: *CB Signers* (Coinbase, 3-trên-6) và *Security Council* (8-trên-11, 11 thành viên độc lập). Base tự công bố đạt Stage 1 | Tài liệu Base không nêu timelock. L2BEAT (nguồn phụ): "There is no delay on upgrades", không có exit window | [S4]; [S19] |
| Base — bối cảnh 2026 | Base rời khỏi superchain-registry của Optimism (PR #1212, gộp 27/04/2026) và tự nâng cấp mạng: Azul (mainnet 28/05/2026), Beryl (25/06/2026), Cobalt (30/09/2026), Denim (dự kiến 11/2026) | — | [S7], [S5] |
| Arbitrum One | Security Council 12 thành viên, hành động khẩn cấp cần 9-trên-12 và không qua độ trễ; đề xuất hiến pháp (AIP) đi qua chờ trên L2, một chu kỳ thách thức của rollup, rồi thêm 3 ngày chờ trên L1 | Đường khẩn cấp: không độ trễ; đường thường: ≥ 3 ngày trên L1 sau thách thức | [S13] |
| Scroll | Tài liệu: nâng cấp thực thi sau timelock hai tuần; đọc trên chuỗi `getMinDelay()` của L1 Timelock = 1.209.600 s (14 ngày) [S16]. Tài liệu Euclid ghi Security Council 9-trên-12. Diễn đàn quản trị Scroll đề xuất giải thể Security Council và chuyển quyền cho multisig quản trị của Scroll; L2BEAT (nguồn phụ) ghi thực thi ngày 01/06/2026, thay bằng multisig 3-trên-4, hạ xuống Stage 0, và có timelock khẩn cấp không độ trễ | Ít nhất một đường không độ trễ (theo nguồn phụ) | [S15], [S14], [S18], [S19] |

Hệ quả cho đề tài: lời hứa "xác minh được mà không cần tin CredVerify" trên L1 trở thành "… và không cần tin CredVerify
**cũng như bên nắm quyền nâng cấp rollup**". Với Scroll, hai điều kiện bất lợi chồng lên nhau (D ≥ 7 ngày và quản trị
Stage 0 theo nguồn phụ).

## 5. DA và xác minh sau khi L2 ngừng hoạt động

### 5.1. Thời gian dữ liệu còn được giữ

- Blob (EIP-4844): node đồng thuận chỉ bắt buộc phục vụ blob sidecar trong `MIN_EPOCHS_FOR_BLOB_SIDECARS_REQUESTS` =
  4.096 epoch; từ Fulu, data column sidecar cũng 4.096 epoch [S20]. Với 32 slot/epoch và 12 s/slot [S20]:
  4.096 × 32 × 12 s = 1.572.864 s ≈ **18,2 ngày**. Tài liệu vận hành node Arbitrum cũng cảnh báo cần blob lịch sử nếu
  node "offline for more than 18 days" [S27].
- Base dùng DA trên Ethereum (`data_availability_type = "eth-da"` [S7]). Sau ≈ 18 ngày, dựng lại trạng thái Base từ L1
  cần một bên ngoài giao thức đã lưu blob.

### 5.2. Tiền lệ

- **Polygon zkEVM Mainnet Beta**: bài thông báo trên diễn đàn Polygon (22/04/2026) ghi sequencer ngừng ngày
  **01/07/2026**, chụp số dư ví lúc đó, tài sản chưa rút coi là bỏ sau 31/12/2027, tài sản khóa trong DeFi không tự
  chuyển được [S24]. Trang hỗ trợ của Polygon ghi chuỗi "was sunset on July 3, 2026", và giao diện nhận tài sản dùng
  "a public read-only RPC" [S25]. Hai nguồn chính thức lệch nhau hai ngày; tài liệu này ghi cả hai.
- **Sovrin MainNet** (sổ danh tính phi tập trung): Sovrin Foundation bị giải thể ngày 21/05/2025; bài ngày 20/01/2026
  cho biết sổ vẫn "fully queryable" nhưng chỉ còn một đơn vị (Trinsic) chạy ở chế độ chỉ đọc trên một máy chủ đám mây
  [S26]. Đây là tiền lệ gần nhất với miền ứng dụng của đề tài: chứng thực còn đọc được, nhưng chỉ nhờ thiện chí của
  một bên.

### 5.3. Giới hạn hiện tại của biên nhận lô

Biên nhận lô của CredVerify chứng minh **lá ∈ root** (Merkle proof), còn **root ∈ trạng thái contract** thì vẫn phải
hỏi một RPC qua `verifyInBatch`/`batches(batchId)`. Trên L1 điều này chấp nhận được vì Ethereum không có kế hoạch
ngừng. Trên một L2 đã ngừng như Polygon zkEVM, người xác minh phụ thuộc vào RPC chỉ đọc do ai đó còn chạy. Hướng khắc
phục (mục 7): kèm storage proof (`eth_getProof`, EIP-1186) của slot `batches[batchId]` đối với state root của L2, và
neo state root đó về output root/bằng chứng hợp lệ đã đăng trên L1.

## 6. Lịch sử event

- **EIP-4444** hiện ở trạng thái **Draft**; bản sửa ngày 28/09/2026 đặt `HISTORY_PRUNE_EPOCHS` = **14.299 epoch**:
  client "SHOULD NOT" phục vụ header, body và receipt cũ hơn mốc này qua p2p và "MAY" xóa cục bộ [S21]. Quy ra thời
  gian: 14.299 × 32 × 12 s ≈ **63,6 ngày**. (Các bản trước của EIP dùng mốc khoảng một năm; tài liệu cũ của đề tài viết
  theo tinh thần đó.)
- **Partial history expiry** đã triển khai: blog của Ethereum Foundation ngày 08/07/2025 cho biết mọi client thực thi
  hỗ trợ xóa dữ liệu block trước The Merge, giảm 300–500 GB, dựa trên giả định tin cậy 1-trên-N; việc xóa lịch sử
  "cuốn chiếu" vẫn đang làm [S22].
- **Quan sát thực nghiệm của đề tài (14/10/2026)** [R2]: RPC công cộng `ethereum-sepolia-rpc.publicnode.com` trả lỗi
  4444 "pruned history unavailable" khi đọc log quanh `DEPLOY_BLOCK` (≈ 23.800 block, hơn 3 ngày tuổi), dRPC gói miễn
  phí chỉ nhận ≈ 100 block mỗi lần `eth_getLogs`; chỉ Tenderly trả đủ. Danh bạ đơn vị hiện rỗng trong khi contract
  không sai. Phần **xác minh** (hàm view đọc trạng thái) không bị ảnh hưởng. Kết luận của đợt 14: phần danh bạ/lịch sử
  phụ thuộc vào việc còn ít nhất một RPC giữ log cũ.
- **Trên L2 vấn đề nặng hơn về số lời gọi.** README mục 12 tính ≈ 263 lời gọi `eth_getLogs` cho mỗi năm tuổi contract
  với khúc 10.000 block ở nhịp 12 s (2.628.000 block/năm). Cùng khúc 10.000 block, *phép tính của tác giả*: Base 2 s/block
  cho 15.768.000 block/năm ≈ 1.577 lời gọi; sau Denim (200 ms/block [S6]) ≈ 15.768 lời gọi mỗi năm cho **mỗi lượt quét**.
  Trên L2, danh bạ thực tế đòi hỏi indexer (README mục 12) chứ không chỉ là tùy chọn.

## 7. Khuyến nghị triển khai và công việc tiếp theo

**Khuyến nghị (không sửa contract):**

1. **Sàn `INHERIT_DELAY` — quyết định (15/10/2026): giữ sàn 24 giờ chung cho mọi mạng thật**, không đặt sàn theo chuỗi
   trong `scripts/lib/delay.js`. Lý do: đề tài không triển khai lên L2; sàn là chốt chặn tối thiểu của script, không thay
   được việc người triển khai chọn giá trị theo chuỗi. **Rủi ro được chấp nhận và công bố** (Bảng 1): sàn 24 giờ có biên
   +12 giờ trên Base, **0 trên Arbitrum One**, âm trên Scroll; mặc định 48 giờ có biên +36 / +24 / âm. Người triển khai
   trên L2 phải tự chọn `INHERIT_DELAY` ≥ D của chuỗi + thời gian phát hiện và phản ứng (ví dụ Arbitrum One: không dưới
   48 giờ). Với Scroll, không giá trị nào trong [1 phút, 7 ngày] cho biên dương — không khuyến nghị đặt sổ trên Scroll
   khi chưa sửa contract. Phương án bị bác: sàn theo chainId trong script (thêm bảng tham số phải cập nhật khi L2 đổi cấu
   hình, và vẫn không giải được Scroll).
2. **Lùi mốc lộ thêm biên lùi dấu thời gian** của chuỗi (Arbitrum: 24 giờ), như mục 3.2.
3. **Gửi giao dịch phòng thủ song song qua đường L1** (deposit/delayed inbox/enforced tx) ngay khi phát hiện sự cố,
   không chờ xem sequencer có kiểm duyệt hay không — đây là giả định "gửi ngay khi cửa sổ mở" của Bảng 1.
4. **Xác minh đọc ở tag `safe`/`finalized`** thay vì `latest` trên L2.
5. **Indexer bắt buộc** cho danh bạ/lịch sử trên L2 (mục 6).
6. Ưu tiên chuỗi có D nhỏ và quản trị có độ trễ nâng cấp; theo nguồn tra hôm nay, Base và Arbitrum One phù hợp hơn
   Scroll cho các cửa sổ hiện có.

**Công việc tiếp theo:**

- Storage proof (EIP-1186) cho `batches[batchId]` và `certificates[certId]`, kèm vào biên nhận, để xác minh root ∈ state
  mà không cần RPC tin cậy.
- Neo định kỳ một digest (ví dụ root của mọi `batchId`) lên L1, để xác minh vẫn đứng được khi L2 ngừng.
- Đo thật trên Base Sepolia / Arbitrum Sepolia (chainId 84532, 421614 đã có trong `TEST_CHAINS` của `delay.js`), gồm
  thử đường deposit/force inclusion với `INHERIT_DELAY` ngắn.

## 8. Ước tính phí trên Base

Sinh bởi `npx hardhat run scripts/l2-fee-estimate.js` (chỉ đọc: `eth_call`/`eth_getBlock`, không gửi giao dịch,
không cần khóa). Nguồn của mục này: [F1]–[F8] ở cuối mục; ngày tra **15/10/2026**.

### 8.1. Cách tính

| Thành phần | Công thức | Lấy từ |
|---|---|---|
| Phí thực thi L2 | `gasUsed × (baseFeePerGas + priority)`; Base có `minBaseFee` = 5.000.000 wei (0,005 gwei) từ Jovian | block Base, `eth_maxPriorityFeePerGas` [F1], [F4] |
| Phí L1 (dữ liệu) | `GasPriceOracle.getL1Fee(tx RLP chưa ký)` tại `0x4200…000F`. Từ Fjord: `l1FeeScaled = baseFeeScalar·l1BaseFee·16 + blobBaseFeeScalar·blobBaseFee`; `size = max(100·10⁶, −42.585.600 + 836.500·fastlzSize)`; `l1Fee = size·l1FeeScaled / 10¹²` | `eth_call` trên Base [F1], [F2], [F3] |
| Phí operator | `gasUsed × operatorFeeScalar × 100 + operatorFeeConstant` (Jovian; Isthmus là `/10⁶`) | `L1Block` `0x4200…0015` [F4], [F5] |
| Gas thực thi `gasUsed` | đo trên mạng Hardhat in-process (hardfork Osaka), cùng bytecode, giống `scripts/gas-v3.js` | receipt local |
| ETH/USD | Chainlink ETH/USD trên Ethereum mainnet `0x5f4e…8419`, `latestRoundData` | `eth_call` trên L1 [F7] |
| Đối chiếu Ethereum L1 | `gasUsed × (baseFeePerGas block mới nhất + eth_maxPriorityFeePerGas)` | RPC publicnode |

Tx đưa vào `getL1Fee` là tx EIP-1559 dựng sẵn: chainId 8453, nonce 100, `gasLimit = 1,2 × gasUsed`,
`maxFee = 2 × baseFee + priority`, `to` = địa chỉ contract trên Sepolia (chỉ để có 20 byte thật — trên Base chưa có
contract), `data` = calldata thật của lần gọi local. Mọi `eth_call` trên Base đọc tại cùng một block.

**Vì sao dùng gas đo local (luật Osaka) cho Base.** Base đã có các EIP Pectra qua Isthmus (gồm EIP-7623, EIP-7702,
EIP-2537, EIP-2935) [F6] và, ở Azul, các EIP Osaka về EVM: EIP-7825, 7823, 7883, 7939, 7951 [F8]. Các EIP này không đổi
giá SSTORE/SLOAD/KECCAK/LOG/calldata mà ba hàm dùng; tài liệu Base không thấy EIP-8037 (Glamsterdam). Vì vậy `gasUsed`
trên Base coi như bằng số đo local. **Giới hạn:** Base không công bố một câu "theo đúng luật Osaka"; đây là suy ra từ
danh sách EIP từng bản nâng cấp — số chính xác chỉ có khi đo thật trên Base Sepolia (mục 7). Gas `issueCertificate` và
`publishBatch` khớp `docs/GAS-V3.md` (72.743; 72.142 / 72.154). `revokeLeaf` cao hơn GAS-V3 vài trăm gas vì lô ở đây
dùng salt tất định nên lá số 0 có proof dài hơn (7 nút ở lô 100, GAS-V3 là 6).

### 8.2. Kết quả (chạy 15/10/2026)

Base block **52.635.373** (10:28:13 UTC); Ethereum block **26.197.314** (10:27:59 UTC).
Tham số đọc được: Base `baseFee` 0,005 gwei (đúng sàn `minBaseFee`), priority 0,001 gwei; `GasPriceOracle.isFjord()` =
true, `l1BaseFee` 0,07446 gwei, `blobBaseFee` 0,004853 gwei, `baseFeeScalar` 2.269, `blobBaseFeeScalar` 1.055.762;
`operatorFeeScalar` = `operatorFeeConstant` = 0 (phí operator = 0). Ethereum L1: `baseFee` 0,05645 gwei, priority
0,0000066 gwei. **ETH/USD = 2.360,06** (Chainlink, `updatedAt` 10:25:59 UTC 15/10/2026).

| Thao tác | Gas | Calldata (byte) | Phí L2 (ETH) | Phí L1 (ETH) | **Tổng Base (ETH)** | **Tổng Base (USD)** | Ethereum L1 (ETH) | Ethereum L1 (USD) | L1 ÷ Base |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `issueCertificate` | 72.743 | 68 | 4,36 × 10⁻⁷ | 8,19 × 10⁻¹⁰ | **4,37 × 10⁻⁷** | **0,00103** | 4,11 × 10⁻⁶ | 0,00969 | 9× |
| `publishBatch` (lô 100) | 72.142 | 68 | 4,33 × 10⁻⁷ | 7,83 × 10⁻¹⁰ | **4,34 × 10⁻⁷** | **0,00102** | 4,07 × 10⁻⁶ | 0,00961 | 9× |
| `revokeLeaf` (lô 100, proof 7 nút) | 63.570 | 388 | 3,81 × 10⁻⁷ | 2,69 × 10⁻⁹ | **3,84 × 10⁻⁷** | **0,000907** | 3,59 × 10⁻⁶ | 0,00847 | 9× |
| `publishBatch` (lô 500) | 72.154 | 68 | 4,33 × 10⁻⁷ | 7,83 × 10⁻¹⁰ | **4,34 × 10⁻⁷** | **0,00102** | 4,07 × 10⁻⁶ | 0,00961 | 9× |
| `revokeLeaf` (lô 500, proof 9 nút) | 65.124 | 452 | 3,91 × 10⁻⁷ | 3,10 × 10⁻⁹ | **3,94 × 10⁻⁷** | **0,000930** | 3,68 × 10⁻⁶ | 0,00868 | 9× |

Chạy lại sau 18 giây (Base block 52.635.382, Ethereum block 26.197.316): gas và calldata giống hệt; phí L1 trên Base
đổi theo `l1BaseFee`/`blobBaseFee` (7,15 × 10⁻¹⁰ ETH cho `publishBatch`), Ethereum L1 `baseFee` 0,06771 gwei → tỉ lệ
11×. Phí là ảnh chụp tại một thời điểm, không phải hằng số.

### 8.3. Nhận xét

- Trên Base, **phí thực thi L2 chiếm > 99 %** tổng phí; phí L1 (dữ liệu) chỉ 0,2–0,8 %, vì ba hàm có calldata ngắn
  (68–452 byte) và giá blob/L1 lúc đo thấp. Phí L2 ở đây đang ở sàn `minBaseFee`, nên khi Base tắc nghẽn phí L2 có thể
  tăng (tối đa 4 %/block [F1]).
- `publishBatch` chạm sàn kích thước `minTransactionSize` = 100 byte của công thức Fjord: tính tay
  `100·10⁶ × (2.269 × 74,46·10⁶ × 16 + 1.055.762 × 4,853·10⁶) / 10¹²` ≈ 7,83 × 10⁻¹⁰ ETH, khớp `getL1Fee`.
- Một lô (dù 100 hay 500 chứng chỉ) tốn khoảng **0,001 USD** trên Base so với khoảng **0,01 USD** trên Ethereum L1 lúc
  đo — chênh khoảng 9–11 lần. Mức chênh nhỏ vì giá gas Ethereum L1 lúc đo rất thấp (0,056–0,068 gwei); tỉ lệ thay đổi
  theo giá gas hai chuỗi tại thời điểm chạy.
- Phí trên cả hai chuỗi đều rất nhỏ so với rủi ro ở mục 2–6; lý do chọn chuỗi nên là độ bền (forced inclusion,
  quản trị, DA, lịch sử event), không phải phí.

### 8.4. Nguồn của mục 8 (tra 15/10/2026)

| Mã | Nguồn | Nội dung dùng |
|---|---|---|
| F1 | Base Docs, *Network Fees* — https://docs.base.org/base-chain/network-information/network-fees | hai thành phần phí; `minBaseFee` 0,005 gwei; tăng tối đa 4 %/block; `GasPriceOracle` `0x4200…000F`, `getL1Fee(bytes)` |
| F2 | Base Docs, *Predeploys* — https://docs.base.org/specifications/base-protocol/execution/predeploys | `getL1Fee` nhận tx RLP chưa ký; tham số sau Ecotone |
| F3 | Base Docs, *Fjord — Execution Engine* — https://docs.base.org/upgrades/fjord/exec-engine | công thức FastLZ; hằng −42.585.600, 836.500, 100 byte |
| F4 | Base Docs, *Jovian — Execution Engine* — https://docs.base.org/upgrades/jovian/exec-engine | sàn base fee; phí operator `× 100` |
| F5 | Base Docs, *Isthmus — Execution Engine* — https://docs.base.org/upgrades/isthmus/exec-engine | phí operator; đọc scalar/constant ở `L1Block` `0x4200…0015` |
| F6 | Base Docs, *Isthmus — Overview* — https://docs.base.org/upgrades/isthmus/overview | danh sách EIP Pectra đã áp dụng |
| F7 | Chainlink Reference Data Directory — https://reference-data-directory.vercel.app/feeds-mainnet.json (dữ liệu của docs.chain.link) | feed `eth-usd`: proxy `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419`, 8 chữ số, ngưỡng 0,5 %, heartbeat 3.600 s |
| F8 | Base Docs, *Azul — Execution Engine* — https://docs.base.org/upgrades/azul/exec-engine | EIP-7825, 7823, 7883, 7939, 7951 |
| — | Base Docs, *Connect to Base* — https://docs.base.org/get-started/connect-to-base | RPC công cộng `https://mainnet.base.org`, chainId 8453 |

## 9. Nguồn

Ngày tra của mọi nguồn: **15/10/2026**. "Gốc" = tài liệu chính thức, đặc tả, mã nguồn hoặc trạng thái đọc trên chuỗi;
"phụ" = bên thứ ba (L2BEAT), chỉ dùng để đối chiếu và cho thông tin chưa có nguồn gốc, luôn ghi rõ.

| Mã | Nguồn | Loại | Nội dung dùng |
|---|---|---|---|
| S1 | Base Docs, *Reliability and Liveness* — https://docs.base.org/specifications/security/reliability-and-liveness | gốc | cơ chế deposit, D ≈ 12 giờ, một sequencer |
| S2 | Base Docs, *Configuration* — https://docs.base.org/specifications/reference/configuration | gốc | Sequencing Window Size 3.600 block L1 |
| S3 | Base Docs, *Derivation* — https://docs.base.org/specifications/base-protocol/consensus/derivation | gốc | quy tắc dấu thời gian, `max_sequencer_drift` 1.800 s |
| S4 | Base Docs, *Security Council for Base* — https://docs.base.org/specifications/security/security-council-for-base | gốc | multisig 2/2, CB 3/6, Council 8/11, Stage 1 |
| S5 | Base Docs, *Upgrades* — https://docs.base.org/upgrades/overview | gốc | ngày kích hoạt Azul, Beryl, Cobalt, Denim |
| S6 | Base Docs, *Denim — 200ms Native Blocks* — https://docs.base.org/upgrades/denim/200ms-blocks | gốc | 200 ms/block, `block.timestamp` giữ theo giây |
| S7 | ethereum-optimism/superchain-registry — PR #1212 (gộp 27/04/2026) và `superchain/configs/mainnet/base.toml` tại commit `5b055be` | gốc | Base rời registry; `seq_window_size = 3600`, `eth-da` |
| S8 | OP Stack Docs, *Outages* — https://docs.optimism.io/stack/rollup/outages | gốc | sequencing window mặc định OP Stack 12 giờ (đối chiếu) |
| S9 | Arbitrum Docs, *Sequencer* (`content/docs/how-arbitrum-works/deep-dives/sequencer.mdx`, repo OffchainLabs/arbitrum-docs) | gốc | Censorship Timeout, `delayBuffer`, `threshold` |
| S10 | Arbitrum Docs, *Block numbers and time* — https://docs.arbitrum.io/build-decentralized-apps/arbitrum-vs-ethereum/block-numbers-and-time | gốc | biên dấu thời gian −24 h / +1 h; dấu thời gian giao dịch force-include |
| S11 | Arbitrum Docs, `content/vars.json` | gốc | `arbOneForceIncludePeriodBlocks` 7200, `…Hours` 24 |
| S12 | Ethereum mainnet, `eth_call` tới SequencerInbox `0x1c479675ad559DC151F6Ec7ed3FbF8ceE79582B6` (địa chỉ từ `arbitrum-sdk/…/networks.ts`), block 26.196.291 (07:02:35 UTC) | gốc (trên chuỗi) | `maxTimeVariation` (7200, 64, 86400, 768); `buffer` 14400/14400, threshold 150; `isDelayBufferable` true |
| S13 | Arbitrum DAO Constitution — https://docs.arbitrum.foundation/dao-constitution | gốc | Security Council 12, 9-trên-12; độ trễ AIP |
| S14 | Scroll Docs, *Euclid Upgrade* (`scroll-tech/scroll-documentation`, `…/scroll-upgrades/euclid-upgrade.mdx`) | gốc | enforced batch mode, Stage-1 readiness, Council 9/12 |
| S15 | Scroll Docs, *Scroll Upgrades* — https://docs.scroll.io/en/technology/overview/scroll-upgrades/ | gốc | timelock hai tuần, địa chỉ L1 Timelock |
| S16 | Ethereum mainnet, `eth_call`: ScrollChain `0xa13BAF47339d63B743e7Da8741db5456DAc1E556` → `systemConfig()` = `0x8432728A257646449245558B8b7Dbe51A16c7a4D` → `enforcedBatchParameters()`; L1 Timelock `0x1A658B88fD0a3c82fa1a0609fCDbD32e7dd4aB9C` → `getMinDelay()`; block 26.196.297 | gốc (trên chuỗi) | (604800, 604800) s; 1.209.600 s; `isEnforcedModeEnabled` false |
| S17 | `scroll-tech/scroll-contracts`, `src/L1/rollup/ScrollChain.sol` (nhánh main) | gốc | điều kiện vào enforced batch mode |
| S18 | Scroll Governance Forum, *Governance Update: Security Council Transition…* — https://forum.scroll.io/t/governance-update-security-council-transition-contributor-roles-operational-adjustments/1470 | gốc | đề xuất giải thể Security Council |
| S19 | L2BEAT — https://l2beat.com/scaling/projects/base, …/scroll, …/summary | **phụ** | Base: không độ trễ nâng cấp; Scroll: 01/06/2026 → multisig 3/4, Stage 0; Arbitrum One Stage 1 |
| S20 | ethereum/consensus-specs: `specs/deneb/p2p-interface.md`, `specs/fulu/p2p-interface.md`, `configs/mainnet.yaml`, `presets/mainnet/phase0.yaml` | gốc | 4.096 epoch; `SLOT_DURATION_MS` 12000; 32 slot/epoch |
| S21 | EIP-4444 — https://eips.ethereum.org/EIPS/eip-4444 (bản sửa 28/09/2026) | gốc | Draft; `HISTORY_PRUNE_EPOCHS` 14.299 |
| S22 | Ethereum Foundation Blog, *Partial history expiry announcement* (08/07/2025) — https://blog.ethereum.org/2025/07/08/partial-history-exp | gốc | xóa lịch sử trước Merge, 1-trên-N |
| S23 | EIP-8198 *Quick Slots* — https://eips.ethereum.org/EIPS/eip-8198 | gốc | Draft (tạo 17/03/2026); slot 10 s trong cấu hình |
| S24 | Polygon Forum, *Polygon zkEVM Mainnet Beta Sunset: Claim Your Funds* (22/04/2026) — https://forum.polygon.technology/t/polygon-zkevm-mainnet-beta-sunset-claim-your-funds/21856 | gốc | ngừng 01/07/2026; hạn 31/12/2027 |
| S25 | Polygon Support, *Recovering Funds from Polygon zkEVM: The Claims Interface* — https://support.polygon.technology/support/solutions/articles/82000927750 | gốc | "sunset on July 3, 2026"; RPC chỉ đọc |
| S26 | Sovrin Foundation, *The Sovrin Foundation Has Been Dissolved — but Sovrin MainNet Remains* (20/01/2026) — https://sovrin.org/?p=15740 | gốc | giải thể 21/05/2025; sổ chỉ đọc do Trinsic chạy |
| S27 | Arbitrum Docs, `content/partials/run-a-node/_dao-chains-parameters.mdx` | gốc | cần blob lịch sử nếu offline > 18 ngày |
| R1 | `contracts/CredentialRegistry.sol`, `scripts/lib/delay.js` (repo này) | mã | hằng số và phép so thời gian |
| R2 | `docs/AUDIT-V3.md` mục 22 (đợt 14) | repo | sự cố RPC 14/10/2026 |

Các bài trong thư mục tài liệu tham khảo của tác giả (SoK Layer-Two Protocols — FC 2020; SoK Decentralized Sequencers;
Impact of EIP-4844 — IEEE TNSE 2025; Formal Foundation ZK Rollups — CCS 2025; L2 Cost Optimization EIP-4844 — IET
Blockchain 2025) dùng cho phần công trình liên quan của bài báo, **không** dùng làm nguồn cho tham số của chuỗi.
