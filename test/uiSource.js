// Đọc THẲNG mã giao diện app/app.js để test dùng đúng hàm thật, không chép tay.
// Phân tích cú pháp bằng acorn, lấy khai báo cấp cao nhất theo tên.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const acorn = require("acorn");

const SRC = fs.readFileSync(path.join(__dirname, "..", "app", "app.js"), "utf8");
const AST = acorn.parse(SRC, { ecmaVersion: "latest", sourceType: "script" });

function declaration(name) {
  for (const n of AST.body) {
    if (n.type === "FunctionDeclaration" && n.id.name === name) return SRC.slice(n.start, n.end);
    if (n.type === "VariableDeclaration" && n.declarations.some((d) => d.id.name === name)) return SRC.slice(n.start, n.end);
  }
  throw new Error("app.js không có khai báo cấp cao nhất tên " + name);
}

/** Nạp các khai báo đã chọn (theo thứ tự) vào sandbox có `ethers`; trả về object các tên đó. */
function load(names, ethers) {
  const ctx = vm.createContext({ ethers, TextEncoder });
  return vm.runInContext(names.map(declaration).join("\n") + "\n;({" + names.join(",") + "});", ctx);
}

module.exports = { SRC, AST, declaration, load };
