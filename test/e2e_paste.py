# 공식 결과 화면 붙여넣기 브라우저 종단 테스트 (아이폰 13 에뮬레이션)
# 사용: python3 test/e2e_paste.py http://localhost:8765/dada-lotto-room/
import sys, os, json, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_common import import_pack
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]
# 실제 복사본은 로컬 전용 (test/local/, 공개 저장소에 없음). 보관 자료 파일도 로컬 전용이라 이 테스트는 로컬에서만 실행
FULL = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'local', 'fixtures-paste-1248.txt'), encoding='utf8').read()
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS' if ok else 'FAIL'), '-', name, ('· ' + detail) if detail else '')

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

def paste(page, text):
    page.tap('#tab-draw')
    page.fill('#pasteText', text)
    page.tap('#pasteRead'); page.wait_for_timeout(150)
    return page.inner_text('#pasteResult')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = browser.new_context(**p.devices['iPhone 13'], locale='ko-KR')
    page = ctx.new_page()
    errors, outside = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: outside.append(r.url) if 'localhost' not in r.url else None)
    page.goto(BASE); page.wait_for_timeout(500)
    import_pack(page)

    # 3등·4등·5등 복권
    add_ticket(page, 1248, [[16, 18, 27, 36, 38, 1], [16, 18, 27, 36, 40, 41], [16, 18, 27, 40, 41, 43]])
    t = ticket_text(page, 1248)
    check('붙여넣기 전: 4·5등 고정 금액', '4등 · 50,000원' in t and '5등 · 5,000원' in t, t.replace('\n', ' ')[:120])
    check('붙여넣기 전: 3등은 금액 확인 필요 + 안내', '3등 · 금액 확인 필요' in t and '붙여넣으면 금액이 표시' in t)

    page.tap('#tab-draw')
    link = page.locator('#officialLink')
    check('동행복권 결과 화면 링크(새 창)', link.get_attribute('href') == 'https://www.dhlottery.co.kr/lt645/result' and link.get_attribute('target') == '_blank')

    r = paste(page, FULL)
    check('1247회: 이미 같은 내용', '1247회' in r and '이미 앱에 같은 내용' in r, r.replace('\n', ' ')[:200])
    check('1248회: 당첨금 표만 저장 (체크됨)', '당첨금 표만 저장' in r and page.locator('#pasteResult input[data-pi]:checked').count() == 1)
    check('당첨금 표 미리보기', '1,933,658,450원' in r and '2,723,467' in r)
    page.tap('#pasteSave'); page.wait_for_timeout(300)
    check('저장 안내', '1248회 저장했어요' in page.inner_text('#pasteMsg'), page.inner_text('#pasteMsg'))
    check('붙여넣기 칸 비움', page.input_value('#pasteText') == '')
    check('목록에 당첨금 표 있음', '당첨금 표 있음' in page.locator('#drawList [data-round="1248"]').inner_text())
    t = ticket_text(page, 1248)
    check('저장 후: 3등 실제 금액', '3등 · 1,480,597원' in t, t.replace('\n', ' ')[:140])
    check('번호가 보관 자료와 같으니 경고 없음', '직접 입력한' not in t and '금액 확인 필요' not in t)

    r = paste(page, FULL)
    check('다시 붙여넣으면 둘 다 이미 있음', r.count('이미 앱에 같은 내용') == 2 and page.is_hidden('#pasteSaveRow'))

    r = paste(page, FULL.replace('\n45\n+', '\n44\n+'))
    check('다른 번호는 저장 안 함', '1247회' in r and '달라요' in r and '저장하지 않았어요' in r, r.replace('\n', ' ')[:160])

    r = paste(page, FULL.replace('\n27\n', '\n18\n'))
    check('번호 중복 읽힘 → 저장 안 하고 입력칸 안내', '1248회' in r and '번호' in r and page.locator('[data-fill]').count() >= 1 and page.locator('#pasteResult input[data-pi]').count() == 0, r.replace('\n', ' ')[:200])
    page.locator('[data-fill]').first.tap(); page.wait_for_timeout(200)
    check('불완전한 번호는 입력칸에 채우지 않음(회차만)', page.input_value('#d0') == '' and page.input_value('#dRound') == '1248')
    page.tap('#drawCancel') if page.is_visible('#drawCancel') else None
    page.fill('#dRound', '')
    r = paste(page, '16\n18\n27\n36\n38\n42\n+\n보너스번호\n22')
    check('회차 없는 복사: 입력칸 채우기 버튼', '회차를 찾지 못했어요' in r and page.locator('[data-fill]').count() == 1)
    page.tap('[data-fill]'); page.wait_for_timeout(200)
    check('입력칸에 번호 채움', [page.input_value(f'#d{k}') for k in range(6)] == ['16', '18', '27', '36', '38', '42'] and page.input_value('#dBonus') == '22')
    page.tap('#drawCancel') if page.is_visible('#drawCancel') else None

    nxt = FULL.replace('1248회', '1249회').replace('제 1248회', '제 1249회').replace('2026.10.31', '2026.11.07').replace('\n16\n18\n27\n36\n38\n42\n', '\n1\n2\n3\n4\n5\n6\n')
    r = paste(page, nxt.replace('제 1247회', '제 1250회').replace('2026.10.24', '2026.11.14'))
    boxes = page.locator('#pasteResult input[data-pi]')
    check('숨은 옆 회차(새 회차)는 기본 선택 안 함 + 안내', boxes.count() == 2 and page.locator('#pasteResult input[data-pi]:checked').count() == 1 and page.is_visible('#pasteHint'), r.replace('\n', ' ')[:160])
    check('새 회차: 새로 저장', '1249회' in r and '새로 저장' in r)
    page.tap('#pasteSave'); page.wait_for_timeout(300)
    check('체크 안 한 1250회는 저장 안 됨', page.locator('#drawList [data-round="1250"]').count() == 0)
    check('새 회차 저장 → 판정 가능 1249회', '마지막 1249회' in page.inner_text('#status'), page.inner_text('#status'))
    add_ticket(page, 1249, [[1, 2, 3, 4, 5, 6]])
    t = ticket_text(page, 1249)
    check('새 회차 1등 금액은 표 기준 + 직접 입력 경고', '1등 · 1,933,658,450원' in t and '직접 붙여넣은 당첨번호 기준' in t, t.replace('\n', ' ')[:140])

    page.tap('#tab-backup'); page.tap('#export'); page.wait_for_timeout(300)
    bk = json.loads(page.input_value('#bkText'))
    ud = {d['round']: d for d in bk['userDraws']}
    check('백업에 당첨금 표 포함', len(ud.get(1248, {}).get('ranks', [])) == 5 and len(ud.get(1249, {}).get('ranks', [])) == 5)

    page.reload(); page.wait_for_timeout(600)
    check('새로고침 후 금액 유지', '3등 · 1,480,597원' in ticket_text(page, 1248))
    check('동행복권 등 바깥 주소 요청 0건', not outside, ' '.join(outside[:3]))
    check('스크립트 오류 없음', not errors, ' | '.join(errors[:3]))
    ctx.close()

    # 빠진 회차 안내: 시계를 2026-11-15 (1249·1250회 추첨 뒤)로
    ctx = browser.new_context(**p.devices['iPhone 13'], locale='ko-KR')
    page = ctx.new_page()
    page.clock.install(time=datetime.datetime(2026, 11, 15, 12, 0, tzinfo=datetime.timezone.utc))
    page.goto(BASE); page.wait_for_timeout(500)
    import_pack(page)
    page.tap('#tab-draw')
    m = page.inner_text('#missingNote') if page.is_visible('#missingNote') else ''
    check('빠진 회차 안내 (1249~1250회)', '1249~1250회 (2회)' in m, m)
    ctx.close()
    browser.close()

fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} 통과')
sys.exit(1 if fails else 0)
