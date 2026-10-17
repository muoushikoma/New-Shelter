// 结局：由多个维度组合生成，命中特定组合时给出「标志性结局」的标题
import type { EndingResult, Person, World } from './types';
import { P, player, present, alive, rel, opinion, day, cnt, hasCond, nm, pron } from './util';

const OUT_NAME: Record<string, string> = { ceasefire: '停火', regime: '政权回归', occupation: '占领', collapse: '崩溃' };

function topTags(p: Person, n = 3) {
  return Object.entries(p.tags).sort((a, b) => b[1] - a[1]).slice(0, n).filter(([, v]) => v > 0).map(([k]) => k);
}

function eyesOf(w: World, me: Person): string {
  const o = w.people.filter((q) => q !== me && !q.external && (q.alive || q.deathDay));
  if (!o.length) return '没有人记得你';
  let tr = 0, fe = 0, re = 0, af = 0;
  for (const q of o) { const r = rel(w, q.id, me.id); tr += r.trust; fe += r.fear; re += r.resentment; af += r.affection; }
  const n = o.length; tr /= n; fe /= n; re /= n; af /= n;
  if (re > 45) return '一个被恨的人';
  if (fe > 50) return '一个让人害怕的人';
  if (af > 60 && tr > 55) return '一个被爱着的人';
  if (tr > 60) return '一个可以托付的人';
  if (tr < 25) return '一个不能信任的人';
  return '一个和大家一样的人';
}

