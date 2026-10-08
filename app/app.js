/* =========================================================================
   CredVerify V3 — giao diện cho sổ đăng ký DÙNG CHUNG.

   NGUYÊN TẮC PHÂN CHIA TRÁCH NHIỆM giữa contract và trang này:

     Contract cưỡng chế cái gì phải ĐÚNG.
     Giao diện cung cấp cái gì phải được NHÌN THẤY.

   Hỏng vì "trạng thái thay đổi khi không được phép"  -> việc của contract.
   Hỏng vì "con người tin nhầm vì thiếu thông tin"     -> việc của trang này.

   GIỚI HẠN: mọi cảnh báo ở đây chỉ bảo vệ người ĐANG DÙNG trang này.
   Kẻ tấn công dựng trang riêng, hoặc gọi thẳng contract qua Etherscan. Đây là lớp
   phòng vệ chống NHẦM LẪN, không phải lớp phòng vệ chống TẤN CÔNG. Mọi ràng buộc
   phân quyền nằm trong contract và phải ở lại đó.
   ========================================================================= */

/* Lỗi của contract (custom error) -> câu tiếng Việt cho người dùng. */
const ERR_VI = {
  "NotOwner": "Chỉ owner (đơn vị vận hành) được làm thao tác này",
  "NotPendingOwner": "Không có đề cử owner đang chờ cho địa chỉ này",
  "NotActiveIssuer": "Ví không phải đơn vị phát hành đang hoạt động",
  "ZeroAddress": "Địa chỉ 0 không hợp lệ",
  "OwnerCannotBeIssuer": "Owner không được làm đơn vị phát hành",
  "PendingOwnerCannotBeIssuer": "Owner đang được đề cử không được làm đơn vị phát hành",
  "IssuerCannotBeOwner": "Một địa chỉ từng là đơn vị phát hành không được làm owner",
  "AddressAlreadyUsed": "Địa chỉ này đã từng được dùng làm đơn vị phát hành",
  "EmptyName": "Tên rỗng",
  "NameTooLong": "Tên dài quá 256 byte",
  "NameNotCanonical": "Tên không ở dạng chuẩn (khoảng trắng đầu/cuối, hai khoảng trắng liền nhau hoặc ký tự điều khiển)",
  "NameTaken": "Tên này đã thuộc về một đơn vị khác",
  "IssuerNotActive": "Đơn vị không ở trạng thái hoạt động",
  "IssuerNotDisabled": "Đơn vị không ở trạng thái bị gỡ",
  "IssuerWasInherited": "Khóa này đã được chuyển giao, không bật lại được",
  "CannotBeInherited": "Khóa cũ không chuyển giao được (chưa từng là đơn vị, hoặc đã được chuyển giao)",
  "RecoveryWindowClosed": "Đã quá 7 ngày kể từ lúc gỡ — danh tính đã đóng băng",
  "InvalidCompromiseTime": "Mốc lộ khóa không hợp lệ (ở tương lai hoặc lùi quá 30 ngày)",
  "ProposalExists": "Đã có một đề xuất chuyển giao đang chờ cho khóa này",
  "NoProposal": "Không có đề xuất chuyển giao nào cho khóa này",
  "TimelockNotElapsed": "Chưa hết thời gian chờ chuyển giao kể từ lúc đề xuất",
  "ProposalExpired": "Đề xuất đã hết hạn (quá 7 ngày sau thời điểm được phép thực thi)",
  "HolderZero": "Ví học viên là địa chỉ 0",
  "EmptyCertHash": "Hash tệp rỗng",
  "CertificateExists": "Đơn vị này đã đăng ký tệp này rồi",
  "NotRevocable": "Chứng chỉ không ở trạng thái thu hồi được",
  "NotIssuingKeyOrSuccessor": "Chỉ khóa đã cấp hoặc khóa kế nhiệm của nó mới thu hồi được",
  "EmptyRoot": "Merkle root rỗng",
  "EmptyBatch": "Lô rỗng",
  "BatchExists": "Lô này đã được đăng",
  "BatchNotFound": "Không có lô này",
  "RootMismatch": "Root không khớp lô",
  "BatchAlreadyRevoked": "Lô đã bị thu hồi",
  "LeafAlreadyRevoked": "Chứng chỉ trong lô đã bị thu hồi",
  "LeafNotInBatch": "Chứng chỉ không thuộc lô (proof sai)",
  "InvalidInheritDelay": "Độ trễ chuyển giao nằm ngoài khoảng cho phép (chỉ gặp lúc deploy)"
};

const ABI = [
  // --- đọc ---
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function issuerStatus(address) view returns (uint8)",
  "function issuerName(address) view returns (string)",
  "function nameHolder(bytes32) view returns (address)",
  "function issuerByName(string name) view returns (address)",
  "function inheritedBy(address) view returns (address)",
  "function activeIssuerCount() view returns (uint256)",
  "function certIdOf(address issuer, bytes32 certHash) pure returns (bytes32)",
  "function certificates(bytes32) view returns (address issuer, uint8 status, uint64 issuedAt, address holder, uint64 revokedAt)",
  "function getCertificate(bytes32 certId) view returns (tuple(address issuer, uint8 status, uint64 issuedAt, address holder, uint64 revokedAt))",
  "function verifyCertificate(address issuer, bytes32 certHash) view returns (tuple(bool valid, uint8 status, address holder, uint64 issuedAt, uint64 revokedAt, uint8 issuerState, string issuerDisplayName, bool revocationVoided, bool issuedAfterCompromise, uint64 compromisedSince, uint64 compromiseDeclaredAt))",
  "function governance() view returns (address owner_, address pendingOwner_, uint256 activeIssuerCount_)",
  // --- danh tính + lô ---
  "function identityOf(address) view returns (address)",
  "function currentKeyOf(address key) view returns (address)",
  "function batchIdOf(address issuer, bytes32 root) pure returns (bytes32)",
  "function leafOf(bytes32 certHash, address holder, bytes32 salt) pure returns (bytes32)",
  "function batches(bytes32) view returns (address issuer, uint64 issuedAt, uint64 revokedAt, uint32 leafCount, address revokedBy)",
  "function verifyInBatch(address issuer, bytes32 root, bytes32 certHash, address holder, bytes32 salt, bytes32[] proof) view returns (tuple(bool valid, bool batchExists, bool inBatch, bool batchRevoked, bool leafRevoked, uint64 issuedAt, uint64 revokedAt, uint32 leafCount, uint8 issuerState, string issuerDisplayName, bool revocationVoided, bool issuedAfterCompromise, uint64 compromisedSince, uint64 compromiseDeclaredAt))",
  // --- khóa lộ + độ trễ chuyển giao ---
  "function compromisedAt(address) view returns (uint64)",
  // --- mốc công bố lộ khóa, trạng thái hiệu lực, độ trễ ---
  "function compromiseDeclaredAt(address) view returns (uint64)",
  "function effectiveStatus(bytes32 certId) view returns (uint8)",
  "function INHERIT_DELAY() view returns (uint64)",
  "function predecessorOf(address) view returns (address)",
  "function inheritProposals(address) view returns (address newIssuer, uint64 eta, uint64 compromisedSince)",
  // --- nghiệp vụ ---
  "function issueCertificate(bytes32 certHash, address holder) returns (bytes32)",
  "function revokeCertificate(bytes32 certId)",
  "function publishBatch(bytes32 root, uint32 leafCount) returns (bytes32)",
  "function revokeLeaf(bytes32 batchId, bytes32 root, bytes32 inner, bytes32[] proof)",
  "function revokeBatch(bytes32 batchId)",
  // --- quản trị (owner) ---
  "function addIssuer(address issuerAddress, string name)",
  "function removeIssuer(address issuerAddress)",
  "function restoreIssuer(address issuerAddress)",
  "function proposeInherit(address oldIssuer, address newIssuer, uint64 compromisedSince)",
  "function executeInherit(address oldIssuer)",
  "function cancelInherit(address oldIssuer)",
  "function transferOwnership(address newOwner)",
  "function cancelOwnershipTransfer()",
  "function acceptOwnership()",
  // --- event ---
  "event CertificateIssued(bytes32 certId, bytes32 indexed certHash, address indexed issuer, address indexed holder, uint256 issuedAt)",
  "event CertificateRevoked(bytes32 indexed certId, address indexed by, uint256 revokedAt)",
  "event IssuerAdded(address indexed issuerAddress, string name)",
  "event IssuerRemoved(address indexed issuerAddress)",
  "event IssuerRestored(address indexed issuerAddress)",
  "event IssuerInherited(address indexed oldIssuer, address indexed newIssuer, string name)",
  "event BatchPublished(bytes32 indexed batchId, bytes32 indexed root, address indexed issuer, uint32 leafCount, uint256 issuedAt)",
  "event BatchRevoked(bytes32 indexed batchId, address indexed by, uint256 revokedAt)",
  "event LeafRevoked(bytes32 indexed batchId, bytes32 indexed leaf, address indexed by, uint256 revokedAt)",
  "event InheritProposed(address indexed oldIssuer, address indexed newIssuer, uint64 compromisedSince, uint64 eta)",
  "event InheritCancelled(address indexed oldIssuer, address indexed newIssuer)",
  "event KeyCompromised(address indexed key, uint64 since)",
  "event OwnershipTransferStarted(address indexed from, address indexed to)",
  "event OwnershipTransferCancelled(address indexed from, address indexed to)",
  "event OwnershipTransferred(address indexed from, address indexed to)",
  // --- lỗi (ethers giải mã custom error nhờ các dòng này) ---
  ...Object.keys(ERR_VI).map((n) => "error " + n + "()")
];

const STATUS_LABEL = ["Chưa tồn tại", "Còn hiệu lực", "Đã thu hồi"];
const STATUS_CLASS = ["t-none", "t-issued", "t-revoked"];
const ISSUER_LABEL = ["Chưa được công nhận", "Đang hoạt động", "Đã bị vô hiệu hóa"];

const KEY_STORE    = "credverify.offchain";
const KEY_RECEIPTS = "credverify.receipts";   // bản sao biên nhận các lô đăng từ trình duyệt này
const KEY_LEDGER   = "credverify.ledger";

const CONTRACT_ADDRESS  = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const EXPECTED_CHAIN_ID = 31337n;   // 11155111n cho Sepolia
// Block chứa giao dịch deploy contract chính thức. Mọi truy vấn event bắt đầu từ đây
// thay vì từ block 0 — trên Sepolia (~10 triệu block) quét từ 0 là >1.000 lời gọi RPC
// mỗi bộ lọc và bị RPC công khai chặn. scripts/deploy.js in ra giá trị cần điền.
const DEPLOY_BLOCK = 0;

let provider, signer, contract, account, contractAddress;

/* Danh sách RPC ĐỘC LẬP. Kết quả xác minh được đọc trên TẤT CẢ, cùng một
   block, và chỉ hiện "Hợp lệ" khi mọi RPC trả cùng một kết quả. Một RPC bị chiếm (hoặc trả
   sai) không còn tự quyết được kết luận. Khi deploy công khai, liệt kê 2–3 nhà cung cấp khác
   nhau VÀ thêm đúng các host đó vào connect-src của CSP ở đầu trang.
   Phần tử đầu là RPC chính (danh bạ, nhật ký). */
const RPC_URLS = ["http://127.0.0.1:8545"];
let readProvider = null, readContract = null, readContracts = [];

function initReadOnly() {
  try {
    readContracts = RPC_URLS.map((u) => new ethers.Contract(CONTRACT_ADDRESS, ABI,
      new ethers.JsonRpcProvider(u, undefined, { staticNetwork: true })));
    readContract = readContracts[0];
    readProvider = readContract.runner;
  } catch { readProvider = null; readContract = null; readContracts = []; }
}
const reader = () => contract || readContract;

/* Gọi một hàm view trên mọi RPC tại CÙNG một block, so kết quả. Block = độ cao LỚN NHẤT
   mà các RPC báo, trừ 2 khi có nhiều RPC (chừa độ trễ lan truyền). KHÔNG lấy độ cao nhỏ nhất: một RPC gian có
   thể báo độ cao thấp để kéo mọi RPC về đọc trạng thái CŨ (trước một lần thu hồi). RPC nào
   chưa tới block đó bị coi là lỗi -> không kết luận. Trả { value, agree, n, block, errors }. agree=false nghĩa là các RPC trả khác
   nhau hoặc một RPC lỗi — trang phải nói ra và KHÔNG kết luận "Hợp lệ". */
const asJSON = (v) => JSON.stringify(v, (k, x) => (typeof x === "bigint" ? x.toString() : x));
async function crossCall(fn, ...args) {
  const cs = readContracts.length ? readContracts : [reader()];
  const heights = await Promise.all(cs.map((c) =>
    (c.runner.provider || c.runner).getBlockNumber().catch(() => null)));
  const ok = heights.filter((h) => h != null);
  if (!ok.length) throw new Error("không RPC nào trả lời");
  const lag = cs.length > 1 ? 2 : 0;   // một RPC thì không cần chừa độ trễ giữa các nhà cung cấp
  const block = Math.max(0, Math.max(...ok) - lag);
  const res = await Promise.all(cs.map((c, i) => heights[i] == null
    ? Promise.resolve({ err: "không trả lời" })
    : heights[i] < block ? Promise.resolve({ err: "chậm " + (block - heights[i]) + " block" })
    : c[fn](...args, { blockTag: block }).then((v) => ({ v }), (e) => ({ err: reasonOf(e) }))));
  const good = res.filter((r) => !("err" in r));
  if (!good.length) throw new Error(res[0].err);
  const ref = asJSON(good[0].v);
  const agree = good.length === res.length && good.every((r) => asJSON(r.v) === ref);
  return { value: good[0].v, agree, n: cs.length, block, errors: res.filter((r) => "err" in r).map((r) => r.err) };
}

function rpcNote(x) {
  if (!x) return "";
  if (!x.agree) {
    return '<div class="banner err" style="margin:14px 0 0"><b>CÁC RPC TRẢ KẾT QUẢ KHÁC NHAU</b> tại block ' +
      x.block + " (" + x.n + " RPC" + (x.errors.length ? ", " + x.errors.length + " lỗi" : "") + "). " +
      "Đừng tin kết luận lần này. Tự kiểm lại qua Etherscan hoặc <span class='mono'>scripts/verify-receipt.js</span>.</div>";
  }
  return x.n > 1
    ? '<div class="banner" style="margin:14px 0 0">' + x.n + " RPC độc lập trả <b>cùng một kết quả</b> tại block " + x.block + ".</div>"
    : '<p class="hint" style="margin:10px 0 0">Kết quả đọc qua <b>một</b> RPC (block ' + x.block + "). " +
      "Khi triển khai công khai, trang đối chiếu 2–3 nhà cung cấp độc lập.</p>";
}

