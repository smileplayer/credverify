const hre = require("hardhat");
async function main() {
  const [cv] = await hre.ethers.getSigners();
  const F = await hre.ethers.getContractFactory("CredentialRegistry");
  const reg = await F.deploy(); await reg.waitForDeployment();
  const HASH = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("mot-tep.pdf"));

  console.log("N issuer | findByHash (gas) | listActiveIssuers (gas)");
  const marks = [10, 50, 100, 200, 400];
  let made = 0;
  for (const N of marks) {
    while (made < N) {
      const w = hre.ethers.Wallet.createRandom();
      await reg.connect(cv).addIssuer(w.address, "TT-" + made);
      made++;
    }
    const g1 = await reg.findByHash.estimateGas(HASH);
    const g2 = await reg.listActiveIssuers.estimateGas();
    console.log(`${String(N).padStart(8)} | ${String(g1).padStart(16)} | ${String(g2).padStart(21)}`);
  }
  // Gioi han hop cua chuoi ke nhiem
  console.log("\n--- MAX_INHERIT_HOPS ---");
  const reg2 = await F.deploy(); await reg2.waitForDeployment();
  const keys = [];
  for (let i = 0; i < 12; i++) keys.push(hre.ethers.Wallet.createRandom().connect(hre.ethers.provider));
  await cv.sendTransaction({ to: keys[0].address, value: hre.ethers.parseEther("1") });
  await reg2.connect(cv).addIssuer(keys[0].address, "Trung tam X");
  await reg2.connect(keys[0]).issueCertificate(HASH, cv.address);
  const certId = await reg2.certIdOf(keys[0].address, HASH);
  for (let i = 1; i <= 11; i++) {
    await cv.sendTransaction({ to: keys[i].address, value: hre.ethers.parseEther("1") });
    await reg2.connect(cv).inheritIssuer(keys[i-1].address, keys[i].address);
    let ok = true;
    try { await reg2.connect(keys[i]).revokeCertificate.staticCall(certId); } catch { ok = false; }
    console.log(`  doi thu ${String(i).padStart(2)}: thu hoi duoc chung chi goc? ${ok ? "CO" : "KHONG"}`);
    if (!ok) break;
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
