const express = require('express');
const { appError } = require('../../middleware/errors');
const { normalizeNickname } = require('../../utils/nickname');
const customerService = require('../../services/customerService');
const stampService = require('../../services/stampService');
const couponService = require('../../services/couponService');
const redemptionService = require('../../services/redemptionService');

const router = express.Router();

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

// PIN을 잊은 손님을 위한 초기화. 사장님이 매장에서 대면으로 신원을 확인한 뒤 PIN을 비우면,
// 손님이 앱에서 같은 닉네임을 다시 입력해 새 PIN을 스스로 정하게 된다(customer/auth.js의 pin-reset).
router.post('/customers/:id/pin', (req, res, next) => {
  const customer = customerService.findById(req.params.id);
  if (!customer) return next(appError('SERVER_ERROR'));
  customerService.clearPinHash(customer.id);
  customerService.clearLock(customer.id); // PIN 분실로 잠겨있던 계정도 같이 풀어준다
  res.json({ ok: true });
});

// 고객조회 화면에서 스탬프 개수를 직접 보정한다. delta는 0이 아닌 정수(양수/음수 모두 허용).
router.post('/customers/:id/stamps/adjust', (req, res, next) => {
  const customer = customerService.findById(req.params.id);
  if (!customer) return next(appError('SERVER_ERROR'));

  const delta = Number(req.body && req.body.delta);
  if (!Number.isInteger(delta) || delta === 0) {
    return next(appError('SERVER_ERROR'));
  }

  try {
    const { stamps, couponsIssued } = stampService.adjustStamps(customer.id, delta);
    res.json({ ok: true, stamps, couponsIssued });
  } catch (err) {
    if (err.code === 'NOT_ENOUGH_STAMPS') return next(appError('NOT_ENOUGH_STAMPS'));
    next(err);
  }
});

module.exports = router;