export function computeEnding(w: World, terminal: string): EndingResult {
  const me = player(w);
  const outcome = w.war.outcome;
  const d = day(w);
  const isLeader = w.politics.leader === me.id;
  const abusive = isLeader && (w.politics.abuses >= 4 || (me.tags['特权'] || 0) + (me.tags['胁迫'] || 0) + (me.tags['牺牲他人'] || 0) >= 3);
  const partner = P(w, me.partner || null);
  const reported = (me.tags['告密'] || 0) > 0;
  const crossed = me.leftReason === 'crossed';
  const joined = me.leftReason === 'joined';
  const captive = hasCond(me, 'captive');
  const othersAlive = alive(w).filter((p) => !p.isPlayer && !p.external);
  const stillHere = present(w).filter((p) => !p.isPlayer);
  const crossedWith = String(w.facts.crossedWith || '').split(',').filter(Boolean);
  const withPartner = partner && partner.alive && (crossed ? crossedWith.includes(partner.id) || partner.leftReason === 'crossed' : partner.present && me.alive && !joined);

  // ---- 维度 ----
  let where = '避难所';
  if (!me.alive) where = `死于第 ${me.deathDay} 天（${me.deathCause}）`;
  else if (crossed) where = w.facts.crossedBy === 'redcross' ? '红十字车队上，驶向边境' : '界河对岸，另一个国家';
  else if (joined) where = w.facts.joinedOrg === 'smug' ? '走私团伙的地下室' : '军营';
  else if (captive) where = '劳动营';
  else if (outcome === 'regime') where = '回到政权治下的灰河镇';
  else if (outcome === 'occupation') where = '占领区的灰河镇';
  else if (outcome === 'collapse') where = '无主之地';
  else if (outcome === 'ceasefire') where = '停火后的灰河镇';

  let who = '普通成员';
  if (isLeader) who = abusive ? '小领袖（人们怕你）' : '避难所的领导者';
  else if (w.facts[`patron:${me.id}`] === 'mil') who = '军方的眼线';
  else if (w.facts[`patron:${me.id}`]) who = '强者的亲信';
  else if (joined) who = w.facts.joinedOrg === 'smug' ? '走私者' : '穿制服的人';
  else if (captive) who = '囚徒';
  else if (crossed) who = '流亡者';
  if (reported && outcome === 'regime') who += ' · 检举有功';
  if (reported && outcome === 'occupation' && w.facts[`C_MIL:${me.id}`] === 'occupier') who += ' · 合作者';
  if (me.origin === 'deserter' && outcome === 'regime' && !crossed && me.alive) who += ' · 在逃兵名单上';
  if (me.origin === 'cadre' && outcome === 'occupation' && !crossed && me.alive) who += ' · 在清算名单上';

  let withWhom = withPartner ? `和${partner!.name}在一起` : '孤身一人';
  const haters = w.people.filter((q) => q !== me && rel(w, q.id, me.id).resentment > 55).length;
  if (haters >= 3) withWhom += `（${haters} 个人恨你）`;

  let shelter = '';
  if (!stillHere.length) shelter = w.people.filter((p) => !p.isPlayer && p.alive === false).length >= 3 ? '全灭' : '人去楼空';
  else if (w.facts.harvests && w.shelter.filterBuilt && stillHere.length >= 3) shelter = '自给自足，继续运转';
  else if (outcome === 'occupation' || outcome === 'regime') shelter = '被接管';
  else if (stillHere.length <= 2) shelter = '只剩下零星几个人';
  else shelter = `还有 ${stillHere.length + (me.present ? 1 : 0)} 个人`;

  const worldTxt = outcome ? OUT_NAME[outcome] : `战争还在继续（第 ${w.war.phase} 阶段）`;
  const tags = topTags(me);
  const how = tags.length ? tags.join(' · ') : '随波逐流';

  // ---- 标志性结局 ----
  let title = '活着', subtitle = '';
  if (!me.alive) {
    title = othersAlive.length ? '门外的雪' : '最后一个人';
    subtitle = `${me.deathCause}。${othersAlive.length ? '其他人还在等着天亮。' : '避难所里再也没有声音了。'}`;
  } else if (crossed && withPartner) { title = '一起过河'; subtitle = `你和${partner!.name}在对岸的雪地里坐了很久。没有人说话。`; }
  else if (crossed && (me.tags['牺牲他人'] || 0) > 0) { title = '过河的代价'; subtitle = '你过了河。你知道是谁替你付了钱。'; }
  else if (crossed) { title = '独自过河'; subtitle = stillHere.length ? `你没有回头。避难所里的${stillHere.length}个人，不知道你是怎么走的。` : '你走了。身后什么也没有剩下。'; }
  else if (joined) { title = w.facts.joinedOrg === 'smug' ? '河上的人' : '一把铁锹'; subtitle = w.facts.joinedOrg === 'smug' ? '你学会了在夜里不点灯地划船。' : '你穿上了制服。你不再是难民了，也不再是你自己。'; }
  else if (captive) { title = '劳动营'; subtitle = '你的名字成了一个编号。'; }
  else if (abusive) { title = '他们排成一列'; subtitle = '你走出避难所时，身后的人排成一列，低着头。广播里的声音，和你的声音越来越像。'; }
  else if (isLeader && w.politics.legitimacy >= 55) { title = w.facts.harvests ? '地下的田' : '小小的共和国'; subtitle = '你没有成为你曾经害怕的那种人。至少，没有完全成为。'; }
  else if (w.facts.harvests && w.shelter.filterBuilt && stillHere.length >= 3) { title = '地下的田'; subtitle = '你们不再等救援了。蘑菇和豆芽在黑暗里长着，像一个小小的、固执的国家。'; }
  else if (withPartner) { title = '两个人的冬天'; subtitle = `不管外面变成什么样子，你身边有${partner!.name}。`; }
  else if (reported && outcome === 'regime') { title = '坚守者'; subtitle = '你被表彰了。表彰会上，你没有看那些被你写进名单的人的家属。'; }
  else if (me.origin === 'deserter' && outcome === 'regime') { title = '审查'; subtitle = '卡车开进镇子的那天，你听见了自己的名字。'; }
  else if (outcome === 'occupation') { title = '新的边界'; subtitle = '地图上的线挪了几十公里。你没动，国家动了。'; }
  else if (outcome === 'collapse') { title = '无主之地'; subtitle = '没有人来救你们，也没有人来管你们。'; }
  else if (outcome === 'ceasefire' && w.facts.rcRegistered) { title = '公社的冬天'; subtitle = '救援车队来的时候，所有人都瘦得认不出彼此。但大部分人还活着。'; }
  else if (outcome === 'ceasefire') { title = '停火'; subtitle = '你走出避难所，眯着眼睛看雪地上的太阳。'; }

  // ---- 统计 ----
  const lines: string[] = [];
  lines.push(`你活了 ${me.alive ? d : me.deathDay} 天。在别人眼里，你是${eyesOf(w, me)}。`);
  const dead = w.people.filter((p) => !p.alive && !p.external && !p.isPlayer);
  if (dead.length) lines.push(`死去的人：${dead.map((p) => `${p.name}（${p.deathCause}）`).join('、')}。`);
  const taken = w.people.filter((p) => p.leftReason === 'taken');
  if (taken.length) lines.push(`被带走的人：${taken.map((p) => p.name).join('、')}。`);
  const loves = w.people.filter((q) => q !== me && rel(w, me.id, q.id).times > 0);
  if (loves.length) lines.push(`和你有过亲密关系的人：${loves.map((q) => `${q.name}（${relStateName(rel(w, q.id, me.id).state)}）`).join('、')}。`);
  if (w.politics.history.length) lines.push(`避难所的权力更替：${w.politics.history.filter((h) => h.includes('领导者') || h.includes('罢免')).slice(-4).join('；') || '没有人真正掌过权'}。`);

  const epilogues = w.people.filter((p) => !p.isPlayer && !p.external).map((p) => ({ id: p.id, text: epilogue(w, p, me) }));
  return { title, subtitle, where, who, withWhom, shelter, world: worldTxt, how, lines, epilogues, day: d, terminal };
}

