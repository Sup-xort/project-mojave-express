const express = require('express');
const { requireAuth } = require('../../middleware/session');
const { appError } = require('../../middleware/errors');
const stampService = require('../../services/stampService');
const rewardService = require('../../services/rewardService');

const router = express.Router();

router.post('/stamp', requireAuth, (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (typeof token !== 'string' || !token) {
      return next(appError('INVALID_QR'));
    }

    const result = stampService.redeemQr(req.customer.id, token);
    if (!result.ok) {
      return next(appError(result.reason));
    }

    res.json({
      stamps: result.stamps,
      added: result.added,
      couponsIssued: result.couponsIssued,
      rewards: rewardService.activeRewards(),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
