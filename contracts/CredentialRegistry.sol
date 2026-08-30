// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  CredentialRegistry — sổ đăng ký chứng chỉ dùng chung
/// @notice Thành phần on-chain của CredVerify. MỘT contract cho TẤT CẢ đơn vị phát hành.

///  owner (CredVerify)  công nhận ai là issuer, đặt tên, chuyển giao issuer.
///                      KHÔNG cấp. KHÔNG thu hồi. KHÔNG sửa/xóa bản ghi đã có.
///
///  issuer (trung tâm)  cấp và thu hồi chứng chỉ CỦA CHÍNH MÌNH.
///                      Không tự công nhận mình. Không đụng được vào chứng chỉ
///                      của trung tâm khác — xem `certIdOf` bên dưới.
///
///  verifier (bất kỳ)   đọc và xác minh, KHÔNG cần xin phép ai, không cần ví,
///                      không cần trang web của CredVerify còn sống.

contract CredentialRegistry {
    // ---------- Kiểu dữ liệu ----------

    enum Status {
        None,     // 0 — chưa từng tồn tại
        Issued,   // 1 — đã cấp, còn hợp lệ
        Revoked   // 2 — đã thu hồi, VĨNH VIỄN không hợp lệ
    }

    enum IssuerStatus {
        None,     // 0 — chưa từng được công nhận
        Active,   // 1 — đang được phép cấp
        Disabled  // 2 — đã bị gỡ quyền hoặc đã chuyển giao cho khóa kế nhiệm
    }

    struct Certificate {
        address issuer;     // khóa đã cấp
        Status status;     // trạng thái hiện tại
        uint64 issuedAt;   // thời điểm cấp
        address holder;     // ví học viên
        uint64 revokedAt;  // thời điểm thu hồi (0 nếu chưa)
    }

    // ---------- Trạng thái lưu trữ ----------

    address public owner;
    address public pendingOwner;

    mapping(address => IssuerStatus) public issuerStatus;
    mapping(address => string) public issuerName;

    /// keccak256(bytes(tên)) -> địa chỉ đang giữ tên đó. Một tên, một chủ.
    mapping(bytes32 => address) public nameHolder;

    /// Khóa cũ -> khóa kế nhiệm. Chỉ ghi một lần cho mỗi khóa cũ.
    mapping(address => address) public inheritedBy;

    /// Mọi địa chỉ TỪNG được công nhận, kể cả đã bị gỡ — phục vụ kiểm toán.
    address[] private _knownIssuers;

    uint256 public activeIssuerCount;

    mapping(bytes32 => Certificate) public certificates;

    /// Chặn vòng lặp vô hạn khi đi theo chuỗi kế nhiệm A->B->C->...
    uint256 private constant MAX_INHERIT_HOPS = 8;

    // ---------- Sự kiện ----------

    event IssuerAdded(address indexed issuerAddress, string name);
    event IssuerRemoved(address indexed issuerAddress);
    event IssuerRestored(address indexed issuerAddress);
    event IssuerInherited(address indexed oldIssuer, address indexed newIssuer, string name);

    /// Chọn certHash (verifier tra theo tệp), holder (học viên tra chứng chỉ của mình) và issuer (kiểm toán theo đơn vị). 
    // `certId` không indexed vì nó suy ra được từ hai trong ba cái kia.
    event CertificateIssued(bytes32 certId, bytes32 indexed certHash, address indexed issuer, address indexed holder, uint256 issuedAt);
    event CertificateRevoked(bytes32 indexed certId, address indexed by, uint256 revokedAt);

    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    // ---------- Modifier ----------

    modifier onlyOwner() {
        require(msg.sender == owner, "CredentialRegistry: caller is not owner");
        _;
    }

    modifier onlyActiveIssuer() {
        require(issuerStatus[msg.sender] == IssuerStatus.Active, "CredentialRegistry: caller is not an active issuer");
        _;
    }

    // ---------- Constructor ----------

    /// @dev Deployer trở thành owner nhưng KHÔNG tự cấp cho mình quyền phát hành.
    constructor() {
        owner = msg.sender;
    }

    // ---------- Khóa định danh ----------

    /// @notice Khóa chính của một bản ghi chứng chỉ.
    function certIdOf(address issuer, bytes32 certHash) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(issuer, certHash));
    }

    // ---------- Quản trị issuer (chỉ owner) ----------
    //
    //  ĐƯỜNG NỐI CHO TIMELOCK
    //  Bốn hàm dưới đây là TOÀN BỘ quyền của owner. Nếu về sau gắn timelock để
    //  trả lời đề bài mục 5.2 ("tránh single admin key"), chỉ cần bọc `inheritIssuer`
    //  — đó là hàm duy nhất cho phép owner cướp danh tính một trung tâm ĐANG hoạt
    //  động. Ba hàm còn lại chỉ mở/đóng cánh cửa cấp mới, không đụng tới bản ghi
    //  đã tồn tại, nên trì hoãn chúng chỉ gây hại chứ không thêm an toàn.

    /// @notice Công nhận một đơn vị phát hành và gắn tên hiển thị cho nó.
    function addIssuer(address issuerAddress, string calldata name) external onlyOwner {
        require(issuerAddress != address(0), "CredentialRegistry: zero address");
        require(issuerAddress != owner, "CredentialRegistry: owner cannot be an issuer");
        require(issuerStatus[issuerAddress] == IssuerStatus.None, "CredentialRegistry: address already used as issuer");
        require(bytes(name).length > 0, "CredentialRegistry: empty name");

        bytes32 nameKey = keccak256(bytes(name));
        require(nameHolder[nameKey] == address(0), "CredentialRegistry: name already taken");

        nameHolder[nameKey]         = issuerAddress;
        issuerStatus[issuerAddress] = IssuerStatus.Active;
        issuerName[issuerAddress]   = name;
        _knownIssuers.push(issuerAddress);
        activeIssuerCount += 1;

        emit IssuerAdded(issuerAddress, name);
    }

    /// @notice Gỡ quyền cấp. Hành động BẢO VỆ nên tức thì.
    /// @dev    Gỡ quyền cắt LUÔN khả năng thu hồi của khóa đó (xem `revokeCertificate`).
    function removeIssuer(address issuerAddress) external onlyOwner {
        require(issuerStatus[issuerAddress] == IssuerStatus.Active, "CredentialRegistry: issuer is not active");
        issuerStatus[issuerAddress] = IssuerStatus.Disabled;
        activeIssuerCount -= 1;
        emit IssuerRemoved(issuerAddress);
    }

    /// @notice Bật lại một khóa đã bị gỡ — dành cho trường hợp gỡ nhầm.
    function restoreIssuer(address issuerAddress) external onlyOwner {
        require(issuerStatus[issuerAddress] == IssuerStatus.Disabled, "CredentialRegistry: issuer is not disabled");
        require(inheritedBy[issuerAddress] == address(0), "CredentialRegistry: issuer was inherited, cannot restore");
        issuerStatus[issuerAddress] = IssuerStatus.Active;
        activeIssuerCount += 1;
        emit IssuerRestored(issuerAddress);
    }

    /// @notice Chuyển giao danh tính issuer từ khóa cũ sang khóa mới.
    ///         Đây là đường XOAY KHÓA khi một khóa cấp bị lộ.
    function inheritIssuer(address oldIssuer, address newIssuer) external onlyOwner {
        require(newIssuer != address(0), "CredentialRegistry: zero address");
        require(newIssuer != owner, "CredentialRegistry: owner cannot be an issuer");
        require(issuerStatus[oldIssuer] == IssuerStatus.Active, "CredentialRegistry: old address is not an active issuer");
        require(issuerStatus[newIssuer] == IssuerStatus.None, "CredentialRegistry: address already used as issuer");

        string memory name = issuerName[oldIssuer];
        nameHolder[keccak256(bytes(name))] = newIssuer;

        issuerStatus[oldIssuer] = IssuerStatus.Disabled;
        issuerStatus[newIssuer] = IssuerStatus.Active;
        issuerName[newIssuer] = name;
        inheritedBy[oldIssuer]  = newIssuer;
        _knownIssuers.push(newIssuer);
        // activeIssuerCount không đổi: một khóa tắt, một khóa bật.

        emit IssuerRemoved(oldIssuer);
        emit IssuerAdded(newIssuer, name);
        emit IssuerInherited(oldIssuer, newIssuer, name);
    }

    // ---------- Chuyển quyền owner ----------

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "CredentialRegistry: zero address");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @dev Hai bước: gõ nhầm một ký tự trong địa chỉ không làm mất quyền vĩnh viễn.
    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "CredentialRegistry: not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    // ---------- Luồng nghiệp vụ chính ----------

    /// @notice Cấp một chứng chỉ. Chỉ issuer đang hoạt động gọi được.
    function issueCertificate(bytes32 certHash, address holder) external onlyActiveIssuer
        returns (bytes32 certId)
    {
        require(holder != address(0), "CredentialRegistry: holder is zero address");
        require(certHash != bytes32(0), "CredentialRegistry: empty certHash");
        certId = certIdOf(msg.sender, certHash);
        require(certificates[certId].status == Status.None, "CredentialRegistry: certificate already exists for this issuer and file");

        certificates[certId] = Certificate({
            issuer:    msg.sender,
            status:    Status.Issued,
            issuedAt:  uint64(block.timestamp),
            holder:    holder,
            revokedAt: 0
        });

        emit CertificateIssued(certId, certHash, msg.sender, holder, block.timestamp);
    }

    /// @notice Thu hồi một chứng chỉ. VĨNH VIỄN — không có hàm nào đảo ngược.
    /// @dev Ai được phép: khóa đã cấp, hoặc bất kỳ khóa nào trong chuỗi kế nhiệm
    ///      của nó — VÀ khóa đó phải ĐANG hoạt động.
    function revokeCertificate(bytes32 certId) external {
        Certificate storage cert = certificates[certId];
        require(cert.status == Status.Issued, "CredentialRegistry: certificate not in Issued state");
        require(issuerStatus[msg.sender] == IssuerStatus.Active, "CredentialRegistry: caller is not an active issuer");
        require(_inheritsFrom(cert.issuer, msg.sender), "CredentialRegistry: not the issuing key or its successor");

        cert.status    = Status.Revoked;
        cert.revokedAt = uint64(block.timestamp);
        emit CertificateRevoked(certId, msg.sender, block.timestamp);
    }

    /// @dev true nếu `claimant` chính là `origin`, hoặc nằm trên chuỗi kế nhiệm
    ///      xuất phát từ `origin`. Chuỗi bị chặn ở MAX_INHERIT_HOPS.
    function _inheritsFrom(address origin, address claimant) private view returns (bool) {
        address cur = origin;
        for (uint256 i = 0; i <= MAX_INHERIT_HOPS; i++) {
            if (cur == claimant) return true;
            cur = inheritedBy[cur];
            if (cur == address(0)) return false;
        }
        return false;
    }

    // ---------- Đọc ----------

    /// Kết quả xác minh, gói thành struct.
    struct VerifyResult {
        bool valid; // hash khớp VÀ trạng thái vẫn là Issued
        Status status; // None / Issued / Revoked
        address holder;
        uint64 issuedAt;
        uint64 revokedAt;
        IssuerStatus issuerState; // đơn vị cấp nay còn được công nhận không
        string issuerDisplayName; // tên hiển thị của đơn vị cấp
    }

    /// @notice Xác minh một tệp do một đơn vị cụ thể cấp.
    function verifyCertificate(address issuer, bytes32 certHash) external view
        returns (VerifyResult memory)
    {
        Certificate storage cert = certificates[certIdOf(issuer, certHash)];
        // Không cần so hash: hash đã là một nửa của khóa, tra ra bản ghi nghĩa là khớp.
        return VerifyResult({
            valid:             cert.status == Status.Issued,
            status:            cert.status,
            holder:            cert.holder,
            issuedAt:          cert.issuedAt,
            revokedAt:         cert.revokedAt,
            issuerState:       issuerStatus[issuer],
            issuerDisplayName: issuerName[issuer]
        });
    }

    /// @notice Trả về bản ghi theo tên trường
    function getCertificate(bytes32 certId) external view returns (Certificate memory) {
        return certificates[certId];
    }

    /// @notice Tra ngược: một tệp đã được ĐƠN VỊ NÀO đăng ký?
    function findByHash(bytes32 certHash) external view
        returns (address[] memory issuers, bytes32[] memory certIds, Status[] memory statuses)
    {
        uint256 len = _knownIssuers.length;
        uint256 n = 0;
        for (uint256 i = 0; i < len; i++) {
            if (certificates[certIdOf(_knownIssuers[i], certHash)].status != Status.None) n++;
        }
        issuers  = new address[](n);
        certIds  = new bytes32[](n);
        statuses = new Status[](n);
        uint256 j = 0;
        for (uint256 i = 0; i < len; i++) {
            bytes32 id = certIdOf(_knownIssuers[i], certHash);
            Status s = certificates[id].status;
            if (s != Status.None) {
                issuers[j]  = _knownIssuers[i];
                certIds[j]  = id;
                statuses[j] = s;
                j++;
            }
        }
    }

    /// @notice Những đơn vị ĐANG được phép cấp. Giao diện hiện danh sách này để một
    ///         issuer được owner thêm lén không còn vô hình.
    function listActiveIssuers() external view
        returns (address[] memory addrs, string[] memory names)
    {
        uint256 len = _knownIssuers.length;
        uint256 n = 0;
        for (uint256 i = 0; i < len; i++) {
            if (issuerStatus[_knownIssuers[i]] == IssuerStatus.Active) n++;
        }
        addrs = new address[](n);
        names = new string[](n);
        uint256 j = 0;
        for (uint256 i = 0; i < len; i++) {
            address a = _knownIssuers[i];
            if (issuerStatus[a] == IssuerStatus.Active) {
                addrs[j] = a;
                names[j] = issuerName[a];
                j++;
            }
        }
    }

    /// @notice Mọi địa chỉ TỪNG được công nhận, kể cả đã bị gỡ — phục vụ kiểm toán.
    function knownIssuers() external view returns (address[] memory) {
        return _knownIssuers;
    }

    /// @notice Tra ngược từ tên hiển thị ra địa chỉ đang giữ tên đó.
    /// @dev    GIỚI HẠN ĐÃ BIẾT: so khớp theo BYTE. "Trung tâm X" và "Trung tam X" là hai
    ///         tên khác nhau với contract, và cặp chữ Latin/Kirin trông giống hệt nhau
    ///         (A vs А) cũng vậy. Ràng buộc này chặn trùng tên Y HỆT, KHÔNG chặn được tên
    ///         gần giống. Lời giải đúng là buộc tên phải CHỨNG MINH ĐƯỢC (gắn với quyền
    ///         kiểm soát một tên miền) chứ không phải do owner tuyên bố — ngoài phạm vi
    ///         MVP.
    function issuerByName(string calldata name) external view returns (address) {
        return nameHolder[keccak256(bytes(name))];
    }

    /// @notice Gói trạng thái quản trị vào một lời gọi để giao diện chỉ cần một vòng RPC.
    function governance() external view
        returns (address owner_, address pendingOwner_, uint256 activeIssuerCount_, uint256 knownIssuerCount_)
    {
        return (owner, pendingOwner, activeIssuerCount, _knownIssuers.length);
    }
}
