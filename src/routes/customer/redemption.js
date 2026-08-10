const express = require('express');
const config = require('../../config');
const { requireAuth } = require('../../middleware/session');
const { appError } = require('../../middleware/errors');
const rewardService = require('../../services/rewardService');
const redemptionService = require('../../services/redemptionService');
const customerService = require('../../services/customerService');

const router = express.Router();

router.post('/reward/request', requireAuth, (req, res, next) => {
  try {
    const { rewardId } = req.body || {};
    const reward = rewardService.findById(Number(rewardId));
    if (!reward) return next(appError('REWARD_UNAVAILABLE'));
    if (!rewardService.isActiveNow(reward)) return next(appError('REWARD_UNAVAILABLE'));

    const customer = customerService.findById(req.customer.id);
    if (customer.stamps < reward.cost) return next(appError('NOT_ENOUGH_STAMPS'));

    const existing = redemptionService.getPendingForCustomer(customer.id);
    if (existing) {
      return res.json({
        redemptionId: existing.id,
        rewardName: existing.reward_name,
        expiresAt: existing.requested_at + config.redemptionTtlSec,
      });
    }

    const redemption = redemptionService.createRequest({ customerId: customer.id, reward });
    res.json({
      redemptionId: redemption.id,
      rewardName: redemption.reward_name,
      expiresAt: redemption.requested_at + config.redemptionTtlSec,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/reward/status', requireAuth, (req, res) => {
  const pending = redemptionService.getPendingForCustomer(req.customer.id);
  if (!pending) {
    res.json({ status: 'none' });
    return;
  }
  res.json({
    status: pending.status,
    rewardName: pending.reward_name,
    expiresAt: pending.requested_at + config.redemptionTtlSec,
  });
});

router.post('/reward/cancel', requireAuth, (req, res) => {
  const pending = redemptionService.getPendingForCustomer(req.customer.id);
  if (pending) {
    redemptionService.cancel(pending.id);
  }
  res.json({ ok: true });
});

module.exports = router;
