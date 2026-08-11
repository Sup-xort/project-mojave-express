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
