// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import {CredentialRegistry} from "../../contracts/CredentialRegistry.sol";

/// Handler: đóng vai owner, 6 khóa issuer, 3 ví có thể làm owner, 3 ví học viên.
/// Gọi ngẫu nhiên mọi hàm ghi (kể cả gọi SAI vai), tua thời gian, rồi kiểm bất biến sau MỖI bước.
contract Handler is Test {
    CredentialRegistry public reg;
    address[] internal pool;     // 0..5 khóa issuer, 6..8 ví có thể thành owner
    string[] internal names;

    bytes32[] internal certIds;
    struct B { address issuer; bytes32 root; bytes32 batchId; bytes32[2] h; address[2] hd; bytes32[2] s; bytes32[2] inner; bytes32[2] leaf; }
    B[] internal batches;

    mapping(address => uint64) internal firstCompromise;
    mapping(address => uint256) internal proposedAt;   // I10: ghi lúc đề xuất thành công
    mapping(address => bool) internal frozenKey;   // khóa cuối của một danh tính đã đóng băng

    string public why;
    bool internal seenVoided; bool internal seenFrozen; bool internal seenCompExec; bool internal seenFlag;           // rỗng = chưa vi phạm
    mapping(string => uint256) public okCalls;
    string[] internal ops;

    constructor(uint64 delay) {
        reg = new CredentialRegistry(delay);           // handler là owner ban đầu
        for (uint256 i = 0; i < 6; i++) pool.push(vm.addr(1000 + i));
        for (uint256 i = 0; i < 3; i++) pool.push(vm.addr(2000 + i));
        names.push("Trung tam A"); names.push("Trung tam B"); names.push("Trung tam C");
        names.push(unicode"Trung tâm Đà Nẵng"); names.push(unicode"Cơ sở 2 (Hà Nội)"); names.push("Trung tam F");
    }

    // ---------------- tiện ích ----------------
    function _a(uint256 i) internal view returns (address) { return pool[i % pool.length]; }
    function _k(uint256 i) internal view returns (address) { return pool[i % 6]; }
    function _ok(string memory op) internal { if (okCalls[op] == 0) ops.push(op); okCalls[op]++; }
    function _fail(string memory m) internal { if (bytes(why).length == 0) why = m; }

    /// 1 = hiệu lực (Issued / lá hợp lệ), 2 = không hiệu lực. Chứng chỉ lẻ và lá trong lô tách hai mảng
    /// để thêm phần tử mới không làm lệch chỉ số khi so trước/sau.
    struct Snap { uint8[] c; address[] ci; uint8[] b; address[] bi; }
    function _snap() internal view returns (Snap memory x) {
        x.c = new uint8[](certIds.length); x.ci = new address[](certIds.length);
        for (uint256 i = 0; i < certIds.length; i++) {
            x.c[i] = reg.effectiveStatus(certIds[i]) == CredentialRegistry.Status.Issued ? 1 : 2;
            x.ci[i] = reg.getCertificate(certIds[i]).issuer;
        }
        x.b = new uint8[](batches.length * 2); x.bi = new address[](batches.length * 2);
        for (uint256 j = 0; j < batches.length; j++) {
            B storage b = batches[j];
            for (uint256 t = 0; t < 2; t++) {
                bytes32[] memory proof = new bytes32[](1);
                proof[0] = b.leaf[1 - t];
                x.b[2 * j + t] = reg.verifyInBatch(b.issuer, b.root, b.h[t], b.hd[t], b.s[t], proof).valid ? 1 : 2;
                x.bi[2 * j + t] = b.issuer;
            }
        }
    }

    function _cmp(uint8 kind, uint8[] memory s0, uint8[] memory s1, address[] memory iss0) internal {
        for (uint256 i = 0; i < s0.length; i++) {
            if (s0[i] == s1[i]) continue;
            if (frozenKey[reg.currentKeyOf(iss0[i])]) _fail("I5: hieu luc chung chi cua danh tinh DA DONG BANG bi doi");
            if (kind == 0) _fail("I8: thao tac khong lien quan lam doi hieu luc chung chi");
            if (kind == 1 && !(s0[i] == 1 && s1[i] == 2)) _fail("I8: thu hoi lam chung chi CO hieu luc tro lai");
            if (kind == 2 && !(s0[i] == 2 && s1[i] == 1)) _fail("I8: executeInherit lam mat hieu luc chung chi");
        }
    }

    /// kind 0 = không được đổi hiệu lực; 1 = thu hồi (chỉ 1->2); 2 = executeInherit (chỉ 2->1)
    function _after(uint8 kind, Snap memory a) internal {
        Snap memory z = _snap();
        _cmp(kind, a.c, z.c, a.ci);
        _cmp(kind, a.b, z.b, a.bi);
        _global();
    }

    function _i10(address old) internal {
        if (block.timestamp < proposedAt[old] + reg.INHERIT_DELAY()) _fail("I10: chuyen giao truoc khi het INHERIT_DELAY");
    }

    function _global() internal {
        // I2: owner / pendingOwner không bao giờ là issuer
        if (reg.issuerStatus(reg.owner()) != CredentialRegistry.IssuerStatus.None) _fail("I2: owner la issuer");
        address p = reg.pendingOwner();
        if (p != address(0) && reg.issuerStatus(p) != CredentialRegistry.IssuerStatus.None) _fail("I2: pendingOwner la issuer");

        uint256 active;
        for (uint256 i = 0; i < pool.length; i++) {
            address k = pool[i];
            CredentialRegistry.IssuerStatus st = reg.issuerStatus(k);
            if (st == CredentialRegistry.IssuerStatus.Active) {
                active++;
                // I1: tối đa MỘT khóa Active cho mỗi danh tính
                for (uint256 j = i + 1; j < pool.length; j++)
                    if (reg.issuerStatus(pool[j]) == CredentialRegistry.IssuerStatus.Active && reg.identityOf(pool[j]) == reg.identityOf(k))
                        _fail("I1: hai khoa Active cung danh tinh");
            }
            // I4: compromisedAt ghi một lần, không sau lúc công bố
            uint64 c = reg.compromisedAt(k);
            if (firstCompromise[k] == 0) { if (c != 0) firstCompromise[k] = c; }
            else if (c != firstCompromise[k]) _fail("I4: compromisedAt bi ghi lai");
            if (c != 0 && c > reg.compromiseDeclaredAt(k)) _fail("I4: moc lo sau thoi diem cong bo");
            // I5: đánh dấu đóng băng (khóa cuối bị gỡ, chưa kế nhiệm, quá mọi cửa sổ)
            if (st == CredentialRegistry.IssuerStatus.Disabled && reg.inheritedBy(k) == address(0) &&
                block.timestamp > uint256(reg.disabledAt(k)) + reg.RECOVERY_WINDOW() + reg.MAX_INHERIT_DELAY() + reg.PROPOSAL_TTL())
                { frozenKey[k] = true; seenFrozen = true; }
            if (frozenKey[k] && st == CredentialRegistry.IssuerStatus.Active) _fail("I5: danh tinh dong bang song lai");
        }
        // I6: bộ đếm khớp
        if (active != reg.activeIssuerCount()) _fail("I6: activeIssuerCount lech");
        // I3: thu hồi bởi khóa CHƯA bị tuyên bố lộ thì không bao giờ bị vô hiệu
        for (uint256 i = 0; i < certIds.length; i++) {
            CredentialRegistry.Certificate memory c = reg.getCertificate(certIds[i]);
            if (c.status == CredentialRegistry.Status.Revoked && reg.compromisedAt(reg.certRevokedBy(certIds[i])) == 0 &&
                reg.effectiveStatus(certIds[i]) != CredentialRegistry.Status.Revoked) _fail("I3: thu hoi hop le bi vo hieu");
            uint64 cm = reg.compromisedAt(reg.certRevokedBy(certIds[i]));
            if (c.status == CredentialRegistry.Status.Revoked && cm != 0 && c.revokedAt < cm &&
                reg.effectiveStatus(certIds[i]) != CredentialRegistry.Status.Revoked) _fail("I3b: thu hoi TRUOC moc lo bi vo hieu");
            if (c.status == CredentialRegistry.Status.Revoked && reg.effectiveStatus(certIds[i]) == CredentialRegistry.Status.Issued) seenVoided = true;
        }
    }

    // ---------------- thao tác của owner ----------------
    function addIssuer(uint256 a, uint256 n) external {
        Snap memory s = _snap();
        address o = reg.owner();
        vm.prank(o); try reg.addIssuer(_a(a), names[n % names.length]) { _ok("addIssuer"); } catch {}
        _after(0, s);
    }
    function removeIssuer(uint256 a) external {
        Snap memory s = _snap();
        address o = reg.owner();
        vm.prank(o); try reg.removeIssuer(_a(a)) { _ok("removeIssuer"); } catch {}
        _after(0, s);
    }
    function restoreIssuer(uint256 a) external {
        Snap memory s = _snap();
        address o = reg.owner();
        vm.prank(o); try reg.restoreIssuer(_a(a)) { _ok("restoreIssuer"); } catch {}
        _after(0, s);
    }
    function proposeInherit(uint256 a, uint256 b, bool comp, uint256 lb) external {
        Snap memory s = _snap();
        uint64 since = comp ? uint64(block.timestamp - bound(lb, 0, 40 days)) : 0;
        address o = reg.owner();
        vm.prank(o); try reg.proposeInherit(_a(a), _a(b), since) { _ok("proposeInherit"); proposedAt[_a(a)] = block.timestamp; } catch {}
        _after(0, s);
    }
    function cancelInherit(uint256 a) external {
        Snap memory s = _snap();
        address o = reg.owner();
        vm.prank(o); try reg.cancelInherit(_a(a)) { _ok("cancelInherit"); } catch {}
        _after(0, s);
    }
    function executeInherit(uint256 a) external {
        Snap memory s = _snap();
        address o = reg.owner();
        address old = _a(a);
        vm.prank(o); try reg.executeInherit(old) { _ok("executeInherit"); _i10(old); if (reg.compromisedAt(old) != 0) seenCompExec = true; } catch {}
        _after(2, s);
    }
    function transferOwnership(uint256 a) external {
        Snap memory s = _snap();
        address o = reg.owner();
        vm.prank(o); try reg.transferOwnership(_a(a)) { _ok("transferOwnership"); } catch {}
        _after(0, s);
    }
    function acceptOwnership(uint256 a) external {
        Snap memory s = _snap();
        address p = reg.pendingOwner();
        vm.prank(a % 2 == 0 ? p : _a(a)); try reg.acceptOwnership() { _ok("acceptOwnership"); } catch {}
        _after(0, s);
    }
    function cancelOwnershipTransfer() external {
        Snap memory s = _snap();
        address o = reg.owner();
        vm.prank(o); try reg.cancelOwnershipTransfer() { _ok("cancelOwnershipTransfer"); } catch {}
        _after(0, s);
    }
    /// Một ví bất kỳ (kể cả issuer) thử gọi hàm của owner — phải luôn thất bại.
    function strangerAdmin(uint256 a, uint256 b) external {
        Snap memory s = _snap();
        address who = _a(a);
        if (who != reg.owner()) {
            vm.prank(who); try reg.addIssuer(_a(b), "Trung tam X") { _fail("I7: vi la goi duoc addIssuer"); } catch {}
            vm.prank(who); try reg.removeIssuer(_a(b)) { _fail("I7: vi la goi duoc removeIssuer"); } catch {}
            vm.prank(who); try reg.proposeInherit(_a(b), _a(a + 1), 0) { _fail("I7: vi la goi duoc proposeInherit"); } catch {}
            vm.prank(who); try reg.executeInherit(_a(b)) { _fail("I7: vi la goi duoc executeInherit"); } catch {}
        }
        _after(0, s);
    }

    // ---------------- thao tác của issuer ----------------
    function issue(uint256 k, uint256 seed, uint256 h) external {
        Snap memory s = _snap();
        address key = _k(k);
        bytes32 hash = keccak256(abi.encode("cert", seed));
        vm.prank(key);
        try reg.issueCertificate(hash, vm.addr(3000 + h % 3)) returns (bytes32 id) { certIds.push(id); _ok("issueCertificate"); } catch {}
        _after(0, s);
    }
    function revokeCert(uint256 k, uint256 c) external {
        if (certIds.length == 0) return;
        Snap memory s = _snap();
        bytes32 id = certIds[c % certIds.length]; address who = _a(k);
        address orig = reg.getCertificate(id).issuer;
        vm.prank(who); try reg.revokeCertificate(id) { _ok("revokeCertificate");
            if (reg.identityOf(who) != reg.identityOf(orig)) _fail("I9: khoa khac danh tinh thu hoi duoc");
            if (who == reg.owner()) _fail("I9: owner thu hoi duoc"); } catch {}
        _after(1, s);
    }
    function publishBatch(uint256 k, uint256 seed) external {
        Snap memory s = _snap();
        B memory b;
        b.issuer = _k(k);
        for (uint256 t = 0; t < 2; t++) {
            b.h[t] = keccak256(abi.encode("leaf", seed, t));
            b.hd[t] = t == 0 ? vm.addr(3000 + seed % 3) : address(0);
            b.s[t] = keccak256(abi.encode("salt", seed, t));
            b.inner[t] = reg.leafInnerOf(b.h[t], b.hd[t], b.s[t]);
            b.leaf[t] = keccak256(bytes.concat(b.inner[t]));
        }
        b.root = b.leaf[0] < b.leaf[1] ? keccak256(abi.encode(b.leaf[0], b.leaf[1])) : keccak256(abi.encode(b.leaf[1], b.leaf[0]));
        vm.prank(b.issuer);
        try reg.publishBatch(b.root, 2) returns (bytes32 id) { b.batchId = id; batches.push(b); _ok("publishBatch"); } catch {}
        _after(0, s);
    }
    function revokeLeaf(uint256 k, uint256 j, bool which) external {
        if (batches.length == 0) return;
        Snap memory s = _snap();
        B storage b = batches[j % batches.length];
        uint256 t = which ? 1 : 0;
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = b.leaf[1 - t];
        address who = _a(k);
        vm.prank(who); try reg.revokeLeaf(b.batchId, b.root, b.inner[t], proof) { _ok("revokeLeaf");
            if (reg.identityOf(who) != reg.identityOf(b.issuer)) _fail("I9: khoa khac danh tinh thu hoi la duoc"); } catch {}
        _after(1, s);
    }
    /// Thử nộp NÚT TRONG (root) hoặc LÁ thay cho inner — phải luôn thất bại (V34-01).
    function revokeLeafWithNode(uint256 k, uint256 j) external {
        if (batches.length == 0) return;
        Snap memory s = _snap();
        B storage b = batches[j % batches.length];
        bytes32[] memory empty = new bytes32[](0);
        bytes32[] memory p1 = new bytes32[](1); p1[0] = b.leaf[1];
        vm.prank(_a(k)); try reg.revokeLeaf(b.batchId, b.root, b.root, empty) { _fail("V34-01: nop root lam la duoc"); } catch {}
        vm.prank(_a(k)); try reg.revokeLeaf(b.batchId, b.root, b.leaf[0], p1) { _fail("V34-01: nop la thay cho inner duoc"); } catch {}
        _after(0, s);
    }
    function revokeBatch(uint256 k, uint256 j) external {
        if (batches.length == 0) return;
        Snap memory s = _snap();
        B storage bb = batches[j % batches.length]; address who = _a(k);
        vm.prank(who); try reg.revokeBatch(bb.batchId) { _ok("revokeBatch");
            if (reg.identityOf(who) != reg.identityOf(bb.issuer)) _fail("I9: khoa khac danh tinh thu hoi lo duoc"); } catch {}
        _after(1, s);
    }
    /// Kịch bản lộ khóa (tham số ngẫu nhiên): khóa K cấp vài chứng chỉ, "kẻ gian" giữ K thu hồi
    /// một phần, owner gỡ K, đề xuất chuyển sang khóa mới với mốc lộ ngẫu nhiên (có thể sai/quá 30
    /// ngày), tua thời gian ngẫu nhiên (có thể chưa đủ độ trễ / quá hạn đề xuất), rồi thực thi.
    /// Mỗi bước có ảnh chụp và loại thao tác riêng nên I1..I9 vẫn kiểm đủ.
    function compromiseFlow(uint256 k, uint256 n, uint256 lb, uint256 gap, uint256 mask, uint256 w) external {
        address key = _k(k);
        Snap memory s = _snap();
        address o = reg.owner();
        if (reg.issuerStatus(key) == CredentialRegistry.IssuerStatus.None) {
            vm.prank(o); try reg.addIssuer(key, names[n % names.length]) {} catch {}
        }
        _after(0, s);
        for (uint256 t = 0; t < 3; t++) {               // cấp hợp pháp
            s = _snap();
            vm.prank(key);
            try reg.issueCertificate(keccak256(abi.encode("cf", k, n, t, block.timestamp)), vm.addr(3000 + t)) returns (bytes32 id) { certIds.push(id); } catch {}
            _after(0, s);
        }
        s = _snap(); vm.warp(block.timestamp + bound(gap, 1, 20 days)); _after(0, s);
        uint256 since0 = block.timestamp;
        for (uint256 i = 0; i < certIds.length && i < 12; i++) {   // kẻ gian thu hồi theo mặt nạ
            if ((mask >> i) & 1 == 0) continue;
            s = _snap();
            vm.prank(key); try reg.revokeCertificate(certIds[certIds.length - 1 - i]) {} catch {}
            _after(1, s);
        }
        s = _snap(); o = reg.owner();
        vm.prank(o); try reg.removeIssuer(key) {} catch {}
        _after(0, s);
        s = _snap();
        uint64 since = uint64(since0 - bound(lb, 0, 40 days));
        address nk = _k(k + 1 + (n % 5));
        vm.prank(o); try reg.proposeInherit(key, nk, since) { proposedAt[key] = block.timestamp; } catch {}
        _after(0, s);
        s = _snap(); vm.warp(block.timestamp + bound(w, 1, 12 days)); _after(0, s);
        s = _snap(); o = reg.owner();
        vm.prank(o); try reg.executeInherit(key) { _ok("compromiseFlow-exec"); _i10(key); if (reg.compromisedAt(key) != 0) seenCompExec = true; } catch {}
        _after(2, s);
    }

    function warp(uint256 secs) external {
        Snap memory s = _snap();
        vm.warp(block.timestamp + bound(secs, 1, 10 days));
        _ok("warp");
        _after(0, s);
    }

    function stats() external view returns (string memory) {
        return string.concat(seenCompExec ? "C" : "-", seenVoided ? "V" : "-", seenFrozen ? "F" : "-",
            okCalls["executeInherit"] > 0 ? "E" : "-", okCalls["revokeLeaf"] > 0 ? "L" : "-", okCalls["restoreIssuer"] > 0 ? "R" : "-",
            okCalls["acceptOwnership"] > 0 ? "O" : "-");
    }
    function report() external view {
        for (uint256 i = 0; i < ops.length; i++) console.log(ops[i], okCalls[ops[i]]);
        console.log("chung chi le:", certIds.length, " lo:", batches.length);
    }
}

contract CredVerifyInvariants is Test {
    Handler internal h;
    function setUp() public {
        vm.warp(1_790_000_000);
        h = new Handler(uint64(vm.envOr("DELAY", uint256(48 hours))));
        targetContract(address(h));
    }
    /// I1..I8 được kiểm sau MỖI lời gọi trong handler; ở đây chỉ đọc kết quả.
    function invariant_khongViPham() public view { assertEq(h.why(), ""); }
    /// Mỗi lượt chạy ghi một dòng: C = thực thi chuyển giao sau lộ khóa, V = có thu hồi bị vô hiệu, F = có danh tính đóng băng,
    /// E/L/R/O = executeInherit / revokeLeaf / restoreIssuer / acceptOwnership thành công. Đếm số dòng có chữ để biết fuzz đã đi tới nhánh khó bao nhiêu lần.
    function afterInvariant() public { vm.writeLine("cache-foundry/invariant-stats.txt", h.stats()); }
}
