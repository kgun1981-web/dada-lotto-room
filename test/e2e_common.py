# 브라우저 테스트 공통: 휴대폰 보관용 당첨번호 파일 만들기·불러오기
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
REAL = os.path.join(HERE, '..', 'draws', 'lotto645.json')  # 로컬 전용 (공개 저장소에 없음)

def pack_text():
    d = json.load(open(REAL))
    draws = [{'round': x['round'], 'date': x['date'], 'numbers': x['numbers'], 'bonus': x['bonus']} for x in d['draws']]
    return json.dumps({'kind': 'dada-lotto-backup', 'version': 3, 'drawsSource': '동행복권 결과 화면 (2026-11-03 수집)',
                       'tickets': [], 'userDraws': [], 'draws': draws})

def import_pack(page):
    page.tap('#tab-backup')
    page.fill('#importText', pack_text())
    page.tap('#importBtn')
    page.wait_for_function("document.getElementById('importMsg').textContent.includes('당첨번호 자료')", timeout=10000)
    msg = page.inner_text('#importMsg')
    page.fill('#importText', '')
    page.tap('#tab-gen')
    return msg
