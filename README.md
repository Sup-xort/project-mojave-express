# 모하비 익스프레스 스탬프 앱

`plan.md`에 정의된 손님용 스탬프 카드 시스템의 구현체. Node.js + Express + SQLite(WAL).
개인정보(이름·전화번호·이메일 등)를 받지 않고, 별명 + PIN 4자리만으로 이용한다.

## 폴더 구조와 손님/사장님 경계

이 저장소는 **손님용 앱**을 구현한다. 사장님용 관리자 앱은 나중에 별도로 만들 예정이라,
지금은 손님용 플로우를 테스트할 수 있는 **최소 placeholder 관리자**만 붙어 있다. 둘은 코드
상으로 확실히 분리되어 있다.

```
src/
  routes/customer/   손님용 API (/api/signup, /api/login, /api/stamp, /api/reward/... 등)
  routes/admin/       임시 최소 관리자 API — 나중에 통째로 교체 예정 (routes/admin/README.md 참고)
  services/           도메인 로직 (세션, QR, 스탬프, 리워드, 로그인 시도 제한)
  middleware/         세션 인증, 에러 응답, rate limit, (임시) 관리자 키 인증
  db/                 SQLite 스키마 + 연결
  cron/               만료 QR/리워드 요청/로그인 시도 기록 정리
public/                손님용 웹앱 (바닐라 HTML/CSS/JS, 빌드 단계 없음)
admin/                 임시 관리자 화면 — 나중에 교체 예정
deploy/                Caddyfile, systemd 유닛, DuckDNS 갱신 스크립트
scripts/backup.sh       SQLite 백업 스크립트
```

사장님용 앱을 만들 때는 `src/routes/admin/*`, `src/middleware/adminAuth.js`, `admin/*`만
들어내고 교체하면 된다. 손님용 코드는 이 파일들을 참조하지 않는다.

## 로컬 실행

```
npm install
cp .env.example .env
# .env에서 PIN_PEPPER, ADMIN_KEY를 채우고, 로컬 http 테스트를 위해 COOKIE_SECURE=false로 설정
npm run dev
```

- 손님용 앱: http://localhost:3000/
- 임시 관리자 화면: http://localhost:3000/admin/ (ADMIN_KEY 입력 필요)

## 배포

OCI + DuckDNS + Caddy 배포 절차는 [DEPLOY.md](./DEPLOY.md) 참고.

## 구현 범위와 의도적으로 뺀 것

- `plan.md` 10절에 따라 PIN 찾기·계정 복구·손님 간 스탬프 전송·서드파티 분석/광고·푸시 알림은
  만들지 않았다.
- 앱 내 카메라 QR 스캐너는 만들지 않았다. QR을 URL(`/s/<token>`)로 발급하므로 기본 카메라 앱으로
  찍으면 바로 열리는 경로가 주 동선이고(plan.md 8.3), 카메라를 못 쓰는 경우를 위한 수동 코드 입력
  화면만 손님용 앱에 넣었다.
- 관리자 인증은 고정 키 하나뿐인 placeholder다 (plan.md 6절 — 관리자 인증 체계는 범위 밖으로 명시됨).
