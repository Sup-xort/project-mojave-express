#!/usr/bin/env bash
# OCI Always Free 인스턴스는 재부팅 시 공인 IP가 바뀔 수 있다(예약 IP를 쓰지 않는 경우).
# DuckDNS가 그때마다 최신 IP를 가리키도록 주기적으로 갱신한다.
# 사용법: DUCKDNS_DOMAIN=mojave-express DUCKDNS_TOKEN=xxxx ./duckdns-update.sh
set -euo pipefail

: "${DUCKDNS_DOMAIN:?DUCKDNS_DOMAIN을 설정하세요 (예: mojave-express, .duckdns.org 제외)}"
: "${DUCKDNS_TOKEN:?DUCKDNS_TOKEN을 설정하세요}"

curl -fsS "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip="