function relStateName(s: string) {
  return ({ lovers: '恋人', affair: '情人', transactional: '交易', patronage: '庇护', domination: '支配', enemy: '仇人', flirting: '暧昧', friend: '朋友', acquainted: '熟人', stranger: '陌生人' } as Record<string, string>)[s] || s;
}

function epilogue(w: World, p: Person, me: Person): string {
  const op = opinion(w, p.id, me.id);
  const view = op > 55 ? '记得你的好' : op < 5 ? '不愿意提起你' : '偶尔会想起你';
  if (!p.alive) return `${p.name}：死于第 ${p.deathDay} 天，${p.deathCause}。`;
  if (p.leftReason === 'crossed') return `${p.name}：过了河。后来有人在难民营里见过${pron(p)}。${pron(p)}${view}。`;
  if (p.leftReason === 'taken') return `${p.name}：被带走了，再也没有消息。`;
  if (p.leftReason === 'joined') return `${p.name}：留在了外面，换了一身衣服。`;
  if (p.leftReason === 'expelled') return `${p.name}：被赶出了避难所。没有人知道${pron(p)}后来怎么样了。`;
  const out = w.war.outcome;
  let fate = '';
  if (out === 'regime' && (p.origin === 'deserter' || p.secrets.some((s) => s.id.includes('deserter')))) fate = '政权回来以后，被审查了。';
  else if (out === 'regime' && p.origin === 'cadre') fate = '官复原职。他写了一份很长的报告，关于避难所里每个人的表现。';
  else if (out === 'occupation' && p.origin === 'cadre') fate = '在占领当局的登记处排了三天队，然后被带走了。';
  else if (out === 'occupation' && p.pers.regime === 'rebel') fate = '在新的政府里找到了一份工作。';
  else if (out === 'ceasefire') fate = '活到了停火。';
  else if (out === 'collapse') fate = '在废墟里活了下去，靠的是在避难所学会的那些事。';
  else fate = '还在避难所里。';
  const love = p.partner ? `和${nm(w, p.partner)}在一起。` : '';
  return `${p.name}：${fate}${love}${pron(p)}${view}。`;
}

export { cnt };
