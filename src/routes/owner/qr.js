const express = require('express');
const QRCode = require('qrcode');
const config = require('../../config');
const { appError } = require('../../middleware/errors');
const qrService = require('../../services/qrService');

const router = express.Router();

router.post('/qr', async (req, res, next) => {
  try {
    const amount = Number(req.body && req.body.amount);
    if (!Number.isInteger(amount) || amount < 1 || amount > config.qrAmountMax) {
      return next(appError('INVALID_QR'));
    }
    const issued = qrService.issueToken(amount);
    const url = `${req.protocol}://${req.get('host')}/s/${issued.token}`;
    const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 320 });
    res.json({ ...issued, url, qrDataUrl });
  } catch (err) {
    next(err);
  }
});

// 사장님이 "삭제 후 재발급"을 눌렀을 때만 호출된다. 그냥 "닫기"는 토큰을 살려둔다 —
// 손님이 아직 QR을 스캔하는 중일 수 있기 때문이다.
// 없는 토큰·이미 소진된 토큰이어도 성공으로 응답한다(멱등). 화면은 어차피 수량 화면으로 돌아간다.
router.delete('/qr/:token', (req, res, next) => {
  try {
    qrService.revokeToken(req.params.token);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
