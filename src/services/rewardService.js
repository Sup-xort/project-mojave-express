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

// 5.7: 손님 홈에는 전체 스케줄을 보여주되 activeNow 플래그를 함께 내려준다.
function allRewardsWithFlags(date = new Date()) {
  const nowMin = currentMinutes(date);
  return listAllStmt.all().map((r) => ({
    id: r.id,
    name: r.name,
    cost: r.cost,
    activeNow: isWindowActiveNow(r, nowMin),
    window: windowLabel(r),
  }));
}

function findById(id) {
  return findByIdStmt.get(id);
}

function isActiveNow(reward, date = new Date()) {
  return isWindowActiveNow(reward, currentMinutes(date));
}

module.exports = { activeRewards, allRewardsWithFlags, findById, isActiveNow, windowLabel };
