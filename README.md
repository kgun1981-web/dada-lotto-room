# 다다의 복권방

로또 6/45 번호 추천과 내 복권 당첨 확인을 위한 개인용 아이폰 웹앱(PWA)입니다.
배포 주소: https://kgun1981-web.github.io/dada-lotto-room/

- 어떤 번호든 1등 확률은 같습니다. 통계 추천은 당첨 가능성을 높인다는 근거가 없으며, 과거 검증 결과를 함께 보여 줍니다.
- 구매 기록과 직접 입력한 당첨번호는 휴대폰 안(IndexedDB)에만 저장되며 이 저장소나 외부로 보내지 않습니다.
- 판정 결과는 참고용입니다. 최종 당첨 여부는 동행복권 공식 조회와 실물 복권으로 확인하세요.

## 당첨번호 자동 수집

- `.github/workflows/draws.yml`: 일요일 03:17 KST, 월요일 07:23 KST(보완) 실행
- `tools/fetch_draws.mjs`: 동행복권 결과 화면이 쓰는 조회 주소(`/lt645/selectPstLt645InfoNew.do`, GET)에서 최신 회차 묶음을 받음
  - 공식 공개 API가 아닙니다. `official_verified`는 "결과 화면 응답에서 가져옴"이라는 출처 표시이며 공식 인증·이용 허가를 뜻하지 않습니다
  - 매 실행마다 robots.txt를 확인하고 금지 규칙이 있으면 중단
  - 403·429 응답이면 재시도 없이 중단(관리자 확인 필요). 5xx·시간 초과는 최대 3번
  - 주간 요청 수: robots.txt 1 + 결과 페이지 1 + 조회 1
  - 역대 전체 수집(`history`)은 2026-11-03에 1회 완료(요청 209건, 2초 간격). 다시 실행하지 않음
- 파일 교체 순서: 기존 파일 검증 → 수집 → 전체 검증(1~최신 연속, 회차 수·최신 감소 없음, 날짜 순서, 번호·보너스, 상태값, 알려진 회차 값) → 임시 파일 → 재검증 → 교체
- 어느 단계든 실패하면 Actions가 실패로 끝나고 커밋·배포 단계는 실행되지 않음(기존 파일 그대로). 실패하면 GitHub가 저장소 주인에게 이메일로 알림
- 커밋 후 실제 배포 주소의 JSON을 다시 받아 회차 수·최신 회차가 같은지 확인

## 문제가 생겼을 때

### 앱에 "자동 수집이 늦어지고 있어요"가 보일 때
1. GitHub 저장소 → Actions → `update-draws`에서 마지막 실행 결과 확인
2. 실패 이유가 403·429·robots.txt면 자동 수집을 멈추고 앱의 "당첨번호" 탭에서 직접 입력
3. 일시적 오류(5xx·시간 초과)면 Actions에서 `Run workflow`로 다시 실행 (mode는 `update` 그대로)

### 당첨번호 파일이 잘못 배포됐을 때 (이전 정상 파일로 되돌리기)
1. 저장소 → `draws/lotto645.json` → History에서 마지막 정상 커밋 확인
2. 그 커밋의 파일 내용으로 되돌려 커밋 (예: `git checkout <정상 커밋> -- draws/lotto645.json && git commit && git push`)
3. 1~2분 뒤 배포본 확인: `https://kgun1981-web.github.io/dada-lotto-room/draws/lotto645.json`의 `count`, `latest` 값
4. 휴대폰 앱은 깨진 자료를 받으면 이전에 받은 정상 자료로 판정하고 "최신 확인 실패, 이전에 받은 자료 사용"을 표시함

## 통계 추천

- 규칙과 평가 구간은 `DESIGN.md` 16절에 과거 검증 실행 전에 등록(커밋 c5deff0)
- `lib/stats.js`: 추천·번호 통계·과거 검증. t회 추천은 t-1회까지 자료만 사용(테스트로 확인)
- `tools/backtest.mjs` → `draws/backtest.json`: 매주 수집 후 다시 계산. 등록 후 쌓이는 회차(1249회~)는 따로 집계

## 개발

- 원본: `app.html`, `lib/`, `sw.template.js`
- 배포 파일 생성: `node build.mjs` → `index.html`, `sw.js`
- 단위 테스트: `node --test`
- 브라우저 테스트(아이폰 13 에뮬레이션): `test/e2e_iphone.py`, `test/e2e_draws.py`, `test/e2e_stats.py` (로컬 서버 필요, 결과는 `e2e-log.txt`)
