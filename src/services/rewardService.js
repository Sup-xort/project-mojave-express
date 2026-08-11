const db = require('../db');
const config = require('../config');
const { minutesSinceMidnightInTZ } = require('../utils/time');

const listAllStmt = db.prepare('SELECT * FROM rewards ORDER BY sort_order, cost');
const findByIdStmt = db.prepare('SELECT * FROM rewards WHERE id = ?');

// 5.2: 자정을 넘는 시간대(start_min > end_min)를 반드시 처리한다.
function isWindowActiveNow(reward, nowMin) {
  if (!reward.active) return false;
  if (reward.start_min <= reward.end_min) {
    return nowMin >= reward.start_min && nowMin < reward.end_min;
  }
  return nowMin >= reward.start_min || nowMin < reward.end_min;
}

function currentMinutes(date = new Date()) {
  return minutesSinceMidnightInTZ(date, config.storeTz);
}

function activeRewards(date = new Date()) {
  const nowMin = currentMinutes(date);
  return listAllStmt.all().filter((r) => isWindowActiveNow(r, nowMin));
}

function windowLabel(reward) {
  const fmt = (min) => {
    const h = Math.floor(min / 60)
      .toString()
      .padStart(2, '0');
    const m = (min % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  };
  return `${fmt(reward.start_min)} ~ ${fmt(reward.end_min)}`;
}

// 자정을 넘는 구간은 [start,1440)과 [0,end) 두 조각으로 펴서 비교한다.
function windowSegments(reward) {
  if (reward.start_min <= reward.end_min) return [[reward.start_min, reward.end_min]];
  return [
    [reward.start_min, 1440],
    [0, reward.end_min],
  ];
}

function windowsOverlap(a, b) {
  for (const [as, ae] of windowSegments(a)) {
    for (const [bs, be] of windowSegments(b)) {
      if (as < be && bs < ae) return true;
    }
  }
  return false;
}

// 5.7: 손님 홈에는 전체 스케줄을 보여주되 activeNow 플래그를 함께 내려준다.
// overlapping은 같은 시각에 다른 리워드와 함께 열리는지 — 그때는 손님이 둘 중 하나를 고른다.
// 오류가 아니라 사장님이 알고 있어야 할 정보라서 플래그로만 내려준다.
function allRewardsWithFlags(date = new Date()) {
  const nowMin = currentMinutes(date);
  const rows = listAllStmt.all();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    activeNow: isWindowActiveNow(r, nowMin),
    window: windowLabel(r),
    active: r.active ? 1 : 0,
    sortOrder: r.sort_order,
    overlapping: Boolean(
      r.active && rows.some((o) => o.id !== r.id && o.active && windowsOverlap(r, o))
    ),
  }));
}

function findById(id) {
  return findByIdStmt.get(id);
}

function isActiveNow(reward, date = new Date()) {
  return isWindowActiveNow(reward, currentMinutes(date));
}

module.exports = {
  activeRewards,
  allRewardsWithFlags,
  findById,
  isActiveNow,
  windowLabel,
  windowsOverlap,
};
