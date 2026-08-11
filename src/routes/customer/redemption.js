const express = require('express');
const config = require('../../config');
const { requireAuth } = require('../../middleware/session');
const redemptionService = require('../../services/redemptionService');

const router = express.Router();

// 쿠폰 사용 요청의 진행 상태. 대기 화면이 3초마다 이걸 물어본다.
// pending만 조회하면 승인된 순간 결과가 사라져 "사용 완료"를 영영 못 보여준다 —
// 그래서 상태와 무관하게 가장 최근 요청을 본다.
router.get('/reward/status', requireAuth, (req, res) => {
  const latest = redemptionService.getLatestForCustomer(req.customer.id);
  if (!latest) {
    res.json({ status: 'none' });
    return;
  }
  res.json({
    redemptionId: latest.id,
    status: latest.status,
    rewardName: latest.reward_name,
    requestedAt: latest.requested_at,
    resolvedAt: latest.resolved_at,
    expiresAt: latest.requested_at + config.redemptionTtlSec,
  });
});

// 취소하면 묶여 있던 쿠폰이 다시 미사용으로 돌아온다 (cancelTx가 함께 처리).
router.post('/reward/cancel', requireAuth, (req, res) => {
  const pending = redemptionService.getPendingForCustomer(req.customer.id);
  if (pending) {
    redemptionService.cancelTx(pending.id);
  }
  res.json({ ok: true });
});

module.exports = router;
