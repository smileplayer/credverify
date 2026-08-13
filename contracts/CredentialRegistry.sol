// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CredentialRegistry
/// @notice Contract Registry cho hệ thống cấp/xác minh/thu hồi chứng chỉ khóa học.
///         Đây là thành phần "on-chain" của MVP CredVerify.
///
/// Thiết kế theo state machine đã mô tả trong proposal:
///   None -> Issued -> Revoked   (chỉ đi một chiều, không có đường quay lại)
///
/// Vai trò (roles):
///   - owner   : quản trị hệ thống, có quyền thêm/xóa issuer (vd: admin của trung tâm đào tạo)
///   - issuer  : địa chỉ được ủy quyền cấp chứng chỉ (vd: ví của trung tâm đào tạo)
///   - holder  : học viên nhận chứng chỉ (chỉ lưu địa chỉ, không lưu thông tin cá nhân)
///   - verifier: bất kỳ ai gọi hàm verifyCertificate (không cần địa chỉ đặc biệt, chỉ đọc dữ liệu công khai)
contract CredentialRegistry {
    // ---------- Kiểu dữ liệu ----------

    enum Status {
        None,     // 0 - chưa từng tồn tại
        Issued,   // 1 - đã cấp, còn hợp lệ
        Revoked   // 2 - đã bị thu hồi, vĩnh viễn không hợp lệ
    }

    struct Certificate {
        bytes32 certHash;   // hash (vd: keccak256) của nội dung file chứng chỉ gốc, dùng để đối chiếu khi verify
        address issuer;     // địa chỉ issuer đã cấp - chỉ địa chỉ này mới được thu hồi
        address holder;     // địa chỉ ví của học viên (không phải danh tính thật)
        Status status;      // trạng thái hiện tại
        uint256 issuedAt;   // timestamp lúc cấp
    }

    // ---------- Trạng thái lưu trữ ----------

    address public owner;
    mapping(address => bool) public isIssuer;

    // certId là mã định danh duy nhất của mỗi chứng chỉ (vd: keccak256("KHOAHOC-2026-0001"))

    mapping(bytes32 => Certificate) public certificates;

    // ---------- Sự kiện  ----------

    event IssuerAdded(address indexed issuerAddress);
    event IssuerRemoved(address indexed issuerAddress);
    event CertificateIssued(
        bytes32 indexed certId,
        bytes32 certHash,
        address indexed issuer,
        address indexed holder,
        uint256 issuedAt
    );
    event CertificateRevoked(bytes32 indexed certId, address indexed issuer, uint256 revokedAt);

    // ---------- Modifier (điều kiện cưỡng chế truy cập) ----------

    modifier onlyOwner() {
        require(msg.sender == owner, "CredentialRegistry: caller is not owner");
        _;
    }

    modifier onlyIssuer() {
        require(isIssuer[msg.sender], "CredentialRegistry: caller is not an authorized issuer");
        _;
    }

    // ---------- Constructor ----------

    constructor() {
        owner = msg.sender;
        // Người deploy contract mặc định cũng là issuer đầu tiên, để demo dễ dàng.
        isIssuer[msg.sender] = true;
        emit IssuerAdded(msg.sender);
    }

    // ---------- Quản trị issuer ----------

    function addIssuer(address issuerAddress) external onlyOwner {
        require(issuerAddress != address(0), "CredentialRegistry: zero address");
        isIssuer[issuerAddress] = true;
        emit IssuerAdded(issuerAddress);
    }

    function removeIssuer(address issuerAddress) external onlyOwner {
        isIssuer[issuerAddress] = false;
        emit IssuerRemoved(issuerAddress);
    }

    // ---------- Luồng nghiệp vụ chính  ----------

    /// @notice Cấp một chứng chỉ mới. Chỉ issuer được ủy quyền mới gọi được.
    function issueCertificate(bytes32 certId, bytes32 certHash, address holder) external onlyIssuer {
        require(holder != address(0), "CredentialRegistry: holder is zero address");
        require(certificates[certId].status == Status.None, "CredentialRegistry: certId already used");

        certificates[certId] = Certificate({
            certHash: certHash,
            issuer: msg.sender,
            holder: holder,
            status: Status.Issued,
            issuedAt: block.timestamp
        });

        emit CertificateIssued(certId, certHash, msg.sender, holder, block.timestamp);
    }

    /// @notice Thu hồi một chứng chỉ đã cấp. Chỉ đúng issuer đã cấp chứng chỉ đó mới thu hồi được
    function revokeCertificate(bytes32 certId) external {
        Certificate storage cert = certificates[certId];
        require(cert.status == Status.Issued, "CredentialRegistry: certificate not in Issued state");
        require(cert.issuer == msg.sender, "CredentialRegistry: only the issuing address can revoke");

        cert.status = Status.Revoked;
        emit CertificateRevoked(certId, msg.sender, block.timestamp);
    }

    /// @notice Xác minh một chứng chỉ: đối chiếu hash được cung cấp với hash đã lưu on-chain,
    ///         đồng thời trả về trạng thái hiện tại. Đây là hàm read-only, ai cũng gọi được (verifier).
    /// @return valid true nếu certId tồn tại, hash khớp và trạng thái vẫn là Issued
    function verifyCertificate(bytes32 certId, bytes32 providedHash)
        external
        view
        returns (bool valid, Status status, address issuer, address holder, uint256 issuedAt)
    {
        Certificate storage cert = certificates[certId];
        bool hashMatches = cert.certHash == providedHash;
        bool isValidStatus = cert.status == Status.Issued;
        valid = hashMatches && isValidStatus;
        return (valid, cert.status, cert.issuer, cert.holder, cert.issuedAt);
    }
}
