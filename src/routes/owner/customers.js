const express = require('express');
const bcrypt = require('bcrypt');
const config = require('../../config');
const { appError } = require('../../middleware/errors');
const { normalizeNickname } = require('../../utils/nickname');
const customerService = require('../../services/customerService');
const stampService = require('../../services/stampService');
const couponService = require('../../services/couponService');
const redemptionService = require('../../services/redemptionService');

const router = express.Router();

const PIN_FORMAT = /^\d{4}$/; // customer/auth.js와 동일 규칙

router.get('/customers', (req, res) => {
  const key = normalizeNickname(req.query.query);
  if (!key) {
    res.json([]);
    return;
  }
  const rows = customerService.searchByNickname(key, 20);
  res.json(
    rows.map((c) => ({
      id: c.id,
      nickname: c.nickname,
      cardNo: customerService.getCardNo(c.id),
      stamps: c.stamps,
      lastStampAt: c.last_stamp_at,
    }))
  );
});

router.get('/customers/:id', (req, res, next) => {
  const customer = customerService.findById(req.params.id);
  if (!customer) return next(appError('SERVER_ERROR'));

  res.json({
    id: customer.id,
    nickname: customer.nickname,
    cardNo: customerService.getCardNo(customer.id),
    stamps: customer.stamps,
    couponCount: couponService.countUnused(customer.id),
    createdAt: customer.created_at,
    lastStampAt: customer.last_stamp_at,
    stampLog: stampService.listByCustomer(customer.id, 20).map((s) => ({
      amount: s.amount,
      createdAt: s.created_at,
    })),
    redemptions: redemptionService.listByCustomer(customer.id, 20).map((r) => ({
      id: r.id,
      couponId: r.coupon_id,
      rewardName: r.reward_name,
      status: r.status,
      requestedAt: r.requested_at,
      resolvedAt: r.resolved_at,
    })),
  });
});

// PIN을 잊은 손님을 위한 재설정. 사장님이 매장에서 대면으로 새 PIN을 받아 직접 입력한다.
router.post('/customers/:id/pin', async (req, res, next) => {
  try {
    const customer = customerService.findById(req.params.id);
    if (!customer) return next(appError('SERVER_ERROR'));
    const { pin } = req.body || {};
    if (typeof pin !== 'string' || !PIN_FORMAT.test(pin)) {
      return next(appError('INVALID_PIN_FORMAT'));
    }
    const pinHash = await bcrypt.hash(pin + config.pinPepper, 12);
    customerService.updatePinHash(customer.id, pinHash);
    customerService.clearLock(customer.id); // PIN 분실로 잠겨있던 계정도 같이 풀어준다
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
