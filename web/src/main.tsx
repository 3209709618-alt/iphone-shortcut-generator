import React, { useEffect, useId, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { actions, detectIos, endpointUrl, samplePlan, type Attachment, type Conversation, type Settings, type Version } from './domain.ts';
import { compile } from './compiler.ts';
import { generate, testConnection } from './model.ts';
import { deleteConversation, listConversations, readSettings, saveConversation, writeSettings } from './storage.ts';
import { readAttachment } from './attachments.ts';
import './style.css';

type Page = 'create' | 'library' | 'settings';
type IconName = 'layers' | 'plus' | 'arrow' | 'image' | 'close' | 'clock' | 'settings' | 'chevron' | 'download' | 'check' | 'info' | 'sun' | 'search';
function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    layers: <><path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, arrow: <path d="M12 19V5m-6 6 6-6 6 6"/>,
    image: <><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    settings: <><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 3v6m8 0v6m-6 0v6"/></>,
    chevron: <path d="m9 5 7 7-7 7"/>, download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    check: <path d="m5 12 4 4 10-10"/>, info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></>,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
const date = (n: number) => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(n);
const errorText = (e: unknown) => e instanceof Error ? e.message : '操作未完成，请重试。';
function download(text: string, name: string, mime = 'application/xml') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a'); a.href = url; a.download = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_'); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function PlanView({ version, example, busy, onCompile, ios }: { version: Version; example: boolean; busy: boolean; onCompile: () => void; ios: string }) {
  const titleId = useId();
  const plan = version.plan;
  const describe = (text: string) => text.replace(/\{\{([^{}]+)\}\}/g, (_, id: string) => id === 'input' ? '「快捷指令输入」' : `「第 ${plan.steps.findIndex(s => s.id === id) + 1} 步的结果」`);
  const apps = [...new Set(plan.steps.map(s => actions[s.kind].app))];
  return <section className="plan" aria-labelledby={titleId}>
    <div className="section-heading"><h2 id={titleId}>步骤预览</h2><span className="tag">{example ? '示例方案' : '方案已校验'}</span></div>
    <div className="plan-title"><span className="app-icon"><Icon name="layers" size={26}/></span><div><h3>{plan.name}</h3><p>{plan.steps.length} 个步骤</p></div></div>
    <p className="plan-summary">{plan.summary}</p>
    <ol className="steps">{plan.steps.map((s, i) => <li key={s.id}><span className="step-number">{i + 1}</span><div><strong>{actions[s.kind].label}</strong><p>{s.text ? describe(s.text) : '读取运行时的剪贴板文字'}</p></div></li>)}</ol>
    <dl className="facts"><div><dt>使用 App</dt><dd>{apps.join('、')}</dd></div><div><dt>运行时联网</dt><dd>{plan.steps.some(s => s.kind === 'open_url') ? '打开网页时需要' : '无需调用 AI'}</dd></div><div><dt>兼容性</dt><dd>{ios ? `目标 iOS ${ios}，未实机验证` : 'iOS 版本未知，未实机验证'}</dd></div></dl>
    <details className="guidance"><summary>权限与安装说明</summary><p>这些动作的参数已依据 Cherri 核对，尚未在真实 iPhone 上导入、运行。系统首次运行时可能询问剪贴板或通知权限；需要输入和显示界面的动作，请解锁后手动运行。</p><p>当前没有已验证的签名服务，因此暂不能安装。未签名源文件用于保留编译结果，不是 iPhone 安装文件。</p></details>
    <div className="delivery"><div className="delivery-title"><Icon name="info" size={19}/><strong>{version.compiled ? '文件已生成，等待签名' : '安装需要签名'}</strong></div><p>签名通道尚未接通。接通并验证后，才能提供 iPhone 安装文件。</p>
      {version.compiled ? <button className="secondary full" onClick={() => download(version.compiled!, `${plan.name}.unsigned.plist`)}><Icon name="download" size={18}/>下载未签名源文件</button> : <button className="primary full" disabled={busy} onClick={onCompile}>生成未签名源文件<Icon name="chevron" size={17}/></button>}
    </div>
  </section>;
}

