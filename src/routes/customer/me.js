const express = require('express');
const config = require('../../config');
const { requireAuth } = require('../../middleware/session');
const customerService = require('../../services/customerService');
const redemptionService = require('../../services/redemptionService');

const router = express.Router();

router.get('/me', requireAuth, (req, res) => {
  const pending = redemptionService.getPendingForCustomer(req.customer.id);
  res.json({
    nickname: req.customer.nickname,
    stamps: req.customer.stamps,
    cardNo: customerService.getCardNo(req.customer.id),
    pendingRedemption: pending
      ? {
          redemptionId: pending.id,
          rewardName: pending.reward_name,
          expiresAt: pending.requested_at + config.redemptionTtlSec,
        }
      : null,
  });
});

module.exports = router;
