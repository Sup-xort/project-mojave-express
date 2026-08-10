/*
 * 임시 최소 관리자 API.
 *
 * plan.md 6절은 관리자 인증 체계를 이 프로젝트의 범위 밖으로 명시한다. 하지만 손님용
 * 플로우(QR 발급, 리워드 승인, 수동 지급)를 테스트하려면 뭔가는 있어야 하므로,
 * 고정 키(ADMIN_KEY) 하나로 지키는 최소 구현만 둔다.
 *
 * 나중에 진짜 사장님용 앱을 만들 때는 이 디렉터리(src/routes/admin/*) 전체와
 * ../../middleware/adminAuth.js, public/admin/*을 교체하면 된다. 손님용 코드
 * (src/routes/customer/*, public/*)는 이 디렉터리를 전혀 참조하지 않으므로
 * 영향 없이 들어낼 수 있다.
 */
const express = require('express');
const { requireAdminKey } = require('../../middleware/adminAuth');

const router = express.Router();

router.use(requireAdminKey);
router.use(require('./qr'));
router.use(require('./rewards'));
router.use(require('./redemptions'));
router.use(require('./stampGrant'));

module.exports = router;