/* Quy tắc chuẩn hóa tên — GIỐNG HỆT scripts/lib/name.js: NFC, gộp khoảng trắng, bỏ đầu/cuối.
   Giữ nguyên chữ hoa/thường và dấu. */
const canonicalName = (s) => String(s ?? "")
  .normalize("NFC")
  .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/gu, "")
  .replace(/[\u2010-\u2015\u2212]/gu, "-")
  .replace(/\s+/gu, " ")
  .trim();

/* Danh sách cho phép tên — GIỐNG HỆT scripts/lib/name.js và _requireCanonicalName của contract:
   chữ cái ASCII, chữ số, dấu cách, ( ) , - và 134 chữ có dấu tiếng Việt dạng dựng sẵn. */
const VN_LETTERS =
  "ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯư" +
  Array.from({ length: 0x1EF9 - 0x1EA0 + 1 }, (_, i) => String.fromCharCode(0x1EA0 + i)).join("");
const NAME_ALLOWED = new RegExp("^[A-Za-z0-9 (),\\-" + VN_LETTERS + "]*$", "u");
/** null nếu tên (đã chuẩn hóa) hợp lệ; ngược lại là câu giải thích tiếng Việt. */
function nameProblem(name) {
  const s = String(name ?? "");
  if (!s) return "Tên rỗng.";
  if (new TextEncoder().encode(s).length > 256) return "Tên dài quá 256 byte.";
  if (!NAME_ALLOWED.test(s)) {
    const bad = [...s].find((ch) => !NAME_ALLOWED.test(ch));
    return `Ký tự "${bad}" (U+${bad.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}) không được phép. ` +
      "Chỉ dùng chữ cái tiếng Việt, chữ số, dấu cách, ( ) , -";
  }
  if (s !== s.trim() || / {2}/.test(s)) return "Tên có khoảng trắng thừa.";
  return null;
}

const BLOCK_CHUNK = 10000;
async function queryLogsChunked(c, filter) {
  const prov = c.runner?.provider || readProvider;
  const latest = await prov.getBlockNumber();
  const start = DEPLOY_BLOCK;
  const out = [];
  let to = latest;
  while (to >= start) {
    const from = Math.max(start, to - BLOCK_CHUNK + 1);
    out.push(...(await c.queryFilter(filter, from, to)));
    if (from === start) break;
    to = from - 1;
  }
  return out.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
}

/* Quét MỘT lần cho nhiều loại event (OR theo topic0) thay vì mỗi loại một lần —
   số lời gọi RPC = (số block từ DEPLOY_BLOCK) / BLOCK_CHUNK, bất kể bao nhiêu loại event. */
async function scanEvents(c, names) {
  const prov = c.runner?.provider || readProvider;
  const topics = [names.map((n) => c.interface.getEvent(n).topicHash)];
  const latest = await prov.getBlockNumber();
  const out = [];
  let to = latest;
  while (to >= DEPLOY_BLOCK) {
    const from = Math.max(DEPLOY_BLOCK, to - BLOCK_CHUNK + 1);
    const raw = await prov.getLogs({ address: CONTRACT_ADDRESS, topics, fromBlock: from, toBlock: to });
    for (const lg of raw) {
      const p = c.interface.parseLog(lg);
      if (p) out.push({ name: p.name, args: p.args, blockNumber: lg.blockNumber,
        index: lg.index, transactionHash: lg.transactionHash });
    }
    if (from === DEPLOY_BLOCK) break;
    to = from - 1;
  }
  return out.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
}

/* ---------- tiện ích ---------- */
const $ = (id) => document.getElementById(id);
const short = (s, head = 10, tail = 8) =>
  !s ? "—" : (s.length <= head + tail + 2 ? s : s.slice(0, head) + "…" + s.slice(-tail));

// Thoát ký tự HTML. 
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// certId tính ngay tại client
const certIdOf = (issuer, certHash) =>
  ethers.solidityPackedKeccak256(["address", "bytes32"], [issuer, certHash]);

/* CHUẨN HÓA TÊN — thứ contract KHÔNG làm được với giá hợp lý.

   Giới hạn còn lại: bảng dưới chỉ phủ Kirin + Hy Lạp, là hai bảng chữ có nguy
   cơ thực tế với tên tiếng Việt/Latin. Bảng confusables đầy đủ của Unicode
   (UTS #39) lớn hơn nhiều. */
const CONFUSABLES = {
  "а":"a","е":"e","о":"o","р":"p","с":"c","у":"y","х":"x","і":"i","ј":"j",
  "ѕ":"s","ԁ":"d","һ":"h","ӏ":"l","в":"b","к":"k","м":"m","н":"h","т":"t",
  "α":"a","ο":"o","ρ":"p","ν":"v","ε":"e","ι":"i","κ":"k","μ":"u","τ":"t",
  "γ":"y","χ":"x","β":"b","θ":"o","σ":"o","ϲ":"c","ѡ":"w","ѵ":"v"
};
const normName = (s) => String(s ?? "")
  .normalize("NFKC")
  // ký tự vô hình: không chiếm chỗ trên màn hình nhưng đổi chuỗi byte
  .replace(/[​-‍⁠﻿­]/g, "")
  .toLowerCase()
  .replace(/./g, (c) => CONFUSABLES[c] || c)
  .normalize("NFD").replace(/[̀-ͯ]/g, "")   // bỏ dấu tiếng Việt
  .replace(/đ/g, "d")
  .replace(/\s+/g, " ")
  .trim();

function renderAnchor() {
  $("anchorAddr").textContent = CONTRACT_ADDRESS;
  $("anchorChain").textContent = EXPECTED_CHAIN_ID.toString();
}

function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function writeJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { }
}

/* banner() nhận HTML — CHỈ dùng với chuỗi tĩnh do ta tự viết, hoặc đã esc() ở nơi gọi. */
function banner(target, text, isError) {
  $(target).innerHTML =
    '<div class="banner' + (isError ? " err" : "") + '" style="margin:18px 0 0">' + text + "</div>";
}

function bannerText(target, text, isError) {
  const box = document.createElement("div");
  box.className = "banner" + (isError ? " err" : "");
  box.style.margin = "18px 0 0";
  box.textContent = text;
  const host = $(target);
  host.textContent = "";
  host.appendChild(box);
}

/* ---------- nhật ký bằng chứng ---------- */
function logEntry(entry) {
  const all = readJSON(KEY_LEDGER, []);
  all.unshift(Object.assign({ at: new Date().toISOString() }, entry));
  writeJSON(KEY_LEDGER, all.slice(0, 200));
  renderLedger();
}

function renderLedger() {
  const all = readJSON(KEY_LEDGER, []);
  $("ledgerCount").textContent = all.length + " mục";
  if (!all.length) {
    $("ledgerBody").innerHTML =
      '<p class="empty">Mọi giao dịch và thao tác bị chặn sẽ được ghi lại ở đây kèm mã giao dịch, số block và lượng gas.</p>';
    return;
  }
  $("ledgerBody").innerHTML = all.map((e) => {
    const rows = [];
    if (e.txHash) rows.push(["Tx", short(e.txHash, 12, 10)]);
    if (e.block != null) rows.push(["Block", e.block]);
    if (e.gas) rows.push(["Gas", e.gas]);
    if (e.certId) rows.push(["certId", short(e.certId, 12, 10)]);
    if (e.detail) rows.push(["Chi tiết", esc(e.detail)]);
    if (e.reason) rows.push(["Lý do", esc(e.reason)]);
    return '<div class="entry"><div class="entry-top">' +
      '<span class="entry-op' + (e.ok === false ? " fail" : "") + '">' +
      (e.ok === false ? "✕ " : "") + esc(e.op) + "</span>" +
      '<span class="entry-time">' + new Date(e.at).toLocaleTimeString("vi-VN") + "</span></div>" +
      (rows.length ? "<dl>" + rows.map(([k, v]) => "<dt>" + k + "</dt><dd>" + v + "</dd>").join("") + "</dl>" : "") +
      "</div>";
  }).join("");
}

function exportEvidence() {
  const all = readJSON(KEY_LEDGER, []).slice().reverse();
  if (!all.length) { alert("Nhật ký đang trống. Hãy thực hiện vài thao tác trước."); return; }
  let md = "# EVIDENCE — CredVerify V3 (sổ đăng ký dùng chung)\n\n";
  md += "- Contract address: `" + (contractAddress || CONTRACT_ADDRESS) + "`\n";
  md += "- chainId kỳ vọng: `" + EXPECTED_CHAIN_ID + "`\n";
  md += "- Tài khoản thao tác: `" + (account || "chưa kết nối") + "`\n";
  md += "- Xuất lúc: " + new Date().toISOString() + "\n\n";
  md += "> Nhật ký do giao diện CredVerify ghi lại. Đối chiếu bằng `npx hardhat console` hoặc log của `npx hardhat node`.\n\n";
  md += "## Nhật ký thao tác\n\n";
  md += "| # | Thời điểm | Thao tác | Kết quả | Tx hash | Block | Gas | Ghi chú |\n|---|---|---|---|---|---|---|---|\n";
  all.forEach((e, i) => {
    md += "| " + (i + 1) + " | " + e.at + " | " + e.op + " | " +
      (e.ok === false ? "BỊ CHẶN" : "Thành công") + " | " +
      (e.txHash ? "`" + e.txHash + "`" : "—") + " | " +
      (e.block != null ? e.block : "—") + " | " + (e.gas || "—") + " | " +
      (e.reason || e.detail || "—") + " |\n";
  });
  md += "\n## Ghi chú\n\n- Không đưa private key, seed phrase hay dữ liệu cá nhân thật vào tệp này.\n";
  md += "- Bổ sung thủ công: phiên bản compiler, deployment transaction, kết quả `npx hardhat test`.\n";
  const blob = new Blob([md], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "EVIDENCE.md";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- băm tệp ---------- */
async function hashFile(file) {
  const buf = await file.arrayBuffer();
  return ethers.keccak256(new Uint8Array(buf));
}
function wireFileInput(inputId, outId, store) {
  $(inputId).addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const h = await hashFile(f);
      store.hash = h; store.name = f.name;
      // esc(f.name): tên tệp do NGƯỜI NGOÀI cung cấp (ứng viên gửi hồ sơ).
      $(outId).innerHTML = "Hash tệp <b>" + esc(f.name) + "</b>: <span class='mono'>" + short(h, 14, 12) + "</span>";
      if (inputId === "isFile") renderIssueCertId();
    } catch (e) {
      $(outId).textContent = "Không đọc được tệp: " + e.message;
    }
  });
}
const issueFile = { hash: null, name: null };
const verifyFile = { hash: null, name: null };

// DANH BẠ ĐƠN VỊ PHÁT HÀNH 

/* Danh bạ dựng HOÀN TOÀN từ event — contract không có hàm view duyệt danh sách (vỡ trần gas của
   eth_call khi danh bạ lớn; docs/SCALE-NAMES.md). Phát lại theo thứ tự (block, logIndex):
     IssuerAdded(a,name) -> Active · IssuerRemoved(a) -> Disabled · IssuerRestored(a) -> Active
     IssuerInherited(old,new) -> old Disabled, ghi chuỗi kế nhiệm
   Rồi ĐỐI CHIẾU số đơn vị Active với activeIssuerCount() trên chuỗi: lệch nghĩa là RPC trả
   thiếu event, và trang phải nói ra điều đó. Cùng thuật toán với scripts/lib/directory.js. */
const DIR_EVENTS = ["IssuerAdded", "IssuerRemoved", "IssuerRestored", "IssuerInherited"];
const emptyDir = () => ({ keys: {}, addrs: [], names: [], inactive: [], recognizedBlock: {},
  recognizedAt: {}, predecessor: {}, loadedAt: 0, logsError: null, countMismatch: null });
let DIR = emptyDir();

async function loadDirectory(force) {
  const c = reader();
  if (!c) return DIR;
  if (!force && DIR.loadedAt && Date.now() - DIR.loadedAt < 30000) return DIR;
  const d = emptyDir();
  try {
    const logs = await scanEvents(c, DIR_EVENTS);
    for (const lg of logs) {
      const a = lg.args;
      if (lg.name === "IssuerAdded") {
        const k = a.issuerAddress.toLowerCase();
        d.keys[k] = { address: a.issuerAddress, name: a.name, status: 1, successor: null };
        d.recognizedBlock[k] = lg.blockNumber;
      } else if (lg.name === "IssuerRemoved" || lg.name === "IssuerRestored") {
        const k = d.keys[a.issuerAddress.toLowerCase()];
        if (k) k.status = lg.name === "IssuerRemoved" ? 2 : 1;
      } else if (lg.name === "IssuerInherited") {
        const o = d.keys[a.oldIssuer.toLowerCase()];
        if (o) { o.status = 2; o.successor = a.newIssuer; }
        d.predecessor[a.newIssuer.toLowerCase()] = a.oldIssuer.toLowerCase();
      }
    }
    const all = Object.values(d.keys).sort((x, y) => x.name.localeCompare(y.name, "vi"));
    const active = all.filter((k) => k.status === 1);
    d.addrs = active.map((k) => k.address);
    d.names = active.map((k) => k.name);
    d.inactive = all.filter((k) => k.status !== 1);
    const onChain = Number(await c.activeIssuerCount());
    if (onChain !== active.length) d.countMismatch = { onChain, fromEvents: active.length };
  } catch (e) {
    // KHÔNG nuốt im lặng: thiếu event thì thiếu danh bạ. Người dùng phải được biết.
    d.logsError = reasonOf(e);
  }
  d.loadedAt = Date.now();
  DIR = d;
  return DIR;
}

/* Thời điểm (giây) một khóa được công nhận — lấy timestamp block CHỈ khi cần hiển thị,
   để không phải gọi getBlock cho mọi đơn vị trong danh bạ. */
async function ensureRecognizedAt(addrs) {
  const prov = reader()?.runner?.provider || readProvider;
  for (const a of addrs) {
    const k = String(a).toLowerCase();
    const bn = DIR.recognizedBlock[k];
    if (bn == null || DIR.recognizedAt[k] != null) continue;
    try { const b = await prov.getBlock(bn); DIR.recognizedAt[k] = b ? Number(b.timestamp) : null; } catch { }
  }
}

