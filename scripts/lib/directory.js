// Dựng danh bạ đơn vị phát hành TỪ EVENT (contract không có hàm view duyệt danh bạ).
// Cùng thuật toán với giao diện app/app.js (hàm loadDirectory).
//
// Phát lại theo đúng thứ tự (block, logIndex):
//   IssuerAdded(a, name)      -> a: Active, gắn tên
//   IssuerRemoved(a)          -> a: Disabled
//   IssuerRestored(a)         -> a: Active
//   IssuerInherited(old, new) -> old: Disabled, ghi chuỗi kế nhiệm
// Kết quả đối chiếu được với `activeIssuerCount()` trên chuỗi: lệch nghĩa là thiếu event.

const EVENTS = ["IssuerAdded", "IssuerRemoved", "IssuerRestored", "IssuerInherited"];

async function buildDirectory(reg, fromBlock = 0) {
  const logs = [];
  for (const ev of EVENTS) logs.push(...(await reg.queryFilter(reg.filters[ev](), fromBlock)));
  logs.sort((x, y) => x.blockNumber - y.blockNumber || x.index - y.index);

  const keys = new Map(); // địa chỉ (lowercase) -> { address, name, status, addedBlock, successor, predecessor }
  const get = (a) => keys.get(String(a).toLowerCase());
  for (const lg of logs) {
    const n = lg.fragment.name, a = lg.args;
    if (n === "IssuerAdded") {
      keys.set(a.issuerAddress.toLowerCase(), { address: a.issuerAddress, name: a.name, status: 1,
        addedBlock: lg.blockNumber, successor: null, predecessor: null });
    } else if (n === "IssuerRemoved") {
      if (get(a.issuerAddress)) get(a.issuerAddress).status = 2;
    } else if (n === "IssuerRestored") {
      if (get(a.issuerAddress)) get(a.issuerAddress).status = 1;
    } else if (n === "IssuerInherited") {
      const o = get(a.oldIssuer), w = get(a.newIssuer);
      if (o) { o.status = 2; o.successor = a.newIssuer; }
      if (w) w.predecessor = a.oldIssuer;
    }
  }
  const all = [...keys.values()];
  return { all, active: all.filter((k) => k.status === 1), byAddress: get };
}

module.exports = { buildDirectory, EVENTS };
