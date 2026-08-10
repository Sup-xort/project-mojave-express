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

module.exports = { minutesSinceMidnightInTZ, nowUnix };
