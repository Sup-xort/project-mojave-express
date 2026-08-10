// 임시 최소 구현 — 실제 사장님용 앱은 별도로 제작 예정. src/routes/admin/README.md 참고.
// PIN 찾기/계정 복구 대신 두는 유일한 구제 수단 (plan.md 10절).
const express = require('express');
const { appError } = require('../../middleware/errors');
const { validateNickname } = require('../../utils/nickname');
const { nowUnix } = require('../../utils/time');
const customerService = require('../../services/customerService');

const router = express.Router();

router.post('/stamp/grant', (req, res, next) => {
  const { nickname, amount } = req.body || {};
  const v = validateNickname(nickname);
  const amt = Number(amount);
  if (!v.ok || !Number.isInteger(amt) || amt < 1) {
    return next(appError('SERVER_ERROR'));
  }
  const customer = customerService.findByNicknameKey(v.key);
  if (!customer) return next(appError('SERVER_ERROR'));

  customerService.addStamps(customer.id, amt, nowUnix());
  res.json({ ok: true, nickname: customer.nickname, stamps: customer.stamps + amt });
});

module.exports = router;
