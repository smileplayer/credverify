// Thí nghiệm mạo danh có đối chứng (docs/IMPERSONATION.md): cùng kịch bản trên CredVerify và trên
// contract đối chứng kiểu IET 2026. Test khẳng định KẾT QUẢ của từng kịch bản ở cả hai phía —
// phía đối chứng phải bị tấn công thành công, nếu không thí nghiệm mất ý nghĩa.
const { expect } = require("chai");
const hre = require("hardhat");
const { run } = require("../scripts/lib/impersonation");
const { INHERIT_DELAY } = require("./helpers");

describe("Thí nghiệm mạo danh đơn vị cấp (đối chứng kiểu IET 2026)", function () {
  let res, by;
  before(async () => { res = await run(hre, { delay: INHERIT_DELAY }); by = Object.fromEntries(res.rows.map((r) => [r.id, r])); });

  it("mốc: chứng chỉ thật được chấp nhận ở cả hai hệ thống", () => {
    expect(res.base).to.deep.equal({ iet: true, cvSingle: true, cvBatch: true });
  });
  it("E1 tự đăng ký đúng tên nạn nhân: đối chứng nhận; CredVerify chặn (NotOwner)", () => {
    expect(by.E1.iet.attackSucceeds).to.equal(true);
    expect(by.E1.cv.attackSucceeds).to.equal(false);
    expect(by.E1.cv.detail).to.include("NotOwner");
  });
  it("E2 ví chưa công nhận ghi lên sổ: đối chứng nhận; CredVerify chặn (NotActiveIssuer)", () => {
    expect(by.E2.iet.attackSucceeds).to.equal(true);
    expect(by.E2.cv.attackSucceeds).to.equal(false);
    expect(by.E2.cv.detail).to.include("NotActiveIssuer");
  });
  it("E3 Block.co — bằng giả tự khai là của nạn nhân: đối chứng báo Verified; CredVerify không tìm thấy lô", () => {
    expect(by.E3.iet.attackSucceeds).to.equal(true);
    expect(by.E3.cv.attackSucceeds).to.equal(false);
  });
  it("E4 lò bằng được công nhận giả làm nạn nhân: đối chứng nhận; CredVerify từ chối (lô công khai là của lò bằng)", () => {
    expect(by.E4.iet.attackSucceeds).to.equal(true);
    expect(by.E4.cv.attackSucceeds).to.equal(false);
  });
  it("E5 tên gần giống: CredVerify chặn trùng, Kirin, dấu chấm, khoảng trắng; còn lọt bỏ dấu và hậu tố (giới hạn đã biết)", () => {
    expect(by.E5.iet.attackSucceeds).to.equal(true);
    const v = Object.fromEntries(by.E5.cv.variants.map((o) => [o.label, o.cv]));
    expect(v["trùng y hệt"]).to.equal("NameTaken");
    expect(v["chữ Kirin 'а' thay 'a'"]).to.equal("NameNotCanonical");
    expect(v["thêm dấu chấm"]).to.equal("NameNotCanonical");
    expect(v["khoảng trắng cuối"]).to.equal("NameNotCanonical");
    expect(v["hai khoảng trắng"]).to.equal("NameNotCanonical");
    expect(v["bỏ dấu tiếng Việt"]).to.equal("nhận");
    expect(v["thêm hậu tố"]).to.equal("nhận");
  });
  it("E6 sửa nội dung, giữ root: cả hai hệ thống từ chối", () => {
    expect(by.E6.iet.attackSucceeds).to.equal(false);
    expect(by.E6.cv.attackSucceeds).to.equal(false);
  });
  it("E7 khóa lộ: đối chứng giữ bằng giả vĩnh viễn; CredVerify sau phản ứng từ chối bằng giả, khôi phục bằng thật", () => {
    expect(by.E7.iet.attackSucceeds).to.equal(true);
    expect(by.E7.cv.before).to.deep.equal({ fake: true, genuine: false });   // trung thực: trước phản ứng, tấn công có hiệu lực
    expect(by.E7.cv.fakeAfter).to.equal(false);
    expect(by.E7.cv.genuineAfter).to.equal(true);
    expect(by.E7.cv.detail).to.include("NotActiveIssuer");
  });
  it("E8 đơn vị biến mất: đối chứng không còn xác minh được; CredVerify vẫn xác minh được", () => {
    expect(by.E8.iet.stillVerifiable).to.equal(false);
    expect(by.E8.cv.stillVerifiable).to.equal(true);
  });
});
