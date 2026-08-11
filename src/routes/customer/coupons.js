const express = require('express');
const config = require('../../config');
const { requireAuth } = require('../../middleware/session');
const { appError } = require('../../middleware/errors');
const rewardService = require('../../services/rewardService');
const couponService = require('../../services/couponService');
const redemptionService = require('../../services/redemptionService');
const ownerEvents = require('../../services/ownerEvents');

const router = express.Router();

function couponView(c) {
  return {
    id: c.id,
    issuedAt: c.issued_at,
    usedAt: c.used_at,
    rewardName: c.reward_name,
  };
}

// 쿠폰 자체에는 이름이 없다. "지금 무엇으로 바꿀 수 있는지"는 이 시각에 열려 있는 리워드가 정한다.
router.get('/coupons', requireAuth, (req, res) => {
  const all = rewardService.allRewardsWithFlags();
  res.json({
    stampCost: config.couponStampCost,
    unused: couponService.listUnused(req.customer.id).map(couponView),
    used: couponService.listUsed(req.customer.id, 20).map(couponView),
    availableRewards: all.filter((r) => r.activeNow),
    schedule: all,
  });
});

router.post('/coupon/use', requireAuth, (req, res, next) => {
  try {
    const { couponId, rewardId } = req.body || {};

    // 이미 대기 중인 요청이 있으면 새로 만들지 않고 그것을 그대로 돌려준다.
    // (대기 화면에서 새로고침했을 때 쿠폰이 한 장 더 묶이는 것을 막는다)
    const existing = redemptionService.getPendingForCustomer(req.customer.id);
    if (existing) {
      return res.json({
        redemptionId: existing.id,
        couponId: existing.coupon_id,
        rewardName: existing.reward_name,
        expiresAt: existing.requested_at + config.redemptionTtlSec,
      });
    }

    const coupon = couponService.findOwned(Number(couponId), req.customer.id);
    if (!coupon || coupon.status !== 'unused') return next(appError('COUPON_UNAVAILABLE'));

    // 시간대 판정은 서버가 STORE_TZ 기준으로 다시 한다. 클라이언트 시계는 믿지 않는다.
    const reward = rewardService.findById(Number(rewardId));
    if (!reward || !rewardService.isActiveNow(reward)) return next(appError('REWARD_UNAVAILABLE'));

    const redemption = redemptionService.createRequestTx({
      customerId: req.customer.id,
      coupon,
      reward,
    });
    if (!redemption) return next(appError('COUPON_UNAVAILABLE'));

    ownerEvents.broadcast('redemption_request', {
      redemptionId: redemption.id,
      nickname: req.customer.nickname,
      rewardName: redemption.reward_name,
    });

    res.json({
      redemptionId: redemption.id,
      couponId: coupon.id,
      rewardName: redemption.reward_name,
      expiresAt: redemption.requested_at + config.redemptionTtlSec,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
