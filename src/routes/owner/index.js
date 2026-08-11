/*
 * 사장님(오너)용 API. 기존 임시 관리자(ADMIN_KEY 고정 키 하나)를 완전히 대체한다.
 * 인증은 아이디+비밀번호(bcrypt) 세션 쿠키 기반이며, 손님용 코드(src/routes/customer/*)와는
 * 미들웨어·세션·쿠키가 전부 분리되어 있다.
 */
const express = require('express');
const { requireOwnerAuth } = require('../../middleware/ownerSession');

const router = express.Router();

// setup-status/setup/login은 공개, logout/me/password는 auth.js 내부에서 requireOwnerAuth를 붙인다.
router.use(require('./auth'));

router.use(requireOwnerAuth);
router.use(require('./dashboard'));
router.use(require('./qr'));
router.use(require('./rewards'));
router.use(require('./redemptions'));
router.use(require('./stampGrant'));
router.use(require('./customers'));

module.exports = router;
