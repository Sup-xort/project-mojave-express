const express = require('express');
const db = require('../../db');
const { appError } = require('../../middleware/errors');
const rewardService = require('../../services/rewardService');

const router = express.Router();

const insertStmt = db.prepare(`
  INSERT INTO rewards (name, cost, start_min, end_min, active, sort_order)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const updateStmt = db.prepare(`
  UPDATE rewards SET name = ?, cost = ?, start_min = ?, end_min = ?, active = ?, sort_order = ?
  WHERE id = ?
`);

function isValidMin(n) {
  return Number.isInteger(n) && n >= 0 && n <= 1439;
}

router.get('/rewards', (req, res) => {
  res.json(rewardService.allRewardsWithFlags());
});

router.post('/rewards', (req, res, next) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const cost = Number(b.cost);
  const startMin = Number(b.startMin);
  const endMin = Number(b.endMin);
  const active = b.active === undefined ? 1 : b.active ? 1 : 0;
  const sortOrder = Number.isInteger(Number(b.sortOrder)) ? Number(b.sortOrder) : 0;

  if (!name || !Number.isInteger(cost) || cost < 1 || !isValidMin(startMin) || !isValidMin(endMin)) {
    return next(appError('SERVER_ERROR'));
  }

  const info = insertStmt.run(name, cost, startMin, endMin, active, sortOrder);
  res.json(rewardService.findById(info.lastInsertRowid));
});

router.put('/rewards/:id', (req, res, next) => {
  const existing = rewardService.findById(Number(req.params.id));
  if (!existing) return next(appError('SERVER_ERROR'));

  const b = req.body || {};
  const name = b.name !== undefined ? String(b.name).trim() : existing.name;
  const cost = b.cost !== undefined ? Number(b.cost) : existing.cost;
  const startMin = b.startMin !== undefined ? Number(b.startMin) : existing.start_min;
  const endMin = b.endMin !== undefined ? Number(b.endMin) : existing.end_min;
  const active = b.active !== undefined ? (b.active ? 1 : 0) : existing.active;
  const sortOrder = b.sortOrder !== undefined ? Number(b.sortOrder) : existing.sort_order;

  if (!name || !Number.isInteger(cost) || cost < 1 || !isValidMin(startMin) || !isValidMin(endMin)) {
    return next(appError('SERVER_ERROR'));
  }

  updateStmt.run(name, cost, startMin, endMin, active, sortOrder, existing.id);
  res.json(rewardService.findById(existing.id));
});

module.exports = router;
