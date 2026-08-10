const express = require('express');

const router = express.Router();

router.use(require('./auth'));
router.use(require('./me'));
router.use(require('./rewards'));
router.use(require('./stamp'));
router.use(require('./redemption'));

module.exports = router;
