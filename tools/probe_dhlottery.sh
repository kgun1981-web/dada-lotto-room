#!/usr/bin/env bash
# 동행복권 공식 사이트 당첨번호 제공 방식 확인용 (요청 10건 이내, 1초 간격)
set -u
UA="Mozilla/5.0 (dada-lotto-room personal app; weekly check)"
OUT=probe-output.txt
: > $OUT
log() { echo "$@" | tee -a $OUT; }
get() { # $1 url, $2 label
  sleep 1
  code=$(curl -sS -A "$UA" -o /tmp/body -w '%{http_code} %{content_type}' --max-time 20 "$1" || echo "curl-fail")
  log "== $2"; log "URL: $1"; log "STATUS: $code"; log "BODY(앞 800자):"; head -c 800 /tmp/body | tee -a $OUT; log ""; log ""
}
get "https://www.dhlottery.co.kr/lt645/result?ltEpsd=1248" "결과 페이지 HTML"
log "== 스크립트 파일 목록"
grep -oE '<script[^>]+src="[^"]+"' /tmp/body | sed -E 's/.*src="([^"]+)".*/\1/' | tee -a $OUT /tmp/scripts
log ""
log "== HTML 안 .do / json / api 단서"
curl -sS -A "$UA" --max-time 20 "https://www.dhlottery.co.kr/lt645/result?ltEpsd=1248" | grep -oE '["'"'"'][^"'"'"' ]*(\.do|/api/|json)[^"'"'"' ]*["'"'"']' | sort -u | head -40 | tee -a $OUT
log ""
n=0
while read -r s; do
  n=$((n+1)); [ $n -gt 4 ] && break
  case "$s" in http*) u="$s";; //*) u="https:$s";; /*) u="https://www.dhlottery.co.kr$s";; *) u="https://www.dhlottery.co.kr/lt645/$s";; esac
  sleep 1
  log "== JS 단서: $u"
  curl -sS -A "$UA" --max-time 20 "$u" | grep -oE '["'"'"'][^"'"'"' ]*(\.do|/api/|Lt645|lt645)[^"'"'"' ]*["'"'"']' | sort -u | head -30 | tee -a $OUT
  log ""
done < /tmp/scripts
get "https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchLtEpsd=1248" "후보1 selectPstLt645InfoNew.do"
get "https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=1248" "후보2 selectPstLt645Info.do"
get "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=1248" "옛 방식 getLottoNumber"
