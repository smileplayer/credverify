// INHERIT_DELAY là tham số constructor. Mọi script deploy chọn giá trị qua hàm này:
//   - mặc định 48 giờ (thiết kế production);
//   - biến môi trường INHERIT_DELAY_SECONDS đặt giá trị khác (ví dụ 60 hoặc 3600 cho bản demo);
//   - trên mạng KHÔNG phải local/testnet, từ chối giá trị dưới 24 giờ (contract bất biến sau deploy).

const HOUR = 3600;
const PRODUCTION_DEFAULT = 48 * HOUR;
const PRODUCTION_FLOOR = 24 * HOUR;
const MIN = 60;            // khớp MIN_INHERIT_DELAY của contract
const MAX = 7 * 24 * HOUR; // khớp MAX_INHERIT_DELAY của contract

// Mạng thử nghiệm được phép dùng độ trễ ngắn: Hardhat, Sepolia, Base Sepolia, Arbitrum Sepolia.
const TEST_CHAINS = new Set([31337, 11155111, 84532, 421614]);

/** @returns {number} số giây; ném lỗi nếu giá trị không hợp lệ cho mạng này. */
function resolveInheritDelay(envValue, chainId) {
  const id = Number(chainId);
  let v = PRODUCTION_DEFAULT;
  if (envValue !== undefined && String(envValue).trim() !== "") {
    if (!/^\d+$/.test(String(envValue).trim())) throw new Error("INHERIT_DELAY_SECONDS phải là số nguyên giây");
    v = Number(String(envValue).trim());
  }
  if (v < MIN || v > MAX) throw new Error(`INHERIT_DELAY phải trong [${MIN}, ${MAX}] giây (contract sẽ từ chối)`);
  if (!TEST_CHAINS.has(id) && v < PRODUCTION_FLOOR) {
    throw new Error(`chainId ${id} không phải mạng thử nghiệm: INHERIT_DELAY tối thiểu ${PRODUCTION_FLOOR} giây (24 giờ)`);
  }
  return v;
}

function humanDelay(sec) {
  if (sec % (24 * HOUR) === 0) return sec / (24 * HOUR) + " ngày";
  if (sec % HOUR === 0) return sec / HOUR + " giờ";
  if (sec % 60 === 0) return sec / 60 + " phút";
  return sec + " giây";
}

module.exports = { resolveInheritDelay, humanDelay, PRODUCTION_DEFAULT, PRODUCTION_FLOOR, TEST_CHAINS, MIN, MAX };