function SettingsView({ settings, apiKey, busy, onSave }: { settings: Settings; apiKey: string; busy: boolean; onSave: (s: Settings, key: string) => void }) {
  const [form, setForm] = useState(settings);
  const [key, setKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const detected = detectIos(navigator.userAgent);
  function save(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('');
    try {
      endpointUrl(form.endpoint);
      if (!form.model.trim() || form.model.length > 120) throw new Error('请填写有效的模型名称。');
      if (form.ios && !/^\d{1,2}(\.\d{1,2}){0,2}$/.test(form.ios)) throw new Error('iOS 版本示例：18.6 或 26.0.1；未知可留空。');
      // A changed provider must not silently receive a key intended for the previous provider.
      if (form.endpoint !== settings.endpoint && !key) throw new Error('更换接口地址后，请重新填写该服务商的密钥。');
      onSave(form, key || apiKey); setKey(''); setMessage('配置已保存。密钥仅在当前页面有效，刷新后需重新填写。');
    } catch (e) { setError(errorText(e)); }
  }
  async function test() {
    setError(''); setMessage(''); setTesting(true); controller.current = new AbortController();
    try {
      if (form.endpoint !== settings.endpoint && !key) throw new Error('更换接口地址后，请先填写对应服务商的密钥。');
      setMessage(await testConnection(form, key || apiKey, controller.current.signal));
    } catch (e) { setError(errorText(e)); } finally { setTesting(false); }
  }
  return <div className="settings-page"><header className="page-heading"><h1>设置</h1><p>让生成器按你的方式工作。</p></header><form onSubmit={save}>
    <section className="settings-section"><h2>模型服务</h2><p className="muted">支持 OpenAI 兼容的 Chat Completions 接口，需要服务商允许浏览器跨域访问。</p>
      <label>接口地址<input type="url" required value={form.endpoint} onChange={e => setForm({ ...form, endpoint: e.target.value, vision: false })} placeholder="https://api.deepseek.com" autoCapitalize="none" autoCorrect="off" spellCheck={false}/></label>
      <label>模型名称<input required value={form.model} onChange={e => setForm({ ...form, model: e.target.value, vision: e.target.value === 'deepseek-flash' && form.endpoint.replace(/\/$/, '') === 'https://api.deepseek.com' })} placeholder="deepseek-flash" autoCapitalize="none" autoCorrect="off" spellCheck={false}/></label>
      <label>API 密钥 <span className="field-note">{apiKey ? '•••••••• · 本页已配置' : '未配置'}</span><input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder={apiKey ? '留空保留本页密钥' : '填写服务商提供的密钥'} autoComplete="off" autoCapitalize="none" spellCheck={false}/></label>
      <p className="hint">密钥从浏览器直接发送给上方地址，不保存在浏览器存储、源码或快捷指令中。请只使用你信任的接口。</p>
      <label className="check-field"><input type="checkbox" checked={form.vision} onChange={e => setForm({ ...form, vision: e.target.checked })}/><span>已确认此模型支持图片输入</span></label>
      <div className="test-line"><button type="button" className="secondary" disabled={testing || busy} onClick={test}>{testing ? '正在连接…' : '测试连接'}</button><span className="hint">会发送一次请求，可能消耗 API 额度。</span></div>
    </section>
    <section className="settings-section"><h2>iPhone 与外观</h2><label>目标 iOS 版本<input value={form.ios} onChange={e => setForm({ ...form, ios: e.target.value })} inputMode="decimal" placeholder={detected ? `浏览器参考：${detected}` : '未知，请在 iPhone 设置中确认'}/></label><p className="hint">浏览器识别：{detected || '未知'}。识别结果仅供参考，不能代替实机测试。</p><label>外观<select value={form.theme} onChange={e => setForm({ ...form, theme: e.target.value as Settings['theme'] })}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label></section>
    <section className="settings-section"><h2>关于静态版</h2><p>没有在线后台。对话、截图和版本只保存在当前浏览器，清除网站数据会删除记录。多人共用浏览器时也能看到这些记录。</p><p>生成时会把当前对话和截图发给所选模型。结构校验失败时最多额外请求一次修正；网络失败不会自动重试。</p><p>签名尚未接通，现有文件不能直接导入 iPhone。短信提醒和 AI 记账的完整版本仍待后续开发。</p></section>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}
    <button className="primary" type="submit" disabled={testing || busy}>保存配置</button>
  </form></div>;
}

