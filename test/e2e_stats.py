# 통계 추천·과거 검증 화면 브라우저 테스트 (아이폰 13 에뮬레이션)
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_common import import_pack
from playwright.sync_api import sync_playwright
BASE = sys.argv[1]
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail)); print(('PASS' if ok else 'FAIL'), '-', name, ('· ' + detail) if detail else '')
bt = json.load(open('draws/backtest.json'))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(**p.devices['iPhone 13'], locale='ko-KR'); page = ctx.new_page()
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until='networkidle'); page.wait_for_timeout(300)
    check('자료 없을 때 통계 추천 대신 안내', '빠짐없이' in page.inner_text('#statRule'))
    import_pack(page); page.wait_for_timeout(300)
    t = bt['next']['round']
    check('통계 추천과 무작위 설정이 한 화면에', page.is_visible('#statBox') and page.is_visible('#randBox'))
    check(f'제목에 {t}회용 표시', f'{t}회용 추천 10게임 (통계 5 + 무작위 5)' in page.inner_text('#statTitle'), page.inner_text('#statTitle'))
    check('안내 문구(확률 같음·근거 없음)', '당첨 가능성을 높인다는 근거는 없습니다' in page.inner_text('#statBox'))
    nums = lambda: [li.inner_text().split()[1:7] for li in page.locator('#games li').all()]
    games = nums()
    want = [[str(n) for n in g] for g in bt['next']['games']][:5]
    check('A~E = 과거 검증 파일의 다음 회차 통계 추천 앞 5게임', games[:5] == want, str(games[:2]))
    check('F~J 무작위 5게임, 통계와 겹치지 않음', len(games) == 10 and not set(map(tuple, games[5:])) & set(map(tuple, games[:5])))
    page.tap('#go'); page.wait_for_timeout(200)
    g3 = nums()
    check('"무작위 5게임만 새로 뽑기"는 F~J만 바꿈', g3[:5] == games[:5] and g3[5:] != games[5:])
    page.reload(wait_until='networkidle'); page.wait_for_timeout(300)
    games2 = nums()
    check('새로고침해도 통계 5게임은 같음', games2[:5] == games[:5])
    games = games2
    body = page.inner_text('#btBody')
    c = bt['preRegistered']['compare']
    check('과거 검증 표: 통계 추천 3개+ 일치 값', str(c['hit3plus']['strategy']) in body, body[:120].replace('\n', ' '))
    check('과거 검증 표: 무작위 평균·범위', f"{c['hit3plus']['random']['min']}~{c['hit3plus']['random']['max']}" in body)
    check('과거 검증 판정 문장', '무작위' in page.inner_text('.verdict') and '보장하지 않아요' in page.inner_text('.verdict'), page.inner_text('.verdict')[:80])
    page.locator('#numBox summary').tap()
    nb = page.inner_text('#numBody')
    check('번호별 통계 열림: 45개 번호', page.locator('#numBody .heat > div').count() == 45)
    check('번호별 통계: 4가지 목록', all(x in nb for x in ['많이 나온 번호', '오래 안 나온 번호', '역대 많이 나온 번호', '함께 많이 나온 번호쌍']))
    w = page.evaluate('[document.documentElement.scrollWidth, window.innerWidth]')
    check('가로 스크롤 없음', w[0] <= w[1], f'{w[0]} <= {w[1]}')
    page.tap('#toMy'); page.wait_for_timeout(200)
    rows = [[page.input_value(f'#c{i}_{k}') for k in range(6)] for i in range(5)]
    check('초안 1장 = 통계 추천 5게임', rows == want)
    ctx.set_offline(True); page.reload(wait_until='load'); page.wait_for_timeout(800)
    check('오프라인: 통계 추천 그대로', nums()[:5] == want and len(nums()) == 10)
    check('오프라인: 과거 검증 표시(저장본)', str(c['hit3plus']['strategy']) in page.inner_text('#btBody'))
    ctx.set_offline(False)
    check('스크립트 오류 없음', not errors, ' | '.join(errors[:3]))
    (page.screenshot(path=sys.argv[2]) if len(sys.argv) > 2 else None)
    b.close()
passed = sum(1 for _, ok, _ in results if ok); print(f'\n결과: {passed}/{len(results)} 통과'); sys.exit(0 if passed == len(results) else 1)
