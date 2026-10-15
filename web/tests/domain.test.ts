import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, workflow } from '../src/compiler.ts';
import { validatePlan, validateReply, samplePlan, endpointUrl, publicHttps, detectIos } from '../src/domain.ts';

test('schema accepts free combinations and rejects invented actions and parameters', () => {
  assert.deepEqual(validatePlan(samplePlan), samplePlan);
  assert.equal(validateReply({ kind: 'question', message: '需要保存到哪里？' }).kind, 'question');
  for (const steps of [[], [{ id: 'x', kind: 'shell', text: 'do something' }], [{ id: 'x', kind: 'show', text: 'ok', command: 'bad' }], [{ id: 'x', kind: 'text', text: 'no final action' }], [{ id: 'x', kind: 'show', text: '\u0000' }]]) {
    assert.throws(() => validatePlan({ ...samplePlan, steps }));
  }
});
test('variable references must be earlier text outputs with unique ids', () => {
  for (const steps of [
    [{ id: 'one', kind: 'show', text: '{{later}}' }, { id: 'later', kind: 'ask', text: 'prompt' }],
    [{ id: 'one', kind: 'show', text: 'ok' }, { id: 'two', kind: 'copy', text: '{{one}}' }],
    [{ id: 'one', kind: 'ask', text: 'prompt' }, { id: 'one', kind: 'show', text: '{{one}}' }],
    [{ id: 'one', kind: 'show', text: '{bad}' }],
  ]) assert.throws(() => validatePlan({ ...samplePlan, steps }));
  assert.doesNotThrow(() => validatePlan({ ...samplePlan, steps: [{ id: 'one', kind: 'show', text: '{{input}}' }] }));
});
test('URLs reject local/IP/credential/non-HTTPS targets and normalize compatible API paths', () => {
  for (const url of ['http://api.example.com', 'https://127.0.0.1', 'https://127.1', 'https://0x7f000001', 'https://[::1]', 'https://10.0.0.1', 'https://localhost', 'https://metadata.google.internal', 'https://app.local', 'https://u:p@api.example.com', 'https://api.example.com?key=secret', 'https://api.example.com:8443']) assert.throws(() => publicHttps(url), url);
  assert.equal(endpointUrl('https://api.deepseek.com'), 'https://api.deepseek.com/chat/completions');
  assert.equal(endpointUrl('https://example.com/v1/'), 'https://example.com/v1/chat/completions');
  assert.equal(endpointUrl('https://example.com/v1/chat/completions'), 'https://example.com/v1/chat/completions');
});
test('compiler emits deterministic Apple XML with escaped content and UTF-16 references', () => {
  const plan = { ...samplePlan, steps: [{ id: 'answer', kind: 'ask' as const, text: '测试' }, { id: 'done', kind: 'show' as const, text: '😀<&> {{answer}}\r\n{{input}}' }] };
  const output = compile(plan);
  assert.equal(output, compile(plan));
  assert.match(output, /<plist version="1.0">/);
  assert.match(output, /&lt;&amp;&gt;/);
  assert.match(output, /&#13;/);
  assert.match(output, /<key>\{6, 1\}<\/key>/);
  assert.match(output, /WFWorkflowHasShortcutInputVariables/);
  assert.doesNotMatch(output, /Bearer|api\.deepseek|Authorization/);
  assert.equal(typeof workflow(samplePlan), 'object');
});
test('iOS detection is advisory and returns unknown on desktop', () => {
  assert.equal(detectIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X)'), '18.6.2');
  assert.equal(detectIos('Mozilla/5.0 (Windows NT 10.0)'), '');
});
