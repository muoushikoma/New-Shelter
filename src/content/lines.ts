// 可扩展的台词池：内容包可以往这里追加或替换台词。键名列表见 docs/CONTENT_GUIDE.md「台词池」
export const LINE_KEYS: Record<string, string> = {
  'chat.hungry': '和玩家闲聊：对方很饿',
  'chat.cold': '和玩家闲聊：对方很冷',
  'chat.stressed': '和玩家闲聊：对方压力很大',
  'chat.hostile': '和玩家闲聊：对方讨厌玩家',
  'chat.partner': '和玩家闲聊：对方是玩家的恋人',
  'chat.general': '和玩家闲聊：其他情况（会和人物简介、对领导的看法混在一起随机）',
  'small.hungry': 'NPC 之间头顶对白：说话人很饿',
  'small.cold': 'NPC 之间头顶对白：说话人很冷',
  'small.stressed': 'NPC 之间头顶对白：说话人压力很大',
  'small.lovers': 'NPC 之间头顶对白：两人是恋人或暧昧',
  'small.hostile': 'NPC 之间头顶对白：说话人怨恨对方',
  'small.general': 'NPC 之间头顶对白：没话找话',
  'quarrel': 'NPC 之间吵起来时的第一句',
};

const extra: Record<string, { mode: 'add' | 'replace'; lines: string[] }> = {};

export function setLines(key: string, lines: string[], mode: 'add' | 'replace' = 'add') {
  const cur = extra[key];
  if (cur && mode === 'add') cur.lines.push(...lines);
  else extra[key] = { mode, lines: [...lines] };
}

// 取台词池：内置台词 + 内容包追加（或被内容包整体替换）
export function lines(key: string, defaults: string[]): string[] {
  const e = extra[key];
  if (!e || !e.lines.length) return defaults;
  return e.mode === 'replace' ? e.lines : [...defaults, ...e.lines];
}
