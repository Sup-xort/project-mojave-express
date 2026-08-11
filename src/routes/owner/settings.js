const express = require('express');
const config = require('../../config');
const { appError } = require('../../middleware/errors');
const settingsService = require('../../services/settingsService');

const router = express.Router();

function currentSettings() {
  return {
    couponTtlDays: settingsService.getCouponTtlDays(), // 0이면 무기한
    maxCouponTtlDays: settingsService.MAX_TTL_DAYS,
    // 아래 둘은 .env에서만 바꾼다. 화면에는 읽기 전용으로만 보여준다.
    couponStampCost: config.couponStampCost,
    storeTz: config.storeTz,
  };
}

router.get('/settings', (req, res) => {
  res.json(currentSettings());
});

// 유효기간은 쿠폰을 발급하는 시점에 스냅샷으로 새겨진다. 여기서 값을 바꿔도
// 이미 발급된 쿠폰의 만료일은 달라지지 않는다 (손님에게 이미 준 것을 소급 만료시키지 않는다).
router.put('/settings', (req, res, next) => {
  const raw = (req.body || {}).couponTtlDays;
  // Number(null)은 0이라 값을 빠뜨린 요청이 조용히 "무기한"으로 꺼버릴 수 있다. 명시적으로 막는다.
  if (raw === undefined || raw === null || raw === '') return next(appError('INVALID_TTL_DAYS'));

  const days = Number(raw);
  if (!settingsService.isValidTtlDays(days)) return next(appError('INVALID_TTL_DAYS'));

  settingsService.setCouponTtlDays(days);
  res.json(currentSettings());
});

module.exports = router;
