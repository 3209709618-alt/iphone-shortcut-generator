import { test, expect, type Page } from '@playwright/test';
import { samplePlan } from '../src/domain.ts';

async function configure(page: Page) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('API 密钥', { exact: false }).fill('SYNTHETIC-TEST-KEY-ONLY');
  await page.getByRole('button', { name: '保存配置' }).click();
  await expect(page.getByRole('status')).toContainText('配置已保存');
  await page.getByRole('button', { name: '创作', exact: true }).click();
}
test('desktop and phone presentation, honest example compilation, theme and no overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('把想法');
  await page.screenshot({ path: '.local/screenshots/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.local/screenshots/phone.png', fullPage: true });
  await page.getByRole('button', { name: '先查看一个示例' }).click();
  await page.locator('.mobile-plan').getByRole('button', { name: '生成未签名源文件' }).click();
  await expect(page.locator('.mobile-plan').getByRole('button', { name: '下载未签名源文件' })).toBeVisible();
  await expect(page.getByRole('button', { name: '安装到 iPhone' })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('外观').selectOption('dark');
  await page.getByRole('button', { name: '保存配置' }).click();
  await page.getByRole('button', { name: '创作', exact: true }).click();
  await expect(page.getByRole('button', { name: 'IPHONE 快捷指令生成器，返回创作' })).toHaveCSS('color', 'rgb(245, 245, 247)');
  await page.locator('.mobile-plan').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.local/screenshots/phone-dark.png', fullPage: true });
  expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');
  expect(errors).toEqual([]);
});

test('clarification, version generation, failed modification and reload preserve data without persisting key', async ({ page }) => {
  let calls = 0;
  await page.route('https://api.deepseek.com/chat/completions', async route => {
    calls++;
    if (calls === 3) return route.fulfill({ status: 402, contentType: 'application/json', body: '{}' });
    const content = calls === 1 ? { kind: 'question', message: '需要把输入的内容复制到剪贴板吗？' } : { kind: 'plan', message: '已整理好三个步骤。', plan: samplePlan };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }) });
  });
  await page.goto('/'); await configure(page);
  await page.getByLabel('描述你想实现的快捷指令').fill('测试数据：帮我记一句话');
  await page.getByRole('button', { name: '发送需求' }).click();
  await expect(page.getByText('需要把输入的内容复制到剪贴板吗？', { exact: true })).toBeVisible();
  await page.getByLabel('描述你想实现的快捷指令').fill('复制并显示');
  await page.getByRole('button', { name: '发送需求' }).click();
  await page.locator('.desktop-plan').getByRole('button', { name: '生成未签名源文件' }).click();
  await expect(page.locator('.desktop-plan').getByRole('button', { name: '下载未签名源文件' })).toBeVisible();
  await page.getByLabel('描述你想实现的快捷指令').fill('把提示文字改得更短');
  await page.getByRole('button', { name: '发送需求' }).click();
  await expect(page.getByRole('alert')).toContainText('余额不足');
  await expect(page.locator('.desktop-plan').getByRole('button', { name: '下载未签名源文件' })).toBeVisible();
  expect(calls).toBe(3);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('SYNTHETIC');
  await page.reload();
  await page.getByRole('button', { name: '我的快捷指令', exact: true }).click();
  await page.locator('.history-open').click();
  await expect(page.locator('.desktop-plan').getByRole('button', { name: '下载未签名源文件' })).toBeVisible();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByText('未配置', { exact: true })).toBeVisible();
  expect(calls).toBe(3);
});

test('screenshots validate limits and are included in actual request body; non-vision config disables upload', async ({ page }) => {
  let imageReceived = false;
  await page.route('https://api.deepseek.com/chat/completions', async route => {
    imageReceived = route.request().postDataJSON().messages.at(-1).content.some((x: { type: string }) => x.type === 'image_url');
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ kind: 'question', message: '希望如何处理这张测试图片？' }) } }] }) });
  });
  await page.goto('/'); await configure(page);
  const input = page.getByLabel('添加截图', { exact: true });
  const data = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8; canvas.getContext('2d')!.fillRect(0, 0, 8, 8); return canvas.toDataURL().split(',')[1]; });
  const png = Buffer.from(data, 'base64');
  const image = { name: '合成测试图.png', mimeType: 'image/png', buffer: png };
  await input.setInputFiles([image, image, image, image]);
  await expect(page.getByRole('alert')).toContainText('最多添加 3 张');
  await input.setInputFiles(image);
  await expect(page.locator('.attachment')).toHaveCount(1);
  await page.getByRole('button', { name: '发送需求' }).click();
  await expect(page.getByText('希望如何处理这张测试图片？', { exact: true })).toBeVisible();
  expect(imageReceived).toBe(true);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('模型名称', { exact: true }).fill('text-only-model');
  await page.getByRole('button', { name: '保存配置' }).click();
  await page.getByRole('button', { name: '创作', exact: true }).click();
  await expect(input).toBeDisabled();
});

test('a stale tab cannot overwrite a newer conversation or submit another billed request', async ({ page, context }) => {
  let calls = 0;
  await context.route('https://api.deepseek.com/chat/completions', route => {
    calls++;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ kind: 'plan', message: '合成测试方案', plan: samplePlan }) } }] }) });
  });
  await page.goto('/'); await configure(page);
  await page.getByLabel('描述你想实现的快捷指令').fill('测试数据'); await page.getByRole('button', { name: '发送需求' }).click();
  await expect(page.getByRole('status')).toContainText('动作校验完成');
  const other = await context.newPage(); await other.goto('/'); await configure(other);
  await other.getByRole('button', { name: '我的快捷指令', exact: true }).click(); await other.locator('.history-open').click();
  await page.getByLabel('描述你想实现的快捷指令').fill('测试修改'); await page.getByRole('button', { name: '发送需求' }).click();
  await expect(page.getByRole('status')).toContainText('动作校验完成');
  await other.getByLabel('描述你想实现的快捷指令').fill('另一页面的过期修改'); await other.getByRole('button', { name: '发送需求' }).click();
  await expect(other.getByRole('alert')).toContainText('另一页面修改');
  expect(calls).toBe(2);
});

test('reload does not repeat an interrupted request', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('iphone-shortcut-generator', 1); request.onsuccess = () => resolve(request.result); request.onerror = reject; });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('conversations', 'readwrite'); tx.objectStore('conversations').put({ id: 'interrupted', title: '中断测试', pending: true, updated: Date.now(), messages: [], versions: [] }); tx.oncomplete = () => resolve(); tx.onerror = reject; }); db.close();
  });
  let calls = 0;
  await page.route('https://api.deepseek.com/**', route => { calls++; return route.abort(); });
  await page.reload();
  await page.getByRole('button', { name: '我的快捷指令', exact: true }).click();
  await page.locator('.history-open').click();
  await expect(page.getByText(/上次页面关闭或刷新/)).toBeVisible();
  expect(calls).toBe(0);
});
