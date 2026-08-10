# 관리자 API — 임시 최소 구현

plan.md 6절은 관리자 인증 체계를 이 프로젝트(손님용 시스템)의 범위 밖으로 명시한다. 하지만
QR 발급·리워드 승인·수동 지급이 없으면 손님용 플로우를 테스트할 방법이 없으므로, 고정 키
(`ADMIN_KEY` 환경변수) 하나로 지키는 최소 구현만 여기 둔다.

## 인증 방식 (임시)

모든 요청에 `X-Admin-Key: <ADMIN_KEY>` 헤더가 필요하다. `src/middleware/adminAuth.js` 참고.
비밀번호 정책·다중 관리자·감사 로그 같은 것은 없다 — 매장 태블릿 한 대에서만 쓰는 것을 가정한다.

## 나중에 진짜 사장님용 앱을 만들 때

아래를 통째로 교체하면 된다. 손님용 코드는 이 디렉터리를 참조하지 않는다.

- `src/routes/admin/*` (이 라우터들)
- `src/middleware/adminAuth.js`
- `/admin/*` (임시 관리자 화면, 프로젝트 루트 `admin/` 디렉터리)

## 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/admin/qr` | `{amount}` — QR 토큰 발급, QR 이미지(dataURL) 포함 |
| GET | `/api/admin/rewards` | 리워드 전체 목록 |
| POST | `/api/admin/rewards` | 리워드 생성 |
| PUT | `/api/admin/rewards/:id` | 리워드 수정 |
| GET | `/api/admin/redemptions` | pending 교환 요청 목록 |
| POST | `/api/admin/reward/:id/approve` | 교환 승인 |
| POST | `/api/admin/stamp/grant` | `{nickname, amount}` — 수동 지급 |
