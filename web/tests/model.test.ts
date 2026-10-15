import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { completion, generate } from '../src/model.ts';
import { defaults, samplePlan, type Message } from '../src/domain.ts';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const signal = () => new AbortController().signal;
const messages: Message[] = [{ id: 'one', role: 'user', text: '测试数据：询问一句话然后复制' }];
const response = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { headers: { 'content-type': 'application/json' } });

test('real request uses chosen config, omits credentials, retains structured plan context', async () => {
  let requests = 0;
  globalThis.fetch = async (url, init) => {
    requests++;
    assert.equal(url, 'https://example.com/v1/chat/completions');
    assert.equal(init?.credentials, 'omit'); assert.equal(init?.redirect, 'error');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'chosen-model');
    assert.ok(body.messages.some((m: { content: string }) => m.content.includes(samplePlan.name)));
    assert.doesNotMatch(String(init?.body), /synthetic-secret/);
    return response(JSON.stringify({ kind: 'plan', message: '方案如下', plan: samplePlan }));
  };
  const result = await generate({ ...defaults, endpoint: 'https://example.com/v1', model: 'chosen-model' }, 'synthetic-secret', [...messages, { id: 'two', role: 'assistant', text: '已有方案', plan: samplePlan }], signal(), () => {});
  assert.equal(result.kind, 'plan'); assert.equal(requests, 1);
});
test('invalid schema gets exactly one repair; subsequent invalid output fails', async () => {
  let requests = 0; let repairs = 0;
  globalThis.fetch = async () => { requests++; return response('not json'); };
  await assert.rejects(() => generate(defaults, 'synthetic', messages, signal(), () => repairs++), /两次/);
  assert.equal(requests, 2); assert.equal(repairs, 1);
});
test('non-vision models reject attachments before sending anything', async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return response('{}'); };
  await assert.rejects(() => generate({ ...defaults, vision: false }, 'synthetic', [{ ...messages[0], attachments: [{ id: 'img', name: 'test.png', type: 'image/png', data: 'data:image/png;base64,TEST' }] }], signal(), () => {}), /不会忽略/);
  assert.equal(requests, 0);
});
test('HTTP errors do not leak response secrets and never auto-retry', async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response('synthetic-secret', { status: 401 }); };
  await assert.rejects(() => generate(defaults, 'synthetic-secret', messages, signal(), () => {}), e => e instanceof Error && /密钥无效/.test(e.message) && !e.message.includes('synthetic-secret'));
  assert.equal(requests, 1);
});
test('CORS errors and cancellation explain recovery without exposing network exception', async () => {
  globalThis.fetch = async () => { throw new TypeError('SECRET exception'); };
  await assert.rejects(() => completion(defaults, 'synthetic', [], signal()), /CORS/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => completion(defaults, 'synthetic', [], controller.signal), /停止等待/);
});
