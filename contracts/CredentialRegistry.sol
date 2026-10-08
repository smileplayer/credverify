// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title  CredentialRegistry V3 — sổ đăng ký chứng chỉ dùng chung
/// @notice Thành phần on-chain của CredVerify. MỘT contract cho TẤT CẢ đơn vị phát hành.

///  owner (CredVerify)  công nhận ai là issuer, đặt tên, chuyển giao issuer (qua độ trễ
///                      INHERIT_DELAY). KHÔNG cấp. KHÔNG thu hồi. KHÔNG sửa/xóa
///                      bản ghi đã có. Một địa chỉ từng là issuer không bao giờ trở thành
///                      owner, kể cả qua chuyển quyền.
///
///  issuer (trung tâm)  cấp và thu hồi chứng chỉ CỦA CHÍNH MÌNH — cấp lẻ từng tệp,
///                      hoặc cấp theo lô bằng một Merkle root.
///                      Không tự công nhận mình. Không đụng được vào chứng chỉ
///                      của trung tâm khác — xem `certIdOf` và `batchIdOf`.
///
///  verifier (bất kỳ)   đọc và xác minh, KHÔNG cần xin phép ai, không cần ví,
///                      không cần trang web của CredVerify còn sống.
///
///  BẤT BIẾN THU HỒI:
///      Thu hồi do một khóa HỢP LỆ là vĩnh viễn. Thu hồi do một khóa đã được tuyên bố LỘ,
///      thực hiện từ mốc lộ trở đi, bị VÔ HIỆU — tự động, trong hàm xác minh, không cần
///      giao dịch nào. Lịch sử không bị xóa: bản ghi và event thu hồi gốc vẫn nằm nguyên,
///      việc tuyên bố lộ là một event công khai (`KeyCompromised`).

