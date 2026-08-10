// plan.md 섹션 2. 중복 판정과 로그인 조회는 반드시 nickname_key로만 한다.
// NFC 정규화를 빼면 iOS/Android 간 바이트 표현 차이로 같은 별명인데 로그인이 안 되는 버그가 난다.
const STRIP_PATTERN = new RegExp(
  '[\\u0000-\\u001F\\u007F\\u200B-\\u200D\\uFEFF]',
  'g'
);

function normalizeNickname(raw) {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(STRIP_PATTERN, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const MIN_LEN = 1;
const MAX_LEN = 12;

// { ok: true, nickname, key } | { ok: false }
function validateNickname(raw) {
  if (typeof raw !== 'string') return { ok: false };
  const key = normalizeNickname(raw);
  if (key.length < MIN_LEN || key.length > MAX_LEN) return { ok: false };
  const nickname = raw
    .normalize('NFC')
    .replace(STRIP_PATTERN, '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!nickname) return { ok: false };
  return { ok: true, nickname, key };
}

module.exports = { normalizeNickname, validateNickname };
