// Dung du lieu demo cho kiem thu giao dien. Chi dung khi phat trien.
const hre = require("hardhat");
const fs = require("fs");
async function main() {
  const [cv, cx, cy, alice, bob] = await hre.ethers.getSigners();
  const F = await hre.ethers.getContractFactory("CredentialRegistry");
  const reg = await F.deploy(); await reg.waitForDeployment();
  const addr = await reg.getAddress();
  console.log("registry:", addr);

  await reg.connect(cv).addIssuer(cx.address, "Trung tam dao tao X");
  await reg.connect(cv).addIssuer(cy.address, "Trung tam dao tao Y");
  await reg.connect(cv).addIssuer(bob.address, "Trung t\u0430m dao tao X");

  const fileA = fs.readFileSync("/tmp/demo/bang-that.pdf");
  const fileB = fs.readFileSync("/tmp/demo/bang-thu-hoi.pdf");
  const hA = hre.ethers.keccak256(fileA), hB = hre.ethers.keccak256(fileB);
  await reg.connect(cx).issueCertificate(hA, alice.address);
  await reg.connect(cx).issueCertificate(hB, alice.address);
  await reg.connect(cx).revokeCertificate(await reg.certIdOf(cx.address, hB));

  console.log(JSON.stringify({ addr, issuerX: cx.address, issuerY: cy.address,
    holder: alice.address, hashA: hA, hashB: hB }, null, 0));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
