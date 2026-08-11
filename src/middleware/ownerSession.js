const config = require('../config');
const ownerSessionService = require('../services/ownerSessionService');
const ownerService = require('../services/ownerService');
const { appError } = require('./errors');

// 손님 세션 쿠키(me_session)와 이름을 분리해 손님/오너 세션이 서로 섞이지 않게 한다.
const COOKIE_NAME = 'owner_session';

function attachOwnerSession(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : undefined;
  if (!token) {
    next();
    return;
  }
  const ownerId = ownerSessionService.validateAndTouch(token);
  if (!ownerId) {
    clearOwnerSessionCookie(res);
    next();
    return;
  }
  const owner = ownerService.findById(ownerId);
  if (!owner) {
    next();
    return;
  }
  req.owner = owner;
  req.ownerSessionToken = token;
  next();
}

function requireOwnerAuth(req, res, next) {
  if (!req.owner) {
    next(appError('UNAUTHORIZED'));
    return;
  }
  next();
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionTtlSec * 1000,
  };
}

function setOwnerSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function clearOwnerSessionCookie(res) {
  const { maxAge, ...rest } = cookieOptions();
  res.clearCookie(COOKIE_NAME, rest);
}

module.exports = {
  COOKIE_NAME,
  attachOwnerSession,
  requireOwnerAuth,
  setOwnerSessionCookie,
  clearOwnerSessionCookie,
};
