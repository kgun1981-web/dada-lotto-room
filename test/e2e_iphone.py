# 배포판(index.html + sw.js) 브라우저 종단 테스트. 아이폰 화면 크기·터치로 실행.
# 사용: 저장소 상위 폴더를 http://localhost:PORT/ 로 서빙한 뒤
#   python3 test/e2e_iphone.py http://localhost:8765/dada-lotto-room/
import sys, json
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]
results = []
def fill_rows(page, games):
    # 화면의 행 수를 맞춘 뒤 칸마다 입력
    while page.locator('#rows .grow').count() < len(games):
        page.tap('#addRow')
    for i, g in enumerate(games):
        for k in range(6):
            page.fill(f'#c{i}_{k}', str(g[k]) if k < len(g) else '')
def read_rows(page):
    return [[page.input_value(f'#c{i}_{k}') for k in range(6)] for i in range(page.locator('#rows .grow').count())]
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS' if ok else 'FAIL'), '-', name, ('· ' + detail) if detail else '')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    iphone = p.devices['iPhone 13']
    ctx = browser.new_context(**iphone, locale='ko-KR')
    page = ctx.new_page()
    errors, requests = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.on('request', lambda r: requests.append(r.url))

    # 1. 첫 접속
    page.goto(BASE, wait_until='networkidle')
    check('제목 "다다의 복권방"', page.title() == '다다의 복권방', page.title())
    check('화면에 버전 표시', page.inner_text('#appVer').startswith('20'), page.inner_text('#appVer'))
    check('상단 상태줄 표시', '판정 가능' in page.inner_text('#status'), page.inner_text('#status'))
    check('번호 10게임 표시', page.locator('#games li').count() == 10)
    games = [li.inner_text().split() for li in page.locator('#games li').all()]
    ok = all(len(g) == 7 and len(set(g[1:])) == 6 and all(1 <= int(n) <= 45 for n in g[1:]) for g in games)
    check('각 게임 1~45 중복 없는 6개', ok)
    check('10게임 서로 다름', len({' '.join(g[1:]) for g in games}) == 10)
    w = page.evaluate('[document.documentElement.scrollWidth, window.innerWidth]')
    check('가로 스크롤 없음(아이폰 폭)', w[0] <= w[1], f'{w[0]} <= {w[1]}')
    page.tap('#tab-my')
    w2 = page.evaluate("[document.documentElement.scrollWidth, window.innerWidth, getComputedStyle(document.getElementById('c0_0')).inputMode || document.getElementById('c0_0').inputMode]")
    check('내 복권 화면 가로 스크롤 없음', w2[0] <= w2[1], f'{w2[0]} <= {w2[1]}')
    check('번호 칸은 숫자 키패드(inputmode=numeric)', page.get_attribute('#c0_0', 'inputmode') == 'numeric')
    page.tap('#tab-gen')

    # 2. 서비스 워커
    page.wait_for_function('navigator.serviceWorker && navigator.serviceWorker.controller !== null || true')
    page.reload(wait_until='networkidle')
    sw = page.evaluate('navigator.serviceWorker.getRegistration().then(r => r && r.active ? r.active.scriptURL : null)')
    check('서비스 워커 등록·활성', sw and sw.endswith('/dada-lotto-room/sw.js'), str(sw))
    scope = page.evaluate('navigator.serviceWorker.getRegistration().then(r => r && r.scope)')
    check('서비스 워커 범위 = 저장소 하위 경로', scope and scope.endswith('/dada-lotto-room/'), str(scope))
    man = page.evaluate("fetch('manifest.webmanifest').then(r => r.json())")
    check('manifest 이름·standalone·start_url', man['name'] == '다다의 복권방' and man['display'] == 'standalone' and man['start_url'] == './', json.dumps(man, ensure_ascii=False)[:80])

    # 3. 탭 전환 시 다른 탭 내용 숨김
    page.tap('#tab-my')
    vis = page.evaluate("['p-gen','p-my','p-backup'].map(id => getComputedStyle(document.getElementById(id)).display !== 'none')")
    check('내 복권 탭만 보임', vis == [False, True, False], str(vis))
    page.tap('#tab-gen')

    # 4. 패턴 회피 토글
    page.tap('#mode-rand')
    check('무작위 모드 전환', page.is_visible('#randBox') and not page.is_visible('#statBox'))
    page.tap('#filter')
    check('패턴 회피 끄기 → 재생성', '필터 꺼짐' in page.inner_text('#stat'))
    page.tap('#filter')
    check('패턴 회피 켜기', '필터 제외' in page.inner_text('#stat'))

    # 5. 초안 2장 흐름
    first5 = [li.inner_text().split()[1:] for li in page.locator('#games li').all()][:5]
    last5 = [li.inner_text().split()[1:] for li in page.locator('#games li').all()][5:]
    page.tap('#toMy')
    check('초안 1장(A~E) 채워짐', read_rows(page) == first5, str(read_rows(page))[:80])
    check('초안 안내 문구 표시', page.is_visible('#draftNote'))
    check('저장 전 "다음 장" 버튼 숨김', not page.is_visible('#nextDraft'))
    page.fill('#round', '1249')
    page.tap('#save')
    page.wait_for_timeout(300)
    check('1장 저장 후 "다음 장" 버튼 표시', page.is_visible('#nextDraft'))
    page.tap('#nextDraft')
    check('초안 2장(F~J) 채워짐', read_rows(page) == last5)
    check('다음 장 회차 유지', page.input_value('#round') == '1249', page.input_value('#round'))
    page.tap('#save')
    page.wait_for_timeout(300)
    check('2장 저장 후 "다음 장" 버튼 사라짐', not page.is_visible('#nextDraft'))
    cards = page.locator('#list [data-id]')
    check('1249회 2장 저장됨', cards.count() == 2)
    check('1249회는 판정 불가 표시', '판정 불가' in page.inner_text('#list'))

    # 6. 잘못된 입력 거부
    for bad in [['1', '2', '3', '4', '5', '5'], ['1', '2', '3', '4', '5', '46'], ['1', '2', '', '4', '5', '6'], ['0', '2', '3', '4', '5', '6']]:
        page.fill('#round', '1209'); fill_rows(page, [bad]); page.tap('#save'); page.wait_for_timeout(150)
        check(f'잘못된 입력 거부: {" ".join(bad) or "빈칸"}', page.is_visible('#formErr') and cards.count() == 2, page.inner_text('#formErr'))
    # 숫자 키패드처럼 실제 타이핑: 기호는 칸에 들어가지 않고, 두 자리·5~9 입력 시 다음 칸으로 이동
    page.tap('#cancelEdit') if page.is_visible('#cancelEdit') else None
    page.fill('#c0_0', ''); page.focus('#c0_0')
    page.keyboard.type('-1')
    check('칸에 기호 입력 안 됨', page.input_value('#c0_0') == '1', page.input_value('#c0_0'))
    page.fill('#c0_0', ''); page.focus('#c0_0')
    page.keyboard.type('217')
    check('두 자리 입력 후 다음 칸 이동', page.input_value('#c0_0') == '21' and page.input_value('#c0_1') == '7', f"{page.input_value('#c0_0')}/{page.input_value('#c0_1')}")
    page.fill('#c0_0', ''); page.fill('#c0_1', ''); page.focus('#c0_0')
    page.keyboard.type('84')
    check('5~9 한 자리 입력 후 다음 칸 이동', page.input_value('#c0_0') == '8' and page.input_value('#c0_1') == '4')
    page.fill('#c0_0', ''); page.fill('#c0_1', '')

    # 7. 정상 회차 판정 (1209회 테스트 데이터)
    page.fill('#round', '1209'); fill_rows(page, [[2, 17, 20, 35, 37, 39], [2, 17, 20, 35, 37, 24], [1, 2, 3, 4, 5, 6]]); page.tap('#save'); page.wait_for_timeout(300)
    t1209 = page.locator('#list [data-id]').filter(has_text='1209회').first.inner_text()
    check('1209회: 1등·2등·낙첨 표시', '1등' in t1209 and '2등' in t1209 and '낙첨' in t1209, t1209.replace('\n', ' ')[:120])

    # 8. 새로고침 후 유지
    page.reload(wait_until='networkidle')
    page.tap('#tab-my')
    check('새로고침 후 기록 3장 유지', page.locator('#list [data-id]').count() == 3)

    # 9. 수정·삭제(취소/확인)
    card = page.locator('#list [data-id]').filter(has_text='1209회').first
    card.locator('[data-act=edit]').tap()
    check('수정 모드 진입', page.inner_text('#formTitle') == '복권 수정')
    check('수정 시 칸에 기존 번호 채워짐', read_rows(page)[0] == ['2', '17', '20', '35', '37', '39'], str(read_rows(page))[:60])
    page.tap('#cancelEdit')
    check('수정 취소', page.inner_text('#formTitle') == '복권 등록')
    card = page.locator('#list [data-id]').filter(has_text='1209회').first
    card.locator('[data-act=del]').tap(); card.locator('[data-act=delNo]').tap()
    check('삭제 취소 시 유지', page.locator('#list [data-id]').count() == 3)

    # 10. 백업 → 전체 삭제 → 복원
    page.tap('#tab-backup')
    page.tap('#export')
    bk = page.input_value('#bkText')
    check('백업 내용 생성(3장)', len(json.loads(bk)['tickets']) == 3)
    page.tap('#wipe'); page.tap('#wipeNo')
    page.tap('#wipe'); page.tap('#wipeYes'); page.wait_for_timeout(300)
    page.tap('#tab-my')
    check('전체 삭제 후 0장', page.locator('#list [data-id]').count() == 0)
    page.tap('#tab-backup')
    page.fill('#importText', bk); page.tap('#importBtn'); page.wait_for_timeout(300)
    check('백업 복원 3장', '3장 추가' in page.inner_text('#importMsg'), page.inner_text('#importMsg'))
    page.fill('#importText', bk); page.tap('#importBtn'); page.wait_for_timeout(300)
    check('같은 백업 다시 불러오면 중복 건너뜀', '0장 추가' in page.inner_text('#importMsg'), page.inner_text('#importMsg'))

    # 11. 오프라인
    ctx.set_offline(True)
    page.reload(wait_until='load')
    page.wait_for_timeout(800)
    check('오프라인에서 화면 열림', page.title() == '다다의 복권방')
    check('오프라인 상태 표시(최신 확인 실패, 이전 자료 사용)', '최신 확인 실패, 이전에 받은 자료 사용' in page.inner_text('#status'), page.inner_text('#status'))
    page.tap('#tab-my')
    check('오프라인에서 저장 복권 조회', page.locator('#list [data-id]').count() == 3)
    check('오프라인에서 기존 회차 판정 유지', '1등' in page.inner_text('#list'))
    page.tap('#tab-gen'); page.tap('#go')
    check('오프라인에서 번호 생성', page.locator('#games li').count() == 10)
    ctx.set_offline(False)

    # 12. 앱 업데이트(서비스 워커 새 버전): 입력 없으면 자동 새로고침, 입력 중이면 안내만
    import os, re
    sw_path = os.environ.get('SW_PATH')
    if sw_path:
        old = open(sw_path).read()
        old_ver = re.search(r"VERSION = '([^']+)'", old).group(1)
        try:
            page.reload(wait_until='networkidle')
            loads = []
            page.on('load', lambda: loads.append(1))
            open(sw_path, 'w').write(old.replace(old_ver, old_ver + 'u'))
            page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")  # 앱으로 돌아온 상황
            page.wait_for_timeout(3000)
            check('새 버전 감지 후 자동 새로고침(입력 없음)', len(loads) >= 1, f'load {len(loads)}회')
            keys = page.evaluate('caches.keys()')
            check('업데이트 후 새 캐시만 남음', keys == [f'dada-lotto-{old_ver}u'], str(keys))
            page.tap('#tab-my')
            check('업데이트 후 기록 3장 유지', page.locator('#list [data-id]').count() == 3)
            # 입력 중일 때는 자동 새로고침하지 않고 안내
            page.fill('#round', '1300')
            loads.clear()
            open(sw_path, 'w').write(old.replace(old_ver, old_ver + 'v'))
            page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
            page.wait_for_timeout(3000)
            check('입력 중에는 자동 새로고침 안 함', len(loads) == 0 and page.input_value('#round') == '1300')
            check('입력 중에는 "새 버전 적용" 안내 표시', page.is_visible('#updateNote'))
            page.tap('#applyUpdate')
            check('입력 중 "새 버전 적용" → 확인 단계', page.is_visible('#applyConfirm') and len(loads) == 0)
            page.tap('#applyNo')
            check('확인 단계 취소 시 입력 유지', page.input_value('#round') == '1300' and len(loads) == 0)
            page.tap('#applyUpdate')
            with page.expect_navigation(timeout=5000):
                page.tap('#applyYes')
            page.wait_for_load_state('networkidle')
            check('"새 버전 적용" 누르면 새로고침', len(loads) >= 1 and page.input_value('#round') == '')
        finally:
            open(sw_path, 'w').write(old)

    # 13. 외부 요청 없음
    origin = BASE.split('/dada-lotto-room')[0]
    ext = sorted({u for u in requests if not u.startswith(origin)})
    check('외부(다른 주소) 요청 없음', not ext, ', '.join(ext[:3]))
    real = [e for e in errors if 'ERR_INTERNET_DISCONNECTED' not in e]  # 오프라인 단계의 당첨 데이터 요청 실패는 의도된 동작
    check('스크립트·파일 오류 없음 (오프라인 단계 제외)', not real, ' | '.join(real[:3]))

    # 14. 저장 공간 상태
    print('IDB_COUNT', page.evaluate("new Promise(r => { const q = indexedDB.open('dada-lotto'); q.onsuccess = () => { const t = q.result.transaction('tickets').objectStore('tickets').count(); t.onsuccess = () => r(t.result); }; })"))
    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
print(f'\n결과: {passed}/{len(results)} 통과')
sys.exit(0 if passed == len(results) else 1)
