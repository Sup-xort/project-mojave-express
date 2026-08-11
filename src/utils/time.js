// plan.md 섹션 5.2 — 서버 로컬 시각(OCI는 기본 UTC)에 의존하지 않고 STORE_TZ 기준으로 판정한다.
function minutesSinceMidnightInTZ(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  return hour * 60 + minute;
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

// 대시보드의 "오늘" 집계 기준(매장 시간대 자정) unix seconds. minutesSinceMidnightInTZ를 재사용해
// 자체적인 tz 변환 로직을 새로 만들지 않는다.
function startOfDayUnix(date, tz) {
  const nowSec = Math.floor(date.getTime() / 1000);
  const minutesToday = minutesSinceMidnightInTZ(date, tz);
  return nowSec - minutesToday * 60 - (nowSec % 60);
}

module.exports = { minutesSinceMidnightInTZ, nowUnix, startOfDayUnix };
