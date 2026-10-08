// Đo chi phí theo số đơn vị phát hành trên contract V3.
//   npx hardhat run scripts/scale-probe.js
// V3 không có hàm view duyệt danh bạ (findByHash, listActiveIssuers, knownIssuers của V2), nên
// mọi cột dưới đây phải KHÔNG ĐỔI khi số đơn vị tăng. Số đo trước khi gỡ: docs/SCALE-NAMES.md.
const hre = require("hardhat");
async function main() {
  const [cv, x, alice] = await hre.ethers.getSigners();
  const F = await hre.ethers.getContractFactory("CredentialRegistry");
  const reg = await F.deploy(60); await reg.waitForDeployment();
  const HASH = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("mot-tep.pdf"));
  await reg.connect(cv).addIssuer(x.address, "Trung tam X");
  await reg.connect(x).issueCertificate(HASH, alice.address);

  console.log("N issuer | addIssuer thu N (gas) | verifyCertificate (gas) | issueCertificate (gas)");
  const marks = [10, 50, 100, 200, 400];
  let made = 1, i = 0;
  for (const N of marks) {
    let add = 0n;
    while (made < N) {
      add = (await (await reg.connect(cv).addIssuer(hre.ethers.Wallet.createRandom().address,
        "TT-" + String(made).padStart(4, "0"))).wait()).gasUsed;
      made++;
    }
    const v = await reg.verifyCertificate.estimateGas(x.address, HASH);
    const iss = (await (await reg.connect(x).issueCertificate(hre.ethers.id("t-" + i++), alice.address)).wait()).gasUsed;
    console.log(`${String(N).padStart(8)} | ${String(add).padStart(22)} | ${String(v).padStart(23)} | ${String(iss).padStart(22)}`);
  }

  // V2 có trần 8 đời kế nhiệm (MAX_INHERIT_HOPS). V3 kiểm quyền thu hồi bằng identityOf (O(1)):
  // vòng dưới đây phải in "CO" cho cả 11 đời.
  console.log("\n--- Chuoi ke nhiem (V3: khong con tran) ---");
  const reg2 = await F.deploy(60); await reg2.waitForDeployment();
  const keys = [];
  for (let k = 0; k < 12; k++) keys.push(hre.ethers.Wallet.createRandom().connect(hre.ethers.provider));
  await cv.sendTransaction({ to: keys[0].address, value: hre.ethers.parseEther("1") });
  await reg2.connect(cv).addIssuer(keys[0].address, "Trung tam X");
  await reg2.connect(keys[0]).issueCertificate(HASH, cv.address);
  const certId = await reg2.certIdOf(keys[0].address, HASH);
  for (let k = 1; k <= 11; k++) {
    await cv.sendTransaction({ to: keys[k].address, value: hre.ethers.parseEther("1") });
    await reg2.connect(cv).proposeInherit(keys[k - 1].address, keys[k].address, 0);
    await hre.network.provider.send("evm_increaseTime", [61]);   // > INHERIT_DELAY (60 giây)
    await reg2.connect(cv).executeInherit(keys[k - 1].address);
    let ok = true;
    try { await reg2.connect(keys[k]).revokeCertificate.staticCall(certId); } catch { ok = false; }
    console.log(`  doi thu ${String(k).padStart(2)}: thu hoi duoc chung chi goc? ${ok ? "CO" : "KHONG"}`);
    if (!ok) break;
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
