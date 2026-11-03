# 복권 QR 읽기 브라우저 종단 테스트 (아이폰 13 에뮬레이션, 합성 QR 그림)
# 사용: python3 test/e2e_qr.py <앱 주소> <합성 QR 그림 폴더: ok.png other.png none.png cam.y4m>
import sys, os
from playwright.sync_api import sync_playwright

BASE, IMG = sys.argv[1], sys.argv[2]
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS' if ok else 'FAIL'), '-', name, ('· ' + detail) if detail else '')
rows = lambda page: [[page.input_value(f'#c{i}_{k}') for k in range(6)] for i in range(page.locator('#rows .grow').count())]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=[
        '--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        f'--use-file-for-fake-video-capture={os.path.join(IMG, "cam.y4m")}'])
    ctx = browser.new_context(**p.devices['iPhone 13'], locale='ko-KR', permissions=['camera'])
    page = ctx.new_page()
    errors, outside, reqs = [], [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: (reqs.append(r.url), outside.append(r.url) if 'localhost' not in r.url else None))
    page.goto(BASE); page.wait_for_timeout(500)
    page.tap('#tab-my')
    check('QR 판독기는 처음엔 안 불러옴', not any('jsQR' in u for u in reqs))

    page.fill('#round', '1248')
    page.set_input_files('#qrFile', os.path.join(IMG, 'other.png')); page.wait_for_timeout(800)
    check('다른 QR은 거부, 입력칸 그대로', '동행복권 로또 QR이 아니에요' in page.inner_text('#qrMsg') and page.input_value('#round') == '1248', page.inner_text('#qrMsg')[:80])
    check('읽은 QR 글자는 접혀 있음', not page.locator('#qrMsg .qr-raw').is_visible())
    page.tap('#qrMsg summary')
    check('누르면 읽은 QR 글자 보임', page.locator('#qrMsg .qr-raw').is_visible() and 'example.com' in page.inner_text('#qrMsg'))

    page.set_input_files('#qrFile', os.path.join(IMG, 'none.png')); page.wait_for_timeout(800)
    check('QR 없는 사진 안내', 'QR을 찾지 못했어요' in page.inner_text('#qrMsg'))

    page.set_input_files('#qrFile', os.path.join(IMG, 'ok.png')); page.wait_for_timeout(800)
    r = rows(page)
    check('사진에서 회차·번호 채움', page.input_value('#round') == '3001' and r == [['3', '9', '17', '25', '33', '41'], ['5', '11', '19', '27', '35', '43'], ['1', '2', '3', '4', '5', '6']], str(r))
    check('확인 안내 + 형식 확인 중 안내', '3001회 3게임' in page.inner_text('#qrMsg') and '확인 중' in page.inner_text('#qrMsg'))
    page.tap('#save'); page.wait_for_timeout(400)
    check('저장됨', page.locator('#list [data-id]').filter(has_text='3001회').count() == 1)
    page.set_input_files('#qrFile', os.path.join(IMG, 'ok.png')); page.wait_for_timeout(800)
    check('같은 복권 다시 읽으면 중복 안내', '이미 같은 복권' in page.inner_text('#qrMsg'))

    page.tap('#qrStart')
    page.wait_for_function("document.getElementById('round').value === '3002'", timeout=10000)
    check('카메라로 읽음', page.input_value('#round') == '3002' and rows(page) == [['5', '9', '11', '17', '25', '33']], str(rows(page)))
    check('읽은 뒤 카메라 닫힘', page.is_hidden('#qrBox'))
    page.tap('#qrStart'); page.wait_for_timeout(100)
    page.tap('#tab-gen'); page.wait_for_timeout(200)
    check('다른 탭으로 가면 카메라 닫힘', page.evaluate("!document.getElementById('qrVideo').srcObject"))

    check('바깥 주소 요청 0건 (QR 주소 안 엶)', not outside, ' '.join(outside[:3]))
    check('스크립트 오류 없음', not errors, ' | '.join(errors[:3]))
    browser.close()

fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} 통과')
sys.exit(1 if fails else 0)