contract CredentialRegistry {
    // ---------- Lỗi ----------

    error NotOwner();
    error NotPendingOwner();
    error NotActiveIssuer();
    error ZeroAddress();
    error OwnerCannotBeIssuer();
    error PendingOwnerCannotBeIssuer();
    error IssuerCannotBeOwner();
    error AddressAlreadyUsed();
    error EmptyName();
    error NameTooLong();
    error NameNotCanonical();
    error NameTaken();
    error IssuerNotActive();
    error IssuerNotDisabled();
    error IssuerWasInherited();
    error CannotBeInherited();
    error RecoveryWindowClosed();
    error InvalidCompromiseTime();
    error ProposalExists();
    error NoProposal();
    error TimelockNotElapsed();
    error ProposalExpired();
    error HolderZero();
    error EmptyCertHash();
    error CertificateExists();
    error NotRevocable();
    error NotIssuingKeyOrSuccessor();
    error EmptyRoot();
    error EmptyBatch();
    error BatchExists();
    error BatchNotFound();
    error RootMismatch();
    error BatchAlreadyRevoked();
    error LeafAlreadyRevoked();
    error LeafNotInBatch();
    error InvalidInheritDelay();

    // ---------- Kiểu dữ liệu ----------

    enum Status {
        None,     // 0 — chưa từng tồn tại
        Issued,   // 1 — đã cấp, còn hợp lệ
        Revoked   // 2 — đã thu hồi (xem BẤT BIẾN THU HỒI ở đầu tệp)
    }

    enum IssuerStatus {
        None,     // 0 — chưa từng được công nhận
        Active,   // 1 — đang được phép cấp
        Disabled  // 2 — đã bị gỡ quyền hoặc đã chuyển giao cho khóa kế nhiệm
    }

    struct Certificate {
        address issuer;     // khóa đã cấp
        Status status;      // trạng thái LƯU TRỮ (trạng thái hiệu lực: xem verifyCertificate)
        uint64 issuedAt;    // thời điểm cấp
        address holder;     // ví học viên
        uint64 revokedAt;   // thời điểm thu hồi (0 nếu chưa)
    }

    /// Một lô chứng chỉ, đại diện bằng Merkle root. Chỉ root lên chuỗi.
    /// Xếp trường để vừa 2 slot: [issuer|issuedAt] [revokedAt|leafCount|revokedBy].
    struct Batch {
        address issuer;     // khóa đã đăng lô
        uint64 issuedAt;    // thời điểm đăng
        uint64 revokedAt;   // thu hồi CẢ LÔ (0 nếu chưa)
        uint32 leafCount;   // số lá do issuer TỰ KHAI — contract không kiểm được, chỉ để thống kê
        address revokedBy;  // khóa đã thu hồi cả lô
    }

    /// Một lần thu hồi: khi nào và bởi khóa nào. Vừa 1 slot.
    struct Revocation {
        uint64 at;
        address by;
    }

    /// Đề xuất chuyển giao danh tính, chờ INHERIT_DELAY.
    struct InheritProposal {
        address newIssuer;
        uint64 eta;               // sớm nhất được thực thi
        uint64 compromisedSince;  // 0 = xoay định kỳ; > 0 = khóa cũ bị lộ từ mốc này
    }

    // ---------- Tham số ----------

    /// Giới hạn độ dài tên (byte UTF-8). Tên tiếng Việt dài nhất đã đo ~175 byte.
    uint256 public constant MAX_NAME_BYTES = 256;

    /// Sau khi bị gỡ quyền, một khóa chỉ còn được bật lại hoặc ĐỀ XUẤT chuyển giao trong
    /// khoảng này. Hết hạn, danh tính ĐÓNG BĂNG vĩnh viễn. Lý do: nếu không có hạn, owner
    /// có thể chuyển danh tính của một trung tâm ĐÃ GIẢI THỂ sang ví của mình rồi thu hồi
    /// toàn bộ chứng chỉ của trung tâm đó.
    uint64 public constant RECOVERY_WINDOW = 7 days;

    /// Độ trễ bắt buộc giữa đề xuất và thực thi chuyển giao danh tính. Trong lúc chờ, trung tâm
    /// thật thấy đề xuất công khai và kịp phản đối. `removeIssuer` vẫn tức thì.
    /// Đặt một lần lúc deploy, bất biến; production 48 giờ (mặc định của scripts/deploy.js).
    uint64 public immutable INHERIT_DELAY;

    /// Biên của INHERIT_DELAY. Sàn 1 phút để demo được; trần bằng RECOVERY_WINDOW.
    uint64 public constant MIN_INHERIT_DELAY = 1 minutes;
    uint64 public constant MAX_INHERIT_DELAY = 7 days;

    /// Đề xuất quá hạn này (tính từ eta) mà chưa thực thi thì hết hiệu lực. Chặn việc giữ
    /// một đề xuất "treo" để hồi sinh danh tính đã đóng băng về sau.
    uint64 public constant PROPOSAL_TTL = 7 days;

    /// Mốc lộ khóa không được lùi quá xa: owner chọn mốc này, nên không giới hạn
    /// thì owner có thể vô hiệu một lần thu hồi hợp pháp từ nhiều năm trước.
    uint64 public constant MAX_COMPROMISE_LOOKBACK = 30 days;

    // ---------- Trạng thái lưu trữ ----------

    address public owner;
    address public pendingOwner;

    mapping(address => IssuerStatus) public issuerStatus;
    /// Tên hiển thị lưu theo DANH TÍNH (khóa gốc). Đọc qua `issuerName(key)`.
    /// Tên nằm trong STORAGE (trạng thái), không chỉ trong event (lịch sử): node có thể bỏ
    /// lịch sử cũ (EIP-4444) nhưng luôn giữ trạng thái — tên còn đọc được mãi qua eth_call.
    mapping(address => string) private _identityName;

    /// keccak256(bytes(tên)) -> địa chỉ đang giữ tên đó. Một tên, một chủ.
    mapping(bytes32 => address) public nameHolder;

    /// Khóa cũ -> khóa kế nhiệm. Chỉ ghi một lần cho mỗi khóa cũ.
    mapping(address => address) public inheritedBy;

    /// Khóa mới -> khóa ngay trước nó. Cho phép đi ngược chuỗi kế nhiệm CHỈ bằng trạng
    /// thái: từ `issuerByName(tên)` (khóa mới nhất) lần về mọi khóa cũ đã từng cấp chứng chỉ,
    /// không cần event, không cần website.
    mapping(address => address) public predecessorOf;

    /// Mọi khóa trong cùng một chuỗi kế nhiệm có chung một "danh tính" = khóa GỐC.
    mapping(address => address) public identityOf;

    /// Danh tính -> khóa MỚI NHẤT của nó (có thể đang Disabled nếu đã bị gỡ).
    mapping(address => address) public latestKeyOf;

    /// Thời điểm khóa bị `removeIssuer` gần nhất. Dùng cho cửa sổ khôi phục.
    mapping(address => uint64) public disabledAt;

    /// Khóa -> mốc bị lộ (0 = chưa từng bị tuyên bố lộ).
    /// Đây là thời điểm ƯỚC TÍNH khóa bắt đầu rơi vào tay kẻ gian (owner khai, lùi tối đa
    /// MAX_COMPROMISE_LOOKBACK) — mọi phép so "vô hiệu thu hồi" và "cấp sau mốc lộ" dùng mốc này.
    mapping(address => uint64) public compromisedAt;

    /// Khóa -> thời điểm việc lộ khóa được CÔNG BỐ trên chuỗi (block của executeInherit).
    /// Không dùng để so, chỉ để minh bạch: người xác minh thấy owner đã lùi mốc lộ bao xa.
    mapping(address => uint64) public compromiseDeclaredAt;

    /// Khóa cũ -> đề xuất chuyển giao đang chờ.
    mapping(address => InheritProposal) public inheritProposals;

    uint256 public activeIssuerCount;

    mapping(bytes32 => Certificate) public certificates;

    /// certId -> khóa đã thu hồi.
    mapping(bytes32 => address) public certRevokedBy;

    mapping(bytes32 => Batch) public batches;

    /// batchId -> lá -> lần thu hồi lá đó.
    mapping(bytes32 => mapping(bytes32 => Revocation)) public leafRevocation;

    // ---------- Sự kiện ----------

    event IssuerAdded(address indexed issuerAddress, string name);
    event IssuerRemoved(address indexed issuerAddress);
    event IssuerRestored(address indexed issuerAddress);
    event IssuerInherited(address indexed oldIssuer, address indexed newIssuer, string name);
    event InheritProposed(address indexed oldIssuer, address indexed newIssuer, uint64 compromisedSince, uint64 eta);
    event InheritCancelled(address indexed oldIssuer, address indexed newIssuer);
    event KeyCompromised(address indexed key, uint64 since);

    /// Chọn certHash (verifier tra theo tệp), holder (học viên tra chứng chỉ của mình) và issuer (kiểm toán theo đơn vị).
    event CertificateIssued(bytes32 certId, bytes32 indexed certHash, address indexed issuer, address indexed holder, uint256 issuedAt);
    event CertificateRevoked(bytes32 indexed certId, address indexed by, uint256 revokedAt);

    /// Lô KHÔNG phát địa chỉ học viên — lá chỉ là một hash.
    event BatchPublished(bytes32 indexed batchId, bytes32 indexed root, address indexed issuer, uint32 leafCount, uint256 issuedAt);
    event BatchRevoked(bytes32 indexed batchId, address indexed by, uint256 revokedAt);
    /// `leaf` luôn là một lá thật của cây (= keccak256(inner)), không bao giờ là nút trong.
    event LeafRevoked(bytes32 indexed batchId, bytes32 indexed leaf, address indexed by, uint256 revokedAt);

    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferCancelled(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    // ---------- Modifier ----------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyActiveIssuer() {
        if (issuerStatus[msg.sender] != IssuerStatus.Active) revert NotActiveIssuer();
        _;
    }

    // ---------- Constructor ----------

    /// @dev Deployer trở thành owner nhưng KHÔNG tự cấp cho mình quyền phát hành.
    /// @param inheritDelay Độ trễ chuyển giao danh tính (giây), trong [MIN_INHERIT_DELAY, MAX_INHERIT_DELAY].
    constructor(uint64 inheritDelay) {
        if (inheritDelay < MIN_INHERIT_DELAY || inheritDelay > MAX_INHERIT_DELAY) revert InvalidInheritDelay();
        INHERIT_DELAY = inheritDelay;
        owner = msg.sender;
    }

    // ---------- Khóa định danh ----------

    /// @notice Khóa chính của một bản ghi chứng chỉ cấp lẻ.
    function certIdOf(address issuer, bytes32 certHash) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(issuer, certHash));
    }

    /// @notice Khóa chính của một lô. Gắn issuer vào khóa nên hai đơn vị đăng
    ///         cùng một root vẫn là hai lô độc lập.
    function batchIdOf(address issuer, bytes32 root) public pure returns (bytes32) {
        return keccak256(abi.encode(issuer, root));
    }

    /// @notice Lá của cây Merkle cho một chứng chỉ trong lô.
    /// @dev    Băm HAI LẦN, đúng chuẩn OpenZeppelin StandardMerkleTree với kiểu
    ///         ["bytes32","address","bytes32"]. `holder` có thể là address(0).
    ///         `salt` ngẫu nhiên 32 byte cho từng chứng chỉ.
    function leafOf(bytes32 certHash, address holder, bytes32 salt) public pure returns (bytes32) {
        return keccak256(bytes.concat(leafInnerOf(certHash, holder, salt)));
    }

    /// @notice Lớp băm TRONG của lá: keccak256(abi.encode(certHash, holder, salt)). Lá = keccak256(inner).
    /// @dev    `revokeLeaf` nhận giá trị này. Có salt nên không lộ certHash hay holder.
    function leafInnerOf(bytes32 certHash, address holder, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(certHash, holder, salt));
    }

    // ---------- Quản trị issuer (chỉ owner) ----------

    /// @notice Công nhận một đơn vị phát hành và gắn tên hiển thị cho nó.
    /// @dev    Tên phải nằm trong DANH SÁCH CHO PHÉP:
    ///         chữ cái ASCII, chữ số, dấu cách, "(", ")", ",", "-", và 134 chữ có dấu tiếng Việt ở
    ///         dạng DỰNG SẴN (NFC). Không khoảng trắng đầu/cuối, không hai dấu cách liền nhau.
    ///         Hệ quả: NBSP, ký tự vô hình, dấu kết hợp rời (NFD), chữ Kirin/Hy Lạp, dấu chấm và
    ///         ký tự đặc biệt (& # % . ' / – …) đều bị từ chối. Script và giao diện chuẩn hóa trước
    ///         (scripts/lib/name.js: NFC, "–"/"—" → "-", gộp khoảng trắng, bỏ ký tự vô hình).
    function addIssuer(address issuerAddress, string calldata name) external onlyOwner {
        if (issuerAddress == address(0)) revert ZeroAddress();
        _requireNotOwnerSide(issuerAddress);
        if (issuerStatus[issuerAddress] != IssuerStatus.None) revert AddressAlreadyUsed();
        _requireCanonicalName(bytes(name));

        bytes32 nameKey = keccak256(bytes(name));
        if (nameHolder[nameKey] != address(0)) revert NameTaken();

        nameHolder[nameKey]           = issuerAddress;
        issuerStatus[issuerAddress]   = IssuerStatus.Active;
        _identityName[issuerAddress]  = name;
        identityOf[issuerAddress]     = issuerAddress;
        latestKeyOf[issuerAddress]    = issuerAddress;
        activeIssuerCount += 1;

        emit IssuerAdded(issuerAddress, name);
    }

    /// @notice Gỡ quyền cấp — cho nghỉ có trật tự, hoặc CHẶN NGAY một khóa nghi bị lộ.
    /// @dev    Đây là nước đi đầu tiên khi nghi lộ khóa: tức thì cắt quyền cấp và
    ///         thu hồi của khóa đó, rồi `proposeInherit` từ trạng thái Disabled (trong
    ///         RECOVERY_WINDOW) để chuyển danh tính sang khóa sạch sau INHERIT_DELAY.
    function removeIssuer(address issuerAddress) external onlyOwner {
        if (issuerStatus[issuerAddress] != IssuerStatus.Active) revert IssuerNotActive();
        issuerStatus[issuerAddress] = IssuerStatus.Disabled;
        disabledAt[issuerAddress]   = uint64(block.timestamp);
        activeIssuerCount -= 1;
        emit IssuerRemoved(issuerAddress);
    }

    /// @notice Bật lại một khóa đã bị gỡ — CHỈ khi gỡ nhầm một khóa chắc chắn còn an toàn.
    /// @dev    Chỉ trong RECOVERY_WINDOW kể từ lúc gỡ.
    function restoreIssuer(address issuerAddress) external onlyOwner {
        if (issuerStatus[issuerAddress] != IssuerStatus.Disabled) revert IssuerNotDisabled();
        if (inheritedBy[issuerAddress] != address(0)) revert IssuerWasInherited();
        _requireInRecoveryWindow(issuerAddress);
        issuerStatus[issuerAddress] = IssuerStatus.Active;
        activeIssuerCount += 1;
        emit IssuerRestored(issuerAddress);
    }

    /// @notice Bước 1/2 của chuyển giao danh tính: ghi đề xuất công khai, chờ INHERIT_DELAY.
    /// @param  compromisedSince  0 nếu xoay khóa định kỳ. Nếu khóa cũ bị LỘ: mốc (unix time)
    ///         sớm nhất mà khóa có thể đã nằm trong tay kẻ gian. Từ mốc này, mọi lần thu hồi
    ///         do khóa cũ thực hiện bị vô hiệu và mọi chứng chỉ nó cấp bị gắn cờ
    ///         `issuedAfterCompromise`. Không được ở tương lai, không lùi quá
    ///         MAX_COMPROMISE_LOOKBACK.
    function proposeInherit(address oldIssuer, address newIssuer, uint64 compromisedSince) external onlyOwner {
        _requireInheritable(oldIssuer, newIssuer);
        IssuerStatus oldStatus = issuerStatus[oldIssuer];
        if (oldStatus == IssuerStatus.Disabled) _requireInRecoveryWindow(oldIssuer);
        if (inheritProposals[oldIssuer].eta != 0) revert ProposalExists();
        if (compromisedSince != 0 && (
            compromisedSince > block.timestamp ||
            uint256(compromisedSince) + MAX_COMPROMISE_LOOKBACK < block.timestamp
        )) revert InvalidCompromiseTime();

        uint64 eta = uint64(block.timestamp) + INHERIT_DELAY;
        inheritProposals[oldIssuer] = InheritProposal({
            newIssuer:        newIssuer,
            eta:              eta,
            compromisedSince: compromisedSince
        });
        emit InheritProposed(oldIssuer, newIssuer, compromisedSince, eta);
    }

    /// @notice Hủy một đề xuất đang chờ (ví dụ trung tâm thật phản đối).
    function cancelInherit(address oldIssuer) external onlyOwner {
        InheritProposal memory p = inheritProposals[oldIssuer];
        if (p.eta == 0) revert NoProposal();
        delete inheritProposals[oldIssuer];
        emit InheritCancelled(oldIssuer, p.newIssuer);
    }

    /// @notice Bước 2/2: thực thi chuyển giao sau INHERIT_DELAY, trước khi đề xuất hết hạn.
    /// @dev    Kiểm lại mọi điều kiện vì trạng thái có thể đã đổi trong lúc chờ. KHÔNG kiểm
    ///         lại RECOVERY_WINDOW: đề xuất đã được tạo trong cửa sổ, và PROPOSAL_TTL chặn
    ///         trên tổng thời gian (≤ 7 + 2 + 7 ngày kể từ lúc gỡ).
    function executeInherit(address oldIssuer) external onlyOwner {
        InheritProposal memory p = inheritProposals[oldIssuer];
        if (p.eta == 0) revert NoProposal();
        if (block.timestamp < p.eta) revert TimelockNotElapsed();
        if (block.timestamp > uint256(p.eta) + PROPOSAL_TTL) revert ProposalExpired();
        address newIssuer = p.newIssuer;
        _requireInheritable(oldIssuer, newIssuer);
        delete inheritProposals[oldIssuer];

        IssuerStatus oldStatus = issuerStatus[oldIssuer];
        address identity = identityOf[oldIssuer];
        string memory name = _identityName[identity];
        nameHolder[keccak256(bytes(name))] = newIssuer;

        issuerStatus[oldIssuer] = IssuerStatus.Disabled;
        issuerStatus[newIssuer] = IssuerStatus.Active;
        inheritedBy[oldIssuer]  = newIssuer;
        predecessorOf[newIssuer] = oldIssuer;
        identityOf[newIssuer]   = identity;
        latestKeyOf[identity]   = newIssuer;

        if (oldStatus == IssuerStatus.Active) {
            // Một khóa tắt, một khóa bật: activeIssuerCount không đổi.
            emit IssuerRemoved(oldIssuer);
        } else {
            activeIssuerCount += 1;
        }

        if (p.compromisedSince != 0) {
            compromisedAt[oldIssuer]        = p.compromisedSince;
            compromiseDeclaredAt[oldIssuer] = uint64(block.timestamp);
            emit KeyCompromised(oldIssuer, p.compromisedSince);
        }

        emit IssuerAdded(newIssuer, name);
        emit IssuerInherited(oldIssuer, newIssuer, name);
    }

    function _requireInheritable(address oldIssuer, address newIssuer) private view {
        if (newIssuer == address(0)) revert ZeroAddress();
        _requireNotOwnerSide(newIssuer);
        IssuerStatus oldStatus = issuerStatus[oldIssuer];
        if (!(oldStatus == IssuerStatus.Active ||
              (oldStatus == IssuerStatus.Disabled && inheritedBy[oldIssuer] == address(0))))
            revert CannotBeInherited();
        if (issuerStatus[newIssuer] != IssuerStatus.None) revert AddressAlreadyUsed();
    }

    // ---------- Chuyển quyền owner ----------

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        if (issuerStatus[newOwner] != IssuerStatus.None) revert IssuerCannotBeOwner();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Hủy đề cử owner đang chờ.
    function cancelOwnershipTransfer() external onlyOwner {
        address p = pendingOwner;
        if (p == address(0)) revert NotPendingOwner();
        pendingOwner = address(0);
        emit OwnershipTransferCancelled(owner, p);
    }

    /// @dev Hai bước: gõ nhầm một ký tự trong địa chỉ không làm mất quyền vĩnh viễn.
    ///      Kiểm `issuerStatus` lần nữa lúc nhận: với mã hiện tại nhánh này KHÔNG đến
    ///      được — phòng thủ chiều sâu nếu sau này ai thêm một đường công nhận issuer mới.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        if (issuerStatus[msg.sender] != IssuerStatus.None) revert IssuerCannotBeOwner();
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    function _requireInRecoveryWindow(address key) private view {
        if (block.timestamp > uint256(disabledAt[key]) + RECOVERY_WINDOW) revert RecoveryWindowClosed();
    }

    function _requireNotOwnerSide(address a) private view {
        if (a == owner) revert OwnerCannotBeIssuer();
        if (a == pendingOwner) revert PendingOwnerCannotBeIssuer();
    }

    /// @dev Danh sách cho phép tên. Bit i của mỗi mặt nạ = byte (i) hoặc (0x80 + i) được nhận.
    ///      ASCII: dấu cách ( ) , - 0-9 A-Z a-z.
    uint256 private constant _ASCII_OK = 0x7fffffe07fffffe03ff330100000000;
    ///      Byte thứ hai sau C3: À Á Â Ã È É Ê Ì Í Ò Ó Ô Õ Ù Ú Ý và chữ thường tương ứng.
    uint256 private constant _C3_OK = 0x263c370f263c370f;
    ///      Sau C4: Ă ă Đ đ Ĩ ĩ. Sau C5: Ũ ũ. Sau C6: Ơ ơ Ư ư.
    uint256 private constant _C4_OK = 0x3000003000c;
    uint256 private constant _C5_OK = 0x30000000000;
    uint256 private constant _C6_OK = 0x1800300000000;
    //       Ba byte: E1 BA A0–BF và E1 BB 80–B9 = U+1EA0–U+1EF9 (ạ ả ấ … ỹ, 90 chữ).

    /// @dev Không rỗng, ≤ MAX_NAME_BYTES, chỉ gồm ký tự trong danh sách cho phép, không dấu cách
    ///      đầu/cuối, không hai dấu cách liền nhau. Vòng lặp bằng assembly, CHỈ ĐỌC calldata; mọi
    ///      chuỗi UTF-8 nhiều byte đều được kiểm đủ độ dài và từng byte tiếp nối.
    function _requireCanonicalName(bytes calldata n) private pure {
        uint256 len = n.length;
        if (len == 0) revert EmptyName();
        if (len > MAX_NAME_BYTES) revert NameTooLong();
        if (n[0] == 0x20 || n[len - 1] == 0x20) revert NameNotCanonical();
        bool bad;
        assembly {
            let p := n.offset
            let end := add(p, len)
            let prevSpace := 0
            for { } lt(p, end) { } {
                let w := calldataload(p)
                let c := byte(0, w)
                switch lt(c, 0x80)
                case 1 {
                    let sp := eq(c, 0x20)
                    if or(iszero(and(shr(c, _ASCII_OK), 1)), and(sp, prevSpace)) { bad := 1 break }
                    prevSpace := sp
                    p := add(p, 1)
                }
                default {
                    prevSpace := 0
                    if gt(add(p, 2), end) { bad := 1 break }
                    let c2 := byte(1, w)
                    // c2 ngoài 0x80–0xBF làm phép dịch ra số ≥ 64 (hoặc tràn) -> bit 0 -> từ chối.
                    let k := sub(c2, 0x80)
                    let step := 2
                    let ok := 0
                    switch c
                    case 0xC3 { ok := and(shr(k, _C3_OK), 1) }
                    case 0xC4 { ok := and(shr(k, _C4_OK), 1) }
                    case 0xC5 { ok := and(shr(k, _C5_OK), 1) }
                    case 0xC6 { ok := and(shr(k, _C6_OK), 1) }
                    case 0xE1 {
                        if iszero(gt(add(p, 3), end)) {
                            let c3 := byte(2, w)
                            ok := or(
                                and(eq(c2, 0xBA), and(gt(c3, 0x9F), lt(c3, 0xC0))),
                                and(eq(c2, 0xBB), and(gt(c3, 0x7F), lt(c3, 0xBA))))
                            step := 3
                        }
                    }
                    if iszero(ok) { bad := 1 break }
                    p := add(p, step)
                }
            }
        }
        if (bad) revert NameNotCanonical();
    }

    // ---------- Luồng nghiệp vụ: cấp lẻ ----------

    /// @notice Cấp một chứng chỉ. Chỉ issuer đang hoạt động gọi được.
    /// @dev    Đường cấp lẻ ghi certHash KHÔNG salt lên chuỗi. Khi cần riêng tư,
    ///         dùng `publishBatch` kể cả với một chứng chỉ: gas gần bằng, và chỉ commitment
    ///         có salt lên chuỗi.
    function issueCertificate(bytes32 certHash, address holder) external onlyActiveIssuer
        returns (bytes32 certId)
    {
        if (holder == address(0)) revert HolderZero();
        if (certHash == bytes32(0)) revert EmptyCertHash();
        certId = certIdOf(msg.sender, certHash);
        if (certificates[certId].status != Status.None) revert CertificateExists();

        certificates[certId] = Certificate({
            issuer:    msg.sender,
            status:    Status.Issued,
            issuedAt:  uint64(block.timestamp),
            holder:    holder,
            revokedAt: 0
        });

        emit CertificateIssued(certId, certHash, msg.sender, holder, block.timestamp);
    }

    /// @notice Thu hồi một chứng chỉ cấp lẻ. Vĩnh viễn — trừ khi chính khóa thu hồi được
    ///         tuyên bố lộ từ trước thời điểm thu hồi (khi đó lần thu hồi bị vô hiệu và khóa
    ///         hợp lệ có thể thu hồi lại nếu thật sự cần).
    function revokeCertificate(bytes32 certId) external {
        Certificate storage cert = certificates[certId];
        Status s = cert.status;
        if (!(s == Status.Issued || (s == Status.Revoked && _voided(certRevokedBy[certId], cert.revokedAt))))
            revert NotRevocable();
        _requireCanRevoke(cert.issuer);

        cert.status        = Status.Revoked;
        cert.revokedAt     = uint64(block.timestamp);
        certRevokedBy[certId] = msg.sender;
        emit CertificateRevoked(certId, msg.sender, block.timestamp);
    }

    // ---------- Luồng nghiệp vụ: cấp theo lô ----------

    /// @notice Đăng một lô chứng chỉ bằng Merkle root. Chỉ issuer đang hoạt động gọi được.
    function publishBatch(bytes32 root, uint32 leafCount) external onlyActiveIssuer
        returns (bytes32 batchId)
    {
        if (root == bytes32(0)) revert EmptyRoot();
        if (leafCount == 0) revert EmptyBatch();
        batchId = batchIdOf(msg.sender, root);
        if (batches[batchId].issuer != address(0)) revert BatchExists();

        batches[batchId] = Batch({
            issuer:    msg.sender,
            issuedAt:  uint64(block.timestamp),
            revokedAt: 0,
            leafCount: leafCount,
            revokedBy: address(0)
        });

        emit BatchPublished(batchId, root, msg.sender, leafCount, block.timestamp);
    }

    /// @notice Thu hồi MỘT chứng chỉ trong lô.
    /// @param  inner  `leafInnerOf(certHash, holder, salt)` của chứng chỉ — KHÔNG phải lá. Contract
    ///         tự tính lá = keccak256(inner), đúng cách `verifyInBatch` tính, rồi kiểm Merkle proof.
    /// @dev    Nút trong là keccak256 của 64 byte, lá là keccak256 của 32 byte: muốn nộp một nút trong
    ///         phải tìm `inner` có keccak256(inner) = nút đó, bất khả về mật mã. Không nhận nguyên liệu
    ///         lá (certHash, holder, salt) vì sẽ lộ chúng lên chuỗi; `inner` có salt nên không lộ.
    function revokeLeaf(bytes32 batchId, bytes32 root, bytes32 inner, bytes32[] calldata proof) external {
        bytes32 leaf = keccak256(bytes.concat(inner));
        Batch storage b = batches[batchId];
        if (b.issuer == address(0)) revert BatchNotFound();
        if (batchIdOf(b.issuer, root) != batchId) revert RootMismatch();
        if (_effective(b.revokedBy, b.revokedAt) != 0) revert BatchAlreadyRevoked();
        Revocation storage lr = leafRevocation[batchId][leaf];
        if (_effective(lr.by, lr.at) != 0) revert LeafAlreadyRevoked();
        _requireCanRevoke(b.issuer);
        if (!MerkleProof.verifyCalldata(proof, root, leaf)) revert LeafNotInBatch();

        lr.at = uint64(block.timestamp);
        lr.by = msg.sender;
        emit LeafRevoked(batchId, leaf, msg.sender, block.timestamp);
    }

    /// @notice Thu hồi CẢ LÔ. Dùng khi phát hiện cả lô gian lận.
    function revokeBatch(bytes32 batchId) external {
        Batch storage b = batches[batchId];
        if (b.issuer == address(0)) revert BatchNotFound();
        if (_effective(b.revokedBy, b.revokedAt) != 0) revert BatchAlreadyRevoked();
        _requireCanRevoke(b.issuer);

        b.revokedAt = uint64(block.timestamp);
        b.revokedBy = msg.sender;
        emit BatchRevoked(batchId, msg.sender, block.timestamp);
    }

    // ---------- Quyền thu hồi ----------

    /// @dev Người gọi phải ĐANG hoạt động và cùng danh tính với khóa đã cấp. Mỗi danh tính
    ///      có NHIỀU NHẤT một khóa Active — luôn là khóa mới nhất — nên kiểm tra là O(1).
    function _requireCanRevoke(address originalIssuer) private view {
        if (issuerStatus[msg.sender] != IssuerStatus.Active) revert NotActiveIssuer();
        if (identityOf[msg.sender] != identityOf[originalIssuer]) revert NotIssuingKeyOrSuccessor();
    }

    /// @dev Một lần thu hồi bị vô hiệu khi khóa thực hiện nó đã được tuyên bố lộ và lần thu
    ///      hồi xảy ra TỪ mốc lộ trở đi. Thu hồi trước mốc lộ (khóa còn trong tay chủ) giữ nguyên.
    function _voided(address by, uint64 at) private view returns (bool) {
        uint64 c = compromisedAt[by];
        return c != 0 && at >= c;
    }

    /// @dev Thời điểm thu hồi CÓ HIỆU LỰC (0 nếu chưa thu hồi hoặc lần thu hồi bị vô hiệu).
    function _effective(address by, uint64 at) private view returns (uint64) {
        return (at == 0 || _voided(by, at)) ? 0 : at;
    }

    // ---------- Đọc ----------

    struct VerifyResult {
        bool valid;                  // tồn tại VÀ không bị thu hồi có hiệu lực
        Status status;               // trạng thái HIỆU LỰC: Revoked bị vô hiệu trả về Issued
        address holder;
        uint64 issuedAt;
        uint64 revokedAt;            // 0 nếu không có lần thu hồi hiệu lực
        IssuerStatus issuerState;    // KHÓA đã cấp nay còn được công nhận không
        string issuerDisplayName;
        bool revocationVoided;       // có một lần thu hồi do khóa lộ, đã bị vô hiệu
        bool issuedAfterCompromise;  // cấp TỪ mốc lộ của khóa cấp trở đi — KHÔNG đáng tin
        uint64 compromisedSince;     // mốc lộ của khóa cấp (0 = chưa từng bị tuyên bố lộ)
        uint64 compromiseDeclaredAt; // lúc việc lộ được công bố trên chuỗi
    }

    /// @notice Xác minh một tệp cấp lẻ do một đơn vị cụ thể cấp.
    /// @dev    `valid` chỉ nói về bản ghi. Người gọi PHẢI đọc thêm `issuedAfterCompromise`:
    ///         true nghĩa là chứng chỉ do một khóa đã bị tuyên bố lộ cấp ra sau mốc lộ — có
    ///         thể là bằng giả. Contract không tự đặt valid=false vì như thế owner (qua mốc
    ///         lộ) sẽ có quyền vô hiệu chứng chỉ thật — trái nguyên tắc owner không thu hồi.
    function verifyCertificate(address issuer, bytes32 certHash) external view
        returns (VerifyResult memory r)
    {
        bytes32 certId = certIdOf(issuer, certHash);
        Certificate storage cert = certificates[certId];
        r.holder   = cert.holder;
        r.issuedAt = cert.issuedAt;
        if (cert.status == Status.Revoked && _voided(certRevokedBy[certId], cert.revokedAt)) {
            r.status = Status.Issued;
            r.revocationVoided = true;
        } else {
            r.status    = cert.status;
            r.revokedAt = cert.revokedAt;
        }
        r.valid       = r.status == Status.Issued;
        uint64 c      = compromisedAt[issuer];
        r.issuedAfterCompromise = cert.status != Status.None && c != 0 && cert.issuedAt >= c;
        r.compromisedSince     = c;
        r.compromiseDeclaredAt = compromiseDeclaredAt[issuer];
        r.issuerState       = issuerStatus[issuer];
        r.issuerDisplayName = issuerName(issuer);
    }

    struct BatchVerifyResult {
        bool valid;             // lô tồn tại, lá nằm trong cây, lá và lô đều không bị thu hồi có hiệu lực
        bool batchExists;
        bool inBatch;           // Merkle proof đúng
        bool batchRevoked;      // có hiệu lực
        bool leafRevoked;       // có hiệu lực
        uint64 issuedAt;
        uint64 revokedAt;       // mốc thu hồi hiệu lực SỚM NHẤT giữa lá và lô
        uint32 leafCount;
        IssuerStatus issuerState;
        string issuerDisplayName;
        bool revocationVoided;
        bool issuedAfterCompromise;
        uint64 compromisedSince;
        uint64 compromiseDeclaredAt;
    }

    /// @notice Xác minh một chứng chỉ trong lô, kiểm Merkle proof TRÊN CHUỖI.
    /// @dev    Nhận nguyên liệu của lá (certHash, holder, salt) chứ KHÔNG nhận lá có sẵn:
    ///         nếu nhận lá, người gọi có thể đưa thẳng root vào làm "lá" với proof rỗng.
    function verifyInBatch(
        address issuer,
        bytes32 root,
        bytes32 certHash,
        address holder,
        bytes32 salt,
        bytes32[] calldata proof
    ) external view returns (BatchVerifyResult memory r) {
        bytes32 leaf    = leafOf(certHash, holder, salt);
        bytes32 batchId = batchIdOf(issuer, root);
        Batch storage b = batches[batchId];
        r.batchExists   = b.issuer != address(0);
        r.inBatch       = r.batchExists && MerkleProof.verifyCalldata(proof, root, leaf);
        r.issuedAt      = b.issuedAt;
        r.leafCount     = b.leafCount;

        _applyBatchRevocations(r, b, leafRevocation[batchId][leaf]);
        uint64 c = compromisedAt[issuer];
        r.issuedAfterCompromise = r.batchExists && c != 0 && r.issuedAt >= c;
        r.compromisedSince     = c;
        r.compromiseDeclaredAt = compromiseDeclaredAt[issuer];
        r.issuerState       = issuerStatus[issuer];
        r.issuerDisplayName = issuerName(issuer);
    }

    /// @dev Tách khỏi verifyInBatch để tránh "stack too deep".
    function _applyBatchRevocations(BatchVerifyResult memory r, Batch storage b, Revocation storage lr) private view {
        uint64 eb = _effective(b.revokedBy, b.revokedAt);
        uint64 el = _effective(lr.by, lr.at);
        r.batchRevoked = eb != 0;
        r.leafRevoked  = el != 0;
        r.revokedAt    = (el != 0 && (eb == 0 || el < eb)) ? el : eb;
        r.revocationVoided = (b.revokedAt != 0 && eb == 0) || (lr.at != 0 && el == 0);
        r.valid        = r.inBatch && eb == 0 && el == 0;
    }

    /// @notice Bản ghi THÔ (trạng thái LƯU TRỮ) theo tên trường — KHÔNG áp quy tắc vô hiệu thu
    ///         hồi do khóa lộ. Muốn kết luận một chứng chỉ còn hiệu lực hay không, dùng
    ///         `effectiveStatus(certId)` hoặc `verifyCertificate(issuer, certHash)`.
    function getCertificate(bytes32 certId) external view returns (Certificate memory) {
        return certificates[certId];
    }

    /// @notice Trạng thái HIỆU LỰC của một chứng chỉ cấp lẻ: như bản ghi lưu trữ,
    ///         trừ khi lần thu hồi do một khóa đã bị tuyên bố lộ thực hiện từ mốc lộ trở đi —
    ///         khi đó trả `Issued`. Đọc thêm `verifyCertificate` để biết cờ `issuedAfterCompromise`.
    function effectiveStatus(bytes32 certId) external view returns (Status) {
        Certificate storage cert = certificates[certId];
        if (cert.status == Status.Revoked && _voided(certRevokedBy[certId], cert.revokedAt)) return Status.Issued;
        return cert.status;
    }

    /// @notice Thời điểm thu hồi lá THÔ (0 nếu chưa), không áp quy tắc vô hiệu — dùng
    ///         `verifyInBatch` để kết luận.
    function leafRevokedAt(bytes32 batchId, bytes32 leaf) external view returns (uint64) {
        return leafRevocation[batchId][leaf].at;
    }

    /// @notice Khóa hiện hành của danh tính đã sở hữu `key`.
    function currentKeyOf(address key) external view returns (address) {
        return latestKeyOf[identityOf[key]];
    }

    /// @notice Tên hiển thị của danh tính sở hữu `key` (chuỗi rỗng nếu chưa từng là issuer).
    function issuerName(address key) public view returns (string memory) {
        return _identityName[identityOf[key]];
    }

    /// @notice Tra ngược từ tên hiển thị ra địa chỉ đang giữ tên đó. Chỉ đọc TRẠNG THÁI —
    ///         chạy được cả khi không còn event cũ lẫn website. Giao diện chuẩn hóa tên gõ
    ///         vào (scripts/lib/name.js) trước khi gọi.
    /// @dev    So khớp theo BYTE. Tên khác nhau chỉ ở chữ hoa/thường hoặc l/I, 0/O vẫn là hai
    ///         tên — giao diện cảnh báo tên na ná.
    function issuerByName(string calldata name) external view returns (address) {
        return nameHolder[keccak256(bytes(name))];
    }

    /// @notice Gói trạng thái quản trị vào một lời gọi để giao diện chỉ cần một vòng RPC.
    function governance() external view
        returns (address owner_, address pendingOwner_, uint256 activeIssuerCount_)
    {
        return (owner, pendingOwner, activeIssuerCount);
    }
}