/* Các khóa đang GIỮ một danh tính (Active, hoặc Disabled mà chưa có người kế nhiệm). */
const identityHolders = () => [
  ...DIR.addrs.map((a, i) => ({ addr: a, name: DIR.names[i] })),
  ...DIR.inactive.filter((k) => !k.successor).map((k) => ({ addr: k.address, name: k.name }))
];

/* Đời thứ mấy trong chuỗi kế nhiệm (0 = khóa gốc). */
function generationOf(addr) {
  let n = 0, cur = String(addr).toLowerCase();
  while (DIR.predecessor[cur] && n < 32) { cur = DIR.predecessor[cur]; n++; }
  return n;
}

/* Các cặp tên TRÙNG NHAU SAU CHUẨN HÓA. Contract không bắt được, trang này bắt được. */
function normalizedCollisions() {
  const byNorm = {};
  identityHolders().forEach((x) => {
    const k = normName(x.name);
    (byNorm[k] = byNorm[k] || []).push({ addr: x.addr, name: x.name });
  });
  return Object.values(byNorm).filter((g) => g.length > 1);
}

async function fillIssuerSelect() {
  const sel = $("vfIssuer");
  const keep = sel.value;
  sel.innerHTML = '<option value="">— Chọn đơn vị ghi trên chứng chỉ —</option>';
  const group = (label, items) => {
    if (!items.length) return;
    const g = document.createElement("optgroup");
    g.label = label;
    items.forEach((it) => {
      const o = document.createElement("option");
      o.value = it.addr;
      o.textContent = it.text;   // textContent -> an toàn với tên do owner đặt
      g.appendChild(o);
    });
    sel.appendChild(g);
  };
  // Đánh dấu ngay trong ô chọn những đơn vị có tên TRÔNG GIỐNG nhau — người xác minh
  // chọn theo tên in trên chứng chỉ, nên đây là chỗ dễ bị lừa nhất.
  const look = new Set(normalizedCollisions().flat().map((x) => x.addr.toLowerCase()));
  const warn = (a) => look.has(a.toLowerCase()) ? "  ⚠ có tên gần giống — đối chiếu địa chỉ ví" : "";
  group("Đang hoạt động", DIR.addrs.map((a, i) => ({ addr: a, text: DIR.names[i] + " (" + short(a, 8, 6) + ")" + warn(a) })));
  group("Đã ngừng hoạt động / khóa cũ đã xoay", DIR.inactive.map((k) => ({
    addr: k.address,
    text: k.name + " (" + short(k.address, 8, 6) + ") — " + (k.successor ? "khóa cũ, đã xoay" : "đã ngừng") + warn(k.address)
  })));
  if (keep) sel.value = keep;
}

/* ---------- kết nối ---------- */
async function connect() {
  if (!window.ethereum) {
    walletNotice("Không tìm thấy ví trong trình duyệt. Cài ví rồi tải lại trang.", true);
    return;
  }
  contractAddress = CONTRACT_ADDRESS;
  if (!ethers.isAddress(contractAddress)) {
    walletNotice("Địa chỉ contract trong cấu hình không hợp lệ.", true); return;
  }
  provider = new ethers.BrowserProvider(window.ethereum);

  const net = await provider.getNetwork();
  if (net.chainId !== EXPECTED_CHAIN_ID) {
    walletNotice("Sai mạng: ví đang ở chainId " + net.chainId +
      ", hệ thống yêu cầu " + EXPECTED_CHAIN_ID + ". Đổi mạng trong ví rồi kết nối lại.", true);
    return;
  }

  const code = await provider.getCode(contractAddress);
  if (code === "0x") {
    walletNotice("Không có contract nào tại địa chỉ này trên mạng đang chọn.", true); return;
  }

  await provider.send("eth_requestAccounts", []);
  signer = await provider.getSigner();
  account = await signer.getAddress();
  contract = new ethers.Contract(contractAddress, ABI, signer);

  $("chipNet").innerHTML = "<b>Mạng</b> " + esc(net.name) + " · chainId " + net.chainId;
  $("chipAcct").textContent = short(account, 8, 6);

  let role = "Người xác minh";
  try {
    const [own, st] = await Promise.all([contract.owner(), contract.issuerStatus(account)]);
    if (own.toLowerCase() === account.toLowerCase()) role = "Đơn vị vận hành (owner)";
    else if (Number(st) === 1) role = "Đơn vị phát hành";
    else if (Number(st) === 2) role = "Đơn vị đã bị vô hiệu hóa";
  } catch {
    walletNotice("Kết nối được ví nhưng không đọc được contract. Kiểm tra địa chỉ và mạng.", true);
    return;
  }
  $("chipRole").innerHTML = "<b>Vai trò</b> " + esc(role);
  $("setupBanner").classList.add("hidden");
  clearWalletNotice();
  logEntry({ op: "Kết nối ví", detail: role + " · " + short(account, 8, 6) });
  renderIssueCertId();
  await refreshAll(true);
}

/* Lỗi đi qua ví (BrowserProvider) đôi khi tới tay ethers ở dạng "unknown custom error" vì mỗi
   ví bọc dữ liệu revert một kiểu. Tự tìm chuỗi hex dữ liệu revert trong lỗi rồi giải mã bằng ABI. */
const IFACE = new ethers.Interface(ABI);
function decodeRevertName(err) {
  let s = "";
  try { s = JSON.stringify(err, (k, v) => (typeof v === "bigint" ? v.toString() : v)); } catch { }
  for (const m of s.match(/0x[0-9a-fA-F]{8}(?:[0-9a-fA-F]{64})*(?![0-9a-fA-F])/g) || []) {
    try { const e = IFACE.parseError(m); if (e) return e.name; } catch { }
  }
  return null;
}

function reasonOf(err) {
  const n = err?.revert?.name || decodeRevertName(err);
  if (n) return (ERR_VI[n] || "Contract từ chối") + " (" + n + ")";
  return err?.reason || err?.shortMessage || err?.info?.error?.message || err?.message || "Không rõ nguyên nhân";
}


function walletNotice(html, isError) {
  const el = $("walletBanner");
  el.className = "banner" + (isError ? " err" : "");
  el.innerHTML = html;
}
function clearWalletNotice() {
  const el = $("walletBanner");
  el.className = "banner hidden";
  el.innerHTML = "";
}

function setWrongChain(id) {
  $("chainNow").textContent = id.toString();
  $("chainWant").textContent = EXPECTED_CHAIN_ID.toString();
  $("chainBanner").classList.remove("hidden");
  clearWalletNotice();   // chainBanner đã nói đủ, tránh hai băng chồng nhau
  $("chipNet").innerHTML =
    "<b>Mạng</b> <span style='color:var(--seal);font-weight:500'>SAI · chainId " + id + "</span>";
  $("chipRole").innerHTML = "<b>Vai trò</b> —";
}

function dropWriteAccess() {
  signer = null;
  contract = null;
}

function wireWalletEvents() {
  if (!window.ethereum || window.ethereum.__credverifyWired) return;
  window.ethereum.__credverifyWired = true;

  window.ethereum.on("chainChanged", (hexChainId) => {
    let id;
    try { id = BigInt(hexChainId); } catch { id = -1n; }
    dropWriteAccess();
    if (id === EXPECTED_CHAIN_ID) {
      $("chainBanner").classList.add("hidden");
      $("chipNet").innerHTML = "<b>Mạng</b> chainId " + id;
      $("chipAcct").textContent = "chưa kết nối";
      walletNotice("Ví đã quay lại đúng mạng. Bấm <b>Kết nối ví</b> để nối lại.");
    } else {
      setWrongChain(id);
    }
    logEntry({
      op: "Ví đổi mạng", ok: id === EXPECTED_CHAIN_ID,   // sai mạng mới là lỗi (✕)
      reason: id === EXPECTED_CHAIN_ID
        ? "" : "chainId " + id + " — đã ngắt toàn bộ quyền ghi",
      detail: "chainId " + id,
    });
  });

  window.ethereum.on("accountsChanged", (accs) => {
    dropWriteAccess();
    const next = accs && accs.length ? accs[0] : null;
    account = null;
    $("chipAcct").textContent = next ? short(next, 8, 6) : "chưa kết nối";
    $("chipRole").innerHTML = "<b>Vai trò</b> —";
    walletNotice(next
      ? "Ví đã đổi sang <span class='mono'>" + esc(short(next, 8, 6)) +
        "</span>. Bấm <b>Kết nối ví</b> để nạp lại vai trò trước khi thao tác."
      : "Ví đã ngắt kết nối khỏi trang này.", true);
    logEntry({ op: "Ví đổi tài khoản", detail: next ? short(next, 8, 6) : "ngắt kết nối" });
  });
}

/* ---------- cấp ---------- */
function renderIssueCertId() {
  if (!account || !issueFile.hash) return;
  const id = certIdOf(account, issueFile.hash);
  $("isCertIdBox").innerHTML =
    "Mã bản ghi sẽ là <span class='mono' style='font-size:12px'>" + esc(short(id, 14, 12)) + "</span>" +
    "<div style='margin-top:6px;font-size:12.5px;color:var(--ink-soft)'>" +
    "= keccak256(ví của bạn ‖ hash tệp). Tính ngay tại máy này, không cần hỏi chuỗi.</div>";
}

async function doIssue() {
  if (!contract) { banner("issueOut", "Hãy kết nối ví trước.", true); return; }
  const holder = $("isHolder").value.trim();
  if (!issueFile.hash) { banner("issueOut", "Chưa chọn tệp chứng chỉ.", true); return; }
  if (!ethers.isAddress(holder)) { banner("issueOut", "Địa chỉ ví học viên không hợp lệ.", true); return; }

  const certId = certIdOf(account, issueFile.hash);
  $("btnIssue").disabled = true;
  banner("issueOut", "Đang gửi giao dịch, xác nhận trong ví…");
  try {
    const tx = await contract.issueCertificate(issueFile.hash, holder);
    const rc = await tx.wait();

    const store = readJSON(KEY_STORE, {});
    store[certId] = {
      certId, hash: issueFile.hash, file: issueFile.name, holder,
      name: $("isName").value.trim(), course: $("isCourse").value.trim(),
      issuer: account, txHash: rc.hash
    };
    writeJSON(KEY_STORE, store);

    logEntry({
      op: "Cấp chứng chỉ", txHash: rc.hash, block: rc.blockNumber,
      gas: rc.gasUsed.toString(), certId, detail: issueFile.name || ""
    });
    banner("issueOut", "Đã cấp chứng chỉ cho tệp <b>" + esc(issueFile.name || "") +
      "</b>. Xem mã giao dịch ở nhật ký bên phải.");
    renderList();
  } catch (err) {
    const r = reasonOf(err);
    logEntry({ op: "Cấp chứng chỉ", ok: false, certId, reason: r });
    bannerText("issueOut", "Giao dịch bị chặn: " + r, true);
  } finally {
    $("btnIssue").disabled = false;
  }
}


/* =====================================================================
   CẤP THEO LÔ TRONG TRÌNH DUYỆT
   Cây Merkle tái hiện ĐÚNG OpenZeppelin StandardMerkleTree v1.0.8 với lá
   ["bytes32","address","bytes32"] = (certHash, holder, salt), lá được sắp xếp — nên biên nhận
   sinh ở đây và ở scripts/issue-batch.js là MỘT định dạng, và verifyInBatch của contract chấp nhận.
   test/UiShared.test.js so root + proof với thư viện OpenZeppelin.
   ===================================================================== */
const LEAF_TYPES = ["bytes32", "address", "bytes32"];
const cmpHex = (a, b) => { const d = BigInt(a) - BigInt(b); return d > 0n ? 1 : d < 0n ? -1 : 0; };
// `inner` = keccak(abi.encode(certHash, holder, salt)); lá = keccak(inner). revokeLeaf nhận inner.
const merkleInner = (v) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(LEAF_TYPES, v));
const merkleLeaf = (v) => ethers.keccak256(merkleInner(v));
const merkleNode = (a, b) => ethers.keccak256(ethers.concat([a, b].sort(cmpHex)));
function buildMerkle(values) {
  if (!values.length) throw new Error("Lô rỗng");
  const hashed = values.map((v, i) => ({ i, hash: merkleLeaf(v) })).sort((a, b) => cmpHex(a.hash, b.hash));
  const tree = new Array(2 * values.length - 1);
  hashed.forEach((h, k) => { tree[tree.length - 1 - k] = h.hash; });
  for (let i = tree.length - 1 - values.length; i >= 0; i--) tree[i] = merkleNode(tree[2 * i + 1], tree[2 * i + 2]);
  const at = new Array(values.length);
  hashed.forEach((h, k) => { at[h.i] = tree.length - 1 - k; });
  const proof = (vi) => {
    const out = []; let j = at[vi];
    while (j > 0) { out.push(tree[j % 2 === 1 ? j + 1 : j - 1]); j = Math.floor((j - 1) / 2); }
    return out;
  };
  return { root: tree[0], leaf: (vi) => tree[at[vi]], proof };
}
const randomSalt = () => ethers.hexlify(crypto.getRandomValues(new Uint8Array(32)));
const receiptFileName = (certHash, i) => String(i + 1).padStart(3, "0") + "-" + certHash.slice(2, 10) + ".receipt.json";

const batchDraft = { items: [] };   // [{ name, hash }]

$("btFiles").addEventListener("change", async (ev) => {
  const files = [...ev.target.files];
  batchDraft.items = [];
  $("batchOut").innerHTML = "";
  if (!files.length) { $("btRows").innerHTML = ""; $("btnPublishBatch").disabled = true; return; }
  try {
    for (const f of files) batchDraft.items.push({ name: f.name, hash: await hashFile(f) });
  } catch (e) { bannerText("batchOut", "Không đọc được tệp: " + e.message, true); return; }
  let rows = "";
  batchDraft.items.forEach((it, i) => {
    rows += "<tr><td><b>" + esc(it.name) + "</b><br><span class='mono' style='font-size:11.5px;color:var(--ink-soft)'>" +
      esc(short(it.hash, 10, 8)) + "</span></td><td><input type='text' class='mono' data-bt-holder='" + i +
      "' placeholder='0x… (để trống = vô danh)'></td></tr>";
  });
  $("btRows").innerHTML = "<table><thead><tr><th>Tệp (" + batchDraft.items.length + ")</th><th>Ví học viên (tùy chọn)</th></tr></thead><tbody>" +
    rows + "</tbody></table>";
  $("btnPublishBatch").disabled = false;
});

