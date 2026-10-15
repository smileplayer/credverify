// =============================================================================
//  Ước tính phí issueCertificate / publishBatch / revokeLeaf trên Base mainnet
//  (thẻ T9). CHỈ ĐỌC: không gửi giao dịch, không cần khóa, chỉ eth_call/eth_getBlock.
//
//    npx hardhat run scripts/l2-fee-estimate.js
//    BASE_RPC=... ETH_RPC=... npx hardhat run scripts/l2-fee-estimate.js
//
//  Bước 1 — gas thực thi và calldata THẬT: deploy CredentialRegistry trên mạng
//  Hardhat in-process (hardfork Osaka), gọi từng hàm, đọc gasUsed trong receipt
//  (cùng cách scripts/gas-v3.js). Base đã có các EIP Pectra (Isthmus) và các EIP
//  Osaka đụng tới EVM (Azul: 7825, 7823, 7883, 7939, 7951) — không EIP nào đổi giá
//  SSTORE/SLOAD/KECCAK/LOG/calldata mà các hàm này dùng, nên gasUsed coi như bằng nhau.
//
//  Bước 2 — giá trên Base (docs.base.org, tra 15/10/2026), đọc tại CÙNG một block:
//    phí L2      = gasUsed × (baseFeePerGas + priority)
//    phí L1      = GasPriceOracle(0x42…0F).getL1Fee(tx EIP-1559 chưa ký, RLP)   [Fjord/FastLZ]
//    phí operator = gasUsed × operatorFeeScalar × 100 + operatorFeeConstant      [Jovian]
//                   (scalar/constant đọc từ L1Block 0x42…15)
//  Tx dựng cho getL1Fee: chainId 8453, nonce 100, gasLimit = gasUsed × 1,2,
//  maxFee = 2 × baseFee + priority, `to` = địa chỉ contract trên Sepolia (chỉ để có
//  20 byte thật; Base chưa có contract), data = calldata thật ở bước 1.
//
//  Bước 3 — đối chiếu Ethereum L1: gasUsed × (baseFeePerGas block mới nhất + priority).
//  Giá ETH/USD: Chainlink ETH/USD trên Ethereum mainnet (latestRoundData), in kèm
//  updatedAt. Số liệu thay đổi theo thời điểm chạy — mỗi lần chạy in thời điểm của nó.
// =============================================================================

const hre = require("hardhat");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");

const { ethers } = hre;
const BASE_RPC = process.env.BASE_RPC || "https://mainnet.base.org";
const ETH_RPC = process.env.ETH_RPC || "https://ethereum-rpc.publicnode.com";
const BASE_CHAIN_ID = 8453n;
const GAS_PRICE_ORACLE = "0x420000000000000000000000000000000000000F";
const L1_BLOCK = "0x4200000000000000000000000000000000000015";
const CHAINLINK_ETH_USD = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";   // feed "eth-usd", 8 chữ số thập phân
const PLACEHOLDER_TO = "0x672e08DBF5Ce118a235E36C235b53Fa251dDe7F6";

const GPO_ABI = [
  "function getL1Fee(bytes) view returns (uint256)",
  "function isFjord() view returns (bool)",
  "function l1BaseFee() view returns (uint256)",
  "function blobBaseFee() view returns (uint256)",
  "function baseFeeScalar() view returns (uint32)",
  "function blobBaseFeeScalar() view returns (uint32)",
];
const L1_BLOCK_ABI = [
  "function operatorFeeScalar() view returns (uint32)",
  "function operatorFeeConstant() view returns (uint64)",
];
const FEED_ABI = ["function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)"];

const fmt = (n) => Number(n).toLocaleString("vi-VN");
const gwei = (w) => Number(ethers.formatUnits(w, "gwei")).toPrecision(4);
const eth = (w) => Number(ethers.formatEther(w)).toPrecision(3);
const iso = (sec) => new Date(Number(sec) * 1000).toISOString().replace(".000Z", "Z");

// Bước 1: gasUsed + calldata thật của từng thao tác.
async function measure() {
  const [owner, issuer, holder] = await ethers.getSigners();
  const reg = await (await ethers.getContractFactory("CredentialRegistry")).deploy(48 * 3600);
  await reg.waitForDeployment();
  await (await reg.connect(owner).addIssuer(issuer.address, "Trung tam X")).wait();
  const r = reg.connect(issuer);
  const ops = [];
  const record = async (label, txp) => {
    const tx = await txp;
    ops.push({ label, data: tx.data, gasUsed: (await tx.wait()).gasUsed });
  };

  await record("issueCertificate", r.issueCertificate(ethers.id("l2-fee-le"), holder.address));
  for (const n of [100, 500]) {
    // Salt tất định (keccak của nhãn) để calldata — và do đó phí L1 — lặp lại giữa các lần chạy.
    const rows = Array.from({ length: n }, (_, i) => [
      ethers.id(`l2-fee-${n}-${i}.pdf`), ethers.ZeroAddress, ethers.id(`salt-${n}-${i}`),
    ]);
    const tree = StandardMerkleTree.of(rows, ["bytes32", "address", "bytes32"]);
    await record(`publishBatch (lô ${n})`, r.publishBatch(tree.root, n));
    const batchId = await reg.batchIdOf(issuer.address, tree.root);
    const inner = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "address", "bytes32"], rows[0]));
    const proof = tree.getProof(0);
    await record(`revokeLeaf (lô ${n}, proof ${proof.length} nút)`, r.revokeLeaf(batchId, tree.root, inner, proof));
  }
  return ops;
}

