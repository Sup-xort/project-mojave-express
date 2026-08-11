const express = require('express');
const { appError } = require('../../middleware/errors');
const redemptionService = require('../../services/redemptionService');

const router = express.Router();

router.get('/redemptions', (req, res) => {
  res.json(
    redemptionService.listPending().map((r) => ({
      id: r.id,
      nickname: r.customer_nickname,
      couponId: r.coupon_id,
      rewardName: r.reward_name,
      requestedAt: r.requested_at,
    }))
  );
});

// 스탬프는 쿠폰 발급 시점에 이미 빠졌으므로 승인은 차감을 하지 않는다 (approveTx 주석 참고).
router.post('/reward/:id/approve', (req, res, next) => {
  const id = Number(req.params.id);
  const { ok, redemption } = redemptionService.approveTx(id);
  if (!ok) {
    // 5.3: "status가 pending인지 재확인, 아니면 무시" — 이미 처리/만료된 요청.
    if (!redemption) return next(appError('SERVER_ERROR'));
    return res.json({ ok: false, status: redemption.status });
  }
  res.json({ ok: true, status: redemption.status });
});

module.exports = router;
