// Tái dựng trên node local ĐÚNG trạng thái Sepolia của bản V3 (docs/sepolia-evidence.md):
// cùng địa chỉ contract (ví owner ở nonce 0), cùng DEPLOY_BLOCK 11890480 và cùng 8 giao dịch
// của scripts/seed-sepolia.js ở đúng số block. Ví owner/issuer được MẠO DANH (hardhat_impersonateAccount),
// không cần khóa riêng.
//
// Lô Merkle (cách "lai", tác giả chốt 15/10/2026):
//  - có receipts/sepolia-demo/ (bị .gitignore vì chứa salt) → đọc salt từ biên nhận thật, dựng lại root và
//    assert trùng root trên Sepolia;
//  - không có (máy khác, CI) → sinh lô mới bằng scripts/lib/batch.js, biên nhận ghi vào test/e2e/.tmp/receipts/.
// Không biên nhận / salt nào được ghi vào repo.
import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { ROOT, TMP, FIXTURE, NODE_URL, SEPOLIA, REVOKED_SINGLE_TEXT, loDemoText } from "./env";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildBatch, writeReceipts } = require(path.join(ROOT, "scripts", "lib", "batch.js"));

const LEAF_TYPES = ["bytes32", "address", "bytes32"];
const REAL_RECEIPTS = path.join(ROOT, "receipts", "sepolia-demo");

export type Fixture = {
  mode: "sepolia-receipts" | "generated";
  root: string;
  batchId: string;
  receipts: Record<string, string>;   // tên tệp gốc -> đường dẫn biên nhận
  latestBlock: number;
};

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("seed-chain: " + msg);
}

const batchItems = () => [
  { name: "DemoCert2.pdf", bytes: fs.readFileSync(path.join(ROOT, "Demo", "DemoCert2.pdf")) },
  ...[1, 2, 3].map((i) => ({ name: `lo-demo-${i}.txt`, bytes: Buffer.from(loDemoText(i)) })),
];

/** Đọc biên nhận thật; trả null nếu không có hoặc không khớp bản Sepolia. */
function loadRealBatch() {
  if (process.env.E2E_BATCH === "generated") return null;   // ép nhánh sinh lô mới (kiểm như trên CI)
  const csv = path.join(REAL_RECEIPTS, "index.csv");
  if (!fs.existsSync(csv)) return null;
  const map: Record<string, string> = {};
  for (const line of fs.readFileSync(csv, "utf8").trim().split(/\r?\n/).slice(1)) {
    const m = line.match(/^"((?:[^"]|"")*)",(.+)$/);
    if (m) map[m[1].replace(/""/g, '"')] = path.join(REAL_RECEIPTS, m[2].trim());
  }
  const items = batchItems();
  if (!items.every((it) => map[it.name] && fs.existsSync(map[it.name]))) return null;
  const rcs = items.map((it) => JSON.parse(fs.readFileSync(map[it.name], "utf8")));
  assert(rcs.every((r) => r.contract === SEPOLIA.contract && r.issuer === SEPOLIA.issuer),
    "biên nhận trong receipts/sepolia-demo/ không thuộc contract/issuer Sepolia");
  // Mỗi tệp phải băm đúng certHash ghi trong biên nhận (đổi 1 byte là đổi hash).
  items.forEach((it, i) => assert(ethers.keccak256(it.bytes) === rcs[i].certificate.certHash,
    `certHash của ${it.name} không khớp biên nhận`));
  const values = rcs.map((r) => [r.certificate.certHash, r.certificate.holder, r.certificate.salt]);
  const tree = StandardMerkleTree.of(values, LEAF_TYPES);
  assert(tree.root === rcs[0].root, "root dựng lại từ salt khác root trong biên nhận");
  const entries = items.map((it, i) => ({
    file: it.name, certHash: values[i][0], holder: values[i][1], salt: values[i][2],
    inner: ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(LEAF_TYPES, values[i])),
    proof: tree.getProof(i),
  }));
  return { root: tree.root as string, entries, receipts: map, batchId: rcs[0].batchId as string };
}

