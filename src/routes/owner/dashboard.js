const express = require('express');
const config = require('../../config');
const { startOfDayUnix } = require('../../utils/time');
const stampService = require('../../services/stampService');
const redemptionService = require('../../services/redemptionService');
const customerService = require('../../services/customerService');

const router = express.Router();

router.get('/dashboard', (req, res) => {
  const since = startOfDayUnix(new Date(), config.storeTz);
  res.json({
    todayStamps: stampService.sumAmountSince(since),
    pendingRedemptions: redemptionService.countPending(),
    customerCount: customerService.countAll(),
    todayApprovedRedemptions: redemptionService.countApprovedSince(since),
  });
});

module.exports = router;
