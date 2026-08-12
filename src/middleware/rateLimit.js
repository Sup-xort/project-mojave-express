// plan.md 9절 체크리스트: "정적 파일 외 모든 API에 기본 rate limit 적용".
// 단일 프로세스 기준 인메모리 슬라이딩 카운터. 별도 저장소 없이 충분한 규모(소형 매장 1대)를 가정한다.
const { appError } = require('./errors');

function apiRateLimit({ windowMs = 60_000, max = 300 } = {}) {
  const hits = new Map(); // key -> [timestamps]

  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, arr] of hits) {
      const kept = arr.filter((t) => t > cutoff);
      if (kept.length === 0) hits.delete(key);
      else hits.set(key, kept);
    }
  }, windowMs).unref();

  return function rateLimitMiddleware(req, res, next) {
    // 매장 와이파이를 쓰면 손님 전원이 같은 IP로 보인다. 로그인한 손님/사장님은
    // 세션 쿠키로 개별 식별해 한 명의 요청 폭주가 매장 전체를 막지 않게 한다.
    const sessionCookie = req.cookies && (req.cookies.me_session || req.cookies.owner_session);
    const key = sessionCookie ? `sess:${sessionCookie}` : `ip:${req.ip || 'unknown'}`;
    const now = Date.now();
    const cutoff = now - windowMs;
    const arr = (hits.get(key) || []).filter((t) => t > cutoff);
    arr.push(now);
    hits.set(key, arr);
    if (arr.length > max) {
      next(appError('RATE_LIMITED'));
      return;
    }
    next();
  };
}

module.exports = { apiRateLimit };