async function doPublishBatch() {
  if (!contract) { walletNotice("Hãy kết nối ví trước — đăng lô là thao tác ghi.", true); return; }
  const items = batchDraft.items;
  if (!items.length) { banner("batchOut", "Chưa chọn tệp nào.", true); return; }
  const seen = new Set();
  const values = [];
  for (let i = 0; i < items.length; i++) {
    if (seen.has(items[i].hash)) { bannerText("batchOut", "Hai tệp trùng nội dung trong cùng một lô: " + items[i].name, true); return; }
    seen.add(items[i].hash);
    const raw = (document.querySelector("[data-bt-holder='" + i + "']")?.value || "").trim();
    if (raw && !ethers.isAddress(raw)) { bannerText("batchOut", "Ví học viên không hợp lệ ở tệp " + items[i].name, true); return; }
    values.push([items[i].hash, raw ? ethers.getAddress(raw) : ethers.ZeroAddress, randomSalt()]);
  }
  const t = buildMerkle(values);
  const issuer = ethers.getAddress(account);
  const batchId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32"], [issuer, t.root]));
  $("btnPublishBatch").disabled = true;
  banner("batchOut", "Đang gửi giao dịch đăng lô (" + items.length + " chứng chỉ), xác nhận trong ví…");
  try {
    const tx = await contract.publishBatch(t.root, items.length);
    const rc = await tx.wait();
    let issuedAt = 0, issuerName = "";
    try { issuedAt = (await contract.runner.provider.getBlock(rc.blockNumber)).timestamp; } catch { }
    try { issuerName = await reader().issuerName(issuer); } catch { }
    const meta = { chainId: EXPECTED_CHAIN_ID.toString(), contract: ethers.getAddress(CONTRACT_ADDRESS), issuer,
      issuerName, root: t.root, batchId, txHash: rc.hash, blockNumber: rc.blockNumber, issuedAt };
    const receipts = values.map((v, i) => ({
      fileName: receiptFileName(v[0], i), origName: items[i].name,   // origName CHỈ lưu trên máy này
      receipt: { type: "CredVerifyBatchReceipt", version: 1, ...meta,
        certificate: { certHash: v[0], holder: v[1], salt: v[2] }, proof: t.proof(i) },
      leaf: t.leaf(i),
    }));
    const all = readJSON(KEY_RECEIPTS, {});
    all[batchId] = { batchId, root: t.root, issuer, txHash: rc.hash, issuedAt, receipts };
    writeJSON(KEY_RECEIPTS, all);
    logEntry({ op: "Đăng lô", txHash: rc.hash, block: rc.blockNumber, gas: rc.gasUsed.toString(),
      detail: items.length + " chứng chỉ · root " + short(t.root, 8, 6) });
    batchDraft.items = []; $("btFiles").value = ""; $("btRows").innerHTML = "";
    $("batchOut").innerHTML = '<div class="banner" style="margin:18px 0 0">Đã đăng lô <b>' + receipts.length +
      " chứng chỉ</b> trong một giao dịch (" + rc.gasUsed.toString() + " gas). Gửi cho mỗi học viên <b>đúng tệp biên nhận của họ</b> " +
      "kèm tệp chứng chỉ. Bản sao đã lưu trên máy này (tab Tra cứu &amp; thu hồi).</div>" + receiptTable(batchId);
    wireReceiptButtons($("batchOut"));
    renderBatchList();
  } catch (err) {
    const r = reasonOf(err);
    logEntry({ op: "Đăng lô", ok: false, reason: r });
    bannerText("batchOut", "Giao dịch bị chặn: " + r, true);
  } finally {
    $("btnPublishBatch").disabled = false;
  }
}
$("btnPublishBatch").addEventListener("click", doPublishBatch);

function receiptTable(batchId) {
  const b = readJSON(KEY_RECEIPTS, {})[batchId];
  if (!b) return "";
  let rows = "";
  b.receipts.forEach((x, i) => {
    rows += "<tr><td>" + esc(x.origName || "(không rõ)") + "</td><td class='mono' style='font-size:12px'>" + esc(x.fileName) +
      "</td><td><button class='small ghost' data-dl='" + esc(batchId) + "' data-i='" + i + "'>Tải biên nhận</button></td></tr>";
  });
  return "<table style='margin-top:12px'><thead><tr><th>Tệp gốc (chỉ máy này)</th><th>Tệp biên nhận gửi học viên</th><th>" +
    "<button class='small' data-dl-all='" + esc(batchId) + "'>Tải tất cả</button></th></tr></thead><tbody>" + rows + "</tbody></table>";
}

function downloadJSON(name, obj) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2) + "\n"], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function wireReceiptButtons(root) {
  root.querySelectorAll("[data-dl]").forEach((b) => b.addEventListener("click", () => {
    const x = readJSON(KEY_RECEIPTS, {})[b.getAttribute("data-dl")]?.receipts[Number(b.getAttribute("data-i"))];
    if (x) downloadJSON(x.fileName, x.receipt);
  }));
  root.querySelectorAll("[data-dl-all]").forEach((b) => b.addEventListener("click", async () => {
    const r = readJSON(KEY_RECEIPTS, {})[b.getAttribute("data-dl-all")]?.receipts || [];
    for (const x of r) { downloadJSON(x.fileName, x.receipt); await new Promise((z) => setTimeout(z, 250)); }
  }));
}

/* Danh sách lô đăng từ trình duyệt này (tab Tra cứu & thu hồi): trạng thái từng chứng chỉ đọc qua
   verifyInBatch (đã áp quy tắc vô hiệu thu hồi), thu hồi từng chứng chỉ (revokeLeaf) hoặc cả lô. */
async function renderBatchList() {
  const all = readJSON(KEY_RECEIPTS, {});
  const ids = Object.keys(all);
  if (!ids.length) { $("batchListOut").innerHTML = '<p class="empty">Chưa có lô nào được đăng từ trình duyệt này.</p>'; return; }
  const c = reader();
  let html = "";
  for (const id of ids) {
    const b = all[id];
    let rows = "";
    for (let i = 0; i < b.receipts.length; i++) {
      const x = b.receipts[i], cert = x.receipt.certificate;
      let status = "—", tag = "t-none";
      if (c) {
        try {
          const v = await c.verifyInBatch(b.issuer, b.root, cert.certHash, cert.holder, cert.salt, x.receipt.proof);
          const s = !v.inBatch ? 0 : v.valid ? 1 : 2;
          status = (v.batchRevoked ? "Cả lô đã thu hồi" : STATUS_LABEL[s]) +
            (v.issuedAfterCompromise ? " · đăng sau mốc lộ khóa" : "") + (v.revocationVoided ? " · thu hồi do khóa lộ đã vô hiệu" : "");
          tag = STATUS_CLASS[s];
        } catch { }
      }
      rows += "<tr><td>" + esc(x.origName || "(không rõ)") + "<br><span class='mono' style='font-size:11.5px;color:var(--ink-soft)'>" +
        esc(x.fileName) + "</span></td><td><span class='status-tag " + tag + "'>" + esc(status) + "</span></td>" +
        "<td><button class='small ghost' data-dl='" + esc(id) + "' data-i='" + i + "'>Biên nhận</button> " +
        "<button class='small ghost' data-revoke-leaf='" + esc(id) + "' data-i='" + i + "'>Thu hồi</button></td></tr>";
    }
    html += "<div style='margin:12px 0 4px'><b>Lô " + esc(short(b.root, 10, 8)) + "</b> · " + b.receipts.length + " chứng chỉ · " +
      (b.issuedAt ? new Date(b.issuedAt * 1000).toLocaleString("vi-VN") : "") +
      " <button class='small ghost' data-revoke-batch='" + esc(id) + "'>Thu hồi cả lô</button></div>" +
      "<table><thead><tr><th>Tệp gốc (chỉ máy này)</th><th>Trạng thái</th><th></th></tr></thead><tbody>" + rows + "</tbody></table>";
  }
  $("batchListOut").innerHTML = html;
  wireReceiptButtons($("batchListOut"));
  $("batchListOut").querySelectorAll("[data-revoke-leaf]").forEach((btn) => btn.addEventListener("click", () =>
    doRevokeInBatch(btn.getAttribute("data-revoke-leaf"), Number(btn.getAttribute("data-i")))));
  $("batchListOut").querySelectorAll("[data-revoke-batch]").forEach((btn) => btn.addEventListener("click", () =>
    doRevokeInBatch(btn.getAttribute("data-revoke-batch"), null)));
}

async function doRevokeInBatch(batchId, i) {
  if (!contract) { walletNotice("Hãy kết nối ví trước — thu hồi là thao tác ghi.", true); return; }
  const b = readJSON(KEY_RECEIPTS, {})[batchId];
  if (!b) return;
  const whole = i === null;
  if (!confirm((whole ? "Thu hồi CẢ LÔ (" + b.receipts.length + " chứng chỉ)?" : "Thu hồi chứng chỉ này trong lô?") +
    "\n\nThu hồi là VĨNH VIỄN (trừ khi khóa của bạn sau này bị tuyên bố LỘ từ trước thời điểm này).")) return;
  const op = whole ? "Thu hồi cả lô" : "Thu hồi chứng chỉ trong lô";
  try {
    const x = whole ? null : b.receipts[i];
    const tx = whole ? await contract.revokeBatch(batchId)
      : await contract.revokeLeaf(batchId, b.root, merkleInner([x.receipt.certificate.certHash,
          x.receipt.certificate.holder, x.receipt.certificate.salt]), x.receipt.proof);
    const rc = await tx.wait();
    logEntry({ op, txHash: rc.hash, block: rc.blockNumber, gas: rc.gasUsed.toString(), detail: "lô " + short(b.root, 8, 6) });
    renderBatchList();
  } catch (err) {
    const r = reasonOf(err);
    logEntry({ op, ok: false, reason: r });
    alert(op + " bị chặn: " + r);
  }
}

/* =====================================================================
   XÁC MINH
   ===================================================================== */

function issuerAgeNote(issuerAddr, issuedAt) {
  const rec = DIR.recognizedAt[String(issuerAddr).toLowerCase()];
  if (!rec || !issuedAt) return null;
  const gap = Number(issuedAt) - Number(rec);
  if (gap < 0) return null;
  const d = Math.floor(gap / 86400), h = Math.floor(gap / 3600), m = Math.floor(gap / 60);
  const human = d >= 1 ? d + " ngày" : (h >= 1 ? h + " giờ" : m + " phút");
  return {
    text: "Đơn vị này được công nhận ngày " +
      new Date(rec * 1000).toLocaleDateString("vi-VN") +
      " — " + human + " trước khi cấp chứng chỉ này.",
    suspicious: gap < 86400
  };
}

/* ---------- biên nhận lô ----------
   Biên nhận do NGƯỜI NGOÀI đưa (ứng viên), nên: (1) mọi chuỗi trong đó đi qua esc()
   trước khi vào HTML; (2) KHÔNG tin certHash trong biên nhận — luôn băm tệp thật;
   (3) KHÔNG đi theo địa chỉ contract/chainId trong biên nhận — chỉ chấp nhận biên nhận
   trỏ đúng contract mà trang này đang neo, cùng nguyên tắc với việc không nhận địa chỉ
   contract từ người dùng. */
const verifyReceipt = { data: null, name: null };
const isB32 = (v) => typeof v === "string" && ethers.isHexString(v, 32);

function parseReceipt(o) {
  if (!o || typeof o !== "object") throw new Error("không phải JSON object");
  if (o.type !== "CredVerifyBatchReceipt") throw new Error("thiếu type = CredVerifyBatchReceipt");
  if (o.version !== 1) throw new Error("phiên bản biên nhận không hỗ trợ");
  const c = o.certificate || {};
  if (!ethers.isAddress(o.contract)) throw new Error("contract không hợp lệ");
  if (!ethers.isAddress(o.issuer)) throw new Error("issuer không hợp lệ");
  if (!isB32(o.root)) throw new Error("root không hợp lệ");
  if (!ethers.isAddress(c.holder)) throw new Error("certificate.holder không hợp lệ");
  if (!isB32(c.salt)) throw new Error("certificate.salt không hợp lệ");
  if (c.certHash !== undefined && !isB32(c.certHash)) throw new Error("certificate.certHash không hợp lệ");
  if (!Array.isArray(o.proof) || o.proof.length > 64 || !o.proof.every(isB32)) throw new Error("proof không hợp lệ");
  let chainId;
  try { chainId = BigInt(o.chainId); } catch { throw new Error("chainId không hợp lệ"); }
  return {
    chainId, contract: ethers.getAddress(o.contract), issuer: ethers.getAddress(o.issuer),
    root: o.root, proof: o.proof, holder: ethers.getAddress(c.holder), salt: c.salt,
    certHash: c.certHash || null,
    issuerName: typeof o.issuerName === "string" ? o.issuerName : null
  };
}

function clearReceipt() {
  verifyReceipt.data = null; verifyReceipt.name = null;
  $("vfReceipt").value = "";
  $("vfReceiptOut").textContent = "Không có biên nhận: tra theo kiểu cấp lẻ.";
  $("btnClearReceipt").classList.add("hidden");
  $("vfIssuer").disabled = false;
}

$("vfReceipt").addEventListener("change", async (ev) => {
  const f = ev.target.files[0];
  if (!f) { clearReceipt(); return; }
  try {
    if (f.size > 256 * 1024) throw new Error("tệp quá lớn");
    const d = parseReceipt(JSON.parse(await f.text()));
    verifyReceipt.data = d; verifyReceipt.name = f.name;
    $("vfReceiptOut").innerHTML = "Biên nhận <b>" + esc(f.name) + "</b>: lô của " +
      "<span class='mono'>" + esc(short(d.issuer, 8, 6)) + "</span>, proof " + d.proof.length + " nút.";
    $("btnClearReceipt").classList.remove("hidden");
    $("vfIssuer").disabled = true;   // đơn vị cấp đã ghi trong biên nhận; ô chọn bị bỏ qua
  } catch (e) {
    verifyReceipt.data = null;
    $("vfReceiptOut").textContent = "Biên nhận không hợp lệ: " + e.message;
  }
});
$("btnClearReceipt").addEventListener("click", clearReceipt);

