// 임시 최소 구현 — 실제 사장님용 앱은 별도로 제작 예정. src/routes/admin/README.md 참고.
const express = require('express');
const { appError } = require('../../middleware/errors');
const redemptionService = require('../../services/redemptionService');
const customerService = require('../../services/customerService');

const router = express.Router();

router.get('/redemptions', (req, res) => {
  res.json(
    redemptionService.listPending().map((r) => ({
      id: r.id,
      nickname: r.customer_nickname,
      rewardName: r.reward_name,
      rewardCost: r.reward_cost,
      requestedAt: r.requested_at,
    }))
  );
});

router.post('/reward/:id/approve', (req, res, next) => {
  const id = Number(req.params.id);
  const { ok, redemption } = redemptionService.approveTx(id, (customerId, cost) =>
    customerService.deductStamps(customerId, cost)
  );
  if (!ok) {
    // 5.3: "status가 pending인지 재확인, 아니면 무시" — 이미 처리/만료된 요청.
    if (!redemption) return next(appError('SERVER_ERROR'));
    return res.json({ ok: false, status: redemption.status });
  }
  res.json({ ok: true, status: redemption.status });
});

module.exports = router;
