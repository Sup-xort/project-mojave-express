const app = require('./app');
const config = require('./config');
const db = require('./db');
const cron = require('./cron');

const server = app.listen(config.port, () => {
  console.log(`모하비 익스프레스 스탬프 앱 — listening on :${config.port} (${config.nodeEnv})`);
});

const stopCron = cron.start();

function shutdown(signal) {
  console.log(`${signal} 수신, 종료 중...`);
  stopCron();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