export async function seedChain(): Promise<Fixture> {
  const p = new ethers.JsonRpcProvider(NODE_URL, undefined, { staticNetwork: true, batchMaxCount: 1 });
  const net = await p.send("eth_chainId", []);
  assert(Number(net) === SEPOLIA.chainId, "node không mang chainId 11155111");
  assert(Number(await p.getBlockNumber()) === 0, "node không mới (đã có block) — dừng node cũ rồi chạy lại");

  for (const a of [SEPOLIA.owner, SEPOLIA.issuer]) {
    await p.send("hardhat_impersonateAccount", [a]);
    await p.send("hardhat_setBalance", [a, "0x" + (10n ** 21n).toString(16)]);
  }
  // Ví issuer cần nonce 0 khi nhận ETH như trên Sepolia không quan trọng; ví OWNER phải ở nonce 0
  // để deploy ra đúng địa chỉ. setBalance không đổi nonce.
  assert(ethers.getCreateAddress({ from: SEPOLIA.owner, nonce: 0 }) === SEPOLIA.contract, "địa chỉ dự kiến sai");

  const owner = new ethers.JsonRpcSigner(p, SEPOLIA.owner);   // mạo danh: không có trong eth_accounts
  const issuer = new ethers.JsonRpcSigner(p, SEPOLIA.issuer);
  const mine = (n: number) => p.send("hardhat_mine", ["0x" + n.toString(16)]);

  // Block kế tiếp = DEPLOY_BLOCK.
  await mine(SEPOLIA.deployBlock - 1);

  const art = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts", "contracts",
    "CredentialRegistry.sol", "CredentialRegistry.json"), "utf8"));
  const factory = new ethers.ContractFactory(art.abi, art.bytecode, owner);
  const reg: any = await factory.deploy(SEPOLIA.inheritDelay);
  const deployRc = await reg.deploymentTransaction()!.wait();
  assert(deployRc!.blockNumber === SEPOLIA.deployBlock, "deploy không rơi vào DEPLOY_BLOCK");
  assert(await reg.getAddress() === SEPOLIA.contract, "địa chỉ contract khác Sepolia");

  const blocks: number[] = [deployRc!.blockNumber];
  const step = async (tx: Promise<any>) => {
    await mine(1);   // Sepolia: các giao dịch cách nhau 2 block
    const rc = await (await tx).wait();
    blocks.push(rc.blockNumber);
    return rc;
  };
  const asIssuer = reg.connect(issuer);

  await step(owner.sendTransaction({ to: SEPOLIA.issuer, value: ethers.parseEther("0.01") }));
  await step(reg.addIssuer(SEPOLIA.issuer, SEPOLIA.issuerName));
  const hashValid = ethers.keccak256(fs.readFileSync(path.join(ROOT, "Demo", "DemoCert.pdf")));
  await step(asIssuer.issueCertificate(hashValid, SEPOLIA.holder));
  const hashRevoked = ethers.keccak256(ethers.toUtf8Bytes(REVOKED_SINGLE_TEXT));
  await step(asIssuer.issueCertificate(hashRevoked, SEPOLIA.holder));
  await step(asIssuer.revokeCertificate(await reg.certIdOf(SEPOLIA.issuer, hashRevoked)));

  const real = loadRealBatch();
  const items = batchItems();
  const batch = real ?? buildBatch(items);
  const batchRc = await step(asIssuer.publishBatch(batch.root, items.length));
  const batchId: string = await reg.batchIdOf(SEPOLIA.issuer, batch.root);
  const revoked = batch.entries[3];
  await step(asIssuer.revokeLeaf(batchId, batch.root, revoked.inner, revoked.proof));

  // Đúng block của 8 giao dịch trên Sepolia (docs/sepolia-evidence.md).
  const want = [11890480, 11890482, 11890484, 11890486, 11890488, 11890490, 11890492, 11890494];
  assert(JSON.stringify(blocks) === JSON.stringify(want), "số block khác Sepolia: " + blocks.join(","));

  let receipts: Record<string, string>;
  if (real) {
    assert(batchId === real.batchId, "batchId khác biên nhận");
    receipts = real.receipts;
  } else {
    const dir = path.join(TMP, "receipts");
    const meta = {
      chainId: SEPOLIA.chainId, contract: SEPOLIA.contract, issuer: SEPOLIA.issuer,
      issuerName: SEPOLIA.issuerName, root: batch.root, batchId, txHash: batchRc.hash,
      blockNumber: batchRc.blockNumber, issuedAt: (await p.getBlock(batchRc.blockNumber))!.timestamp,
    };
    writeReceipts(dir, meta, batch.entries);
    receipts = {};
    batch.entries.forEach((e: any, i: number) => {
      receipts[e.file] = path.join(dir, `${String(i + 1).padStart(3, "0")}-${e.certHash.slice(2, 10)}.receipt.json`);
    });
  }

  // Trạng thái cuối phải khớp bảng "đọc lại từ chuỗi công khai" của sepolia-evidence.
  const v1 = await reg.verifyCertificate(SEPOLIA.issuer, hashValid);
  const v2 = await reg.verifyCertificate(SEPOLIA.issuer, hashRevoked);
  assert(v1.valid && Number(v1.status) === 1 && !v2.valid && Number(v2.status) === 2, "trạng thái cấp lẻ sai");
  const e0 = batch.entries[0];
  const b1 = await reg.verifyInBatch(SEPOLIA.issuer, batch.root, e0.certHash, e0.holder, e0.salt, e0.proof);
  const b4 = await reg.verifyInBatch(SEPOLIA.issuer, batch.root, revoked.certHash, revoked.holder, revoked.salt, revoked.proof);
  assert(b1.valid && b1.inBatch && !b1.leafRevoked && !b4.valid && b4.inBatch && b4.leafRevoked, "trạng thái lô sai");

  // Thêm ~1.000 block rỗng: khoảng DEPLOY_BLOCK → mới nhất vượt 100 block, để ca "RPC giới hạn
  // khoảng block" thật sự phải chia khúc.
  await mine(1000);
  // Block trong dải hardhat_mine dồn là block "để dành": eth_call tại đó trả "0x" (trang báo
  // "could not decode result data"). Trang đọc ở (mới nhất − 2), nên đào thật vài block cuối.
  for (let i = 0; i < 5; i++) await p.send("evm_mine", []);

  const fx: Fixture = {
    mode: real ? "sepolia-receipts" : "generated",
    root: batch.root, batchId, receipts, latestBlock: Number(await p.send("eth_blockNumber", [])),
  };
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(FIXTURE, JSON.stringify(fx, null, 2));
  p.destroy();
  return fx;
}
