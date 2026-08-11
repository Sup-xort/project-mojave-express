const express = require('express');
const config = require('../../config');
const { requireAuth } = require('../../middleware/session');
const customerService = require('../../services/customerService');
const couponService = require('../../services/couponService');
const redemptionService = require('../../services/redemptionService');

const router = express.Router();

// 승인 직후 손님이 앱을 껐다 켜도 "사용 완료"를 다시 보여줄 수 있는 시간(초).
// 폴링으로 결과를 못 받고 화면을 벗어난 경우의 안전망이다.
const RECENT_USE_WINDOW_SEC = 180;

router.get('/me', requireAuth, (req, res) => {
  const pending = redemptionService.getPendingForCustomer(req.customer.id);
  const recentlyUsed = couponService.findRecentlyUsed(req.customer.id, RECENT_USE_WINDOW_SEC);

  res.json({
    nickname: req.customer.nickname,
    stamps: req.customer.stamps,
    cardNo: customerService.getCardNo(req.customer.id),
    stampCost: config.couponStampCost,
    couponCount: couponService.countUnused(req.customer.id),
    pendingRedemption: pending
      ? {
          redemptionId: pending.id,
          couponId: pending.coupon_id,
          rewardName: pending.reward_name,
          expiresAt: pending.requested_at + config.redemptionTtlSec,
        }
      : null,
    lastUsedCoupon: recentlyUsed
      ? { couponId: recentlyUsed.id, rewardName: recentlyUsed.reward_name, usedAt: recentlyUsed.used_at }
      : null,
  });
});

module.exports = router;