function App() {
  const [page, setPage] = useState<Page>('create');
  const [settings, setSettings] = useState(readSettings);
  const [apiKey, setApiKey] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [example, setExample] = useState<Version | null>(null);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [showCapabilities, setShowCapabilities] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const imageLock = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const mobilePreview = useRef<HTMLDivElement>(null);
  const current = conversations.find(c => c.id === activeId);
  const version = example ?? current?.versions.find(v => v.id === selectedVersion) ?? current?.versions.at(-1);

  useEffect(() => { document.documentElement.dataset.theme = settings.theme; }, [settings.theme]);
  useEffect(() => {
    let alive = true;
    listConversations().then(async records => {
      for (const c of records.filter(c => c.pending)) {
        c.pending = false;
        c.messages.push({ id: crypto.randomUUID(), role: 'assistant', text: '上次页面关闭或刷新，请求结果未知。为避免重复计费，没有自动重试；此前版本已保留。' });
        await saveConversation(c);
      }
      if (alive) { setConversations(records); setReady(true); }
    }).catch(e => { if (alive) setError(errorText(e)); });
    return () => { alive = false; abort.current?.abort(); };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      if (!viewport) return;
      document.documentElement.style.setProperty('--viewport-height', `${viewport.height}px`);
      document.documentElement.dataset.keyboard = String(window.innerHeight - viewport.height > 150);
    };
    resize(); viewport?.addEventListener('resize', resize);
    return () => viewport?.removeEventListener('resize', resize);
  }, []);
  useEffect(() => { if (busy || current?.messages.length) end.current?.scrollIntoView({ block: 'nearest' }); }, [busy, current?.messages.length]);
  useEffect(() => { if (example) mobilePreview.current?.scrollIntoView({ block: 'start' }); }, [example?.id]);

  async function persist(c: Conversation) {
    await saveConversation(c);
    setConversations(all => [c, ...all.filter(item => item.id !== c.id)].sort((a, b) => b.updated - a.updated));
  }
  function startNew() {
    if (lock.current) return;
    if ((draft.trim() || attachments.length) && !window.confirm('开始新对话会清除尚未发送的内容，继续吗？')) return;
    setActiveId(null); setExample(null); setDraft(''); setAttachments([]); setError(''); setStatus(''); setSelectedVersion(''); setPage('create');
  }
  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (lock.current || imageLock.current || !ready || (!draft.trim() && !attachments.length)) return;
    if (!apiKey) { setError('先到「设置」填写 API 密钥，就能开始对话。也可以先查看示例体验步骤预览。'); return; }
    if (attachments.length && !settings.vision) { setError('当前模型未确认支持图片，请在设置中更换模型。'); return; }
    lock.current = true; setBusy(true); setError(''); setStatus('正在保存消息…'); setExample(null);
    const base: Conversation = current ?? { id: crypto.randomUUID(), title: draft.trim().slice(0, 32) || '图片需求', updated: Date.now(), messages: [], versions: [], pending: false };
    let next: Conversation = { ...base, updated: Date.now(), pending: true, messages: [...base.messages, { id: crypto.randomUUID(), role: 'user', text: draft.trim(), attachments }] };
    let saved = false;
    abort.current = new AbortController();
    try {
      await persist(next); saved = true; setActiveId(next.id); setDraft(''); setAttachments([]); setStatus('理解需求…');
      const response = await generate(settings, apiKey, next.messages, abort.current.signal, () => setStatus('方案未通过校验，正在自动修正一次…'));
      next = { ...next, pending: false, updated: Date.now(), messages: [...next.messages, { id: crypto.randomUUID(), role: 'assistant', text: response.message, ...(response.kind === 'plan' ? { plan: response.plan } : {}) }] };
      if (response.kind === 'plan') {
        const v: Version = { id: crypto.randomUUID(), created: Date.now(), plan: response.plan };
        next.versions = [...next.versions, v]; setSelectedVersion(v.id);
      }
      await persist(next); setStatus(response.kind === 'plan' ? '动作校验完成，请查看步骤预览。' : '回复已保存');
    } catch (e) {
      const msg = errorText(e); setError(msg); setStatus('');
      if (saved) {
        next = { ...next, pending: false, messages: [...next.messages, { id: crypto.randomUUID(), role: 'assistant', text: `此次请求未完成：${msg}` }] };
        try { await persist(next); } catch { setError(`${msg} 本地保存也未完成，请保持页面打开。`); setConversations(all => [next, ...all.filter(c => c.id !== next.id)]); }
      }
    } finally { lock.current = false; setBusy(false); abort.current = null; }
  }
  async function addImages(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]; event.target.value = '';
    if (imageLock.current || lock.current) return;
    if (files.length + attachments.length > 3) { setError('每条消息最多添加 3 张图片。'); return; }
    imageLock.current = true; setUploading(true); setError('');
    try { const images = await Promise.all(files.map(readAttachment)); setAttachments(a => [...a, ...images]); }
    catch (e) { setError(errorText(e)); } finally { imageLock.current = false; setUploading(false); }
  }
  async function build() {
    if (!version || lock.current) return;
    lock.current = true; setBusy(true); setStatus('正在生成文件…'); setError('');
    try {
      const compiled = compile(version.plan);
      if (example) setExample({ ...example, compiled });
      else if (current) await persist({ ...current, updated: Date.now(), versions: current.versions.map(v => v.id === version.id ? { ...v, compiled } : v) });
      setStatus('文件已生成；尚未签名，暂不能安装。');
    } catch (e) { setError(errorText(e)); setStatus(''); } finally { lock.current = false; setBusy(false); }
  }
  function chooseExample() {
    setExample({ id: 'example', created: Date.now(), plan: samplePlan }); setSelectedVersion(''); setError(''); setStatus('这是内置示例，没有调用模型。');
  }
  function fill(text: string) { setDraft(text); textarea.current?.focus(); }
  const nav: { page: Page; icon: IconName; label: string }[] = [{ page: 'create', icon: 'plus', label: '创作' }, { page: 'library', icon: 'layers', label: '我的快捷指令' }, { page: 'settings', icon: 'settings', label: '设置' }];
  const planPanel = version ? <><PlanView version={version} example={!!example} busy={busy} onCompile={build} ios={settings.ios}/>{!example && current && current.versions.length > 1 && <label className="version-select">历史版本<select value={version.id} onChange={e => setSelectedVersion(e.target.value)}>{current.versions.map((v, i) => <option value={v.id} key={v.id}>版本 {i + 1} · {date(v.created)}</option>)}</select></label>}</> : null;

  return <div className="app-shell"><header className="topbar"><button className="brand" onClick={() => setPage('create')} aria-label="IPHONE 快捷指令生成器，返回创作"><span className="brand-mark"><Icon name="layers" size={23}/></span><span>IPHONE <span className="brand-sub">快捷指令生成器</span></span></button><span className="static-label">静态版</span><button className="icon-button desktop-new" onClick={startNew} disabled={busy} aria-label="新建对话"><Icon name="plus"/></button></header>
    <nav className="navigation" aria-label="主导航">{nav.map(n => <button key={n.page} className={page === n.page ? 'nav-item active' : 'nav-item'} aria-current={page === n.page ? 'page' : undefined} onClick={() => setPage(n.page)}><Icon name={n.icon}/><span>{n.label}</span></button>)}</nav>
    <main className={page === 'create' ? `workspace ${version ? 'with-plan' : ''}` : 'content-page'}>
    {page === 'create' && <><div className="conversation-column"><div className="conversation-scroll">
      {!current ? <header className="hero"><h1>把想法，<br/>变成快捷指令。</h1><p>说说你想做什么。<br className="mobile-break"/>复杂的步骤，我们一起理清。</p></header> : <header className="conversation-heading"><div><h1>{current.title}</h1><p>当前对话 · 保存在此浏览器</p></div><button className="icon-button" onClick={startNew} disabled={busy} aria-label="新建对话"><Icon name="plus"/></button></header>}
      {!current && <><div className="intro-note"><Icon name="info" size={18}/><span>可生成方案与源文件；签名接通前，暂不能导入 iPhone。</span></div><div className="suggestions"><p>从一个小想法开始</p>{['运行时问我一句话，复制后显示出来', '把剪贴板里的文字朗读给我听', '打开苹果官网，然后显示“浏览完成”'].map(text => <button className="suggestion" key={text} onClick={() => fill(text)}>{text}<Icon name="chevron" size={16}/></button>)}<div className="intro-actions"><button className="text-button" onClick={chooseExample}>先查看一个示例<Icon name="chevron" size={15}/></button><button className="text-button subtle" onClick={() => setShowCapabilities(!showCapabilities)} aria-expanded={showCapabilities}>支持哪些动作</button></div>{showCapabilities && <div className="capabilities">{Object.entries(actions).map(([key, value]) => <p key={key}><strong>{value.label}</strong> · {value.description}</p>)}<p>提醒事项、日历、备忘录、照片、文件与运行时 AI 尚未开放。可自由描述需求，不限于上述示例。</p></div>}</div></>}
      {current && <div className="messages">{current.messages.map(m => <article className={`message ${m.role}`} key={m.id}><span className="speaker">{m.role === 'user' ? '你' : '生成器'}</span><div className="message-body"><p>{m.text}</p>{!!m.attachments?.length && <div className="message-images">{m.attachments.map(a => <a href={a.data} target="_blank" rel="noreferrer" key={a.id}><img src={a.data} alt={a.name}/></a>)}</div>}{!!m.attachments?.length && <small>已保存 {m.attachments.length} 张图片 · 随请求提交模型</small>}</div></article>)}</div>}
      {planPanel && <div className="mobile-plan" ref={mobilePreview}>{planPanel}</div>}
      <div ref={end}/></div>
      <div className="composer-wrap">{status && <p className="status" role="status">{busy && <span className="spinner"/>}{status}</p>}{error && <div className="error" role="alert">{error}{!apiKey && <button className="text-button" onClick={() => setPage('settings')}>前往设置<Icon name="chevron" size={15}/></button>}</div>}
      <form className="composer" onSubmit={send}><label className="sr-only" htmlFor="request">描述你想实现的快捷指令</label><textarea id="request" ref={textarea} value={draft} onChange={e => setDraft(e.target.value)} maxLength={10000} placeholder={current ? '继续补充需求，或告诉我哪里需要修改…' : '例如：帮我把剪贴板的文字朗读出来…'} rows={3} disabled={busy} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}/>
        {attachments.length > 0 && <div className="attachments">{attachments.map(a => <div className="attachment" key={a.id}><img src={a.data} alt={a.name}/><button type="button" className="remove-image" aria-label={`移除图片 ${a.name}`} onClick={() => setAttachments(all => all.filter(x => x.id !== a.id))} disabled={busy || uploading}><Icon name="close" size={16}/></button></div>)}</div>}
        <div className="composer-tools"><label className={`upload-button ${busy || uploading || !settings.vision ? 'disabled' : ''}`} title="添加截图"><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={addImages} disabled={busy || uploading || !settings.vision} aria-label="添加截图"/><Icon name="image"/><span>{uploading ? '读取中…' : '添加截图'}</span></label><span className="composer-model">{settings.model}</span>{busy ? <button className="stop-button" type="button" onClick={() => abort.current?.abort()} disabled={!abort.current}>停止</button> : <button className="send-button" type="submit" disabled={!ready || uploading || (!draft.trim() && !attachments.length)} aria-label="发送需求"><Icon name="arrow"/></button>}</div>
      </form><p className="composer-caption">{attachments.length ? `${attachments.length} 张图片已就绪 · 发送时提交模型` : '对话保存在此浏览器 · 发送时提交所选模型'}<span>模型调用可能产生费用</span></p>
      </div></div>{planPanel && <aside className="desktop-plan">{planPanel}</aside>}</>}
    {page === 'library' && <div className="library-page"><header className="page-heading"><div><h1>我的快捷指令</h1><p>每一个想法，都可以接着完善。</p></div><button className="secondary" onClick={startNew} disabled={busy}><Icon name="plus" size={18}/>新建</button></header><label className="search"><Icon name="search"/><input aria-label="搜索对话和快捷指令" placeholder="搜索名称或需求" value={query} onChange={e => setQuery(e.target.value)}/></label><p className="hint">记录仅在此浏览器中。未签名文件不能安装；清除浏览器数据前请导出备份。</p>{!ready && <p role="status">正在读取本地记录…</p>}{error && <p className="error" role="alert">{error}</p>}
      {!conversations.length && ready && <div className="empty-state"><span className="empty-icon"><Icon name="layers" size={32}/></span><h2>第一个想法，从这里开始</h2><p>发送需求后，对话和生成的版本会保存在这里。</p><button className="primary" onClick={startNew}>去创作</button></div>}
      {conversations.filter(c => `${c.title} ${c.versions.at(-1)?.plan.name ?? ''}`.includes(query)).map(c => <article className="history-row" key={c.id}><button className="history-open" disabled={busy} onClick={() => { setActiveId(c.id); setExample(null); setSelectedVersion(''); setPage('create'); setError(''); setStatus(''); }}><span className="history-icon"><Icon name="layers"/></span><span><strong>{c.versions.at(-1)?.plan.name ?? c.title}</strong><small>{date(c.updated)} · {c.versions.length ? `${c.versions.length} 个版本 · 未签名` : '对话进行中'}</small></span><Icon name="chevron" size={18}/></button><button className="text-button danger" disabled={busy} onClick={async () => { if (!window.confirm(`删除「${c.title}」及其对话、截图和版本？此操作无法撤销。`)) return; try { await deleteConversation(c.id); setConversations(all => all.filter(x => x.id !== c.id)); if (activeId === c.id) setActiveId(null); } catch (e) { setError(errorText(e)); } }}>删除</button></article>)}
      {conversations.length > 0 && !conversations.some(c => `${c.title} ${c.versions.at(-1)?.plan.name ?? ''}`.includes(query)) && <p className="empty-state">没有匹配的记录。</p>}
      {conversations.length > 0 && <button className="secondary backup" onClick={() => download(JSON.stringify({ format: 'shortcut-generator-backup-v1', conversations }, null, 2), '快捷指令对话备份.json', 'application/json')}><Icon name="download" size={18}/>导出对话备份</button>}
    </div>}
    {page === 'settings' && <SettingsView settings={settings} apiKey={apiKey} busy={busy} onSave={(s, key) => { writeSettings(s); setSettings(s); setApiKey(key); }}/>}
    </main></div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