async function doVerifyBatch(c) {
  const d = verifyReceipt.data;
  if (d.chainId !== EXPECTED_CHAIN_ID) {
    banner("verifyOut", "<b>Biên nhận thuộc mạng khác</b> (chainId " + esc(d.chainId.toString()) +
      "). Trang này chỉ xác minh trên mạng " + EXPECTED_CHAIN_ID + ".", true);
    return;
  }
  const target = String(c.target || "").toLowerCase();
  if (d.contract.toLowerCase() !== target) {
    banner("verifyOut", "<b>Biên nhận trỏ tới một contract khác</b> (<span class='mono'>" +
      esc(short(d.contract, 8, 6)) + "</span>). Trang này không đi theo địa chỉ contract trong " +
      "biên nhận — một biên nhận giả có thể trỏ tới contract của kẻ gian.", true);
    logEntry({ op: "Xác minh (biên nhận lô)", ok: false, reason: "contract trong biên nhận khác contract chính thức" });
    return;
  }
  try {
    await ensureRecognizedAt([d.issuer]);
    const x = await crossCall("verifyInBatch", d.issuer, d.root, verifyFile.hash, d.holder, d.salt, d.proof);
    const r = x.value;
    renderBatchVerdict(d, r, await currentKeySafe(c, d.issuer), x);
    const trusted = r.valid && x.agree && !r.issuedAfterCompromise;
    setProofTarget(trusted && d.holder !== ethers.ZeroAddress
      ? { kind: "lô", ref: d.root, holder: d.holder, issuer: d.issuer, issuerName: r.issuerDisplayName } : null);
    logEntry({ op: "Xác minh (biên nhận lô)", ok: trusted,
      detail: "chỉ đọc, Merkle proof kiểm trên chuỗi, " + x.n + " RPC" + (x.agree ? "" : " KHÔNG khớp") });
  } catch (err) {
    bannerText("verifyOut", "Không đọc được dữ liệu: " + reasonOf(err), true);
  }
}

function renderBatchVerdict(d, r, currentKey, x) {
  let cls, title, msg;
  if (x && !x.agree) { cls = "invalid"; title = "Không kết luận được";
    msg = "Các nguồn dữ liệu (RPC) trả kết quả khác nhau — xem cảnh báo bên dưới."; }
  else if (r.valid && r.issuedAfterCompromise) { cls = "invalid"; title = "KHÔNG ĐÁNG TIN — lô được đăng sau khi khóa của đơn vị bị lộ";
    msg = "Bản ghi có trên chuỗi, nhưng khóa đã đăng lô này được tuyên bố bị lộ từ trước thời điểm đăng. " +
      "Đây có thể là chứng chỉ giả do kẻ gian cấp. Chứng chỉ thật cấp trong khoảng này phải được đơn vị cấp lại bằng khóa mới."; }
  else if (r.valid && orphanedIssuer(d.issuer, Number(r.issuerState), currentKey)) { cls = "caution";
    title = "Hợp lệ trên chuỗi (cấp theo lô) — nhưng đơn vị cấp đã ngừng hoạt động";
    msg = "Tệp khớp biên nhận, biên nhận khớp một lô trên chuỗi và chứng chỉ chưa bị thu hồi." + ORPHAN_MSG; }
  else if (r.valid) { cls = "valid"; title = "Chứng chỉ hợp lệ (cấp theo lô)";
    msg = "Tệp khớp biên nhận, biên nhận khớp một lô do đơn vị này đăng trên chuỗi, chứng chỉ còn hiệu lực."; }
  else if (!r.batchExists) { cls = "none"; title = "Không tìm thấy lô";
    msg = "Đơn vị ghi trong biên nhận chưa từng đăng lô có root này. Biên nhận có thể là giả."; }
  else if (!r.inBatch) { cls = "invalid"; title = "Tệp không khớp biên nhận";
    msg = "Lô có thật, nhưng tệp bạn nộp (hoặc biên nhận) không thuộc lô đó — tệp có thể đã bị sửa."; }
  else if (r.batchRevoked) { cls = "invalid"; title = "Cả lô đã bị thu hồi";
    msg = "Đơn vị phát hành đã thu hồi toàn bộ lô chứa chứng chỉ này."; }
  else { cls = "invalid"; title = "Đã bị thu hồi";
    msg = "Đơn vị phát hành đã thu hồi chứng chỉ này."; }

  const issuedAt = Number(r.issuedAt), revokedAt = Number(r.revokedAt), state = Number(r.issuerState);
  let extra = rpcNote(x) + compromiseNote(r);
  if (d.certHash && d.certHash.toLowerCase() !== String(verifyFile.hash).toLowerCase()) {
    extra += '<div class="banner err" style="margin:14px 0 0">Hash ghi trong biên nhận <b>khác</b> hash ' +
      "của tệp bạn nộp. Trang này luôn dùng hash của tệp thật.</div>";
  }
  if (d.issuerName && r.batchExists && d.issuerName !== r.issuerDisplayName) {
    extra += '<div class="banner err" style="margin:14px 0 0">Tên đơn vị ghi trong biên nhận ("' +
      esc(d.issuerName) + '") <b>khác</b> tên trên chuỗi. Chỉ tin tên đọc từ chuỗi.</div>';
  }
  const age = r.batchExists ? issuerAgeNote(d.issuer, issuedAt) : null;
  if (age) {
    extra += '<div class="banner' + (age.suspicious ? " err" : "") + '" style="margin:14px 0 0">' +
      (age.suspicious ? "<b>Đáng ngờ — </b>" : "") + esc(age.text) + "</div>";
  }
  if (r.batchExists && cls !== "caution") extra += issuerStateNote(d.issuer, state, currentKey);
  extra += logsErrorNote();

  $("verifyOut").innerHTML =
    '<div class="verdict ' + cls + '"><h3>' + title + "</h3><p>" + msg + "</p><dl>" +
    (r.batchExists ? "<dt>Đơn vị cấp</dt><dd>" + esc(r.issuerDisplayName || "(không tên)") + "</dd>" : "") +
    "<dt>Ví đơn vị</dt><dd>" + esc(d.issuer) + "</dd>" +
    "<dt>Ví học viên</dt><dd>" + esc(d.holder === ethers.ZeroAddress ? "(không gắn ví)" : d.holder) + "</dd>" +
    (issuedAt ? "<dt>Ngày đăng lô</dt><dd>" + new Date(issuedAt * 1000).toLocaleString("vi-VN") + "</dd>" : "") +
    (revokedAt ? "<dt>Ngày thu hồi</dt><dd>" + new Date(revokedAt * 1000).toLocaleString("vi-VN") + "</dd>" : "") +
    (r.batchExists ? "<dt>Số chứng chỉ trong lô</dt><dd>" + Number(r.leafCount) + " (đơn vị tự khai)</dd>" : "") +
    "<dt>Hash bạn nộp</dt><dd>" + esc(short(verifyFile.hash, 14, 12)) + "</dd>" +
    "<dt>Merkle root</dt><dd>" + esc(short(d.root, 14, 12)) + "</dd>" +
    "</dl></div>" + extra;
}

/* Tra theo TÊN gõ tay: issuerByName -> khóa mới nhất -> lần ngược predecessorOf.
   Chỉ đọc TRẠNG THÁI hợp đồng: chạy được cả khi RPC không trả event cũ và khi không còn
   website nào của CredVerify. */
async function resolveByName(typed) {
  const name = canonicalName(typed);
  const x = await crossCall("issuerByName", name);
  const keys = [];
  if (x.agree && x.value !== ethers.ZeroAddress) {
    let k = x.value;
    keys.push(k);
    // Mỗi bước lần ngược cũng đối chiếu mọi RPC: một RPC gian không giấu được khóa cũ.
    for (let i = 0; i < 64; i++) {
      const y = await crossCall("predecessorOf", k);
      if (!y.agree) return { name, rpc: y, keys: [] };
      const pr = y.value;
      if (pr === ethers.ZeroAddress) break;
      keys.push(pr); k = pr;
    }
  }
  return { name, rpc: x, keys };
}

async function doVerify() {
  const c = reader();
  if (!c) { banner("verifyOut", "Không kết nối được tới mạng blockchain. Kiểm tra RPC.", true); return; }
  if (!verifyFile.hash) { banner("verifyOut", "Chưa chọn tệp cần kiểm tra.", true); return; }
  setProofTarget(null);

  let chosen = $("vfIssuer").value;
  const typed = $("vfIssuerName").value.trim();
  try { await loadDirectory(false); } catch { }
  if (verifyReceipt.data) return doVerifyBatch(c);

  if ((!chosen || !ethers.isAddress(chosen)) && !typed) {
    banner("verifyOut", "Hãy chọn <b>đơn vị đã cấp</b> — hoặc gõ tên đơn vị in trên chứng chỉ. " +
      "Mỗi đơn vị có một sổ riêng bên trong sổ chung, nên phải biết tra ở sổ nào.", true);
    return;
  }
  try {
    let x, byName = null;
    if (!chosen && typed) {
      byName = await resolveByName(typed);
      if (!byName.rpc.agree) { $("verifyOut").innerHTML = rpcNote(byName.rpc); return; }
      if (!byName.keys.length) {
        const n = normName(byName.name);
        const near = identityHolders().filter((h) => normName(h.name) === n);
        banner("verifyOut", "<b>Không có đơn vị nào mang đúng tên</b> \"" + esc(byName.name) + "\" trong sổ đăng ký." +
          (near.length ? "<br>Tên gần giống đang có: " + near.map((h) => "<b>" + esc(h.name) + "</b> (" +
            esc(short(h.addr, 8, 6)) + ")").join(", ") + ". Đối chiếu từng chữ với tên in trên chứng chỉ." : ""), true);
        return;
      }
      // Thử từ khóa mới nhất về khóa gốc; dừng ở khóa đầu tiên có bản ghi cho tệp này.
      for (const k of byName.keys) {
        x = await crossCall("verifyCertificate", k, verifyFile.hash);
        chosen = k;
        if (!x.agree || Number(x.value.status) !== 0) break;
      }
    } else {
      x = await crossCall("verifyCertificate", chosen, verifyFile.hash);
    }
    const r = x.value;
    await ensureRecognizedAt([chosen]);
    renderVerdict(chosen, r, certIdOf(chosen, verifyFile.hash), await currentKeySafe(c, chosen), x, byName);
    const trusted = r.valid && x.agree && !r.issuedAfterCompromise &&
      (!byName || r.issuerDisplayName === byName.name);
    setProofTarget(trusted ? { kind: "lẻ", ref: certIdOf(chosen, verifyFile.hash), holder: r.holder,
      issuer: chosen, issuerName: r.issuerDisplayName } : null);
    logEntry({ op: "Xác minh", certId: certIdOf(chosen, verifyFile.hash), ok: trusted,
      detail: "chỉ đọc, " + x.n + " RPC" + (x.agree ? "" : " KHÔNG khớp") + (byName ? ", tra theo tên" : "") });
  } catch (err) {
    bannerText("verifyOut", "Không đọc được dữ liệu: " + reasonOf(err), true);
  }
}

/* Ghi chú khóa lộ + thời điểm CÔNG BỐ: người xác minh thấy owner đã lùi mốc lộ bao xa. */
function compromiseNote(r) {
  const since = Number(r.compromisedSince || 0), declared = Number(r.compromiseDeclaredAt || 0);
  const when = since ? new Date(since * 1000).toLocaleString("vi-VN") : "?";
  let s = "";
  if (r.issuedAfterCompromise) {
    s += '<div class="banner err" style="margin:14px 0 0"><b>Khóa đã cấp chứng chỉ này bị tuyên bố LỘ từ ' + when +
      "</b>, và chứng chỉ được cấp sau mốc đó. Đừng chấp nhận; đề nghị ứng viên xin đơn vị cấp lại.</div>";
  }
  if (r.revocationVoided) {
    s += '<div class="banner" style="margin:14px 0 0"><b>Có một lần thu hồi đã bị vô hiệu:</b> nó do một khóa ' +
      "bị tuyên bố lộ (từ " + when + ") thực hiện. Bản ghi thu hồi gốc vẫn còn trên chuỗi, nhưng không có hiệu lực.</div>";
  }
  if ((r.issuedAfterCompromise || r.revocationVoided) && declared) {
    const back = Math.max(0, declared - since), days = Math.floor(back / 86400), hours = Math.floor((back % 86400) / 3600);
    s += '<div class="banner" style="margin:14px 0 0">Việc lộ khóa được <b>công bố trên chuỗi</b> lúc ' +
      new Date(declared * 1000).toLocaleString("vi-VN") + ", tính <b>lùi về</b> mốc " + when +
      " (lùi " + (days ? days + " ngày " : "") + hours + " giờ). Mốc lộ do đơn vị vận hành khai, tối đa 30 ngày " +
      "trước lúc đề xuất — mốc lùi càng xa thì càng nhiều chứng chỉ bị ảnh hưởng.</div>";
  }
  return s;
}

/* Khóa hiện hành của danh tính + nó có đang Active không — đọc THẲNG trạng thái hợp đồng. */
const KEY_ACTIVE = {};
async function currentKeySafe(c, addr) {
  try {
    const k = await c.currentKeyOf(addr);
    try { KEY_ACTIVE[k.toLowerCase()] = Number(await c.issuerStatus(k)) === 1; } catch { }
    return k;
  } catch { return null; }
}
const keyIsActive = (k) => KEY_ACTIVE[String(k).toLowerCase()] ??
  DIR.addrs.some((a) => a.toLowerCase() === String(k).toLowerCase());

/* Khóa cấp đã bị gỡ (Disabled) và danh tính KHÔNG có khóa nào đang hoạt động: chứng chỉ vẫn hợp lệ
   trên chuỗi nhưng không còn ai thu hồi được -> khung kết quả màu vàng. */
function orphanedIssuer(issuer, issuerState, currentKey) {
  if (issuerState !== 2) return false;
  const rotated = currentKey && currentKey !== ethers.ZeroAddress &&
    currentKey.toLowerCase() !== String(issuer).toLowerCase();
  return !(rotated && keyIsActive(currentKey));
}
const ORPHAN_MSG = " Tuy nhiên khóa đã cấp nó <b>đã bị gỡ quyền mà không chuyển sang khóa mới</b>: đơn vị có thể đã " +
  "giải thể, hoặc bị gỡ vì khóa lộ / gian lận mà chưa được xử lý. Không còn ai thu hồi được chứng chỉ của khóa này " +
  "(trừ khi CredVerify chuyển danh tính sang khóa mới trong 7 ngày sau khi gỡ). Hãy đối chiếu trực tiếp với đơn vị " +
  "đào tạo hoặc CredVerify trước khi chấp nhận.";

