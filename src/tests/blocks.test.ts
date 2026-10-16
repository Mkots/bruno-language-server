import { test } from 'node:test';
import assert from 'node:assert';
import { findBlocks } from '../diagnostics/blocks';
import { diagnose } from './helpers';

const names = (text: string) => findBlocks(text.split('\n')).map(b => b.name);

test('simple blocks and adjacent blocks', () => {
  const blocks = findBlocks('meta {\n  name: a\n}\nget {\n  url: x\n}'.split('\n'));
  assert.deepStrictEqual(blocks, [
    { name: 'meta', startLine: 0, endLine: 2 },
    { name: 'get', startLine: 3, endLine: 5 },
  ]);
});

test('braces and bare } inside scripts do not open or close blocks', () => {
  const text = [
    'script:pre-request {',
    '  const { a } = require("x");',
    '  function f() {',
    '    if (a) {',
    '    }',
    '  }',
    '}',
    'tests {',
    '}',
  ].join('\n');
  assert.deepStrictEqual(names(text), ['script:pre-request', 'tests']);
});

test('unclosed block runs to end of document', () => {
  const blocks = findBlocks(['get {', '  url: x']);
  assert.deepStrictEqual(blocks, [{ name: 'get', startLine: 0, endLine: 2 }]);
});

const repro = `meta {
  name: CMS login
  type: http
  seq: 1
}

post {
  url: {{cmsUrl}}/admin/auth/login
  body: json
  auth: none
}

body:json {
  {
    "email": "{{process.env.CMS_USERNAME}}"
  }
}

script:pre-request {
  const { requireEnv } = require("./utils/env.js");
  requireEnv(bru, "CMS_USERNAME");
}
`;

const wrap = (extra: string) =>
  `meta {\n  name: T\n  type: http\n  seq: 1\n}\n\nget {\n  url: https://x.com\n}\n\n${extra}\n`;

test('reference repro yields no diagnostics', () => {
  assert.deepStrictEqual(diagnose(repro), []);
});

test('tests block with if (x) { yields no diagnostics', () => {
  assert.deepStrictEqual(diagnose(wrap('tests {\n  if (x) {\n    y();\n  }\n}')), []);
});

test('unknown block at column 0 is still reported', () => {
  const d = diagnose(wrap('foo {\n  a: b\n}'));
  assert.ok(d.some(x => x.message.startsWith('Unknown block type')));
});

test('get { inside a script is not a duplicate http method', () => {
  const d = diagnose(wrap('script:pre-request {\n  get {\n  }\n}'));
  assert.strictEqual(d.filter(x => x.code === 'duplicate-http-method').length, 0);
});

test('two script:pre-request blocks are still duplicates', () => {
  const d = diagnose(wrap('script:pre-request {\n  a();\n}\n\nscript:pre-request {\n  b();\n}'));
  assert.strictEqual(d.filter(x => x.code === 'duplicate-script').length, 1);
});
