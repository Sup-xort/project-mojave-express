// plan.md 6절: 관리자 API는 "별도 인증 체계"로 범위 밖이라 명시되어 있다.
// 아래는 사장님용 앱이 만들어지기 전까지 손님용 플로우를 손으로 테스트하기 위한
// 최소한의 자리표시자(placeholder)다. 고정 키 하나로 지키는 수준이라 실제 운영에는
// 부적합하며, 사장님용 앱을 만들 때 이 미들웨어 전체를 교체해야 한다.
const config = require('../config');
const { appError } = require('./errors');
const { timingSafeEqualStr } = require('../utils/crypto');

function requireAdminKey(req, res, next) {
  const key = req.get('x-admin-key');
  if (!key || !config.adminKey || !timingSafeEqualStr(key, config.adminKey)) {
    next(appError('UNAUTHORIZED'));
    return;
  }
  next();
}

module.exports = { requireAdminKey };
