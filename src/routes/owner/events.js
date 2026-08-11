// 손님이 교환을 요청하면 오너 앱에 실시간 팝업을 띄우기 위한 SSE 엔드포인트.
const express = require('express');
const ownerEvents = require('../../services/ownerEvents');

const router = express.Router();

const HEARTBEAT_MS = 20_000; // 프록시/브라우저가 유휴 연결을 끊지 않도록 주기적으로 코멘트를 보낸다.

router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':ok\n\n');

  ownerEvents.addClient(res);

  const heartbeat = setInterval(() => {
    res.write(':ping\n\n');
  }, HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    ownerEvents.removeClient(res);
  });
});

module.exports = router;
