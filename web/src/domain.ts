export const actions = {
  text: { label: '文本', app: '快捷指令', output: true, description: '生成文字，可引用前面动作的文字输出。' },
  ask: { label: '询问输入', app: '快捷指令', output: true, description: '运行时让用户输入文字，可用键盘语音输入。' },
  clipboard: { label: '获取剪贴板', app: '剪贴板', output: true, description: '读取系统剪贴板中的文字，需要系统许可。' },
  show: { label: '显示结果', app: '快捷指令', output: false, description: '在屏幕上显示文字。' },
  copy: { label: '复制到剪贴板', app: '剪贴板', output: false, description: '替换当前剪贴板内容，仅本机。' },
  speak: { label: '朗读文本', app: '快捷指令', output: false, description: '朗读文字并等待朗读结束。' },
  notification: { label: '显示通知', app: '快捷指令', output: false, description: '运行当下显示通知；不会创建定时提醒。' },
  open_url: { label: '打开网页', app: 'Safari', output: false, description: '打开明确指定的 HTTPS 网页。' },
} as const;
export type ActionKind = keyof typeof actions;
export type Step = { id: string; kind: ActionKind; text?: string };
export type Plan = { name: string; summary: string; steps: Step[] };
export type Reply = { kind: 'question'; message: string } | { kind: 'unsupported'; message: string } | { kind: 'plan'; message: string; plan: Plan };
export type Attachment = { id: string; name: string; data: string; type: string };
export type Message = { id: string; role: 'user' | 'assistant'; text: string; attachments?: Attachment[]; plan?: Plan };
export type Version = { id: string; created: number; plan: Plan; compiled?: string };
export type Conversation = { id: string; title: string; updated: number; messages: Message[]; versions: Version[]; pending: boolean; revision?: number };
export type Settings = { endpoint: string; model: string; vision: boolean; ios: string; theme: 'system' | 'light' | 'dark' };
export const defaults: Settings = { endpoint: 'https://api.deepseek.com', model: 'deepseek-flash', vision: true, ios: '', theme: 'system' };

const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
function string(x: unknown, max: number, label: string): string {
  if (typeof x !== 'string' || !x.trim() || x.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]|[\uFFFE\uFFFF]/u.test(x)) throw new Error(`${label}为空、过长或包含无效字符。`);
  // Reject unpaired surrogates, which cannot be represented in XML 1.0.
  for (const c of x) if (c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff) throw new Error(`${label}含有无效字符。`);
  return x;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error('方案含有未支持的参数。');
}
export function publicHttps(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('请输入完整的 HTTPS 地址。'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || (url.port && url.port !== '443') || !host.includes('.') || host.includes(':') || /^[\d.]+$/.test(host) || /\.(localhost|local|internal|test|invalid)$/.test(host) || host === 'metadata.google.internal') throw new Error('仅支持公共 HTTPS 域名，不接受本机、IP、内网、用户名或带查询参数的地址。');
  return url;
}
export function endpointUrl(value: string): string {
  const url = publicHttps(value.trim());
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/chat/completions') ? path : `${path}/chat/completions`;
  return url.toString();
}
export function validatePlan(value: unknown): Plan {
  if (!record(value)) throw new Error('方案必须是一个对象。');
  exact(value, ['name', 'summary', 'steps']);
  const name = string(value.name, 60, '名称');
  const summary = string(value.summary, 1200, '功能说明');
  if (!Array.isArray(value.steps) || !value.steps.length || value.steps.length > 30) throw new Error('方案需要 1–30 个步骤。');
  const outputs = new Set<string>();
  const ids = new Set<string>();
  const steps: Step[] = value.steps.map((raw: unknown) => {
    if (!record(raw)) throw new Error('步骤格式错误。');
    exact(raw, ['id', 'kind', 'text']);
    const id = string(raw.id, 32, '步骤标识');
    if (!/^[a-z][a-z0-9_]*$/.test(id) || id === 'input' || ids.has(id)) throw new Error('步骤标识无效或重复。');
    if (typeof raw.kind !== 'string' || !Object.hasOwn(actions, raw.kind)) throw new Error(`不支持动作：${String(raw.kind).slice(0, 80)}`);
    const kind = raw.kind as ActionKind;
    let text: string | undefined;
    if (kind === 'clipboard') {
      if (raw.text !== undefined) throw new Error('获取剪贴板不接受文字参数。');
    } else {
      text = string(raw.text, 6000, '步骤文字');
      for (const match of text.matchAll(/\{\{([^{}]+)\}\}/g)) {
        if (match[1] !== 'input' && !outputs.has(match[1])) throw new Error(`变量 ${match[1]} 不存在、没有文字输出或引用了后续步骤。`);
      }
      if (/[{}]/.test(text.replace(/\{\{[^{}]+\}\}/g, ''))) throw new Error('变量请用 {{步骤标识}} 表示，文字中暂不支持其他花括号。');
      if (kind === 'copy' && !/^\{\{[a-z][a-z0-9_]*\}\}$/.test(text)) throw new Error('复制动作必须引用一个已有文字输出；请先用文本动作组合内容。');
      if (kind === 'open_url') {
        if (text.includes('{{')) throw new Error('网页地址必须明确指定，暂不允许变量拼接。');
        publicHttps(text);
      }
    }
    ids.add(id);
    if (actions[kind].output) outputs.add(id);
    return text === undefined ? { id, kind } : { id, kind, text };
  });
  if (steps.every(step => actions[step.kind].output)) throw new Error('需要显示、朗读、复制、通知或打开网页等最终动作。');
  return { name, summary, steps };
}
export function validateReply(raw: unknown): Reply {
  if (!record(raw)) throw new Error('模型未返回结构化结果。');
  const message = string(raw.message, 3000, '回复');
  if (raw.kind === 'question' || raw.kind === 'unsupported') { exact(raw, ['kind', 'message']); return { kind: raw.kind, message }; }
  if (raw.kind === 'plan') { exact(raw, ['kind', 'message', 'plan']); return { kind: 'plan', message, plan: validatePlan(raw.plan) }; }
  throw new Error('模型返回了未知的回复类型。');
}
export function detectIos(agent: string): string {
  return /(?:iPhone|iPad|iPod).*?OS (\d+(?:_\d+)*)/.exec(agent)?.[1].replaceAll('_', '.') ?? '';
}
export const samplePlan: Plan = {
  name: '随手记一句', summary: '输入一句话，复制到剪贴板，再显示结果，方便粘贴到其他 App。',
  steps: [{ id: 'answer', kind: 'ask', text: '想记下什么？' }, { id: 'copy', kind: 'copy', text: '{{answer}}' }, { id: 'done', kind: 'show', text: '已复制：{{answer}}' }],
};
