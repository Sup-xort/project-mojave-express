const express = require('express');
const path = require('path');

const router = express.Router();

// 8.1: QR은 https://<도메인>/s/<token> 형태의 URL이다. 기본 카메라로 찍어도 바로 열리도록
// 정적 SPA 셸을 그대로 내려준다 — 토큰 처리는 클라이언트가 location.pathname을 읽어 수행한다.
router.get('/s/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

module.exports = router;
