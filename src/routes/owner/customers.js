const express = require('express');
const { appError } = require('../../middleware/errors');
const { normalizeNickname } = require('../../utils/nickname');
const customerService = require('../../services/customerService');
const stampService = require('../../services/stampService');
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
    createdAt: customer.created_at,
    lastStampAt: customer.last_stamp_at,
    stampLog: stampService.listByCustomer(customer.id, 20).map((s) => ({
      amount: s.amount,
      createdAt: s.created_at,
    })),
    redemptions: redemptionService.listByCustomer(customer.id, 20).map((r) => ({
      id: r.id,
      rewardName: r.reward_name,
      rewardCost: r.reward_cost,
      status: r.status,
      requestedAt: r.requested_at,
      resolvedAt: r.resolved_at,
    })),
  });
});

module.exports = router;
