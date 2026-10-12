// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ĐỐI CHỨNG cho thí nghiệm mạo danh (docs/IMPERSONATION.md), không thuộc CredVerify, không deploy.
// Viết lại ngữ nghĩa Institution.sol và AcademicRecord.sol của github.com/nnieru/academic-record-managment
// (Main b9b68f4): cùng chữ ký hàm, điều kiện require, dữ liệu lưu và event.

contract IetStyleInstitution {
    struct InstitutionData { string name; string email; address addr; }

    mapping(address => InstitutionData) public institutions;
    mapping(address => bool) private institutionExists;

    event InstitutionRegistered(string name, string email, address addr);

    /// Như bản gốc: mỗi ví đăng ký một lần; KHÔNG kiểm tên trùng, không có bên công nhận.
    function register(string memory _name, string memory _email) public {
        require(!institutionExists[msg.sender], "Institution already exists");
        institutions[msg.sender] = InstitutionData(_name, _email, msg.sender);
        institutionExists[msg.sender] = true;
        emit InstitutionRegistered(_name, _email, msg.sender);
    }

    function isInstitutionExists(address _addr) public view returns (bool) {
        return institutionExists[_addr];
    }
}

contract IetStyleAcademicRecord {
    struct Record { address issuerAddress; string txHash; }

    mapping(string => Record) public records;
    mapping(string => bool) private recordExists;

    event RecordIssued(address indexed _issuerAddress, string _txHash);

    /// Như bản gốc: bất kỳ ví nào cũng đăng được một Merkle root (dạng chuỗi), chỉ chặn trùng root.
    function AddRecord(string memory _txHash) public {
        require(!recordExists[_txHash], "Record Already exist");
        records[_txHash] = Record(msg.sender, _txHash);
        recordExists[_txHash] = true;
        emit RecordIssued(msg.sender, _txHash);
    }

    /// Trang xác minh gốc chỉ gọi hàm này (cùng phép kiểm Merkle proof ngoài chuỗi).
    function isRecordTxHashExist(string memory _addr) public view returns (bool) {
        return recordExists[_addr];
    }
}
