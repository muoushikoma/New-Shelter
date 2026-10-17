// 事件框架：模拟层把事件压进 pending，UI 取出展示；无人值守时自动处理
import type { World } from './types';

export interface Choice {
  label: string;
  tags?: [string, string][];
  ok?: boolean; why?: string;
  run: (w: World) => string | EventView | void;
}
export interface EventView {
  id: string; title: string; text: string;
  speaker?: string;          // 人物 id（显示头像）
  lines?: { who: string; text: string }[]; // 其他人的表态
  choices: Choice[];
  art?: string;              // 小剧场类型（meeting / door / dark / outside）
  adultCtx?: Record<string, unknown>; // 成人内容接口的上下文
}
export interface EventDef {
  id: string;
  needsPlayer?: boolean;     // 玩家不在场/睡着时是否自动处理
  build: (w: World, ctx: Record<string, unknown>) => EventView | null;
  auto?: (w: World, ctx: Record<string, unknown>) => void;
}

export const EVENTS: Record<string, EventDef> = {};
export function defEvent(e: EventDef) { EVENTS[e.id] = e; }
