import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const THREE = await import('../js/vendor/three-0.160.0.min.js');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the vendored three.js has every THREE.* part render.js uses', () => {
  const used = new Set(read('../js/render.js').match(/THREE\.[A-Za-z0-9]+/g).map((s) => s.slice(6)));
  const missing = [...used].filter((n) => THREE[n] === undefined);
  assert.deepEqual(missing, [], 'run tools/vendor-three.sh to rebuild js/vendor/three-0.160.0.min.js');
});

test('index.html loads nothing from other sites (the CSP in _headers allows only self)', () => {
  assert.doesNotMatch(read('../index.html'), /(src|href)="https?:/);
  assert.doesNotMatch(read('../index.html'), /<script>|type="importmap"/, 'inline scripts would need a CSP hash');
});
