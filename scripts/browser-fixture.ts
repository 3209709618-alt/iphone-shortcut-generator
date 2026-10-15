import { compile } from '../web/src/compiler.ts';
import type { Plan } from '../web/src/domain.ts';

const plan: Plan = { name: 'BrowserActionsProbe', summary: '合成数据：全部浏览器动作映射检查', steps: [
  { id: 'words', kind: 'text', text: '测试数据 <&> 中文' },
  { id: 'answer', kind: 'ask', text: '测试输入' },
  { id: 'clip', kind: 'clipboard' },
  { id: 'copy', kind: 'copy', text: '{{clip}}' },
  { id: 'speak', kind: 'speak', text: '测试朗读' },
  { id: 'notify', kind: 'notification', text: '测试通知' },
  { id: 'web', kind: 'open_url', text: 'https://www.apple.com.cn' },
  { id: 'show', kind: 'show', text: '测试组合：{{words}} {{answer}} {{clip}} {{input}}' },
] };
process.stdout.write(compile(plan));
