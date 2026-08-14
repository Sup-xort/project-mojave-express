const app = require('./app');
const config = require('./config');
const db = require('./db');
const cron = require('./cron');
const ownerEvents = require('./services/ownerEvents');

const server = app.listen(config.port, () => {
  console.log(`모하비 익스프레스 스탬프 앱 — listening on :${config.port} (${config.nodeEnv})`);
});

const stopCron = cron.start();

function shutdown(signal) {
  console.log(`${signal} 수신, 종료 중...`);
  stopCron();

  // server.close()는 열린 연결이 다 닫혀야 콜백을 부른다. 그런데 SSE(/api/owner/events)는
  // 사장님 앱이 계속 붙들고 있어서 스스로 끊기지 않는다. 이걸 먼저 닫지 않으면 종료가
  // 끝나지 않고 systemd가 결국 SIGKILL한다 — 재시작 한 번에 서비스가 몇 분씩 죽었다.
  ownerEvents.closeAll();

  server.close(() => {
    db.close();
    process.exit(0);
  });

  // 요청을 처리 중이 아닌 keep-alive 소켓도 붙잡고 있을 수 있다.
  server.closeIdleConnections();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
