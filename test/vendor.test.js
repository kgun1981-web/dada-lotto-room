import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('vendor/jsQR.js가 기록한 원본 해시와 같음 (vendor/README.md)', () => {
  const sha = createHash('sha256').update(readFileSync(new URL('../vendor/jsQR.js', import.meta.url))).digest('hex');
  assert.equal(sha, '3325b0888fa4745c4e6940897d8c4f426fbaae76901fcbfe1871a04e90a51655');
  assert.match(readFileSync(new URL('../vendor/README.md', import.meta.url), 'utf8'), new RegExp(sha));
});
