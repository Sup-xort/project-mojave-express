# 배포 가이드 — OCI + DuckDNS + Caddy

plan.md 0절이 지정한 실행 환경(OCI Compute Ampere A1, Ubuntu, Node+Express, SQLite WAL,
Caddy, systemd)을 기준으로 한다.

## 1. DuckDNS 도메인 준비

1. https://www.duckdns.org 에서 로그인하고 서브도메인을 하나 등록한다. (예: `mojave-express` →
   `mojave-express.duckdns.org`)
2. 발급된 토큰을 기록해둔다.
3. OCI 인스턴스의 공인 IP를 DuckDNS 관리 페이지에서 그 서브도메인에 연결한다.
4. **OCI Always Free 인스턴스는 예약 공인 IP(Reserved Public IP)를 쓰지 않으면 재부팅 시 IP가
   바뀔 수 있다.** 아래 중 하나를 선택한다.
   - (권장) OCI 콘솔에서 인스턴스에 **예약 공인 IP**를 할당한다. 그러면 IP가 고정되므로 이 단계는 끝.
   - 예약 IP를 안 쓴다면 `deploy/duckdns-update.sh`를 systemd 타이머나 크론으로 주기 실행해 IP를
     최신 상태로 유지한다.
     ```
     DUCKDNS_DOMAIN=mojave-express DUCKDNS_TOKEN=xxxx /opt/mojave-express/deploy/duckdns-update.sh
     ```

## 2. OCI 네트워크 설정

- VCN의 보안 목록(Security List) 또는 NSG에서 인바운드 **80/tcp, 443/tcp**를 0.0.0.0/0에 대해 연다.
  (Caddy가 자동 HTTPS 발급에 80번을, 서비스 트래픽에 443번을 쓴다.)
- 인스턴스 내부 방화벽(`iptables`/`ufw`)도 같은 포트를 열어야 한다. Ubuntu 기본 이미지는 보통
  `iptables`로 막혀 있으니 확인한다.
  ```
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  ```
- 앱이 리스닝하는 3000번 포트는 **외부에 노출하지 않는다.** Caddy만 127.0.0.1:3000으로 접속한다.

## 3. Node.js 설치

```
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs sqlite3
```

## 4. 앱 배포

```
sudo useradd -r -m -d /opt/mojave-express mojave || true
sudo -u mojave git clone <이 저장소 URL> /opt/mojave-express
cd /opt/mojave-express
sudo -u mojave npm ci --omit=dev
sudo -u mojave cp .env.example .env
sudo -u mojave mkdir -p data
```

`.env`를 열어 최소한 아래 값을 실제 값으로 바꾼다.

- `PIN_PEPPER` — 긴 랜덤 문자열 (`openssl rand -base64 48`)
- `OWNER_PASSWORD_PEPPER` — 긴 랜덤 문자열 (`openssl rand -base64 48`)
- `NODE_ENV=production`
- `COOKIE_SECURE=true`

## 5. systemd 서비스 등록

```
sudo cp deploy/systemd/mojave-express.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mojave-express
sudo systemctl status mojave-express
```

## 6. Caddy 설치 및 설정

```
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`deploy/Caddyfile`을 `/etc/caddy/Caddyfile`로 복사하고 `DOMAIN` 환경변수(또는 파일 내 값)를
DuckDNS 도메인으로 바꾼다.

```
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/{$DOMAIN}/mojave-express.duckdns.org/' /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

몇 초 안에 Let's Encrypt 인증서가 자동 발급되고 `https://mojave-express.duckdns.org`로 접속된다.

## 7. 백업 타이머

```
sudo mkdir -p /backup
sudo cp deploy/systemd/mojave-backup.service deploy/systemd/mojave-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mojave-backup.timer
```

## 8. 확인

- `https://<도메인>/` → 가입 화면이 뜨는지
- `https://<도메인>/owner/` → 최초 접속 시 사장님 계정 설정 화면이 뜨고, 계정 생성 후 QR 발급이 되는지
- 새 손님 가입 → 사장님 앱에서 QR 발급 → 손님 화면에서 코드 입력(또는 QR 스캔) → 스탬프 적립 확인
- 사장님 앱 [리워드 관리]에서 시간대가 다른 리워드를 2개 등록 (예: 아침 06:00~11:00, 저녁 11:00~23:59)
- 스탬프를 `COUPON_STAMP_COST`(기본 10)개까지 모아 → 손님 홈에 🎟 쿠폰 1장이 자동으로 생기고
  스탬프 판이 0으로 돌아가는지 (넘친 개수는 이월되는지)
- 손님이 [사용하기] → **지금 시각에 열린 리워드만** 뜨는지 → 요청 → 사장님 앱에 팝업이 뜨는지
- 사장님이 [승인] → 손님 화면에 "사용 완료" 화면이 뜨고 확인을 눌러야 넘어가는지,
  홈의 "사용한 쿠폰" 내역에 남는지, **손님 스탬프 수가 변하지 않는지**(이중 차감 없음)
- 요청 후 손님이 [요청 취소] → 쿠폰이 미사용으로 되돌아오는지
- 사장님 앱 [설정] → 쿠폰 유효기간을 며칠로 저장 → **그 뒤에 발급된** 쿠폰에만 만료일이 붙고
  기존 쿠폰은 무기한 그대로인지 (손님 홈의 쿠폰 카드에 "YYYY.MM.DD까지" 표시)

## 배포 후 업데이트

```
cd /opt/mojave-express
sudo -u mojave git pull
sudo -u mojave npm ci --omit=dev
sudo systemctl restart mojave-express
```
