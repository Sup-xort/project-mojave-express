const express = require('express');
const { appError } = require('../../middleware/errors');
const { validateNickname } = require('../../utils/nickname');
const customerService = require('../../services/customerService');
const stampService = require('../../services/stampService');

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

  const { stamps, couponsIssued } = stampService.grantStamps(customer.id, amt);
  res.json({ ok: true, nickname: customer.nickname, stamps, couponsIssued });
});

module.exports = router;