function issuerStateNote(issuer, issuerState, currentKey) {
  if (issuerState !== 2) return "";
  const rotated = currentKey && currentKey !== ethers.ZeroAddress &&
    currentKey.toLowerCase() !== String(issuer).toLowerCase();
  const curActive = rotated && keyIsActive(currentKey);
  if (rotated && curActive) {
    return '<div class="banner" style="margin:14px 0 0"><b>Đơn vị đã xoay sang khóa mới</b> ' +
      "(khóa hiện tại <span class='mono'>" + esc(short(currentKey, 8, 6)) + "</span>). " +
      "Khóa đã ký chứng chỉ này không còn được dùng để cấp. Chứng chỉ cấp trước khi xoay vẫn hợp lệ " +
      "nếu chưa bị thu hồi. Nếu đơn vị xoay khóa vì khóa cũ bị lộ, hợp đồng tự gắn cờ mọi chứng chỉ khóa đó " +
      "cấp sau mốc lộ (xem cảnh báo đỏ phía trên, nếu có).</div>";
  }
  return '<div class="banner" style="margin:14px 0 0"><b>Đơn vị cấp nay đã bị vô hiệu hóa.</b> ' +
    "Chứng chỉ đã cấp hợp lệ thì vẫn hợp lệ — đơn vị vận hành không có quyền viết lại quá khứ. " +
    "Nhưng bạn nên biết điều này khi cân nhắc.</div>";
}

function countMismatchNote() {
  const m = DIR.countMismatch;
  return m
    ? '<div class="banner err" style="margin:14px 0 0"><b>Danh bạ không khớp với chuỗi:</b> contract ghi ' +
      m.onChain + " đơn vị đang hoạt động, nhưng lịch sử event tải về chỉ dựng được " + m.fromEvents +
      ". RPC có thể đã trả thiếu event — đừng dựa vào danh bạ lần này; kết quả xác minh vẫn đọc thẳng từ contract.</div>"
    : "";
}

function logsErrorNote() {
  return DIR.logsError
    ? '<div class="banner err" style="margin:14px 0 0"><b>Không tải được lịch sử sự kiện</b> (' +
      esc(DIR.logsError) + "). Cảnh báo \"đơn vị vừa được công nhận\" và thông tin chuỗi khóa " +
      "<b>không hiển thị</b> được lần này — kết quả trạng thái ở trên vẫn đọc thẳng từ contract.</div>"
    : "";
}

function renderVerdict(issuer, r, certId, currentKey, x, byName) {
  const issuerNameStr = r.issuerDisplayName, status = Number(r.status), valid = r.valid, holder = r.holder;
  const issuedAt = Number(r.issuedAt), revokedAt = Number(r.revokedAt), issuerState = Number(r.issuerState);
  const nameMismatch = byName && status !== 0 && issuerNameStr !== byName.name;
  let cls, title, msg;
  if (x && !x.agree) { cls = "invalid"; title = "Không kết luận được";
    msg = "Các nguồn dữ liệu (RPC) trả kết quả khác nhau — xem cảnh báo bên dưới."; }
  else if (nameMismatch) { cls = "invalid"; title = "Tên đơn vị không khớp";
    msg = "Bản ghi tìm thấy thuộc đơn vị \"" + esc(issuerNameStr) + "\", không phải tên bạn gõ. Không chấp nhận."; }
  else if (valid && r.issuedAfterCompromise) { cls = "invalid"; title = "KHÔNG ĐÁNG TIN — cấp sau khi khóa của đơn vị bị lộ";
    msg = "Bản ghi có trên chuỗi và chưa bị thu hồi, nhưng khóa đã cấp nó được tuyên bố bị lộ từ trước thời điểm cấp. " +
      "Đây có thể là bằng giả do kẻ gian cấp."; }
  else if (valid && orphanedIssuer(issuer, issuerState, currentKey)) { cls = "caution";
    title = "Hợp lệ trên chuỗi — nhưng đơn vị cấp đã ngừng hoạt động";
    msg = "Tệp khớp với bản ghi trên chuỗi và chứng chỉ chưa bị thu hồi." + ORPHAN_MSG; }
  else if (valid)          { cls = "valid";   title = "Chứng chỉ hợp lệ";
    msg = "Tệp khớp với bản ghi trên chuỗi và chứng chỉ còn hiệu lực."; }
  else if (status === 0) { cls = "none"; title = "Không tìm thấy";
    msg = "Đơn vị này chưa từng đăng ký tệp có nội dung như vậy. Kiểm tra lại đơn vị đã chọn " +
      "có đúng tên in trên chứng chỉ không — nếu đúng, tệp có thể đã bị chỉnh sửa."; }
  else                { cls = "invalid"; title = "Đã bị thu hồi";
    msg = "Đơn vị phát hành đã thu hồi chứng chỉ này."; }

  const age = status !== 0 ? issuerAgeNote(issuer, issuedAt) : null;
  const gen = generationOf(issuer);

  let extra = rpcNote(x) + compromiseNote(r);
  if (byName) {
    extra += '<div class="banner" style="margin:14px 0 0">Tra theo tên <b>' + esc(byName.name) + "</b>: " +
      byName.keys.length + " khóa của đơn vị (khóa mới nhất → khóa gốc), đọc thẳng từ trạng thái hợp đồng.</div>";
  }
  if (age) {
    extra += '<div class="banner' + (age.suspicious ? " err" : "") + '" style="margin:14px 0 0">' +
      (age.suspicious ? "<b>Đáng ngờ — </b>" : "") + esc(age.text) +
      (age.suspicious
        ? " Một đơn vị vừa được công nhận đã cấp bằng ngay có thể hoàn toàn hợp lệ, nhưng cũng là " +
          "dấu hiệu của một ví được thêm vào chỉ để cấp tấm bằng này. Hãy đối chiếu với đơn vị đào tạo."
        : "") + "</div>";
  }
  if (cls !== "caution") extra += issuerStateNote(issuer, issuerState, currentKey);
  extra += countMismatchNote();
  extra += logsErrorNote();
  if (gen > 0) {
    extra += '<div class="banner" style="margin:14px 0 0">Khóa cấp này là <b>đời thứ ' + gen +
      "</b> trong chuỗi chuyển giao của đơn vị.</div>";
  }

  $("verifyOut").innerHTML =
    '<div class="verdict ' + cls + '"><h3>' + title + "</h3><p>" + msg + "</p><dl>" +
    "<dt>Trạng thái</dt><dd><span class='status-tag " + STATUS_CLASS[status] + "'>" +
      STATUS_LABEL[status] + "</span></dd>" +
    (status !== 0 ? "<dt>Đơn vị cấp</dt><dd>" + esc(issuerNameStr || "(không tên)") + "</dd>" : "") +
    (status !== 0 ? "<dt>Ví đơn vị</dt><dd>" + esc(issuer) + "</dd>" : "") +
    (status !== 0 ? "<dt>Ví học viên</dt><dd>" + esc(holder) + "</dd>" : "") +
    (issuedAt ? "<dt>Ngày cấp</dt><dd>" + new Date(issuedAt * 1000).toLocaleString("vi-VN") + "</dd>" : "") +
    (revokedAt ? "<dt>Ngày thu hồi</dt><dd>" + new Date(revokedAt * 1000).toLocaleString("vi-VN") + "</dd>" : "") +
    "<dt>Hash bạn nộp</dt><dd>" + esc(short(verifyFile.hash, 14, 12)) + "</dd>" +
    "<dt>Mã bản ghi</dt><dd>" + esc(short(certId, 14, 12)) + "</dd>" +
    "</dl></div>" + extra;
}

/* ---------- ứng viên chứng minh mình giữ ví ghi trên chứng chỉ ----------
   Không tốn gas, không ghi gì lên chuỗi: nhà tuyển dụng tạo thông điệp có nonce ngẫu nhiên +
   hạn 10 phút, ứng viên ký bằng personal_sign, trang kiểm verifyMessage(...) == holder. */
const PROOF_HEADER = "CredVerify — xác nhận chủ chứng chỉ";
let proofTarget = null, challenge = null;

function setProofTarget(t) {
  proofTarget = t; challenge = null;
  $("pfMessage").value = ""; $("pfSig").value = ""; $("pfOut").innerHTML = "";
  $("proofBox").classList.toggle("hidden", !t);
}

function makeChallenge() {
  if (!proofTarget) return;
  const nonce = ethers.hexlify(ethers.randomBytes(16));
  const exp = new Date(Date.now() + 10 * 60 * 1000);
  const recruiter = $("pfRecruiter").value.replace(/\s+/g, " ").trim().slice(0, 80) || "(không ghi)";
  const text = [
    PROOF_HEADER,
    "Nhà tuyển dụng: " + recruiter,
    "Chứng chỉ (" + proofTarget.kind + "): " + proofTarget.ref,
    "Đơn vị cấp: " + proofTarget.issuerName + " (" + proofTarget.issuer + ")",
    "Ví cần ký: " + proofTarget.holder,
    "Hợp đồng: " + CONTRACT_ADDRESS + " · chainId " + EXPECTED_CHAIN_ID,
    "Nonce: " + nonce,
    "Hết hạn: " + exp.toISOString(),
  ].join("\n");
  challenge = { text, exp: exp.getTime(), holder: proofTarget.holder };
  $("pfMessage").value = text;
  $("pfOut").innerHTML = "";
}

function checkSignature() {
  if (!challenge) { banner("pfOut", "Hãy tạo thông điệp trước.", true); return; }
  const sig = $("pfSig").value.trim();
  if (Date.now() > challenge.exp) { banner("pfOut", "Thông điệp đã <b>hết hạn</b>. Tạo thông điệp mới.", true); return; }
  let who;
  try { who = ethers.verifyMessage(challenge.text, sig); }
  catch { banner("pfOut", "Chữ ký không đúng định dạng.", true); return; }
  const ok = who.toLowerCase() === challenge.holder.toLowerCase();
  banner("pfOut", ok
    ? "<b>Đúng chủ chứng chỉ.</b> Chữ ký do ví <span class='mono'>" + esc(short(who, 8, 6)) + "</span> tạo — trùng ví ghi trên chứng chỉ."
    : "<b>KHÔNG phải chủ chứng chỉ.</b> Chữ ký do ví <span class='mono'>" + esc(short(who, 8, 6)) +
      "</span> tạo, khác ví ghi trên chứng chỉ (<span class='mono'>" + esc(short(challenge.holder, 8, 6)) + "</span>).", !ok);
  logEntry({ op: "Kiểm tra chủ chứng chỉ", ok, detail: "chữ ký ví, 0 gas" });
}

async function signChallenge() {
  const text = $("sgMessage").value.replace(/\r\n/g, "\n").trim();
  if (!text.startsWith(PROOF_HEADER + "\n")) {
    banner("sgOut", "Thông điệp không bắt đầu bằng \"" + esc(PROOF_HEADER) + "\". Không ký.", true); return;
  }
  if (!text.includes("Hợp đồng: " + CONTRACT_ADDRESS + " ")) {
    banner("sgOut", "Thông điệp nhắc tới một hợp đồng khác với sổ đăng ký chính thức. Không ký.", true); return;
  }
  if (!signer) { banner("sgOut", "Hãy bấm <b>Kết nối ví</b> bằng đúng ví ghi trên chứng chỉ.", true); return; }
  try {
    const sig = await signer.signMessage(text);
    $("sgOut").innerHTML = '<div class="banner" style="margin:12px 0 0">Gửi chuỗi dưới cho nhà tuyển dụng:' +
      "<div class='mono' style='font-size:11.5px;word-break:break-all;margin-top:6px'>" + esc(sig) + "</div></div>";
    logEntry({ op: "Ký xác nhận chủ chứng chỉ", detail: "personal_sign, 0 gas" });
  } catch (err) { bannerText("sgOut", "Không ký được: " + reasonOf(err), true); }
}

/* ---------- chứng chỉ của tôi ---------- */
async function renderMine(writeLog) {
  const typed = ($("mineAddr").value || "").trim();
  const who = typed || account;
  const c = reader();
  if (!c) { $("mineOut").innerHTML = '<p class="empty">Không kết nối được tới mạng blockchain.</p>'; return; }
  if (!who || !ethers.isAddress(who)) {
    $("mineOut").innerHTML = '<p class="empty">Nhập địa chỉ ví học viên, hoặc kết nối ví.</p>'; return;
  }
  $("mineOut").innerHTML = '<p class="empty">Đang đọc dữ liệu từ chuỗi…</p>';
  try {
    await loadDirectory(false);
    // CertificateIssued(certId, indexed certHash, indexed issuer, indexed holder, issuedAt)
    const filter = c.filters.CertificateIssued(null, null, null, who);
    const logs = (await queryLogsChunked(c, filter))
      .filter((l) => (l.args.holder || "").toLowerCase() === who.toLowerCase());
    if (!logs.length) {
      $("mineOut").innerHTML = '<p class="empty">Ví này chưa được cấp chứng chỉ nào.</p>'; return;
    }
    const store = readJSON(KEY_STORE, {});
    let rows = "";
    for (const lg of logs) {
      const certId = lg.args.certId;
      const issuedAt = Number(lg.args.issuedAt);
      const meta = store[certId] || null;
      let s = 0, nm = "";
      let flag = "";
      try {
        const v = await c.verifyCertificate(lg.args.issuer, lg.args.certHash);
        s = Number(v.status); nm = v.issuerDisplayName;
        if (v.issuedAfterCompromise) flag = "<br><span style='color:var(--seal);font-size:12px'>cấp sau khi khóa đơn vị bị lộ</span>";
        else if (v.revocationVoided) flag = "<br><span style='font-size:12px'>lần thu hồi do khóa lộ đã bị vô hiệu</span>";
      } catch { }
      rows += "<tr><td>" + (meta && meta.file ? "<b>" + esc(meta.file) + "</b><br>" : "") +
        "<span class='mono' style='font-size:11.5px;color:var(--ink-soft)'>" + esc(short(certId, 10, 8)) + "</span></td>" +
        "<td>" + esc(nm || "(không tên)") + "<br><span class='mono' style='font-size:11.5px;color:var(--ink-soft)'>" +
        esc(short(lg.args.issuer, 8, 6)) + "</span></td>" +
        "<td>" + (issuedAt ? new Date(issuedAt * 1000).toLocaleDateString("vi-VN") : "—") + "</td>" +
        "<td><span class='status-tag " + STATUS_CLASS[s] + "'>" + STATUS_LABEL[s] + "</span>" + flag + "</td></tr>";
    }
    $("mineOut").innerHTML =
      "<table><thead><tr><th>Chứng chỉ</th><th>Đơn vị cấp</th><th>Ngày cấp</th><th>Trạng thái</th></tr></thead><tbody>" +
      rows + "</tbody></table>";
    if (writeLog) logEntry({ op: "Xem chứng chỉ của tôi",
      detail: logs.length + " chứng chỉ của " + short(who, 8, 6) + " (chỉ đọc)" });
  } catch (err) {
    bannerText("mineOut", "Không đọc được dữ liệu từ chuỗi: " + reasonOf(err), true);
  }
}

