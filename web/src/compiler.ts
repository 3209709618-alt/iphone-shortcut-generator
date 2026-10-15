import { validatePlan, type Plan } from './domain.ts';

type Plist = string | number | boolean | Plist[] | { [key: string]: Plist };
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;').replaceAll('\r', '&#13;');
function xml(value: Plist): string {
  if (typeof value === 'string') return `<string>${escape(value)}</string>`;
  if (typeof value === 'number') return `<integer>${value}</integer>`;
  if (typeof value === 'boolean') return value ? '<true/>' : '<false/>';
  if (Array.isArray(value)) return `<array>${value.map(xml).join('')}</array>`;
  return `<dict>${Object.entries(value).map(([key, v]) => `<key>${escape(key)}</key>${xml(v)}`).join('')}</dict>`;
}
// Stable per-step UUIDs only identify outputs within one workflow.
function uuid(index: number) { return `A17E0000-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0').toUpperCase()}`; }
export function workflow(raw: Plan): Plist {
  const plan = validatePlan(raw);
  const references = new Map(plan.steps.map((s, i) => [s.id, uuid(i)]));
  function token(text: string): Plist {
    if (!text.includes('{{')) return text;
    const attachments: { [key: string]: Plist } = {};
    let output = ''; let cursor = 0;
    for (const match of text.matchAll(/\{\{([^{}]+)\}\}/g)) {
      output += text.slice(cursor, match.index);
      attachments[`{${output.length}, 1}`] = match[1] === 'input'
        ? { Type: 'ExtensionInput', VariableName: 'ShortcutInput' }
        : { Type: 'ActionOutput', OutputUUID: references.get(match[1])!, OutputName: match[1] };
      output += '\uFFFC'; cursor = match.index + match[0].length;
    }
    return { Value: { attachmentsByRange: attachments, string: output + text.slice(cursor) }, WFSerializationType: 'WFTextTokenString' };
  }
  const mapped = plan.steps.map((step, i) => {
    const t = token(step.text ?? '');
    let name: string; let params: { [key: string]: Plist };
    switch (step.kind) {
      case 'text': name = 'gettext'; params = { WFTextActionText: t }; break;
      case 'ask': name = 'ask'; params = { WFAskActionPrompt: t, WFInputType: 'Text' }; break;
      case 'clipboard': name = 'getclipboard'; params = {}; break;
      case 'show': name = 'showresult'; params = { Text: t }; break;
      case 'copy': {
        const ref = step.text!.slice(2, -2);
        name = 'setclipboard';
        params = { WFInput: { Value: ref === 'input' ? { Type: 'ExtensionInput', VariableName: 'ShortcutInput' } : { Type: 'ActionOutput', OutputUUID: references.get(ref)!, OutputName: ref }, WFSerializationType: 'WFTextTokenAttachment' }, WFLocalOnly: true };
        break;
      }
      case 'speak': name = 'speaktext'; params = { WFText: t, WFSpeakTextWait: true }; break;
      case 'notification': name = 'notification'; params = { WFNotificationActionBody: t, WFNotificationActionSound: true }; break;
      case 'open_url': name = 'openurl'; params = { WFInput: t, 'Show-WFInput': true }; break;
    }
    if (['text', 'ask', 'clipboard'].includes(step.kind)) Object.assign(params, { UUID: uuid(i), CustomOutputName: step.id });
    return { WFWorkflowActionIdentifier: `is.workflow.actions.${name}`, WFWorkflowActionParameters: params };
  });
  return {
    WFWorkflowActions: mapped,
    WFWorkflowClientVersion: '4033.0.4.3',
    WFWorkflowIcon: { WFWorkflowIconGlyphNumber: 61440, WFWorkflowIconStartColor: 3031607807 },
    WFWorkflowImportQuestions: [], WFWorkflowInputContentItemClasses: ['WFStringContentItem'],
    WFWorkflowMinimumClientVersion: 900, WFWorkflowMinimumClientVersionString: '900',
    ...(plan.steps.some(s => s.text?.includes('{{input}}')) ? { WFWorkflowHasShortcutInputVariables: true } : {}),
  };
}
export function compile(plan: Plan): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${xml(workflow(plan))}</plist>\n`;
}
