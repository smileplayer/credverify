// Logic trang xác minh của hệ thống đối chứng IET 2026 (github.com/nnieru/academic-record-managment,
// Main b9b68f4, frontend/src/pages/verify_status/index.tsx): "Verified" khi Merkle proof đúng và root có
// trên chuỗi; "Institution Address" lấy từ JSON, không đối chiếu với chuỗi. `json = null`: IPFS không trả.
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");

const LEAF = ["string", "string", "string", "string", "string"];
const leafOf = (d) => [d.address, d.title, d.name, d.description, d.issueDate];

/** Dựng các bản ghi + JSON giống trang add_record gốc. `issuerAddress` là giá trị client tự điền. */
function ietBuild(rows, issuerAddress) {
  const tree = StandardMerkleTree.of(rows.map(leafOf), LEAF);
  return {
    root: tree.root,
    jsons: rows.map((r, i) => ({ data: { ...r, issuerAddress }, proof: tree.getProof(i), tree_index: i, root: tree.root })),
  };
}

/** Kết quả mà trang gốc hiển thị. */
async function ietVerify(json, academicRecord) {
  if (!json) return { verified: false, shownInstitution: null, reason: "không lấy được JSON từ IPFS" };
  let integrity = false;
  try { integrity = StandardMerkleTree.verify(json.root, LEAF, leafOf(json.data), json.proof); } catch { integrity = false; }
  const rootOnChain = await academicRecord.isRecordTxHashExist(json.root);
  return {
    verified: integrity && rootOnChain,
    integrity, rootOnChain,
    shownInstitution: json.data.issuerAddress,
    reason: !integrity ? "Merkle proof sai" : !rootOnChain ? "root không có trên chuỗi" : "Verified",
  };
}

module.exports = { ietBuild, ietVerify };
