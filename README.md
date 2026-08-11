# 모하비 익스프레스 스탬프 앱

`plan.md`에 정의된 손님용 스탬프 카드 시스템의 구현체. Node.js + Express + SQLite(WAL).
개인정보(이름·전화번호·이메일 등)를 받지 않고, 별명 + PIN 4자리만으로 이용한다.

## 폴더 구조와 손님/사장님 경계

이 저장소는 **손님용 앱**과 **사장님용 앱**을 함께 구현한다. 둘은 코드상으로 확실히 분리되어
있고(라우터, 미들웨어, 세션 쿠키가 모두 별개), DB만 공유한다.

```
src/
  routes/customer/   손님용 API (/api/signup, /api/login, /api/stamp, /api/reward/... 등)
  routes/owner/       사장님용 API (/api/owner/setup, /login, /dashboard, /qr, /rewards, ... 등)
  services/           도메인 로직 (세션, QR, 스탬프, 리워드, 로그인 시도 제한, 오너 계정)
  middleware/         손님 세션 인증, 오너 세션 인증, 에러 응답, rate limit
  db/                 SQLite 스키마 + 연결
  cron/               만료 QR/리워드 요청/로그인 시도 기록 정리
public/                손님용 웹앱 (바닐라 HTML/CSS/JS, 빌드 단계 없음)
owner/                 사장님용 웹앱 (바닐라 HTML/CSS/JS, 빌드 단계 없음)
deploy/                Caddyfile, systemd 유닛, DuckDNS 갱신 스크립트
scripts/backup.sh       SQLite 백업 스크립트
```

## 로컬 실행

```
npm install
cp .env.example .env
# .env에서 PIN_PEPPER, OWNER_PASSWORD_PEPPER를 채우고, 로컬 http 테스트를 위해 COOKIE_SECURE=false로 설정
npm run dev
```

- 손님용 앱: http://localhost:3000/
- 사장님용 앱: http://localhost:3000/owner/ — 처음 접속하면 계정 생성(아이디+비밀번호) 화면이
  뜨고, 이후에는 로그인 화면으로 이어진다. 별도의 관리자 키나 사전 프로비저닝이 필요 없다.

## 배포

OCI + DuckDNS + Caddy 배포 절차는 [DEPLOY.md](./DEPLOY.md) 참고.

## 구현 범위와 의도적으로 뺀 것

- `plan.md` 10절에 따라 PIN 찾기·계정 복구·손님 간 스탬프 전송·서드파티 분석/광고·푸시 알림은
  만들지 않았다.
- 앱 내 카메라 QR 스캐너는 만들지 않았다. QR을 URL(`/s/<token>`)로 발급하므로 기본 카메라 앱으로
  찍으면 바로 열리는 경로가 주 동선이고(plan.md 8.3), 카메라를 못 쓰는 경우를 위한 수동 코드 입력
  화면만 손님용 앱에 넣었다.
- 사장님 계정은 매장 태블릿 한 대에서 쓰는 것을 가정해 여러 직원 계정 관리 UI는 만들지 않았다
  (DB 스키마 자체는 여러 계정을 담을 수 있지만, 최초 설정 화면은 계정이 하나도 없을 때만 열린다).
