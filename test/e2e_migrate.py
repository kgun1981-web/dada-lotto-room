# 예전 버전 사용자: localStorage에 남은 당첨번호 사본이 휴대폰 저장소로 자동으로 옮겨지는지
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_common import REAL
from playwright.sync_api import sync_playwright
BASE = sys.argv[1]
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail)); print(('PASS' if ok else 'FAIL'), '-', name, ('· ' + detail) if detail else '')
old = open(REAL).read()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(**p.devices['iPhone 13'], locale='ko-KR'); page = ctx.new_page()
    page.goto(BASE + 'manifest.webmanifest')
    page.evaluate("t => localStorage.setItem('dada-lotto-draws-good', t)", old)
    page.goto(BASE, wait_until='networkidle'); page.wait_for_timeout(500)
    check('예전 사본 자동 이전: 1248회차', '휴대폰에 보관한 당첨번호 1248회차' in page.inner_text('#status'), page.inner_text('#status'))
    check('이전 뒤 예전 사본 삭제', page.evaluate("localStorage.getItem('dada-lotto-draws-good')") is None)
    n = page.evaluate("new Promise(r => { const q = indexedDB.open('dada-lotto'); q.onsuccess = () => { const c = q.result.transaction('draws').objectStore('draws').count(); c.onsuccess = () => r(c.result); }; })")
    check('휴대폰 저장소에 1248회차', n == 1248, str(n))
    keys = page.evaluate("new Promise(r => { const q = indexedDB.open('dada-lotto'); q.onsuccess = () => { const g = q.result.transaction('draws').objectStore('draws').get(1248); g.onsuccess = () => r(Object.keys(g.result).sort()); }; })")
    check('보관 항목은 회차·날짜·번호·보너스(+상태·출처)만', keys == ['bonus', 'date', 'numbers', 'round', 'source', 'status'], str(keys))
    page.reload(wait_until='networkidle')
    check('새로고침 후 유지', '1248회차' in page.inner_text('#status'))
    # 손상된 예전 사본은 옮기지 않음
    ctx2 = b.new_context(**p.devices['iPhone 13']); pg2 = ctx2.new_page()
    pg2.goto(BASE + 'manifest.webmanifest'); pg2.evaluate("localStorage.setItem('dada-lotto-draws-good', '{\"draws\":[')")
    pg2.goto(BASE, wait_until='networkidle'); pg2.wait_for_timeout(300)
    check('손상된 예전 사본은 옮기지 않음', '당첨번호 파일을 불러와' in pg2.inner_text('#status'))
    b.close()
passed = sum(1 for _, ok, _ in results if ok); print(f'\n결과: {passed}/{len(results)} 통과'); sys.exit(0 if passed == len(results) else 1)
