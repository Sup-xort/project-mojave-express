// plan.md 4.2/5.5/3.6에서 요구하는 정리 작업. systemd로 앱 하나만 띄우는 소규모 배포이므로
// 별도 OS cron 대신 프로세스 내 setInterval로 처리한다. DB 백업(9절)만은 파일시스템 작업이라
// scripts/backup.sh + systemd 타이머로 별도 관리한다 (DEPLOY.md 참고).
const qrService = require('../services/qrService');
const redemptionService = require('../services/redemptionService');
const couponService = require('../services/couponService');
const loginAttemptService = require('../services/loginAttemptService');

function start() {
  const timers = [];

  // 4.2: 만료·소진된 QR 토큰은 1시간마다 삭제
  timers.push(
    setInterval(() => {
      try {
        qrService.purgeExpired();
      } catch (err) {
        console.error('[cron] qr purge 실패', err.message);
      }
    }, 60 * 60 * 1000)
  );

  // 5.5: TTL 지난 pending 리워드 요청은 1분마다 expired로
  timers.push(
    setInterval(() => {
      try {
        redemptionService.expireStale();
      } catch (err) {
        console.error('[cron] redemption expire 실패', err.message);
      }
    }, 60 * 1000)
  );

  // 유효기간이 지난 미사용 쿠폰을 expired로 정리한다. 조회 쿼리에도 만료 조건이 걸려 있으므로
  // 손님 화면의 정확성은 이 주기와 무관하다 — 내역에 상태를 남기기 위한 정리다.
  timers.push(
    setInterval(() => {
      try {
        couponService.expireStale();
      } catch (err) {
        console.error('[cron] coupon expire 실패', err.message);
      }
    }, 10 * 60 * 1000)
  );

  // 3.6: 오래된 로그인 시도 기록은 하루 한 번 삭제
  timers.push(
    setInterval(() => {
      try {
        loginAttemptService.purgeOld();
      } catch (err) {
        console.error('[cron] login_attempts purge 실패', err.message);
      }
    }, 24 * 60 * 60 * 1000)
  );

  timers.forEach((t) => t.unref());
  return () => timers.forEach(clearInterval);
}

module.exports = { start };
