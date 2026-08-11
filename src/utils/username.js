// 오너 계정 아이디 정규화. nickname.js와 동일한 이유로 NFC를 거치되, 이모지/특수문자를
// 허용할 이유가 없는 로그인용 아이디이므로 영문/숫자/밑줄/하이픈만 허용한다.
const STRIP_PATTERN = new RegExp('[\\u0000-\\u001F\\u007F\\u200B-\\u200D\\uFEFF]', 'g');
const ALLOWED_PATTERN = /^[a-z0-9_-]+$/;

function normalizeUsername(raw) {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(STRIP_PATTERN, '')
    .trim()
    .toLowerCase();
}

const MIN_LEN = 3;
const MAX_LEN = 20;

// { ok: true, username, key } | { ok: false }
function validateUsername(raw) {
  if (typeof raw !== 'string') return { ok: false };
  const key = normalizeUsername(raw);
  if (key.length < MIN_LEN || key.length > MAX_LEN) return { ok: false };
  if (!ALLOWED_PATTERN.test(key)) return { ok: false };
  const username = raw.normalize('NFC').replace(STRIP_PATTERN, '').trim();
  return { ok: true, username, key };
}

module.exports = { normalizeUsername, validateUsername };