/* ---------- danh sách & thu hồi ---------- */
async function renderList() {
  renderBatchList();
  const store = readJSON(KEY_STORE, {});
  const keys = Object.keys(store);
  if (!keys.length) {
    $("listOut").innerHTML = '<p class="empty">Chưa có chứng chỉ nào được cấp từ trình duyệt này.</p>'; return;
  }
  const c = reader();
  let rows = "";
  for (const id of keys) {
    const rec = store[id];
    let status = "—", tag = "t-none";
    if (c) {
      try {
        // Bản ghi không lưu hash -> effectiveStatus (trạng thái HIỆU LỰC).
        const v = rec.issuer && rec.hash ? await c.verifyCertificate(rec.issuer, rec.hash) : { status: await c.effectiveStatus(id) };
        const s = Number(v.status);
        status = STATUS_LABEL[s] + (v.issuedAfterCompromise ? " · cấp sau mốc lộ khóa" : "") +
          (v.revocationVoided ? " · thu hồi do khóa lộ đã vô hiệu" : "");
        tag = STATUS_CLASS[s];
      } catch { }
    }
    rows += "<tr><td><b>" + esc(rec.file || "(không rõ tệp)") + "</b><br>" +
      "<span class='mono' style='font-size:11.5px;color:var(--ink-soft)'>" + esc(short(id, 10, 8)) + "</span></td>" +
      "<td>" + esc(rec.name || "—") + "<br><span style='font-size:12px;color:var(--ink-soft)'>" +
      esc(rec.course || "—") + "</span></td>" +
      "<td><span class='status-tag " + tag + "'>" + esc(status) + "</span></td>" +
      "<td><button class='small ghost' data-revoke='" + esc(id) + "'>Thu hồi</button></td></tr>";
  }
  $("listOut").innerHTML =
    "<table><thead><tr><th>Tệp chứng chỉ</th><th>Học viên (off-chain)</th><th>Trạng thái</th><th></th></tr></thead><tbody>" +
    rows + "</tbody></table>";
  document.querySelectorAll("[data-revoke]").forEach((b) => {
    b.addEventListener("click", () => doRevoke(b.getAttribute("data-revoke")));
  });
}

async function doRevoke(certId) {
  if (!contract) { alert("Hãy kết nối ví trước — thu hồi là thao tác ghi."); return; }
  if (!confirm("Thu hồi chứng chỉ này?\n\nThu hồi là VĨNH VIỄN. Cùng tệp đó sẽ không cấp lại được.\n" +
    "(Ngoại lệ duy nhất: nếu khóa của bạn sau này bị tuyên bố LỘ từ trước thời điểm này, lần thu hồi sẽ bị vô hiệu.)")) return;
  try {
    const tx = await contract.revokeCertificate(certId);
    const rc = await tx.wait();
    logEntry({ op: "Thu hồi chứng chỉ", txHash: rc.hash, block: rc.blockNumber,
      gas: rc.gasUsed.toString(), certId });
    renderList();
  } catch (err) {
    const r = reasonOf(err);
    logEntry({ op: "Thu hồi chứng chỉ", ok: false, certId, reason: r });
    alert("Thu hồi bị chặn: " + r);
  }
}

/* ---------- danh bạ đơn vị phát hành ---------- */
async function renderDirectory() {
  const c = reader();
  if (!c) { $("dirOut").innerHTML = '<p class="empty">Không kết nối được tới mạng blockchain.</p>'; return; }
  try {
    await loadDirectory(true);
    await fillIssuerSelect();

    // Cảnh báo tên trùng nhau SAU CHUẨN HÓA — thứ contract không bắt được.
    const cols = normalizedCollisions();
    $("dupWarn").innerHTML = cols.length
      ? '<div class="banner err" style="margin:0 0 16px"><b>Cảnh báo: có ' + cols.length +
        " nhóm tên gần giống nhau.</b> Contract chỉ chặn trùng tên y hệt theo byte. " +
        "Những cặp dưới đây khác nhau về byte nhưng trông giống nhau trên màn hình — " +
        "hãy đối chiếu <b>địa chỉ ví</b>, đừng chỉ đọc tên." +
        cols.map((g) => "<div class='mono' style='font-size:12px;margin-top:6px'>" +
          g.map((x) => esc(x.name) + "  " + esc(short(x.addr, 8, 6))).join("<br>") + "</div>").join("") +
        "</div>"
      : "";

    await ensureRecognizedAt(DIR.addrs);
    if (!DIR.addrs.length) {
      $("dirOut").innerHTML = '<p class="empty">Chưa có đơn vị nào đang hoạt động.</p>';
    } else {
      let rows = "";
      DIR.addrs.forEach((a, i) => {
        const rec = DIR.recognizedAt[a.toLowerCase()];
        const gen = generationOf(a);
        rows += "<tr><td><b>" + esc(DIR.names[i]) + "</b></td>" +
          "<td class='mono' style='font-size:11.5px'>" + esc(a) + "</td>" +
          "<td>" + (rec ? new Date(rec * 1000).toLocaleDateString("vi-VN") : "—") + "</td>" +
          "<td>" + (gen > 0 ? "đời thứ " + gen : "khóa gốc") + "</td></tr>";
      });
      $("dirOut").innerHTML =
        "<table><thead><tr><th>Tên đơn vị</th><th>Ví</th><th>Được công nhận</th><th>Chuỗi khóa</th></tr></thead><tbody>" +
        rows + "</tbody></table>" +
        "<p class='note'>Con số <b>" + DIR.addrs.length + " đơn vị</b> phải khớp với số đơn vị " +
        "CredVerify <b>chủ động</b> công nhận. Nhiều hơn nghĩa là có đơn vị được thêm mà không ai biết.</p>";
    }
    if (DIR.inactive.length) {
      $("dirOut").insertAdjacentHTML("beforeend",
        "<h4 style='margin:18px 0 6px;font-size:14px'>Đã ngừng hoạt động / khóa cũ đã xoay (" + DIR.inactive.length + ")</h4>" +
        "<table><thead><tr><th>Tên đơn vị</th><th>Ví</th><th>Tình trạng</th></tr></thead><tbody>" +
        DIR.inactive.map((k) => "<tr><td>" + esc(k.name) + "</td><td class='mono' style='font-size:11.5px'>" +
          esc(k.address) + "</td><td>" + (k.successor ? "đã xoay sang " + esc(short(k.successor, 8, 6)) : "đã ngừng") +
          "</td></tr>").join("") + "</tbody></table>" +
        "<p class='note'>Chứng chỉ do các khóa này cấp <b>vẫn xác minh được</b>.</p>");
    }
    await renderPending();
    if (DIR.countMismatch) $("dirOut").insertAdjacentHTML("beforeend", countMismatchNote());
    if (DIR.logsError) $("dirOut").insertAdjacentHTML("beforeend", logsErrorNote());
    await renderAudit();
  } catch (err) {
    bannerText("dirOut", "Không đọc được danh bạ: " + reasonOf(err), true);
  }
}

/* Đề xuất chuyển giao ĐANG CHỜ, hiện thành băng đỏ: thời gian chờ chỉ có ích nếu trung tâm thật
   NHÌN THẤY đề xuất. */
async function loadPending() {
  const c = reader();
  if (!c) return [];
  const olds = new Set();
  for (const l of await scanEvents(c, ["InheritProposed"])) olds.add(l.args.oldIssuer);
  const out = [];
  for (const o of olds) {
    const p = await c.inheritProposals(o);
    if (Number(p.eta) !== 0) out.push({ old: o, newIssuer: p.newIssuer, eta: Number(p.eta),
      since: Number(p.compromisedSince), name: await c.issuerName(o) });
  }
  return out;
}

async function renderPending() {
  let list = [];
  try { list = await loadPending(); } catch { }
  const html = list.length
    ? '<div class="banner err" style="margin:0 0 16px"><b>' + list.length + " đề xuất chuyển giao danh tính đang chờ.</b> " +
      "Nếu bạn là đơn vị dưới đây và <b>không</b> yêu cầu việc này, hãy liên hệ CredVerify ngay để hủy trước thời điểm thực thi." +
      list.map((x) => "<div class='mono' style='font-size:12px;margin-top:6px'>" + esc(x.name) + ": " +
        esc(short(x.old, 8, 6)) + " → " + esc(short(x.newIssuer, 8, 6)) + " · thực thi từ " +
        esc(new Date(x.eta * 1000).toLocaleString("vi-VN")) +
        (x.since ? " · khai báo khóa lộ từ " + esc(new Date(x.since * 1000).toLocaleString("vi-VN")) : "") + "</div>").join("") +
      "</div>"
    : "";
  $("pendingWarn").innerHTML = html;
  $("pendingAdmin").innerHTML = html.replace('margin:0 0 16px', 'margin:14px 0 0');
}

/* THỐNG KÊ KIỂM TOÁN THEO ĐƠN VỊ, dựng từ event, gom theo DANH TÍNH (khóa gốc). Quy tắc vô hiệu
   thu hồi giống _voided() của contract. leafCount là số đơn vị TỰ KHAI. */
const STATS_EVENTS = ["CertificateIssued", "CertificateRevoked", "BatchPublished", "BatchRevoked", "LeafRevoked", "KeyCompromised"];
function issuerStats(logs, predecessor) {
  const lc = (a) => String(a).toLowerCase();
  const rootOf = (a) => { let k = lc(a), n = 0; while (predecessor[k] && n < 64) { k = predecessor[k]; n++; } return k; };
  const comp = {};
  for (const l of logs) if (l.name === "KeyCompromised") comp[lc(l.args.key)] = Number(l.args.since);
  const afterMark = (key, at) => { const c = comp[lc(key)]; return !!c && at >= c; };
  const S = {};
  const row = (key) => {
    const id = rootOf(key);
    return S[id] || (S[id] = { identity: id, single: 0, batches: 0, declaredLeaves: 0, afterCompromise: 0,
      revSingle: 0, revLeaf: 0, revBatch: 0, voided: 0 });
  };
  for (const l of logs) {
    const a = l.args;
    if (l.name === "CertificateIssued" || l.name === "BatchPublished") {
      const r = row(a.issuer);
      if (l.name === "CertificateIssued") r.single++;
      else { r.batches++; r.declaredLeaves += Number(a.leafCount); }
      if (afterMark(a.issuer, Number(a.issuedAt))) r.afterCompromise++;
    } else if (l.name === "CertificateRevoked" || l.name === "LeafRevoked" || l.name === "BatchRevoked") {
      const r = row(a.by);
      r[l.name === "CertificateRevoked" ? "revSingle" : l.name === "LeafRevoked" ? "revLeaf" : "revBatch"]++;
      if (afterMark(a.by, Number(a.revokedAt))) r.voided++;
    }
  }
  return Object.values(S);
}

function renderStats(logs) {
  const all = issuerStats(logs, DIR.predecessor);
  // Đơn vị đã được công nhận mà CHƯA làm gì vẫn có dòng (toàn số 0) — "chưa cấp" cũng là thông tin kiểm toán.
  const seen = new Set(all.map((r) => r.identity));
  for (const k of Object.keys(DIR.keys)) {
    let id = k, n = 0;
    while (DIR.predecessor[id] && n < 64) { id = DIR.predecessor[id]; n++; }
    if (!seen.has(id)) { seen.add(id); all.push({ identity: id, single: 0, batches: 0, declaredLeaves: 0,
      afterCompromise: 0, revSingle: 0, revLeaf: 0, revBatch: 0, voided: 0 }); }
  }
  const rows = all
    .map((r) => ({ ...r, name: DIR.keys[r.identity]?.name || r.identity }))
    .sort((x, y) => x.name.localeCompare(y.name, "vi"));
  if (!rows.length) { $("statsOut").innerHTML = '<p class="empty">Chưa có đơn vị nào được công nhận.</p>'; return; }
  const n = (v, bad) => "<td class='num'>" + (v && bad ? "<b class='t-revoked'>" + v + "</b>" : v) + "</td>";
  $("statsOut").innerHTML =
    "<div class='scroll-x'><table><thead><tr><th>Đơn vị</th><th class='num'>Cấp lẻ</th><th class='num'>Lô</th>" +
    "<th class='num'>Σ chứng chỉ trong lô (tự khai)</th><th class='num'>Cấp sau mốc lộ</th><th class='num'>Thu hồi lẻ</th>" +
    "<th class='num'>Thu hồi trong lô</th><th class='num'>Thu hồi cả lô</th><th class='num'>Thu hồi bị vô hiệu</th></tr></thead><tbody>" +
    rows.map((r) => "<tr><td><b>" + esc(r.name) + "</b></td>" + n(r.single) + n(r.batches) + n(r.declaredLeaves) +
      n(r.afterCompromise, true) + n(r.revSingle) + n(r.revLeaf) + n(r.revBatch) + n(r.voided, true) + "</tr>").join("") +
    "</tbody></table></div>" +
    "<p class='note'>Gom theo <b>danh tính</b> (cả chuỗi khóa đã xoay). Số lần cấp lẻ, số lô và số lần thu hồi là " +
    "<b>chính xác</b> — mỗi con số là một event trên chuỗi. Cột <b>Σ chứng chỉ trong lô</b> là số đơn vị <b>tự khai</b> " +
    "khi đăng lô; contract không đếm được số lá thật của cây Merkle. <b>Cấp sau mốc lộ</b>: lần cấp bằng khóa đã bị " +
    "tuyên bố lộ, xảy ra từ mốc lộ trở đi (chứng chỉ vẫn hợp lệ nhưng được gắn cờ). <b>Thu hồi bị vô hiệu</b>: lần thu " +
    "hồi do khóa lộ thực hiện từ mốc lộ — không có hiệu lực, giống quy tắc của contract.</p>";
}

