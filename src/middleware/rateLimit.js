// plan.md 9절 체크리스트: "정적 파일 외 모든 API에 기본 rate limit 적용".
// 단일 프로세스 기준 인메모리 슬라이딩 카운터. 별도 저장소 없이 충분한 규모(소형 매장 1대)를 가정한다.
const { appError } = require('./errors');

function apiRateLimit({ windowMs = 60_000, max = 120 } = {}) {
  const hits = new Map(); // ip -> [timestamps]

  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, arr] of hits) {
      const kept = arr.filter((t) => t > cutoff);
      if (kept.length === 0) hits.delete(ip);
      else hits.set(ip, kept);
    }
  }, windowMs).unref();

  return function rateLimitMiddleware(req, res, next) {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const cutoff = now - windowMs;
    const arr = (hits.get(ip) || []).filter((t) => t > cutoff);
    arr.push(now);
    hits.set(ip, arr);
    if (arr.length > max) {
      next(appError('RATE_LIMITED'));
      return;
    }
    next();
  };
}

module.exports = { apiRateLimit };
