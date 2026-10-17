// 内容接口共用：when 条件匹配 + 文本变量替换。规范见 docs/CONTENT_GUIDE.md
export function getPath(o: unknown, path: string): unknown {
  let cur: unknown = o;
  for (const k of path.split('.')) { if (cur == null) return undefined; cur = (cur as Record<string, unknown>)[k]; }
  return cur;
}

export const WHEN_OPS = ['any', 'all', 'none', 'in', 'not', 'lt', 'gt', 'lte', 'gte', 'between', 'exists'] as const;
const OP_RE = new RegExp(`^(.*)\\.(${WHEN_OPS.join('|')})$`);

// when: { "路径": 值 } 精确相等；{ "路径.运算符": 值 } 见 WHEN_OPS
export function matchWhen(when: Record<string, unknown> | undefined, c: unknown): boolean {
  for (const [k, v] of Object.entries(when || {})) {
    const m = k.match(OP_RE);
    if (!m) { if (getPath(c, k) !== v) return false; continue; }
    const [, path, op] = m;
    const val = getPath(c, path);
    const arr = Array.isArray(val) ? (val as unknown[]) : [];
    switch (op) {
      case 'any': if (!(v as unknown[]).some((x) => arr.includes(x))) return false; break;
      case 'all': if (!(v as unknown[]).every((x) => arr.includes(x))) return false; break;
      case 'none': if ((v as unknown[]).some((x) => arr.includes(x))) return false; break;
      case 'in': if (!(v as unknown[]).includes(val)) return false; break;
      case 'not': if (Array.isArray(v) ? (v as unknown[]).includes(val) : val === v) return false; break;
      case 'lt': if (!(Number(val) < Number(v))) return false; break;
      case 'gt': if (!(Number(val) > Number(v))) return false; break;
      case 'lte': if (!(Number(val) <= Number(v))) return false; break;
      case 'gte': if (!(Number(val) >= Number(v))) return false; break;
      case 'between': { const [a, b] = v as number[]; if (!(Number(val) >= a && Number(val) <= b)) return false; break; }
      case 'exists': if ((val != null && val !== false && val !== 0 && val !== '') !== !!v) return false; break;
    }
  }
  return true;
}

// 文本变量：
//   {a.name}                          取值
//   {他|她|TA:a}                      按 a 的性别（male/female/其他）
//   {?a.rel.trust.gt:50 ? 甲 | 乙}    条件（gt / lt / eq）
export function fillText(text: string, c: unknown): string {
  // 先替换性别分支和取值，再处理条件（这样条件分支里也能嵌套变量）
  return text
    .replace(/\{([^{}|?]+)\|([^{}|]+)\|([^{}|:]+):([a-zA-Z0-9_]+)\}/g, (_, m, f, n, who) => { const g = getPath(c, who + '.gender'); return g === 'male' ? m : g === 'female' ? f : n; })
    .replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, p) => { const v = getPath(c, p); return v == null ? '' : String(v); })
    .replace(/\{\?([a-zA-Z0-9_.]+)\.(gt|lt|eq):([^ ?]+)\s*\?\s*([^|}]*)\|([^}]*)\}/g, (_, p, op, v, a, b) => { const x = getPath(c, p); const ok = op === 'gt' ? Number(x) > Number(v) : op === 'lt' ? Number(x) < Number(v) : String(x) === v; return (ok ? a : b).trim(); });
}
