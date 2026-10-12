// Thí nghiệm mạo danh có đối chứng (kiểu Block.co): cùng tám kịch bản trên CredVerify và trên đối chứng
// IET 2026 (contracts/attack/IetStyleRegistry.sol + scripts/lib/iet-verify.js). Thiết kế: docs/IMPERSONATION.md.
const { ietBuild, ietVerify } = require("./iet-verify");
const { buildBatch } = require("./batch");

const VICTIM_NAME = "Trung tâm Đào tạo Sao Mai";   // tên hư cấu
const MILL_NAME = "Trung tâm Đào tạo Bình Minh";    // đơn vị được công nhận nhưng gian lận

async function reason(p) {
  try { const tx = await p; await tx.wait(); return { ok: true, gas: (await tx.wait()).gasUsed }; }
  catch (e) {
    const m = (e.message || "").match(/custom error '([A-Za-z]+)\(/) || (e.message || "").match(/reverted with reason string '([^']+)'/);
    return { ok: false, err: m ? m[1] : (e.shortMessage || e.message).slice(0, 80) };
  }
}

async function run(hre, { delay = 60 } = {}) {
  const { ethers } = hre;
  const [owner, victim, attacker, mill, successor, holder] = await ethers.getSigners();
  const send = (m, p) => hre.network.provider.send(m, p);
  const now = async () => (await ethers.provider.getBlock("latest")).timestamp;
  const rows = [];
  const row = (id, scenario, iet, cv) => rows.push({ id, scenario, iet, cv });
  const H = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

  // ---------------- Dựng hai hệ thống, nạn nhân cấp chứng chỉ thật ----------------
  const CV = await (await ethers.getContractFactory("CredentialRegistry")).deploy(delay);
  const IetInst = await (await ethers.getContractFactory("IetStyleInstitution")).deploy();
  const IetRec = await (await ethers.getContractFactory("IetStyleAcademicRecord")).deploy();
  await (await CV.connect(owner).addIssuer(victim.address, VICTIM_NAME)).wait();
  await (await CV.connect(owner).addIssuer(mill.address, MILL_NAME)).wait();
  await (await IetInst.connect(victim).register(VICTIM_NAME, "daotao@saomai.example")).wait();

  const genuineHash = H("CredVerify-exp: chung chi THAT cap le cua Sao Mai");
  await (await CV.connect(victim).issueCertificate(genuineHash, holder.address)).wait();
  const genuineItems = [
    { name: "that-1.pdf", bytes: Buffer.from("chung chi that #1 Sao Mai"), holder: holder.address },
    { name: "that-2.pdf", bytes: Buffer.from("chung chi that #2 Sao Mai"), holder: holder.address },
  ];
  const gBatch = buildBatch(genuineItems);
  await (await CV.connect(victim).publishBatch(gBatch.root, 2)).wait();
  const ietRows = [
    { address: holder.address, title: "Chung chi Blockchain co ban", name: "Hoc vien A", description: "Dat", issueDate: "2026-10-01" },
    { address: holder.address, title: "Chung chi Solidity", name: "Hoc vien A", description: "Dat", issueDate: "2026-10-01" },
  ];
  const ietGenuine = ietBuild(ietRows, victim.address);
  await (await IetRec.connect(victim).AddRecord(ietGenuine.root)).wait();

  // Quy tắc kết luận của giao diện CredVerify.
  const cvAcceptSingle = async (issuer, hash) => {
    const r = await CV.verifyCertificate(issuer, hash);
    return { accept: r.valid && !r.issuedAfterCompromise, r };
  };
  const cvAcceptBatch = async (receipt) => {
    const r = await CV.verifyInBatch(receipt.issuer, receipt.root, receipt.certHash, receipt.holder, receipt.salt, receipt.proof);
    return { accept: r.valid && !r.issuedAfterCompromise && (!receipt.issuerName || receipt.issuerName === r.issuerDisplayName), r };
  };
  const rec = (issuer, batch, i, issuerName) => ({ issuer, root: batch.root, ...batch.entries[i], issuerName });

  const base = {
    iet: (await ietVerify(ietGenuine.jsons[0], IetRec)).verified,
    cvSingle: (await cvAcceptSingle(victim.address, genuineHash)).accept,
    cvBatch: (await cvAcceptBatch(rec(victim.address, gBatch, 0, VICTIM_NAME))).accept,
  };

  // ---------------- E1. Ví lạ tự đăng ký làm đơn vị, lấy đúng tên nạn nhân ----------------
  {
    const i = await reason(IetInst.connect(attacker).register(VICTIM_NAME, "fake@example.com"));
    const c = await reason(CV.connect(attacker).addIssuer(attacker.address, VICTIM_NAME));
    row("E1", "Ví lạ tự đăng ký làm đơn vị phát hành, dùng đúng tên nạn nhân",
      { attackSucceeds: i.ok, detail: i.ok ? "register() thành công — hai ví cùng tên" : i.err },
      { attackSucceeds: c.ok, detail: c.ok ? "addIssuer thành công" : "addIssuer: " + c.err });
  }

  // ---------------- E2. Ví lạ ghi một chứng chỉ/lô lên sổ ----------------
  const fakeRows = [{ address: holder.address, title: "Chung chi Blockchain nang cao", name: "Ke gia mao", description: "Xuat sac", issueDate: "2026-10-05" }];
  {
    const ietFake = ietBuild(fakeRows, victim.address);
    const i = await reason(IetRec.connect(attacker).AddRecord(ietFake.root));
    const c1 = await reason(CV.connect(attacker).issueCertificate(H("gia mao E2"), holder.address));
    const c2 = await reason(CV.connect(attacker).publishBatch(H("root gia E2"), 1));
    row("E2", "Ví chưa được công nhận ghi chứng chỉ/lô lên sổ",
      { attackSucceeds: i.ok, detail: i.ok ? "AddRecord() thành công (public, không kiểm soát truy cập)" : "bị chặn: " + i.err },
      { attackSucceeds: c1.ok || c2.ok, detail: "issueCertificate: " + (c1.ok ? "thành công" : c1.err) + " · publishBatch: " + (c2.ok ? "thành công" : c2.err) });
  }

  // ---------------- E3. Block.co: chứng chỉ giả tự khai là của nạn nhân ----------------
  {
    const ietFake = ietBuild(fakeRows, victim.address);
    const v = await ietVerify(ietFake.jsons[0], IetRec);
    // Ví lạ không ghi được gì lên CredVerify; nó chỉ dựng được biên nhận giả trỏ nạn nhân.
    const fakeBatch = buildBatch([{ name: "gia.pdf", bytes: Buffer.from("bang gia E3"), holder: holder.address }]);
    const c = await cvAcceptBatch(rec(victim.address, fakeBatch, 0, VICTIM_NAME));
    row("E3", "Chứng chỉ giả tự khai đơn vị cấp là nạn nhân (lõi tấn công Block.co)",
      { attackSucceeds: v.verified && v.shownInstitution === victim.address,
        detail: `trang báo "${v.verified ? "Verified" : "Not Exist"}", Institution Address = ví nạn nhân (lấy từ JSON)` },
      { attackSucceeds: c.accept, detail: `verifyInBatch(nạn nhân, root giả): batchExists=${c.r.batchExists} → "Không tìm thấy lô"` });
  }

  // ---------------- E4. Đơn vị ĐƯỢC công nhận (lò bằng) giả làm nạn nhân ----------------
  {
    const ietFake = ietBuild([{ ...fakeRows[0], title: "Chung chi E4" }], victim.address);
    await (await IetInst.connect(mill).register(MILL_NAME, "bm@example.com")).wait();
    await (await IetRec.connect(mill).AddRecord(ietFake.root)).wait();
    const v = await ietVerify(ietFake.jsons[0], IetRec);
    const millBatch = buildBatch([{ name: "gia-e4.pdf", bytes: Buffer.from("bang gia E4"), holder: holder.address }]);
    await (await CV.connect(mill).publishBatch(millBatch.root, 1)).wait();
    const asVictim = await cvAcceptBatch(rec(victim.address, millBatch, 0, VICTIM_NAME));        // biên nhận ghi issuer = nạn nhân
    const nameLie = await cvAcceptBatch(rec(mill.address, millBatch, 0, VICTIM_NAME));           // issuer thật, tên khai là nạn nhân
    row("E4", "Đơn vị được công nhận (lò bằng) cấp chứng chỉ rồi khai là của nạn nhân",
      { attackSucceeds: v.verified && v.shownInstitution === victim.address, detail: "Verified, Institution Address = ví nạn nhân" },
      { attackSucceeds: asVictim.accept || nameLie.accept,
        detail: `biên nhận trỏ nạn nhân: batchExists=${asVictim.r.batchExists}; biên nhận trỏ đúng ví lò bằng nhưng khai tên nạn nhân: ` +
                `tên trên chuỗi "${nameLie.r.issuerDisplayName}" ≠ tên khai → "Tên đơn vị không khớp". Lô hợp lệ nhưng công khai là của lò bằng` });
  }

  // ---------------- E5. Tên gần giống (homoglyph, dấu câu, khoảng trắng, bỏ dấu) ----------------
  {
    const variants = [
      ["trùng y hệt", VICTIM_NAME],
      ["chữ Kirin 'а' thay 'a'", VICTIM_NAME.replace("Sao", "Sаo")],
      ["thêm dấu chấm", VICTIM_NAME + "."],
      ["khoảng trắng cuối", VICTIM_NAME + " "],
      ["hai khoảng trắng", VICTIM_NAME.replace(" Sao", "  Sao")],
      ["bỏ dấu tiếng Việt", "Trung tam Dao tao Sao Mai"],
      ["thêm hậu tố", VICTIM_NAME + " 2"],
    ];
    const out = [];
    for (const [label, name] of variants) {
      const w = ethers.Wallet.createRandom().address;
      const c = await reason(CV.connect(owner).addIssuer(w, name));
      out.push({ label, cv: c.ok ? "nhận" : c.err });
    }
    const extra = (await ethers.getSigners()).slice(6, 8);
    const i1 = await reason(IetInst.connect(extra[0]).register(variants[1][1], "x@example.com"));
    const i2 = await reason(IetInst.connect(extra[1]).register(variants[2][1], "y@example.com"));
    row("E5", "Đăng ký tên gần giống tên nạn nhân (giả định ví đã được owner công nhận ở CredVerify)",
      { attackSucceeds: i1.ok && i2.ok, detail: "register() nhận mọi chuỗi (đã thử Kirin, dấu chấm); E1 cho thấy nhận cả tên trùng y hệt" },
      { attackSucceeds: out.some((o) => o.cv === "nhận"), partial: true, variants: out,
        detail: out.map((o) => `${o.label}: ${o.cv}`).join(" · ") });
  }

  // ---------------- E6. Sửa dữ liệu chứng chỉ thật nhưng giữ root ----------------
  {
    const tampered = JSON.parse(JSON.stringify(ietGenuine.jsons[0]));
    tampered.data.description = "Xuat sac";
    const v = await ietVerify(tampered, IetRec);
    const t = rec(victim.address, gBatch, 0, VICTIM_NAME);
    const c = await cvAcceptBatch({ ...t, certHash: H("tep da bi sua") });
    const s = await cvAcceptSingle(victim.address, H("tep le da bi sua"));
    row("E6", "Sửa nội dung chứng chỉ thật, giữ nguyên root/biên nhận",
      { attackSucceeds: v.verified, detail: `Merkle proof ${v.integrity ? "đúng" : "sai"} → "${v.verified ? "Verified" : "Not Exist"}" (bản Main hiện tại có kiểm proof)` },
      { attackSucceeds: c.accept || s.accept, detail: `lô: inBatch=${c.r.inBatch}; cấp lẻ: không có bản ghi cho hash mới` });
  }

  // ---------------- E7. Khóa của nạn nhân bị lộ ----------------
  {
    const tLeak = (await now()) + 1;
    const fakeHash = H("bang gia cap bang khoa bi lo");
    await (await CV.connect(victim).issueCertificate(fakeHash, attacker.address)).wait();
    await (await CV.connect(victim).revokeCertificate(await CV.certIdOf(victim.address, genuineHash))).wait();
    const ietFake = ietBuild([{ ...fakeRows[0], title: "Chung chi E7" }], victim.address);
    await (await IetRec.connect(victim).AddRecord(ietFake.root)).wait();

    const before = { fake: (await cvAcceptSingle(victim.address, fakeHash)).accept, genuine: (await cvAcceptSingle(victim.address, genuineHash)).accept };
    // Phản ứng: gỡ khóa, đề xuất chuyển giao với mốc lộ, chờ INHERIT_DELAY, thực thi.
    await (await CV.connect(owner).removeIssuer(victim.address)).wait();
    const after1 = await reason(CV.connect(victim).issueCertificate(H("bang gia sau khi go"), attacker.address));
    await (await CV.connect(owner).proposeInherit(victim.address, successor.address, tLeak)).wait();
    await send("evm_increaseTime", [delay]); await send("evm_mine", []);
    await (await CV.connect(owner).executeInherit(victim.address)).wait();
    const fakeAfter = await cvAcceptSingle(victim.address, fakeHash);
    const genAfter = await cvAcceptSingle(victim.address, genuineHash);
    const ietAfter = await ietVerify(ietFake.jsons[0], IetRec);
    row("E7", "Khóa nạn nhân bị lộ: kẻ tấn công cấp bằng giả và thu hồi bằng thật; hệ thống phản ứng",
      { attackSucceeds: ietAfter.verified, detail: "bằng giả \"Verified\" vĩnh viễn: không có thu hồi, không có cách đánh dấu khóa lộ; bằng thật không thu hồi được nên cũng không bị phá" },
      { attackSucceeds: fakeAfter.accept || !genAfter.accept, label: "Thành công tới khi owner phản ứng, sau đó bị vô hiệu",
        detail: `trước phản ứng: giả ${before.fake ? "được chấp nhận" : "bị từ chối"}, thật ${before.genuine ? "hợp lệ" : "bị thu hồi"}; ` +
                `sau gỡ khóa: khóa lộ ký tiếp → ${after1.ok ? "thành công" : after1.err}; sau chuyển giao (mốc lộ, chờ ${delay}s): ` +
                `giả issuedAfterCompromise=${fakeAfter.r.issuedAfterCompromise} → bị từ chối; thật revocationVoided=${genAfter.r.revocationVoided} → hợp lệ trở lại`,
        before, fakeAfter: fakeAfter.accept, genuineAfter: genAfter.accept });
  }

  // ---------------- E8. Đơn vị cấp biến mất ----------------
  {
    await (await CV.connect(owner).removeIssuer(mill.address)).wait();
    const gb = gBatch.entries[1];
    const genuineBatch = await CV.verifyInBatch(victim.address, gBatch.root, gb.certHash, gb.holder, gb.salt, gb.proof);
    const v = await ietVerify(null, IetRec);   // JSON không còn được ghim trên IPFS
    row("E8", "Đơn vị cấp ngừng hoạt động, ngừng ghim dữ liệu/ngừng vận hành web",
      { attackSucceeds: null, stillVerifiable: v.verified, detail: "trang chỉ lấy JSON qua gateway IPFS theo CID; JSON mất → \"Not Exist\"; học viên không tự nộp được dữ liệu" },
      { attackSucceeds: null, stillVerifiable: genuineBatch.valid,
        detail: `lô thật do khóa cũ (đã ngừng) đăng: valid=${genuineBatch.valid}, issuerState=${genuineBatch.issuerState} (2 = ngừng), tên "${genuineBatch.issuerDisplayName}"` });
  }
  return { base, rows, addresses: { CV: await CV.getAddress(), IetRec: await IetRec.getAddress(), IetInst: await IetInst.getAddress() } };
}

/** Bảng kết quả markdown — dùng chung cho docs/IMPERSONATION.md và EVIDENCE.md. */
function resultTable(res) {
  const yes = (b) => (b ? "**Thành công**" : "Bị chặn");
  const cell = (x) => (x.attackSucceeds === null
    ? (x.stillVerifiable ? "Vẫn xác minh được" : "**Không còn xác minh được**")
    : x.label ? x.label : (x.partial && x.attackSucceeds ? "Chặn một phần" : yes(x.attackSucceeds))) + " — " + x.detail.replace(/\|/g, "\\|");
  const out = ["| # | Kịch bản | Đối chứng (IET 2026) | CredVerify V3 |", "|---|---|---|---|"];
  for (const r of res.rows) out.push(`| ${r.id} | ${r.scenario} | ${cell(r.iet)} | ${cell(r.cv)} |`);
  return out.join("\n");
}

module.exports = { run, resultTable, VICTIM_NAME, MILL_NAME };
