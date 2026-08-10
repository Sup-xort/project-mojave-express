const express = require('express');
const rewardService = require('../../services/rewardService');

const router = express.Router();

// 인증 불필요 — 5.7: 지금 열린 것 + 다른 시간대 것을 함께 보여준다.
router.get('/rewards', (req, res) => {
  res.json(rewardService.allRewardsWithFlags());
});

module.exports = router;