/* Nhật ký quản trị */
async function renderAudit() {
  const c = reader();
  if (!c) return;
  try {
    const evs = [];
    // Một lần quét cho mọi loại event dưới đây. Đăng/thu hồi LÔ cũng hiện ở đây — một khóa bị
    // lộ đăng hàng loạt lô là thứ người theo dõi cần thấy ngay.
    const FMT = {
      IssuerAdded: ["Công nhận", (l) => l.args.name + " → " + l.args.issuerAddress],
      IssuerRemoved: ["Gỡ quyền", (l) => String(l.args.issuerAddress)],
      IssuerRestored: ["Bật lại", (l) => String(l.args.issuerAddress)],
      IssuerInherited: ["Chuyển giao", (l) => l.args.name + ": " + short(l.args.oldIssuer, 8, 6) + " → " + short(l.args.newIssuer, 8, 6)],
      InheritProposed: ["Đề xuất chuyển giao", (l) => short(l.args.oldIssuer, 8, 6) + " → " + short(l.args.newIssuer, 8, 6) +
        " · thực thi từ " + new Date(Number(l.args.eta) * 1000).toLocaleString("vi-VN") +
        (Number(l.args.compromisedSince) ? " · KHÓA LỘ từ " + new Date(Number(l.args.compromisedSince) * 1000).toLocaleString("vi-VN") : "")],
      InheritCancelled: ["Hủy đề xuất chuyển giao", (l) => short(l.args.oldIssuer, 8, 6) + " → " + short(l.args.newIssuer, 8, 6)],
      KeyCompromised: ["Tuyên bố khóa lộ", (l) => short(l.args.key, 8, 6) + " từ " + new Date(Number(l.args.since) * 1000).toLocaleString("vi-VN")],
      OwnershipTransferred: ["Đổi owner", (l) => short(l.args.from, 8, 6) + " → " + short(l.args.to, 8, 6)],
      BatchPublished: ["Đăng lô", (l) => short(l.args.issuer, 8, 6) + " · " + l.args.leafCount + " chứng chỉ · root " + short(l.args.root, 8, 6)],
      BatchRevoked: ["Thu hồi lô", (l) => short(l.args.batchId, 8, 6) + " bởi " + short(l.args.by, 8, 6)],
    };
    // Cùng một lượt quét lấy luôn event cho bảng thống kê.
    const logs = await scanEvents(c, [...new Set([...Object.keys(FMT), ...STATS_EVENTS])]);
    try { renderStats(logs); } catch { $("statsOut").innerHTML = '<p class="empty">Không dựng được thống kê.</p>'; }
    for (const l of logs) {
      if (!FMT[l.name]) continue;
      const [kind, fmt] = FMT[l.name];
      evs.push({ b: l.blockNumber, tx: l.transactionHash, kind, text: fmt(l) });
    }

    if (!evs.length) { $("auditOut").innerHTML = '<p class="empty">Chưa có thao tác quản trị nào.</p>'; return; }
    evs.sort((x, y) => y.b - x.b);
    $("auditOut").innerHTML =
      "<table><thead><tr><th>Block</th><th>Thao tác</th><th>Chi tiết</th><th>Tx</th></tr></thead><tbody>" +
      evs.map((e) => "<tr><td>" + e.b + "</td><td>" + esc(e.kind) + "</td>" +
        "<td class='mono' style='font-size:11.5px'>" + esc(e.text) + "</td>" +
        "<td class='mono' style='font-size:11.5px'>" + esc(short(e.tx, 10, 8)) + "</td></tr>").join("") +
      "</tbody></table>";
  } catch {
    $("auditOut").innerHTML = '<p class="empty">Không đọc được nhật ký quản trị.</p>';
    $("statsOut").innerHTML = '<p class="empty">Không đọc được event để thống kê.</p>';
  }
}

/* ---------- quản trị ---------- */
async function govTx(label, fn, detail) {
  if (!contract) { banner("adminOut", "Hãy kết nối ví trước — đây là thao tác ghi.", true); return; }
  try {
    const tx = await fn();
    const rc = await tx.wait();
    logEntry({ op: label, txHash: rc.hash, block: rc.blockNumber, gas: rc.gasUsed.toString(), detail: detail || "" });
    banner("adminOut", esc(label) + " thành công.");
    await refreshAll(true);
  } catch (err) {
    const r = reasonOf(err);
    logEntry({ op: label, ok: false, reason: r, detail: detail || "" });
    bannerText("adminOut", "Bị chặn: " + r, true);
  }
}

async function renderGovernance() {
  const c = reader();
  if (!c) { $("govBox").textContent = "Không kết nối được tới mạng blockchain."; return; }
  try {
    const g = await c.governance();
    const me = account ? account.toLowerCase() : null;
    const isOwner = me && g.owner_.toLowerCase() === me;
    $("govBox").className = "banner";
    $("govBox").innerHTML =
      "<span class='mono' style='font-size:12px'>" +
      "owner  " + esc(g.owner_) +
      (g.pendingOwner_ !== ethers.ZeroAddress ? "  (chờ nhận: " + esc(g.pendingOwner_) + ")" : "") +
      "</span><br>" +
      "<b>" + g.activeIssuerCount_ + "</b> đơn vị đang hoạt động · <b>" +
      (DIR.addrs.length + DIR.inactive.length) + "</b> địa chỉ từng được công nhận (dựng từ event)" +
      (isOwner ? "<br>Ví đang kết nối là <b>owner</b>." :
        (me ? "<br>Ví đang kết nối <b>không phải</b> owner — các nút dưới sẽ bị contract từ chối." : ""));
  } catch (err) {
    bannerText("govBox", "Không đọc được trạng thái quản trị: " + reasonOf(err), true);
  }
}

async function adminAction(kind) {
  const addr = $("adAddr").value.trim();
  // Chuẩn hóa tên TRƯỚC khi gửi, đúng quy tắc người xác minh dùng khi gõ tên để tra.
  const name = canonicalName($("adName").value);
  if (!ethers.isAddress(addr)) { banner("adminOut", "Địa chỉ ví không hợp lệ.", true); return; }

  if (kind === "check") {
    const c = reader();
    if (!c) { banner("adminOut", "Không kết nối được tới mạng blockchain.", true); return; }
    try {
      const [st, nm, inh] = await Promise.all([
        c.issuerStatus(addr), c.issuerName(addr), c.inheritedBy(addr)]);
      banner("adminOut",
        "Trạng thái: <b>" + esc(ISSUER_LABEL[Number(st)]) + "</b>" +
        (nm ? "<br>Tên: <b>" + esc(nm) + "</b>" : "") +
        (inh !== ethers.ZeroAddress ? "<br>Đã chuyển giao cho: <span class='mono'>" + esc(inh) + "</span>" : ""));
      logEntry({ op: "Kiểm tra đơn vị", detail: short(addr, 8, 6) + " → " + ISSUER_LABEL[Number(st)] });
    } catch (err) { bannerText("adminOut", reasonOf(err), true); }
    return;
  }

  if (kind === "add") {
    if (!name) { banner("adminOut", "Chưa nhập tên hiển thị.", true); return; }
    const problem = nameProblem(name);
    if (problem) { bannerText("adminOut", "Tên không hợp lệ: " + problem, true); return; }
    // Cảnh báo TRƯỚC KHI gửi giao dịch 
    try {
      await loadDirectory(true);
      const n = normName(name);
      const pairs = identityHolders().map((x) => ({ a: x.addr, nm: x.name }));
      const near = pairs.filter((x) => x.nm !== name && normName(x.nm) === n);
      if (near.length && !confirm(
        "Tên bạn sắp đăng ký TRÔNG GIỐNG một đơn vị đã có, nhưng khác nhau về byte:\n\n" +
        near.map((x) => "  đã có:      " + JSON.stringify(x.nm) +
                        "\n  bạn đang gõ: " + JSON.stringify(name) +
                        "\n  (" + x.a + ")").join("\n\n") +
        "\n\nContract SẼ CHO PHÉP, vì nó chỉ chặn được trùng tên y hệt từng byte. " +
        "Nhưng người xác minh nhìn trên màn hình sẽ không phân biệt được hai đơn vị này.\n\n" +
        "Vẫn tiếp tục?")) return;
    } catch { }
    await govTx("Công nhận đơn vị", () => contract.addIssuer(addr, name), name + " · " + short(addr, 8, 6));
    return;
  }
  if (kind === "remove")  return govTx("Gỡ quyền đơn vị", () => contract.removeIssuer(addr), short(addr, 8, 6));
  if (kind === "restore") return govTx("Bật lại đơn vị",  () => contract.restoreIssuer(addr), short(addr, 8, 6));
}

/* ---------- làm mới toàn bộ ---------- */
/* Độ trễ chuyển giao đọc TỪ HỢP ĐỒNG — trang không ghi cứng con số nào. */
let INHERIT_DELAY_SEC = null;
const humanDuration = (sec) => sec % 3600 === 0 ? sec / 3600 + " giờ" : sec % 60 === 0 ? sec / 60 + " phút" : sec + " giây";
async function loadInheritDelay() {
  if (INHERIT_DELAY_SEC === null) {
    try { INHERIT_DELAY_SEC = Number(await reader().INHERIT_DELAY()); } catch { return; }
  }
  document.querySelectorAll(".delayText").forEach((e) => { e.textContent = humanDuration(INHERIT_DELAY_SEC); });
}

async function refreshAll(force) {
  loadInheritDelay();
  try { await loadDirectory(!!force); await fillIssuerSelect(); } catch { }
  renderGovernance();
  renderList();
  renderPending();
}

/* ---------- khởi động ---------- */
const TABS = ["verify", "issue", "mine", "manage", "directory", "admin"];
document.querySelectorAll("nav button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    TABS.forEach((t) => $("tab-" + t).classList.toggle("hidden", t !== b.dataset.tab));
    if (b.dataset.tab === "manage")    renderList();
    if (b.dataset.tab === "mine")      renderMine(true);
    if (b.dataset.tab === "directory") renderDirectory();
    if (b.dataset.tab === "admin")     renderGovernance();
    if (b.dataset.tab === "verify")    refreshAll(false);
  });
});

$("btnConnect").addEventListener("click", connect);

$("btnIssue").addEventListener("click", doIssue);
$("btnVerify").addEventListener("click", doVerify);
$("btnRefresh").addEventListener("click", renderList);
$("btnRefreshMine").addEventListener("click", () => renderMine(true));
$("btnRefreshDir").addEventListener("click", renderDirectory);
$("btnExport").addEventListener("click", exportEvidence);
$("btnClearLedger").addEventListener("click", () => {
  if (confirm("Xóa toàn bộ nhật ký bằng chứng?")) { writeJSON(KEY_LEDGER, []); renderLedger(); }
});
$("btnWipeStore").addEventListener("click", () => {
  if (!confirm("Xóa toàn bộ họ tên học viên, tên khóa học và BẢN SAO BIÊN NHẬN LÔ khỏi trình duyệt này?\n\n" +
    "Bản ghi trên chuỗi không bị ảnh hưởng — nó không thể sửa. Nhưng học viên nào làm mất biên nhận " +
    "sẽ không xác minh được chứng chỉ theo lô nữa — hãy xuất/gửi biên nhận trước.")) return;
  localStorage.removeItem(KEY_STORE);
  localStorage.removeItem(KEY_RECEIPTS);
  renderList();
  logEntry({ op: "Xóa dữ liệu off-chain", detail: "localStorage đã được dọn" });
});

$("btnAddIssuer").addEventListener("click", () => adminAction("add"));
$("btnRemoveIssuer").addEventListener("click", () => adminAction("remove"));
$("btnRestoreIssuer").addEventListener("click", () => adminAction("restore"));
$("btnCheckIssuer").addEventListener("click", () => adminAction("check"));

$("btnProposeInherit").addEventListener("click", () => {
  const o = $("inhOld").value.trim(), n = $("inhNew").value.trim();
  if (!ethers.isAddress(o) || !ethers.isAddress(n)) { banner("adminOut", "Địa chỉ không hợp lệ.", true); return; }
  let since = 0;
  if ($("inhCompromised").checked) {
    const t = $("inhSince").value;
    if (!t) { banner("adminOut", "Đã đánh dấu khóa bị lộ — hãy chọn thời điểm sớm nhất khóa có thể đã bị lộ.", true); return; }
    since = Math.floor(new Date(t).getTime() / 1000);
    if (!(since > 0)) { banner("adminOut", "Thời điểm không hợp lệ.", true); return; }
  }
  govTx("Đề xuất chuyển giao danh tính", () => contract.proposeInherit(o, n, since),
    short(o, 8, 6) + " → " + short(n, 8, 6) + (since ? " · khóa lộ từ " + new Date(since * 1000).toISOString() : ""));
});
$("btnExecuteInherit").addEventListener("click", () => {
  const o = $("inhOld").value.trim();
  if (!ethers.isAddress(o)) { banner("adminOut", "Nhập địa chỉ khóa cũ.", true); return; }
  govTx("Thực thi chuyển giao danh tính", () => contract.executeInherit(o), short(o, 8, 6));
});
$("btnCancelInherit").addEventListener("click", () => {
  const o = $("inhOld").value.trim();
  if (!ethers.isAddress(o)) { banner("adminOut", "Nhập địa chỉ khóa cũ.", true); return; }
  govTx("Hủy đề xuất chuyển giao", () => contract.cancelInherit(o), short(o, 8, 6));
});
$("btnCancelOwner").addEventListener("click", () =>
  govTx("Hủy đề cử owner", () => contract.cancelOwnershipTransfer()));
$("btnMakeChallenge").addEventListener("click", makeChallenge);
$("btnCheckSig").addEventListener("click", checkSignature);
$("btnSign").addEventListener("click", signChallenge);
$("btnTransferOwner").addEventListener("click", () => {
  const a = $("govNewAddr").value.trim();
  if (!ethers.isAddress(a)) { banner("adminOut", "Địa chỉ không hợp lệ.", true); return; }
  govTx("Chuyển quyền owner", () => contract.transferOwnership(a), short(a, 8, 6));
});
$("btnAcceptOwner").addEventListener("click", () =>
  govTx("Nhận quyền owner", () => contract.acceptOwnership()));

wireFileInput("isFile", "isHashOut", issueFile);
wireFileInput("vfFile", "vfHashOut", verifyFile);
renderAnchor();
renderLedger();
initReadOnly();
wireWalletEvents();   // gắn TRƯỚC khi kết nối: đổi mạng lúc nào cũng bắt được
refreshAll(true);
