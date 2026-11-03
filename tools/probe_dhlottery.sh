#!/usr/bin/env bash
# 동행복권 당첨번호 조회 방식 확인 2차 (요청 6건 이내, 1초 간격)
set -u
UA="Mozilla/5.0 (dada-lotto-room personal app; weekly check)"
OUT=probe-output.txt; : > $OUT
log() { echo "$@" | tee -a $OUT; }
curl -sS -A "$UA" -c /tmp/jar --max-time 20 "https://www.dhlottery.co.kr/lt645/result?ltEpsd=1248" -o /tmp/page.html
log "== 페이지 안 selectPstLt645InfoNew 호출 부분 (앞뒤 900자)"
python3 - <<'PY' | tee -a probe-output.txt
s=open('/tmp/page.html',encoding='utf-8',errors='ignore').read()
import re
for m in re.finditer('selectPstLt645InfoNew', s):
    print(s[max(0,m.start()-900):m.end()+900]); print('-----')
for m in re.finditer('checkWnNo', s):
    print(s[max(0,m.start()-400):m.end()+400]); print('-----'); break
PY
try() { # method url data label
  sleep 1
  log "== $4"; log "$1 $2 ${3:+DATA:$3}"
  if [ "$1" = POST ]; then
    curl -sS -A "$UA" -b /tmp/jar -e "https://www.dhlottery.co.kr/lt645/result" -H 'X-Requested-With: XMLHttpRequest' -H 'Accept: application/json, text/javascript, */*' \
      -X POST -d "$3" --max-time 20 -o /tmp/r -w 'STATUS %{http_code} %{content_type}\n' "$2" 2>&1 | tee -a $OUT
  else
    curl -sS -A "$UA" -b /tmp/jar -e "https://www.dhlottery.co.kr/lt645/result" -H 'X-Requested-With: XMLHttpRequest' -H 'Accept: application/json, text/javascript, */*' \
      --max-time 20 -o /tmp/r -w 'STATUS %{http_code} %{content_type}\n' "$2" 2>&1 | tee -a $OUT
  fi
  log "BODY:"; head -c 1500 /tmp/r 2>/dev/null | tee -a $OUT; : > /tmp/r; log ""; log ""
}
try GET "https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchDir=center&srchLtEpsd=1248" "" "GET srchLtEpsd"
try POST "https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do" "srchLtEpsd=1248" "POST srchLtEpsd"
try GET "https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?ltEpsd=1248" "" "GET ltEpsd"
