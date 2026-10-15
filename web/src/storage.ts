import { defaults, type Conversation, type Settings, validatePlan } from './domain.ts';

const database = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open('iphone-shortcut-generator', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('conversations', { keyPath: 'id' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(new Error('浏览器无法打开本地记录，请检查隐私或存储设置。'));
  request.onblocked = () => reject(new Error('本地存储正在升级，请关闭其他同站点标签页后重试。'));
});
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('conversations', mode);
    const request = operation(tx.objectStore('conversations'));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('本地记录保存失败，可能存储空间不足。请保留此页面并导出当前方案。')); };
  });
}
export async function listConversations(): Promise<Conversation[]> {
  const data = await transaction('readonly', store => store.getAll());
  for (const c of data) {
    if (typeof c.id !== 'string' || typeof c.title !== 'string' || !Array.isArray(c.messages) || !Array.isArray(c.versions)) throw new Error('本地记录格式异常，未覆盖原数据。');
    for (const v of c.versions) validatePlan(v.plan);
  }
  return data.sort((a, b) => b.updated - a.updated);
}
export async function saveConversation(c: Conversation): Promise<void> {
  const db = await database();
  const revision = c.revision ?? 0;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('conversations', 'readwrite');
    const store = tx.objectStore('conversations');
    const request = store.get(c.id);
    let conflict = false;
    request.onsuccess = () => {
      if ((request.result?.revision ?? 0) !== revision) { conflict = true; tx.abort(); return; }
      store.put({ ...c, revision: revision + 1 });
    };
    tx.oncomplete = () => { db.close(); c.revision = revision + 1; resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error(conflict ? '这个对话已在另一页面修改或删除。请刷新后继续，未覆盖已有记录。' : '本地保存失败，可能存储空间不足。请保留页面并导出当前方案。')); };
  });
}
export const deleteConversation = (id: string) => transaction('readwrite', store => store.delete(id));
export function readSettings(): Settings {
  try {
    const data = JSON.parse(localStorage.getItem('shortcut-settings') ?? '{}');
    return { endpoint: typeof data.endpoint === 'string' ? data.endpoint : defaults.endpoint, model: typeof data.model === 'string' ? data.model : defaults.model, vision: typeof data.vision === 'boolean' ? data.vision : defaults.vision, ios: typeof data.ios === 'string' ? data.ios : '', theme: ['system', 'light', 'dark'].includes(data.theme) ? data.theme : 'system' };
  } catch { return { ...defaults }; }
}
export function writeSettings(s: Settings) {
  // Enumerate persisted fields: a caller cannot accidentally persist its in-memory API key.
  localStorage.setItem('shortcut-settings', JSON.stringify({ endpoint: s.endpoint, model: s.model, vision: s.vision, ios: s.ios, theme: s.theme }));
}
