# 당첨번호 직접 등록 기능 브라우저 종단 테스트 (아이폰 13 에뮬레이션)
# 사용: python3 test/e2e_draws.py http://localhost:8765/dada-lotto-room/
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_common import import_pack
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS' if ok else 'FAIL'), '-', name, ('· ' + detail) if detail else '')

def enter_draw(page, round_, date, nums, bonus):
    if round_ is not None and not page.is_disabled('#dRound'):
        page.fill('#dRound', str(round_))
    page.fill('#dDate', date)
    for k in range(6):
        page.fill(f'#d{k}', str(nums[k]) if k < len(nums) else '')
    page.fill('#dBonus', str(bonus) if bonus is not None else '')
    page.tap('#drawCheck')
    page.wait_for_timeout(150)

def ticket_text(page, round_):
    loc = page.locator('#list [data-id]').filter(has_text=f'{round_}회')
    return loc.first.inner_text() if loc.count() else ''

def add_ticket(page, round_, games):
    page.tap('#tab-my')
    page.fill('#round', str(round_))
    while page.locator('#rows .grow').count() < len(games):
        page.tap('#addRow')
    for i, g in enumerate(games):
        for k in range(6):
            page.fill(f'#c{i}_{k}', str(g[k]))
    page.tap('#save'); page.wait_for_timeout(300)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = browser.new_context(**p.devices['iPhone 13'], locale='ko-KR')
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))

    # 1. 이전 버전(저장소 v1)에 복권이 있던 휴대폰에서 업데이트
    page.goto(BASE + 'manifest.webmanifest')
    page.evaluate("""new Promise((res, rej) => {
      const q = indexedDB.open('dada-lotto', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('tickets', { keyPath: 'id' }).createIndex('round', 'round');
      q.onsuccess = () => { const t = q.result.transaction('tickets', 'readwrite');
        t.objectStore('tickets').put({ id: 'abcdefabcdef0001', round: 1249, games: [[3, 11, 25, 32, 40, 44], [1, 2, 3, 4, 5, 6]], memo: '', createdAt: '2026-11-03T10:00:00.000Z' });
        t.oncomplete = () => { q.result.close(); res(); }; t.onerror = () => rej(t.error); };
      q.onerror = () => rej(q.error);
    })""")
    page.goto(BASE, wait_until='networkidle')
    page.tap('#tab-my')
    check('업데이트 후 이전 버전 복권 유지', '1249회' in ticket_text(page, 1249))
    check('당첨번호 없으면 판정 불가 + 등록 안내', '판정 불가' in ticket_text(page, 1249) and '당첨번호 탭' in ticket_text(page, 1249))
    ver = page.evaluate("new Promise(r => { const q = indexedDB.open('dada-lotto'); q.onsuccess = () => { r([q.result.version, [...q.result.objectStoreNames]]); q.result.close(); }; })")
    check('저장소 v3로 업그레이드, 기존 복권 유지 + 당첨번호 공간 추가', ver[0] == 3 and 'userDraws' in ver[1] and 'draws' in ver[1], str(ver))
    m = import_pack(page)
    check('당첨번호 파일 불러오기', '1248회차 추가' in m, m[:60])
    page.tap('#tab-my')
    check('불러온 뒤 1248회 이전 복권은 판정, 1249회는 판정 불가', '판정 불가' in ticket_text(page, 1249))

    # 2. 탭 4개
    page.tap('#tab-draw')
    vis = page.evaluate("['p-gen','p-my','p-draw','p-backup'].map(id => getComputedStyle(document.getElementById(id)).display !== 'none')")
    check('당첨번호 탭만 보임', vis == [False, False, True, False], str(vis))
    w = page.evaluate('[document.documentElement.scrollWidth, window.innerWidth]')
    check('당첨번호 화면 가로 스크롤 없음', w[0] <= w[1], f'{w[0]} <= {w[1]}')
    check('회차·추첨일 기본값 없음(추측 금지)', page.input_value('#dRound') == '' and page.input_value('#dDate') == '')
    check('빈 목록 안내', '직접 등록한 당첨번호가 없어요' in page.inner_text('#drawList'))

    # 3. 입력 검증
    enter_draw(page, 1249, '', [3, 11, 25, 32, 40, 44], 9)
    check('추첨일 없으면 거부', page.is_visible('#drawErr') and '추첨일' in page.inner_text('#drawErr'))
    enter_draw(page, 1249, '2026-11-07', [3, 11, 25, 32, 40, 40], 9)
    check('번호 중복 거부', page.is_visible('#drawErr') and '중복' in page.inner_text('#drawErr'))
    enter_draw(page, 1249, '2026-11-07', [3, 11, 25, 32, 40, 44], 44)
    check('보너스가 본번호와 같으면 거부', page.is_visible('#drawErr'))
    enter_draw(page, 1249, '2026-11-07', [3, 11, 25, 32, 40, 44], None)
    check('보너스 없으면 거부', page.is_visible('#drawErr') and '보너스' in page.inner_text('#drawErr'))
    enter_draw(page, 1249, '2026-11-07', [3, 11, 25, 32, 40], 9)
    check('번호 일부 빈칸 거부', page.is_visible('#drawErr'))

    # 4. 키패드 입력: 자동 칸 이동 → 보너스 칸까지
    for k in range(6): page.fill(f'#d{k}', '')
    page.fill('#dBonus', '')
    page.focus('#d0'); page.keyboard.type('311253240449')
    vals = [page.input_value(f'#d{k}') for k in range(6)] + [page.input_value('#dBonus')]
    check('키패드 입력 자동 이동(마지막은 보너스 칸)', vals[1:] == ['11', '25', '32', '40', '44', '9'] or vals == ['31', '12', '5', '32', '40', '44', '9'], str(vals))

    # 5. 확인 → 저장
    enter_draw(page, 1249, '2026-11-07', [3, 11, 25, 32, 40, 44], 9)
    check('저장 전 확인 화면', page.is_visible('#drawConfirm') and '1249회' in page.inner_text('#drawConfirmText'), page.inner_text('#drawConfirmText')[:60])
    page.tap('#drawNo')
    check('"고치기"는 저장 안 함', page.locator('#drawList [data-round]').count() == 0)
    page.tap('#drawCheck'); page.wait_for_timeout(150); page.tap('#drawYes'); page.wait_for_timeout(300)
    check('직접 입력 저장', page.locator('#drawList [data-round="1249"]').count() == 1)
    check('저장 후 입력칸 비움', page.input_value('#dRound') == '')
    check('상단에 직접 입력 회차 수 표시', '직접 입력 1회차' in page.inner_text('#status'), page.inner_text('#status'))
    page.tap('#tab-my')
    t = ticket_text(page, 1249)
    check('1249회 복권 판정(1등·낙첨)', '1등' in t and '낙첨' in t, t.replace('\n', ' ')[:100])
    check('직접 입력 기준 경고 표시', '직접 입력한 당첨번호 기준' in t and '공식 결과와 대조 필요' in t)

    # 6. 같은 회차 중복 등록 막기
    page.tap('#tab-draw')
    enter_draw(page, 1249, '2026-11-07', [1, 2, 3, 4, 5, 6], 9)
    check('같은 회차 다시 등록 막음', page.is_visible('#drawErr') and '이미' in page.inner_text('#drawErr'))
    page.fill('#dRound', '')

    # 7. 수정 → 판정 다시 계산
    page.locator('#drawList [data-round="1249"] [data-dact=edit]').tap()
    check('수정 시 값 채움·회차 고정', page.input_value('#d0') == '3' and page.is_disabled('#dRound'))
    enter_draw(page, None, '2026-11-07', [1, 2, 3, 4, 5, 6], 9)
    page.tap('#drawYes'); page.wait_for_timeout(300)
    page.tap('#tab-my')
    t = ticket_text(page, 1249)
    check('수정 후 판정 다시 계산(A 낙첨, B 1등)', t.count('1등') == 1 and '낙첨' in t and t.index('낙첨') < t.index('1등'), t.replace('\n', ' ')[:100])

    # 8. 공개 데이터와 충돌
    add_ticket(page, 1209, [[2, 17, 20, 35, 37, 39]])
    page.tap('#tab-draw')
    enter_draw(page, 1209, '2026-01-31', [2, 17, 20, 35, 37, 40], 24)
    check('저장 전 공개 데이터와 다르다고 안내', '공개 데이터와 다릅니다' in page.inner_text('#drawConfirmText'))
    page.tap('#drawYes'); page.wait_for_timeout(300)
    check('충돌 안내 표시', page.is_visible('#conflicts') and '1209회' in page.inner_text('#conflicts'))
    check('기본은 공개 데이터로 판정', '지금 판정 기준: 공개 데이터' in page.inner_text('#conflicts'))
    page.tap('#tab-my')
    t = ticket_text(page, 1209)
    check('공개 데이터 기준 1등, 경고 없음', '1등' in t and '직접 입력한' not in t, t.replace('\n', ' ')[:80])
    page.tap('#tab-draw'); page.locator('[data-conf="1209"] [data-cact=useUser]').tap(); page.wait_for_timeout(300)
    check('"내 입력으로 판정" 선택 반영', '지금 판정 기준: 직접 입력' in page.inner_text('#conflicts'))
    page.tap('#tab-my')
    t = ticket_text(page, 1209)
    check('내 입력 기준 3등 + 경고', '3등' in t and '직접 입력한 당첨번호 기준' in t, t.replace('\n', ' ')[:80])
    page.tap('#tab-draw'); page.locator('[data-conf="1209"] [data-cact=dropUser]').tap(); page.wait_for_timeout(300)
    check('"내 입력 지우기" 후 충돌 사라짐', not page.is_visible('#conflicts') and page.locator('#drawList [data-round="1209"]').count() == 0)

    # 9. 공개와 같은 값은 충돌 아님
    enter_draw(page, 1209, '2026-01-31', [2, 17, 20, 35, 37, 39], 24)
    check('공개와 같으면 "같습니다" 안내', '공개 데이터와 같습니다' in page.inner_text('#drawConfirmText'))
    page.tap('#drawYes'); page.wait_for_timeout(300)
    check('공개와 같으면 충돌 없음', not page.is_visible('#conflicts'))
    page.locator('#drawList [data-round="1209"] [data-dact=del]').tap(); page.locator('#drawList [data-round="1209"] [data-dact=delYes]').tap(); page.wait_for_timeout(300)

    # 10. 새로고침 후 유지
    page.reload(wait_until='networkidle'); page.tap('#tab-draw')
    check('새로고침 후 직접 입력 유지', page.locator('#drawList [data-round="1249"]').count() == 1)

    # 11. 백업 v2 왕복
    page.tap('#tab-backup'); page.tap('#export')
    bk = json.loads(page.input_value('#bkText'))
    check('백업에 직접 입력 당첨번호 + 보관 자료 포함(v3)', bk['version'] == 3 and len(bk['userDraws']) == 1 and bk['userDraws'][0]['status'] == 'user_entered' and len(bk['draws']) == 1248)
    page.tap('#tab-draw')
    page.locator('#drawList [data-round="1249"] [data-dact=del]').tap()
    page.locator('#drawList [data-round="1249"] [data-dact=delNo]').tap()
    check('삭제 취소 시 유지', page.locator('#drawList [data-round="1249"]').count() == 1)
    page.locator('#drawList [data-round="1249"] [data-dact=del]').tap()
    page.locator('#drawList [data-round="1249"] [data-dact=delYes]').tap(); page.wait_for_timeout(300)
    page.tap('#tab-my')
    check('직접 입력 삭제 → 판정 불가로 돌아감', '판정 불가' in ticket_text(page, 1249))
    page.tap('#tab-backup')
    page.fill('#importText', json.dumps(bk)); page.tap('#importBtn'); page.wait_for_timeout(300)
    msg = page.inner_text('#importMsg')
    check('백업 복원: 당첨번호 1회차 추가', '당첨번호 1회차 추가' in msg, msg[:100])
    page.tap('#tab-my')
    check('복원 후 다시 판정', '1등' in ticket_text(page, 1249))

    # 12. 다른 값 백업은 덮어쓰지 않음
    bk2 = json.loads(json.dumps(bk)); bk2['userDraws'][0]['numbers'] = [13, 14, 15, 16, 17, 18]
    page.tap('#tab-backup'); page.fill('#importText', json.dumps(bk2)); page.tap('#importBtn'); page.wait_for_timeout(300)
    check('다른 값 백업은 덮어쓰지 않고 안내', '덮어쓰지 않았어요' in page.inner_text('#importMsg'))

    # 13. 예전 v1 백업 파일
    v1 = {'kind': 'dada-lotto-backup', 'version': 1, 'tickets': [{'id': 'abcdefabcdef0099', 'round': 1250, 'games': [[1, 2, 3, 4, 5, 6]], 'createdAt': '2026-11-03T10:00:00.000Z'}]}
    page.fill('#importText', json.dumps(v1)); page.tap('#importBtn'); page.wait_for_timeout(300)
    check('예전(v1) 백업도 불러오기', '복권 1장 추가' in page.inner_text('#importMsg'), page.inner_text('#importMsg')[:60])

    # 14. 오프라인에서도 직접 입력으로 판정
    ctx.set_offline(True)
    page.reload(wait_until='load'); page.wait_for_timeout(800)
    page.tap('#tab-my')
    check('오프라인에서 직접 입력 기준 판정', '1등' in ticket_text(page, 1249) and '직접 입력한' in ticket_text(page, 1249))
    ctx.set_offline(False)

    check('스크립트 오류 없음', not errors, ' | '.join(errors[:3]))
    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
print(f'\n결과: {passed}/{len(results)} 통과')
sys.exit(0 if passed == len(results) else 1)
