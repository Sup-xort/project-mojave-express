const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { attachSession } = require('./middleware/session');
const { apiRateLimit } = require('./middleware/rateLimit');
const { errorHandler, notFoundHandler } = require('./middleware/errors');

const app = express();

// Caddy 뒤에서 X-Forwarded-For를 신뢰하되, Caddy가 그 헤더를 덮어써 위조를 막는다는
// 전제다 (DEPLOY.md의 Caddyfile 참고). 홉 수는 TRUST_PROXY_HOPS로 조절.
app.set('trust proxy', config.trustProxyHops);

app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());

// 정적 파일은 rate limit 밖에 둔다 (9절 체크리스트: "정적 파일 외 모든 API에").
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));

app.use('/api', apiRateLimit({ windowMs: 60_000, max: 120 }));
app.use('/api', attachSession);

app.use('/api', require('./routes/customer'));
app.use('/api/admin', require('./routes/admin'));

app.use(require('./routes/shortlink'));

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
