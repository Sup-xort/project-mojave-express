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

module.exports = router;
