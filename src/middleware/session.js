const config = require('../config');
const sessionService = require('../services/sessionService');
const customerService = require('../services/customerService');
const { appError } = require('./errors');

const COOKIE_NAME = 'me_session';

// 3.2: 유효한 세션이면 req.customer를 채우고 last_seen_at을 갱신한다 (슬라이딩 만료).
function attachSession(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : undefined;
  if (!token) {
    next();
    return;
  }
  const customerId = sessionService.validateAndTouch(token);
  if (!customerId) {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    next();
    return;
  }
  const customer = customerService.findById(customerId);
  if (!customer) {
    next();
    return;
  }
  req.customer = customer;
  req.sessionToken = token;
  next();
}

function requireAuth(req, res, next) {
  if (!req.customer) {
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

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function clearSessionCookie(res) {
  const { maxAge, ...rest } = cookieOptions();
  res.clearCookie(COOKIE_NAME, rest);
}

module.exports = { COOKIE_NAME, attachSession, requireAuth, setSessionCookie, clearSessionCookie };