async function main() {
  const ops = await measure();

  const base = new ethers.JsonRpcProvider(BASE_RPC, Number(BASE_CHAIN_ID), { staticNetwork: true });
  const l1 = new ethers.JsonRpcProvider(ETH_RPC, 1, { staticNetwork: true });

  // Bước 2: chốt một block Base, mọi eth_call đọc tại block đó.
  const bBlock = await base.getBlock("latest");
  const at = { blockTag: bBlock.number };
  const bPrio = BigInt(await base.send("eth_maxPriorityFeePerGas", []));
  const gpo = new ethers.Contract(GAS_PRICE_ORACLE, GPO_ABI, base);
  const l1b = new ethers.Contract(L1_BLOCK, L1_BLOCK_ABI, base);
  const [isFjord, l1BaseFee, blobBaseFee, bfScalar, blobScalar, opScalar, opConst] = await Promise.all([
    gpo.isFjord(at), gpo.l1BaseFee(at), gpo.blobBaseFee(at), gpo.baseFeeScalar(at), gpo.blobBaseFeeScalar(at),
    l1b.operatorFeeScalar(at), l1b.operatorFeeConstant(at),
  ]);
  if (!isFjord) throw new Error("GasPriceOracle báo chưa Fjord — công thức phí L1 khác, dừng.");

  // Bước 3: Ethereum L1 + giá ETH/USD (Chainlink).
  const eBlock = await l1.getBlock("latest");
  const ePrio = BigInt(await l1.send("eth_maxPriorityFeePerGas", []));
  const [, answer, , updatedAt] = await new ethers.Contract(CHAINLINK_ETH_USD, FEED_ABI, l1).latestRoundData({ blockTag: eBlock.number });
  const usdPerEth = Number(answer) / 1e8;
  const usd = (w) => (Number(ethers.formatEther(w)) * usdPerEth).toPrecision(3);

  const rows = [];
  for (const op of ops) {
    const g = op.gasUsed;
    const unsigned = ethers.Transaction.from({
      type: 2, chainId: BASE_CHAIN_ID, nonce: 100, to: PLACEHOLDER_TO, value: 0n, data: op.data,
      gasLimit: (g * 12n) / 10n, maxPriorityFeePerGas: bPrio, maxFeePerGas: 2n * bBlock.baseFeePerGas + bPrio,
    }).unsignedSerialized;
    const l1Fee = await gpo.getL1Fee(unsigned, at);
    const l2Fee = g * (bBlock.baseFeePerGas + bPrio);
    const opFee = g * BigInt(opScalar) * 100n + BigInt(opConst);
    const baseTotal = l2Fee + l1Fee + opFee;
    const ethFee = g * (eBlock.baseFeePerGas + ePrio);
    rows.push({ op, l1Fee, l2Fee, opFee, baseTotal, ethFee, calldata: (op.data.length - 2) / 2 });
  }

  const out = [];
  out.push(`Thời điểm: Base block ${bBlock.number} (${iso(bBlock.timestamp)}); Ethereum block ${eBlock.number} (${iso(eBlock.timestamp)}).`);
  out.push(`Base: baseFee ${gwei(bBlock.baseFeePerGas)} gwei, priority (eth_maxPriorityFeePerGas) ${gwei(bPrio)} gwei; GasPriceOracle isFjord = ${isFjord}, l1BaseFee ${gwei(l1BaseFee)} gwei, blobBaseFee ${gwei(blobBaseFee)} gwei, baseFeeScalar ${bfScalar}, blobBaseFeeScalar ${blobScalar}; L1Block operatorFeeScalar ${opScalar}, operatorFeeConstant ${opConst}.`);
  out.push(`Ethereum L1: baseFee ${gwei(eBlock.baseFeePerGas)} gwei, priority ${gwei(ePrio)} gwei.`);
  out.push(`ETH/USD = ${usdPerEth.toFixed(2)} (Chainlink ${CHAINLINK_ETH_USD}, updatedAt ${iso(updatedAt)}).`);
  out.push("");
  out.push("| Thao tác | Gas thực thi | Calldata (byte) | Phí L2 thực thi (ETH) | Phí L1 data (ETH) | Phí operator (ETH) | **Tổng trên Base (ETH)** | **Tổng trên Base (USD)** | Trên Ethereum L1 (ETH) | Trên Ethereum L1 (USD) | L1 / Base |");
  out.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const x of rows) {
    const ratio = Number(x.ethFee) / Number(x.baseTotal);
    out.push(`| \`${x.op.label}\` | ${fmt(x.op.gasUsed)} | ${x.calldata} | ${eth(x.l2Fee)} | ${eth(x.l1Fee)} | ${eth(x.opFee)} | **${eth(x.baseTotal)}** | **${usd(x.baseTotal)}** | ${eth(x.ethFee)} | ${usd(x.ethFee)} | ${ratio.toFixed(0)}× |`);
  }
  console.log(out.join("\n"));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
