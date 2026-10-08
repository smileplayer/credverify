// Tiện ích dùng chung cho các bộ test.
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const artifact = require("../artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json");
const { ethers } = require("hardhat");

// INHERIT_DELAY mà bộ test truyền vào constructor (60 giây để chạy nhanh; production 48 giờ).
// test/CredentialRegistryV3.test.js (nhóm D) kiểm hai giá trị này bằng nhau.
const INHERIT_DELAY = 60;

/** Đề xuất + chờ INHERIT_DELAY + thực thi. Trả về promise của giao dịch executeInherit. */
async function inherit(r, oldA, newA, since = 0) {
  await (await r.proposeInherit(oldA, newA, since)).wait();
  await time.increase(INHERIT_DELAY);
  return r.executeInherit(oldA);
}

/** Đối tượng mang ABI của CredentialRegistry, dùng cho revertedWithCustomError khi lỗi
 *  nổi lên qua một contract khác (ví dụ ví multisig). */
const CR = { interface: new ethers.Interface(artifact.abi) };

module.exports = { inherit, CR, INHERIT_DELAY, time };
