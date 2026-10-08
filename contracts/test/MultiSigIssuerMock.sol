// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MultiSigIssuerMock — ví đa chữ ký TỐI GIẢN, CHỈ DÙNG TRONG TEST.
/// @notice Minh họa khuyến nghị của Cerberus (chống gian lận nội bộ đơn vị): issuer có
///         thể là một contract đòi M-trên-N chữ ký, và CredentialRegistry không cần sửa
///         gì vì nó chỉ nhìn `msg.sender`. Thực tế nên dùng ví đã kiểm toán (vd. Safe).
contract MultiSigIssuerMock {
    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public immutable threshold;

    struct Txn { address target; bytes data; uint256 confirmations; bool executed; }
    Txn[] public txns;
    mapping(uint256 => mapping(address => bool)) public confirmed;

    constructor(address[] memory _owners, uint256 _threshold) {
        require(_threshold > 0 && _threshold <= _owners.length, "MultiSig: bad threshold");
        for (uint256 i = 0; i < _owners.length; i++) {
            require(!isOwner[_owners[i]], "MultiSig: duplicate owner");
            isOwner[_owners[i]] = true;
            owners.push(_owners[i]);
        }
        threshold = _threshold;
    }

    modifier onlyOwner() { require(isOwner[msg.sender], "MultiSig: not owner"); _; }

    function submit(address target, bytes calldata data) external onlyOwner returns (uint256 id) {
        txns.push(Txn(target, data, 0, false));
        id = txns.length - 1;
        _confirm(id);
    }

    function confirm(uint256 id) external onlyOwner { _confirm(id); }

    function _confirm(uint256 id) private {
        Txn storage t = txns[id];
        require(!t.executed, "MultiSig: executed");
        require(!confirmed[id][msg.sender], "MultiSig: already confirmed");
        confirmed[id][msg.sender] = true;
        t.confirmations += 1;
        if (t.confirmations >= threshold) {
            t.executed = true;
            (bool ok, bytes memory ret) = t.target.call(t.data);
            if (!ok) { assembly { revert(add(ret, 32), mload(ret)) } }
        }
    }
}
