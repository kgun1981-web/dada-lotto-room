// app.html(본문) →
//   index.html  : GitHub Pages 배포용 완전한 HTML 문서 (lib/·draws/ 를 직접 불러옴)
//   preview.html: Claude 아티팩트 시험용 한 파일 (lib·draws 내장)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const app = readFileSync('app.html', 'utf8');

// 배포용: doctype·head 추가, 본문은 그대로
const titleEnd = app.indexOf('</title>') + '</title>'.length;
const head = app.slice(0, titleEnd).trim();
const rest = app.slice(titleEnd).replace(/<meta name="claude:viewport-fit-sides"[^>]*>\s*/, '');
const styleEnd = rest.indexOf('</style>') + '</style>'.length;
// 화면에 보이는 버전: 배포 파일 생성 시각 (한국 시간)
const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString();
const APP_VERSION = kst.slice(0, 10).replace(/-/g, '.') + '-' + kst.slice(11, 16).replace(':', '');
const deploy = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="다다의 복권방">
<meta name="theme-color" content="#1f6b4f">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="icon" type="image/png" href="icons/icon-192.png">
${head}
${rest.slice(0, styleEnd).trim()}
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)} body{margin:0} img{max-width:100%}</style>
</head>
<body>
${rest.slice(styleEnd).trim()}
</body>
</html>
`;
writeFileSync('index.html', deploy.replace('__APP_VERSION__', APP_VERSION));

// 미리보기: lib·draws 내장
const strip = (f) => readFileSync(f, 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '');
const LIBS = ['lib/lotto.js', 'lib/tickets.js', 'lib/userdraws.js', 'lib/backup.js', 'lib/drafts.js', 'lib/stats.js', 'lib/store.js'];
const lib = LIBS.map(strip).join('\n');
const draws = existsSync('draws/lotto645.json') ? readFileSync('draws/lotto645.json', 'utf8') : 'null';
const preview = app.replace('__APP_VERSION__', '미리보기')
  .replace(/\/\*__LIB__\*\/[\s\S]*?\/\*__END_LIB__\*\//, () => lib)
  .replace(/\/\*__DRAWS__\*\/null\/\*__END_DRAWS__\*\//, () => draws)
  .replace(/\/\*__BACKTEST__\*\/null\/\*__END_BACKTEST__\*\//, () => readFileSync('draws/backtest.json', 'utf8'));
writeFileSync('preview.html', preview);
// 서비스 워커: 앱 파일 내용 해시로 캐시 버전 자동 갱신
const APP_FILES = ['./', './index.html', ...LIBS.map((f) => './' + f), './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];
const h = createHash('sha256');
for (const f of ['index.html', ...LIBS, 'manifest.webmanifest', 'sw.template.js']) h.update(readFileSync(f));
const version = h.digest('hex').slice(0, 10);
writeFileSync('sw.js', readFileSync('sw.template.js', 'utf8')
  .replace('__VERSION__', version).replace('__FILES__', JSON.stringify(APP_FILES)));

// 배포 파일 점검: 루트(/) 절대경로·외부 주소 참조 금지
const bad = [...deploy.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => u.startsWith('/') || /^https?:/.test(u));
const imports = [...deploy.matchAll(/from '([^']+)'/g)].map((m) => m[1]).filter((u) => !u.startsWith('./'));
if (bad.length || imports.length) { console.error('경로 오류:', bad, imports); process.exit(1); }
console.log('app', APP_VERSION, '/ sw.js version', version, '/ 경로 점검 통과');
console.log('index.html', deploy.length, 'bytes / preview.html', preview.length, 'bytes');
