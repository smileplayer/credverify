// Công nhận một đơn vị phát hành bằng dòng lệnh (owner ký).
//   ISSUER=0x… NAME="Trung tam X" npx hardhat run scripts/add-issuer.js --network localhost
// Mặc định trên mạng local: ISSUER = signer #1, NAME = "Trung tam dao tao X".
const hre = require("hardhat");
const { readAnchor } = require("./lib/anchor");
const { canonicalName, nameProblem } = require("./lib/name");

async function main() {
  const { ethers } = hre;
  const [owner, s1] = await ethers.getSigners();
  const address = process.env.CONTRACT || readAnchor().addr;
  const issuer = process.env.ISSUER || s1.address;
  const raw = process.env.NAME || "Trung tam dao tao X";
  const name = canonicalName(raw);
  if (name !== raw) console.log(`Đã chuẩn hóa tên: ${JSON.stringify(raw)} -> ${JSON.stringify(name)}`);
  const problem = nameProblem(name);
  if (problem) throw new Error("Tên không hợp lệ: " + problem);   // contract cũng từ chối (NameNotCanonical)
  if (!ethers.isAddress(address) || !ethers.isAddress(issuer)) throw new Error("CONTRACT/ISSUER không hợp lệ");
  const reg = await ethers.getContractAt("CredentialRegistry", address, owner);
  const rc = await (await reg.addIssuer(issuer, name)).wait();
  console.log(`addIssuer(${issuer}, "${name}") — tx ${rc.hash} | gas ${rc.gasUsed}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
