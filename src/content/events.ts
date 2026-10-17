// 叙事事件：触发条件和参演角色由模拟决定，文字在这里
import { defEvent, EventView, Choice } from '../sim/events';
import type { Person, World, ItemKey } from '../sim/types';
import { P, player, present, alive, rel, relAdd, opinion, nm, log, day, cnt, addItem, takeItem, addMem, bark, clamp, hasCond, knowFact, tagMethod, isNight, roomOf, pron } from '../sim/util';
import { rnd, chance, pick, rint } from '../engine/rng';
import { holdVote, support, Proposal, punish, coup, applyManualRations, setLeader, RULE_TEXT, giveKey } from '../sim/politics';
import { makeStranger } from '../sim/world';
import { leaveForever, milName, PHASE_NAMES } from '../sim/war';
import { addCond, die } from '../sim/env';
import { propose, CONSENT_NAMES, willingness } from '../sim/intimacy';
import { ITEMS } from './items';
import { ROOM } from './layout';
import { computeEnding } from '../sim/ending';

const say = (w: World, id: string, text: string) => ({ who: id, text });
const name = (w: World, id: string | undefined) => nm(w, id);
const others = (w: World) => present(w).filter((p) => !p.isPlayer && !hasCond(p, 'captive'));

// 会上大家的表态
function opinionsOn(w: World, pr: Proposal, proposer: Person) {
  return others(w).filter((p) => p !== proposer).map((p) => {
    const s = support(w, p, pr, proposer);
    const t = s > 30 ? pick(w.rng, ['我同意。', '早该这样了。', '行。', '就这么办。']) : s > 8 ? pick(w.rng, ['……也行吧。', '先这样试试。', '我没意见。']) : s < -30 ? pick(w.rng, ['我反对。', '凭什么？', '你们疯了。', '想都别想。']) : s < -8 ? pick(w.rng, ['我觉得不妥。', '再想想吧。', '……我不同意。']) : pick(w.rng, ['……', '（低头不说话）', '你们定吧。']);
    return say(w, p.id, t);
  });
}
function voteChoices(w: World, pr: Proposal, proposer: Person): Choice[] {
  const me = player(w);
  const res = (v: 'yes' | 'no' | 'abstain') => (wd: World) => holdVote(wd, pr, proposer, v).text;
  const c: Choice[] = [
    { label: '投赞成票', tags: [['表决', '#8ab0d8']], run: res('yes') },
    { label: '投反对票', tags: [['表决', '#8ab0d8']], run: res('no') },
    { label: '弃权（不表态）', run: res('abstain') },
  ];
  c.unshift({
    label: '站起来说服大家', tags: [[`说服 ${me.skills.persuade}`, '#d8b060']], run: (wd) => {
      const ok = rnd(wd.rng) * 100 < me.skills.persuade + 15;
      const view: EventView = {
        id: 'speech', title: '你说了一番话', text: ok ? '你说完，屋里安静了一会儿。几个人的表情松动了。' : '你说得磕磕巴巴。有人别过了头。', choices: [
          { label: '（支持）然后投赞成票', run: (w2) => { if (ok) for (const p of others(w2)) relAdd(w2, p.id, proposer.id, { trust: 6 }); return holdVote(w2, pr, proposer, 'yes').text; } },
          { label: '（反对）然后投反对票', run: (w2) => { if (ok) for (const p of others(w2)) relAdd(w2, p.id, proposer.id, { trust: -6, respect: -4 }); return holdVote(w2, pr, proposer, 'no').text; } },
        ],
      };
      if (ok) for (const p of others(wd)) relAdd(wd, p.id, me.id, { respect: 3 });
      return view;
    },
  });
  return c;
}

// ---------- 开场 ----------
defEvent({
  id: 'intro', needsPlayer: true,
  build: (w) => {
    const me = player(w);
    const ppl = others(w);
    return {
      id: 'intro', title: '第一个早晨', art: 'meeting',
      text: `炮声停了一会儿。\n\n昨晚，${ppl.length + 1} 个互不相识的人先后钻进了灰河镇第 7 号民防避难所。这里五十年前修来防核弹，后来就被遗忘了：发电机还能转，仓库里还剩些罐头，墙上的领袖画像落满了灰。\n\n你是${me.name}，${me.originText}。${me.bio}\n\n门外是零下二十度和一场不知道什么时候结束的战争。门里，是${ppl.map((p) => p.name).join('、')}。\n\n没有人说该怎么办。所有人都在看着别人。`,
      choices: [{ label: '活下去。', run: () => '' }],
    };
  },
});

// ---------- 第一次分配会议 ----------
defEvent({
  id: 'first_meeting', needsPlayer: true,
  build: (w, ctx) => {
    const c = P(w, ctx.caller as string);
    if (!c || !c.present) return null;
    const food = cnt(w.storage, 'food');
    const n = present(w).length;
    const pr1: Proposal = { kind: 'leader', target: c.id, label: `推举${c.name}为领导者` };
    const policy = c.pers.power > 70 ? 'contribution' : c.pers.morality > 65 ? 'equal' : 'contribution';
    const speech = c.origin === 'cadre' ? `「同志们——各位。仓库里还有 ${food} 份吃的，${n} 个人，撑不过 ${Math.floor(food / n / 2)} 天。没有规矩，大家都得死。我提议：配给${RULE_TEXT.ration[policy]}，钥匙由我保管。有意见的，现在说。」`
      : `「我们得定个规矩。${food} 份吃的，${n} 张嘴。我来管仓库，${RULE_TEXT.ration[policy]}。谁有更好的主意？」`;
    const me = player(w);
    return {
      id: 'first_meeting', title: '第一次分配会议', speaker: c.id, art: 'meeting',
      text: `第 ${day(w)} 天，傍晚。${c.name}把所有人叫到了长桌边。\n\n${speech}`,
      lines: opinionsOn(w, pr1, c),
      choices: [
        { label: `「同意。总得有人管。」`, tags: [[`${c.name} 信任↑`, '#6ab06a']], run: (wd) => { relAdd(wd, c.id, me.id, { trust: 10, affection: 5 }); wd.politics.rules.ration = policy; const r = holdVote(wd, pr1, c, 'yes'); return r.text; } },
        { label: '「谁来定什么叫贡献？你吗？」', tags: [[`说服 ${me.skills.persuade}`, '#d8b060'], [`${c.name} 记恨`, '#c05050']], run: (wd) => { relAdd(wd, c.id, me.id, { resentment: 12 }); const ok = rnd(wd.rng) * 100 < me.skills.persuade + 10; for (const p of others(wd)) if (p !== c) relAdd(wd, p.id, c.id, { trust: ok ? -8 : -2 }); if (ok) for (const p of others(wd)) relAdd(wd, p.id, me.id, { respect: 5 }); const r = holdVote(wd, pr1, c, 'no'); return (ok ? '你的话让几个人犹豫了。\n' : '没几个人接你的话。\n') + r.text; } },
        { label: '「我提议投票——每一件事都投票。」', tags: [['全体表决', '#8ab0d8']], run: (wd) => { wd.politics.rules.decision = 'assembly'; wd.politics.rules.ration = 'equal'; wd.politics.rules.storageLocked = true; const pr: Proposal = { kind: 'ration', value: 'equal', label: '口粮：平均分配，仓库上锁，开会决定一切' }; const r = holdVote(wd, pr, me, 'yes'); if (r.passed) { wd.shelter.keyHolder = null; } return r.text; } },
        { label: '「我来管。」（推举自己）', tags: [['竞争', '#c05050']], run: (wd) => { relAdd(wd, c.id, me.id, { resentment: 15 }); return holdVote(wd, { kind: 'leader', target: me.id, label: '推举你为领导者' }, me, 'yes').text; } },
        { label: '（沉默，看别人怎么说）', run: (wd) => holdVote(wd, pr1, c, 'abstain').text },
      ],
    };
  },
  auto: (w, ctx) => { const c = P(w, ctx.caller as string); if (c) holdVote(w, { kind: 'leader', target: c.id, label: `推举${c.name}为领导者` }, c, 'abstain'); },
});

// ---------- NPC 召集的会议 ----------
defEvent({
  id: 'meeting', needsPlayer: true,
  build: (w, ctx) => {
    const c = P(w, ctx.caller as string);
    const pr = ctx.proposal as Proposal;
    if (!c || !c.present) return null;
    const t = P(w, pr.target || null);
    let why = '';
    if (pr.kind === 'depose') why = `「${t?.name}已经不配坐那个位置了。${w.politics.abuses > 2 ? '他做过什么，大家心里都有数。' : '我们需要换个人。'}」`;
    else if (pr.kind === 'punish') why = `「${t?.isPlayer ? '你' : t?.name}做的事，不能就这么算了。」`;
    else if (pr.kind === 'keeper') why = '「仓库里的东西一天比一天少。得锁起来。」';
    else if (pr.kind === 'leader') why = `「我们需要一个拿主意的人。我愿意担这个担子。」`;
    return { id: 'meeting', title: '开会', speaker: c.id, art: 'meeting', text: `${c.name}敲了敲桌子：${why}\n\n提议：${pr.label}`, lines: opinionsOn(w, pr, c), choices: voteChoices(w, pr, c) };
  },
  auto: (w, ctx) => { const c = P(w, ctx.caller as string); if (c) holdVote(w, ctx.proposal as Proposal, c, 'abstain'); },
});

// ---------- 有人敲门 ----------
defEvent({
  id: 'knock', needsPlayer: false,
  build: (w, ctx) => {
    const kind = ctx.kind as string;
    const me = player(w);
    const food = cnt(w.storage, 'food'), n = present(w).length;
    const door = w.politics.rules.door;
    const leader = P(w, w.politics.leader);
    const canDecide = !leader || leader.isPlayer || w.politics.rules.door !== 'closed';
    const lines = others(w).slice(0, 3).map((p) => say(w, p.id, kindLine(w, p, kind)));
    switch (kind) {
      case 'refugee': case 'wounded': case 'deserter': {
        const s = makeStranger(w, kind);
        ctx.sid = s.id; (w as unknown as { _tmpStranger: Person })._tmpStranger = s;
        const desc = kind === 'refugee' ? `一个${s.gender === 'f' ? '女人' : '男人'}，${s.age} 岁上下，背着一个包袱。「求求你们，外面太冷了。」`
          : kind === 'wounded' ? `一个穿军装的人，头上缠着带血的布，几乎站不住。「……让我进去……我什么都不记得了……」`
          : `一个穿着撕掉了肩章的军大衣的人。「我是从前线下来的。我不想死。」他压低声音：「宪兵就在后面两条街。」`;
        return {
          id: 'knock', title: '有人敲门', art: 'door',
          text: `防爆门外传来敲击声，三下，停，又三下。\n\n透过观察孔：${desc}\n\n门规：${RULE_TEXT.door[door]}。仓库里还有 ${food} 份吃的，${n} 个人。`,
          lines,
          choices: [
            { label: '开门，让人进来', ok: canDecide, why: '领导者不允许', tags: [['多一张嘴', '#c08040']], run: (wd) => { admit(wd, s, kind); if (me.pers) tagMethod(me, '合作'); return `${s.name}进来了，在门边瘫坐下去。`; } },
            { label: '递一份吃的出去，但不开门', ok: cnt(me.inv, 'food') > 0, why: '你身上没有吃的', run: (wd) => { takeItem(me.inv, 'food', 1); me.needs.stress = clamp(me.needs.stress - 3); return '你把罐头从门缝塞了出去。外面的人说了声谢谢，脚步声远了。'; } },
            { label: '不开', run: (wd) => { me.needs.stress = clamp(me.needs.stress + 6); for (const p of others(wd)) if (p.pers.morality > 70) relAdd(wd, p.id, me.id, { respect: -4 }); if (kind === 'deserter') wd.facts.deserterTurnedAway = true; return '敲门声又响了几次，然后停了。'; } },
            { label: '叫醒大家，表决', run: (wd) => { const yes = others(wd).filter((p) => p.pers.morality + (food / n) * 3 - 50 + rnd(wd.rng) * 30 > 45).length; if (yes * 2 > others(wd).length) { admit(wd, s, kind); return `表决：${yes} 比 ${others(wd).length - yes}。门开了。`; } return `表决：${yes} 比 ${others(wd).length - yes}。门没有开。`; } },
          ],
        };
      }
      case 'mp': {
        const deserters = present(w).filter((p) => p.origin === 'deserter' || p.secrets.some((s) => s.id.includes('deserter')));
        return {
          id: 'knock', title: '宪兵', art: 'door',
          text: `枪托砸门的声音。\n\n「宪兵队！开门！我们在搜捕逃兵！」\n\n${deserters.length ? `你感觉到${deserters.map((d) => d.isPlayer ? '你自己' : d.name).join('和')}的呼吸停了一下。` : '屋里没人说话。'}`,
          lines,
          choices: [
            { label: '开门，配合搜查', run: (wd) => mpSearch(wd, false) },
            { label: '开门，把逃兵藏进档案室/下层小间', run: (wd) => mpSearch(wd, true) },
            { label: '交出一个人，换他们走（举报）', ok: deserters.some((d) => !d.isPlayer && d.secrets.some((s) => s.known.includes(me.id))) || deserters.some((d) => !d.isPlayer && d.origin === 'deserter'), why: '你不知道谁是逃兵', tags: [['牺牲他人', '#c05050']], run: (wd) => { const d = deserters.find((x) => !x.isPlayer)!; leaveForever(wd, d, 'taken'); addItem(wd.storage, 'food', 5); tagMethod(me, '告密'); for (const q of others(wd)) { relAdd(wd, q.id, me.id, { fear: 10, trust: -15, respect: q.pers.regime === 'loyal' ? 5 : -10 }); } addMem(me, wd, { kind: 'betrayed', who: d.id, w: -30, text: `我把${d.name}交了出去。` }); wd.facts[`betrayed:${d.id}`] = me.id; return `你说出了${d.name}的名字。他们把${pron(d)}拖了出去。宪兵留下了五罐吃的，算是「奖励」。屋里没有人看你。`; } },
            { label: '不开门', run: (wd) => { if (rnd(wd.rng) < 0.5) { wd.shelter.damage += 10; for (const p of present(wd)) p.needs.stress = clamp(p.needs.stress + 12); return '他们砸了很久的门，往通风口扔了一颗催泪弹，骂骂咧咧地走了。'; } return mpSearch(wd, false, '门被炸开了。'); } },
          ],
        };
      }
      case 'occupier': {
        const cadres = present(w).filter((p) => p.origin === 'cadre' || (p.pers.regime === 'loyal' && p.origin !== 'farmer'));
        return {
          id: 'knock', title: '占领军', art: 'door',
          text: `说另一种语言的人在门外喊话。一个翻译跟着喊：\n\n「占领当局通告！所有原阵线干部、内务处人员必须登记！窝藏者同罪！」\n\n${cadres.length ? `${cadres.map((c) => c.isPlayer ? '你' : c.name).join('、')}的脸白了。` : ''}`,
          lines,
          choices: [
            { label: '开门配合', run: (wd) => occSearch(wd, false) },
            { label: '开门，但把干部藏起来', run: (wd) => occSearch(wd, true) },
            { label: '主动交出干部，换取「合作者」身份', ok: cadres.some((c) => !c.isPlayer), why: '这里没有干部', tags: [['牺牲他人', '#c05050']], run: (wd) => { const c = cadres.find((x) => !x.isPlayer)!; leaveForever(wd, c, 'taken'); wd.facts[`C_MIL:${me.id}`] = 'occupier'; tagMethod(me, '告密'); for (const q of others(wd)) relAdd(wd, q.id, me.id, { fear: 10, trust: q.pers.regime === 'rebel' ? 5 : -15 }); return `${c.name}被带走了。翻译递给你一张纸：「合作者证明」。从今天起，占领军认识你了。`; } },
          ],
        };
      }
      case 'smuggler': return {
        id: 'knock', title: '走私贩', art: 'door',
        text: '一个戴毛线帽的男人，背着一个鼓鼓的包。「做生意。烟、酒、药、过河的路——你们有什么？」',
        lines,
        choices: [
          { label: '让他进来做买卖（之后可以在黑市找到他）', run: (wd) => { knowFact(wd, me, 'K_SMUG'); knowFact(wd, me, 'K_MARKET'); wd.locs.market.known = true; addItem(me.inv, 'cigs', 0); return '他留下了一个地址：老电影院地下室。「过河的事，到那儿再说。」'; } },
          { label: '赶走他', run: () => '他耸耸肩走了。' },
        ],
      };
      case 'redcross': return {
        id: 'knock', title: '红十字', art: 'door',
        text: '门外是一个戴红十字袖标的女人，冻得说不出完整的句子。「我们在……统计幸存者……教堂后院有救助站……」',
        lines,
        choices: [{ label: '登记避难所的人数', run: (wd) => { wd.facts.rcRegistered = true; knowFact(wd, me, 'K_REDCROSS'); wd.locs.redcross.known = true; addItem(wd.storage, 'meds', 1); return '她在本子上记下了你们。临走时留下了一支药。'; } }, { label: '不开门', run: () => '她在门上贴了一张纸条：「红十字救助站——教堂」。' }],
      };
      case 'soldiers': return {
        id: 'knock', title: '溃兵', art: 'door',
        text: '一群不知道属于哪一边的兵。「吃的。全部拿出来。」',
        lines,
        choices: [
          { label: '给他们一半', run: (wd) => { const n = Math.floor(cnt(wd.storage, 'food') / 2); takeItem(wd.storage, 'food', n); return `他们拿走了 ${n} 份吃的。`; } },
          { label: '拼了', ok: cnt(me.inv, 'pistol') + cnt(me.inv, 'rifle') > 0 || present(w).some((p) => cnt(p.inv, 'pistol')), why: '你们没有武器', tags: [['暴力', '#c05050']], run: (wd) => { if (rnd(wd.rng) < 0.5) { return '枪声。他们退走了，留下了一具尸体。'; } const v = pick(wd.rng, present(wd)); addCond(wd, v, 'wound', 50); takeItem(wd.storage, 'food', 99); return `${name(wd, v.id)}中了枪。他们拿走了所有的吃的。`; } },
          { label: '假装没人', run: (wd) => { if (rnd(wd.rng) < 0.6) return '他们骂了几句走了。'; takeItem(wd.storage, 'food', 10); wd.shelter.damage += 10; return '他们砸开了门，搬走了十份吃的。'; } },
        ],
      };
    }
    return null;
  },
  auto: (w, ctx) => {
    const kind = ctx.kind as string;
    const door = w.politics.rules.door;
    const food = cnt(w.storage, 'food'), n = present(w).length;
    if (['refugee', 'wounded', 'deserter'].includes(kind)) {
      const open = (door === 'open' && food / n > 3) || (door === 'useful' && kind !== 'refugee' && rnd(w.rng) < 0.4) || (door === 'vote' && food / n > 7 && rnd(w.rng) < 0.5);
      if (open) { const s = makeStranger(w, kind); admit(w, s, kind); }
      else log(w, '夜里有人敲门。没有人去开。', { col: '#a8a098' });
    } else if (kind === 'mp') mpSearch(w, rnd(w.rng) < 0.5);
    else if (kind === 'occupier') occSearch(w, rnd(w.rng) < 0.5);
    else if (kind === 'soldiers') { takeItem(w.storage, 'food', Math.floor(cnt(w.storage, 'food') / 3)); log(w, '一伙溃兵闯进来抢走了一些吃的。', { col: '#e8705a', important: true }); }
    else if (kind === 'redcross') { w.facts.rcRegistered = true; log(w, '红十字会的人来过，登记了避难所的人数。', { col: '#a0d8e8', important: true }); }
  },
});

function kindLine(w: World, p: Person, kind: string) {
  if (kind === 'mp' && (p.origin === 'deserter' || p.secrets.some((s) => s.id.includes('deserter')))) return '（脸色发白）';
  if (kind === 'occupier' && p.origin === 'cadre') return '（手在发抖）';
  if (['refugee', 'wounded'].includes(kind)) return p.pers.morality > 65 ? '让人进来吧。' : cnt(w.storage, 'food') < present(w).length * 5 ? '我们自己都不够吃。' : '……你决定。';
  if (kind === 'deserter') return p.pers.regime === 'loyal' ? '逃兵？会连累我们所有人。' : '他跟我们一样，只是想活。';
  return '……';
}

function admit(w: World, s: Person, kind: string) {
  if (!w.people.includes(s)) w.people.push(s);
  s.present = true; s.floor = 0; s.x = ROOM.entrance.x + 14;
  log(w, `${s.name}（${s.originText}）住进了避难所。`, { col: '#c8d0a0', important: true });
  for (const q of present(w)) if (q !== s) relAdd(w, s.id, q.id, { trust: 10 });
  if (kind === 'deserter') w.facts.harborDeserter = s.id;
}

function mpSearch(w: World, hide: boolean, pre = ''): string {
  const deserters = present(w).filter((p) => p.origin === 'deserter' || p.secrets.some((s) => s.id.includes('deserter')));
  const out: string[] = [pre];
  const took = Math.min(cnt(w.storage, 'food'), rint(w.rng, 3, 8));
  takeItem(w.storage, 'food', took); out.push(`他们「征用」了 ${took} 份吃的。`);
  for (const d of deserters) {
    const caught = hide ? rnd(w.rng) < 0.25 - d.skills.stealth / 400 : rnd(w.rng) < 0.6;
    if (caught) {
      if (d.isPlayer) { w.pending.push({ id: 'arrested_player', t: w.t, ctx: {} }); out.push('一个宪兵盯着你的军靴看了很久。「你，跟我们走。」'); }
      else { leaveForever(w, d, 'taken'); out.push(`他们认出了${d.name}，把${pron(d)}拖了出去。外面响了一枪。`); for (const q of present(w)) q.needs.stress = clamp(q.needs.stress + 15); }
    } else if (hide) out.push(`${d.isPlayer ? '你' : d.name}在档案室的黑暗里屏住呼吸，直到靴子声远去。`);
  }
  if (!deserters.length) out.push('他们没找到要找的人。');
  log(w, '宪兵搜查了避难所。' + out.join(''), { col: '#e8a060', important: true });
  return out.filter(Boolean).join('\n');
}

function occSearch(w: World, hide: boolean): string {
  const cadres = present(w).filter((p) => p.origin === 'cadre' || p.secrets.some((s) => s.id === 'zhou_informer'));
  const out: string[] = [];
  for (const c of cadres) {
    const caught = hide ? rnd(w.rng) < 0.25 : rnd(w.rng) < 0.7;
    if (caught) {
      if (c.isPlayer) { w.pending.push({ id: 'arrested_player', t: w.t, ctx: { occ: true } }); out.push('翻译指着你：「档案上有你的名字。」'); }
      else { leaveForever(w, c, 'taken'); out.push(`${c.name}被带走了。${pron(c)}回头看了一眼，没说话。`); }
    } else if (hide) out.push(`${c.isPlayer ? '你' : c.name}躲过去了。`);
  }
  if (!cadres.length) out.push('他们翻了一遍登记册，什么也没说就走了。');
  log(w, '占领军搜查了避难所。' + out.join(''), { col: '#e8a060', important: true });
  return out.join('\n');
}

// ---------- 阶段变化 ----------
const phaseText: Record<number, string> = {
  2: '凌晨，大地开始震动。前线到了灰河镇。\n\n炮弹落在镇子上，一下接一下，像有人在敲一扇巨大的门。灰从天花板上簌簌地往下掉。\n\n【战争阶段二：炮火】地表更危险；黑市开张；军方在火车站放出了更多通行证名额。',
  3: '炮声停了。取而代之的是另一种语言的口令和履带声。\n\n灰河镇被占领了。广播里不再是「阵线之声」，而是一个陌生的声音，用生硬的口音念着通告：所有原阵线干部，三日内登记。\n\n【战争阶段三：占领】旧政权的通行证与关系可能变成罪证；红十字会进入灰河；占领军开始清算。',
  4: '有消息说，谈判开始了。也有消息说，旧政权的军队正在反扑。没有人知道哪个是真的。\n\n【战争阶段四：终局】几天之内，一切都会有个结果。',
};
for (const ph of [2, 3, 4]) defEvent({
  id: 'phase' + ph, needsPlayer: false,
  build: () => ({ id: 'phase' + ph, title: `战争阶段${['', '一', '二', '三', '四'][ph]}：${PHASE_NAMES[ph]}`, text: phaseText[ph], art: ph === 2 ? 'dark' : 'outside', choices: [{ label: '……', run: () => '' }] }),
  auto: (w) => log(w, `【战争阶段${['', '一', '二', '三', '四'][ph]}：${PHASE_NAMES[ph]}】`, { col: '#e8a080', important: true }),
});

// ---------- 炮击 ----------
defEvent({
  id: 'shelling', needsPlayer: false,
  build: (w) => {
    const v = pick(w.rng, present(w));
    if (!v) return null;
    const hurt = rnd(w.rng) < 0.35;
    w.shelter.damage += 8;
    for (const p of present(w)) p.needs.stress = clamp(p.needs.stress + 10);
    if (hurt) addCond(w, v, 'wound', rint(w.rng, 20, 45));
    w.shelter.genHealth = clamp(w.shelter.genHealth - rint(w.rng, 5, 20));
    w.shelter.water = Math.max(0, w.shelter.water - rint(w.rng, 0, 15));
    return { id: 'shelling', title: '炮击', art: 'dark', text: `一发炮弹落得很近。整个避难所跳了一下，灯灭了又亮。混凝土碎块从天花板上砸下来。${hurt ? `\n\n${v.isPlayer ? '你' : v.name}被砸中了。` : ''}\n\n发电机在喘气。储水罐在漏水。`, choices: [{ label: '等它过去。', run: () => '' }] };
  },
  auto: (w) => { w.shelter.damage += 8; for (const p of present(w)) p.needs.stress = clamp(p.needs.stress + 10); log(w, '炮弹落在附近。灰从天花板上掉下来。', { col: '#e8a080' }); },
});

// ---------- 指控偷窃 ----------
defEvent({
  id: 'accuse', needsPlayer: false,
  build: (w, ctx) => {
    const a = P(w, ctx.accuser as string), b = P(w, ctx.accused as string);
    if (!a || !b || !a.present || !b.present) return null;
    const me = player(w);
    w.facts[`crimes:${b.id}`] = Number(w.facts[`crimes:${b.id}`] || 0) + 1;
    const item = ITEMS[(ctx.item as ItemKey) || 'food'].name;
    const pr: Proposal = { kind: 'punish', target: b.id, value: a.pers.morality > 70 ? 'ration' : 'confine', label: `惩罚${b.isPlayer ? '你' : b.name}：${a.pers.morality > 70 ? '扣口粮' : '关禁闭'}` };
    if (b.isPlayer) {
      return {
        id: 'accuse', title: '指控', speaker: a.id, art: 'meeting',
        text: `${a.name}当着所有人的面指着你：「我看见了。昨晚你从仓库里拿了${item}。」\n\n所有人都转过头来。`,
        lines: opinionsOn(w, pr, a),
        choices: [
          { label: '「你看错了。」（否认）', tags: [[`说服 ${me.skills.persuade}`, '#d8b060']], run: (wd) => { const ok = rnd(wd.rng) * 100 < me.skills.persuade + rel(wd, a.id, me.id).trust / 3 - 20; if (ok) { relAdd(wd, a.id, me.id, { resentment: 5 }); for (const q of others(wd)) relAdd(wd, q.id, a.id, { trust: -4 }); return '你的声音很稳。有人开始怀疑是不是看错了。事情不了了之。'; } return '没人信你。\n' + holdVote(wd, pr, a, 'no').text; } },
          { label: '「是我拿的。我饿。」（认错）', run: (wd) => { for (const q of others(wd)) relAdd(wd, q.id, me.id, { trust: -4, respect: q.pers.morality > 60 ? 2 : -2 }); punish(wd, me, 'warning', a); return '屋里安静了一会儿。有人叹了口气。这次就算了。'; } },
          { label: '「那你呢？你以为我没看见你做的事？」（反咬）', run: (wd) => { relAdd(wd, a.id, me.id, { resentment: 20 }); const sec = a.secrets.find((s) => s.known.includes(me.id)); if (sec) { for (const q of others(wd)) { relAdd(wd, q.id, a.id, { trust: -15 }); sec.known.push(q.id); } return `你说出了${a.name}的事：「${sec.text}」\n局面一下子乱了。没有人再提仓库的事。`; } return '你说不出什么具体的。这让你看起来更可疑了。\n' + holdVote(wd, pr, a, 'no').text; } },
          { label: '把东西交出来，再加一份赔给大家', ok: cnt(me.inv, (ctx.item as ItemKey) || 'food') >= 1, why: '东西已经不在你身上了', run: (wd) => { const k = (ctx.item as ItemKey) || 'food'; addItem(wd.storage, k, takeItem(me.inv, k, (ctx.n as number) + 1)); for (const q of others(wd)) relAdd(wd, q.id, me.id, { trust: 3 }); return '你把东西放回了桌上。这件事就这么过去了，但有人记住了。'; } },
        ],
      };
    }
    return { id: 'accuse', title: '指控', speaker: a.id, art: 'meeting', text: `${a.name}当着所有人的面指着${b.name}：「我看见了。你从仓库里拿了${item}。」\n\n${b.name}的脸涨红了。`, lines: [say(w, b.id, pick(w.rng, ['你血口喷人！', '……我饿。', '你凭什么说是我？']))], choices: voteChoices(w, pr, a) };
  },
  auto: (w, ctx) => { const a = P(w, ctx.accuser as string), b = P(w, ctx.accused as string); if (a && b && a.present && b.present) holdVote(w, { kind: 'punish', target: b.id, value: 'ration', label: `惩罚${b.name}：扣口粮` }, a, 'abstain'); },
});

// ---------- NPC 向玩家求欢 ----------
defEvent({
  id: 'proposal', needsPlayer: true,
  build: (w, ctx) => {
    const a = P(w, ctx.from as string); const me = player(w);
    if (!a || !a.present || !me.present) return null;
    const r = rel(w, a.id, me.id);
    const deal = ctx.deal as [ItemKey, number] | undefined;
    const coerce = !!ctx.coerce;
    const txt = deal ? `${a.name}在你身边坐下，压低声音：「我这儿有${ITEMS[deal[0]].name}×${deal[1]}。你知道我想要什么。」`
      : coerce ? `${a.name}挡住了你的路。「你知道这里谁说了算。」`
      : r.state === 'lovers' ? `${a.name}握住你的手：「今晚……去下面？」` : `${a.name}靠过来，声音很轻：「冷吗？……要不要一起暖和一下？」`;
    return {
      id: 'proposal', title: '靠近', speaker: a.id, art: 'dark',
      text: txt,
      choices: [
        { label: '答应', tags: [['亲密', '#c05a9a']], run: (wd) => { const res = propose(wd, a, me, { motive: [], deal: deal || null }); if (res.consent === 'refused') return '……'; wd.facts.playerConsent = 'willing'; a.action!.data = { ...(a.action!.data || {}), consent: 'willing', motive: res.motive, deal: deal || null }; return `你跟着${a.name}去了${a.action!.room === 'lower' ? '下层小间' : '挂帘子的床'}。`; } },
        { label: '「不了。」', run: (wd) => { relAdd(wd, a.id, me.id, { affection: -2, desire: -5 }); if (coerce) relAdd(wd, a.id, me.id, { resentment: 10 }); bark(a, wd, pick(wd.rng, ['……好吧。', '随你。', '你会后悔的。'])); return `${a.name}没再说什么，走开了。`; } },
        ...(deal ? [{ label: '「再加点。」（讨价还价）', run: (wd: World) => { if (rnd(wd.rng) < 0.5) { deal[1] += 1; return `${a.name}犹豫了一下：「……${ITEMS[deal[0]].name}×${deal[1]}。不能再多了。」`; } return `${a.name}冷笑了一声，走开了。`; } }] : []),
      ],
    };
  },
});

// ---------- NPC 向玩家讨吃的 ----------
defEvent({
  id: 'beg_player', needsPlayer: true,
  build: (w, ctx) => {
    const a = P(w, ctx.from as string); const me = player(w);
    if (!a || !a.present) return null;
    const k = (ctx.item as ItemKey) || 'food';
    const keeper = w.shelter.keyHolder === me.id;
    return { id: 'beg_player', title: '讨', speaker: a.id, text: `${a.name}拉住你的袖子，声音很低：「${keeper ? '你有钥匙……给我一份吧。就一份。' : '你身上还有吃的吗？我……我两天没吃东西了。'}」`, choices: [
      { label: keeper ? '从仓库拿一份给' + pron(a) : '分' + pron(a) + '一份', ok: keeper ? cnt(w.storage, k) > 0 : cnt(me.inv, k) > 0, why: '没有了', run: (wd) => { if (keeper) { takeItem(wd.storage, k, 1); addItem(a.inv, k, 1); relAdd(wd, a.id, me.id, { trust: 6, affection: 6, debt: 8 }); } else socialMod.giveItem(wd, me, a, k, 1); tagMethod(me, '合作'); return `${a.name}接过去，眼圈红了。`; } },
      { label: '「大家都一样饿。」', run: (wd) => { relAdd(wd, a.id, me.id, { resentment: 4 }); return `${a.name}松开了手。`; } },
      ...(w.settings.adult ? [{ label: '「你拿什么换？」', tags: [['交易', '#c08040']] as [string, string][], run: (wd: World) => { relAdd(wd, a.id, me.id, { respect: -5 }); const res = propose(wd, me, a, { motive: ['交易'], deal: ['food', 1] }); if (res.consent === 'refused') return `${a.name}看了你很久，转身走了。`; tagMethod(me, '交易'); return `${a.name}低下了头。（${CONSENT_NAMES[res.consent]}）`; } }] : []),
    ] };
  },
});

// ---------- 场景（成人内容接口） ----------
defEvent({
  id: 'scene', needsPlayer: true,
  build: (w, ctx) => {
    const a0 = P(w, ctx.initiator as string), b = P(w, ctx.partner as string);
    if (!b || (!a0 && !ctx.external)) return null;
    const a = a0 || ({ name: ctx.external as string } as Person);
    const consent = ctx.consent as string;
    const hook = ctx.hook as string;
    const fade = hook === 'discovered'
      ? `你推开门的时候，看见了${a.name}和${b.name}。他们也看见了你。`
      : consent === 'coerced' ? '灯灭了。之后的事，没有人愿意说出来。' : consent === 'reluctant' ? '帘子拉上了。黑暗里只有呼吸声，和远处发电机的嗡嗡声。' : '帘子拉上了。毯子很薄，但两个人挤在一起就不那么冷了。';
    return {
      id: 'scene', title: hook === 'discovered' ? '撞见' : '夜', art: 'dark', text: fade,
      adultCtx: { ...ctx, consentName: CONSENT_NAMES[consent as keyof typeof CONSENT_NAMES] },
      choices: [{ label: '……', run: () => '' }],
    };
  },
});

// ---------- 嫉妒打架 ----------
defEvent({
  id: 'jealous_fight', needsPlayer: false,
  build: (w, ctx) => {
    const a = P(w, ctx.a as string), b = P(w, ctx.b as string);
    if (!a || !b || !a.present || !b.present) return null;
    return { id: 'jealous_fight', title: '争吵', art: 'meeting', text: `${a.name}一把揪住${b.isPlayer ? '你' : b.name}的领子：「你离${name(w, ctx.about as string)}远点！」`, choices: [
      { label: '拉开他们', ok: !b.isPlayer, run: (wd) => { relAdd(wd, a.id, player(wd).id, { respect: 3 }); return '你挤进两人中间。他们喘着粗气，最终松开了手。'; } },
      { label: b.isPlayer ? '还手' : '看着', run: (wd) => { const { fight } = require_social(); fight(wd, a, b, '为了' + name(wd, ctx.about as string)); return '拳头落下来了。'; } },
    ] };
  },
  auto: (w, ctx) => { const a = P(w, ctx.a as string), b = P(w, ctx.b as string); if (a && b && a.present && b.present) require_social().fight(w, a, b, '争风吃醋'); },
});
import * as socialMod from '../sim/social';
function require_social() { return socialMod; }

// ---------- 政变 ----------
defEvent({
  id: 'coup', needsPlayer: false,
  build: (w, ctx) => {
    const by = P(w, ctx.by as string); const me = player(w);
    if (!by || !by.present || cnt(by.inv, 'pistol') + cnt(by.inv, 'rifle') === 0) return null;
    const old = P(w, w.politics.leader);
    return { id: 'coup', title: '夺权', speaker: by.id, art: 'meeting', text: `${by.name}站在长桌上，手里握着枪。\n\n「${old ? old.name + '当不了这个家。' : ''}从现在起，这里听我的。谁有意见，站出来。」`, choices: [
      { label: '低头', run: (wd) => { relAdd(wd, by.id, me.id, { trust: 5 }); return coup(wd, by); } },
      { label: '站出来', ok: !!old && !old.isPlayer || true, tags: [['危险', '#c05050']], run: (wd) => { const backers = others(wd).filter((p) => p !== by && opinion(wd, p.id, by.id) < 20).length; if (backers >= 2 && rnd(wd.rng) < 0.5 + me.skills.combat / 200) { takeItem(by.inv, 'pistol', 1); addItem(wd.storage, 'pistol', 1); punish(wd, by, 'confine', me); for (const q of others(wd)) relAdd(wd, q.id, me.id, { respect: 10 }); return `你和另外${backers}个人扑了上去。枪响了，打在天花板上。${by.name}被按在地上。`; } addCond(wd, me, 'wound', 40); return '你刚往前走了一步，枪响了。你倒在地上，听见有人尖叫。\n' + coup(wd, by); } },
      { label: '支持他（成为亲信）', run: (wd) => { relAdd(wd, by.id, me.id, { trust: 20, affection: 5 }); wd.facts[`patron:${me.id}`] = by.id; tagMethod(me, '依附'); return '你第一个站到了他身后。\n' + coup(wd, by); } },
    ] };
  },
  auto: (w, ctx) => { const by = P(w, ctx.by as string); if (by && by.present) coup(w, by); },
});

// ---------- 领导者分派活计 ----------
const JOB_TEXT: Record<string, string> = { crank: '摇通风机', clear: '去坍塌区搬瓦砾', guard: '今晚守仓库', melt: '去化雪烧水', cook: '做饭', repair: '修发电机', farm: '照料种植床' };
defEvent({
  id: 'leader_order', needsPlayer: true,
  build: (w, ctx) => {
    const l = P(w, ctx.leader as string); const me = player(w);
    if (!l || !l.present || w.politics.leader !== l.id) return null;
    return { id: 'leader_order', title: '命令', speaker: l.id, text: `${l.name}：「${me.name}，明天你负责${JOB_TEXT[ctx.job as string] || '干活'}。」`, choices: [
      { label: '「好。」', run: (wd) => { relAdd(wd, l.id, me.id, { trust: 3 }); wd.facts.playerJob = ctx.job as string; return ''; } },
      { label: '「凭什么是我？」', run: (wd) => { relAdd(wd, l.id, me.id, { resentment: 6 }); wd.politics.legitimacy = clamp(wd.politics.legitimacy - 1); if (l.pers.power > 75 && rnd(wd.rng) < 0.4) { punish(wd, me, 'ration', l); return `${l.name}冷冷地说：「那你明天少吃一份。」`; } return `${l.name}盯着你看了几秒，没再说什么。`; } },
    ] };
  },
});

// ---------- 领导者的「特权」 ----------
defEvent({
  id: 'leader_demand', needsPlayer: true,
  build: (w, ctx) => {
    const l = P(w, ctx.leader as string); const me = player(w);
    if (!l || !l.present || w.politics.leader !== l.id || !me.present || !w.settings.adult) return null;
    return {
      id: 'leader_demand', title: '私下', speaker: l.id, art: 'dark',
      text: `${l.name}把你叫到仓库的铁笼边，手里掂着两罐吃的。\n\n「最近大家都不好过。你也瘦了。」${pron(l)}看着你。「我可以照顾你——只要你懂事。」`,
      choices: [
        { label: '答应（交换 2 份口粮）', tags: [['交易', '#c08040'], ['亲密', '#c05a9a']], run: (wd) => { const res = propose(wd, l, me, { motive: ['交易', '支配'], deal: ['food', 2] }); if (l.action?.data) l.action.data.consent = 'reluctant'; wd.politics.abuses += 1; tagMethod(me, '交易'); return `你点了点头。${l.name}笑了。`; } },
        { label: '拒绝', run: (wd) => { relAdd(wd, l.id, me.id, { resentment: 10 }); if (rnd(wd.rng) < 0.5) { wd.facts[`rationCut:${me.id}`] = day(wd) + 2; return `「那就算了。」第二天，你的配给少了一份。`; } return `${l.name}耸耸肩：「你会想明白的。」`; } },
        { label: '拒绝，并且把这件事告诉其他人', tags: [['揭发', '#d8b060']], run: (wd) => { const { addRumor, applyRumorJudgement } = socialMod; const r = addRumor(wd, me, `abuse:${l.id}:${wd.t}`, `${l.name}拿口粮逼人跟他睡。`, [l.id], 70); for (const q of others(wd)) { const b = rel(wd, q.id, me.id).trust / 100; if (b > 0.4) { q.knows['rumor:' + r.id] = true; applyRumorJudgement(wd, q, l.id, r, b); } } wd.politics.abuses += 2; relAdd(wd, l.id, me.id, { resentment: 30 }); return '你说了。有人信，有人不信。但从那天起，大家看领导者的眼神不一样了。'; } },
      ],
    };
  },
});

// ---------- 配给（玩家领导者） ----------
defEvent({ id: 'rations', needsPlayer: true, build: () => ({ id: 'rations', title: '分配口粮', text: '', choices: [] }), auto: (w) => { const r = w.politics.rules.rationSize; const share: Record<string, number> = {}; let left = Math.floor(cnt(w.storage, 'food')); for (const p of present(w)) { const g = Math.min(r, left); share[p.id] = g; left -= g; } applyManualRations(w, share); } });

// ---------- 逮捕（被举报的人） ----------
defEvent({
  id: 'arrest', needsPlayer: false,
  build: (w, ctx) => {
    const t = P(w, ctx.target as string); const me = player(w);
    if (!t || !t.alive || !t.present) return null;
    const byMe = ctx.by === me.id;
    return { id: 'arrest', title: '他们来了', art: 'door', text: `天还没亮，门被砸响了。${milName(w)}的人拿着一张纸：「${t.name}。」\n\n${byMe ? '你知道他们为什么会知道这个名字。' : '没有人知道是谁说出去的。'}`, choices: [
      { label: '让他们带走', run: (wd) => { leaveForever(wd, t, 'taken'); for (const q of present(wd)) q.needs.stress = clamp(q.needs.stress + 12); if (byMe && rnd(wd.rng) < 0.5) { const q = pick(wd.rng, others(wd)); if (q) { relAdd(wd, q.id, me.id, { trust: -30, resentment: 20 }); q.knows['reported:' + me.id] = true; return `${t.name}被拖走了。${q.name}看着你，什么也没说。${pron(q)}知道。`; } } return `${t.name}被拖走了。`; } },
      { label: '把人藏起来', run: (wd) => { if (rnd(wd.rng) < 0.4 + t.skills.stealth / 300) return `他们翻遍了避难所，没有找到${t.name}。临走时说：「我们还会来的。」`; leaveForever(wd, t, 'taken'); takeItem(wd.storage, 'food', 5); return `他们找到了${t.name}。窝藏的代价是五份吃的。`; } },
    ] };
  },
  auto: (w, ctx) => { const t = P(w, ctx.target as string); if (t && t.alive && t.present) leaveForever(w, t, 'taken'); },
});

// ---------- 玩家被抓 ----------
defEvent({
  id: 'arrested_player', needsPlayer: true,
  build: (w, ctx) => ({ id: 'arrested_player', title: '被带走', art: 'outside', text: ctx.occ ? '你被押上了占领军的卡车。' : '你被押上了宪兵的卡车。车厢里还有别人，都低着头。', choices: [{ label: '……', run: (wd) => { const me = player(wd); me.present = false; me.conds.push({ type: 'captive', sev: 100, since: wd.t }); wd.facts.captiveSince = wd.t; wd.pending.push({ id: 'captive', t: wd.t + 60, ctx: {} }); return ''; } }] }),
});
defEvent({
  id: 'captive', needsPlayer: true,
  build: (w) => {
    const me = player(w);
    if (!hasCond(me, 'captive')) return null;
    const days = Math.floor((w.t - Number(w.facts.captiveSince || w.t)) / 1440);
    me.needs.hunger = clamp(me.needs.hunger - 10); me.needs.warmth = clamp(me.needs.warmth - 10); me.health = clamp(me.health - 5);
    const next = () => w.pending.push({ id: 'captive', t: w.t + 1440, ctx: {} });
    const free = (wd: World, text: string) => { me.conds = me.conds.filter((c) => c.type !== 'captive'); me.present = true; me.floor = 0; me.x = ROOM.entrance.x + 30; me.px = me.x; return text; };
    return {
      id: 'captive', title: `关押 · 第 ${days + 1} 天`, art: 'outside',
      text: `你被关在火车站的一节货运车厢里。白天被拉去搬尸体、挖战壕，晚上挤在一起取暖。\n\n看守换了三次班。有人在夜里被叫出去，再也没回来。`,
      choices: [
        { label: '低头干活，熬着', run: (wd) => { if (days >= 2 && rnd(wd.rng) < 0.35) return free(wd, '一个早晨，看守打开车厢门：「滚吧。」你不知道为什么。你走回了避难所。'); next(); tagMethod(me, '依附'); return '又一天。'; } },
        { label: '夜里逃跑', tags: [[`潜行 ${me.skills.stealth}`, '#d8b060']], run: (wd) => { if (rnd(wd.rng) < 0.25 + me.skills.stealth / 200) return free(wd, '你从车厢底板的破洞里钻了出去，在雪地里爬了一整夜。'); if (rnd(wd.rng) < 0.4) { die(wd, me, '逃跑时被打死'); return '探照灯照住了你。'; } addCond(wd, me, 'wound', 40); next(); return '你被抓了回来，挨了一顿打。'; } },
        { label: '告诉他们避难所里的事，换自己出去', tags: [['告密', '#c05050']], run: (wd) => { const t = alive(wd).find((p) => p.present && !p.isPlayer && (p.origin === 'deserter' || p.origin === 'cadre' || p.secrets.some((s) => s.severity >= 60))); if (t) { wd.pending.push({ id: 'arrest', t: wd.t + 600, ctx: { target: t.id, by: me.id } }); tagMethod(me, '告密'); tagMethod(me, '牺牲他人'); addMem(me, wd, { kind: 'reported', who: t.id, w: -20, text: `我说出了${t.name}。` }); return free(wd, `你说出了${t.name}的名字。第二天早上，他们放了你。`); } next(); return '你说的东西他们不感兴趣。'; } },
        ...(w.settings.adult ? [{ label: '讨好看守', tags: [['亲密', '#c05a9a'], ['依附', '#8a6ac0']] as [string, string][], run: (wd: World) => { wd.pending.push({ id: 'scene', t: wd.t, ctx: { hook: 'scene', initiator: 'guard', partner: me.id, consent: 'reluctant', motive: ['交易', '依附'], deal: null, location: 'outside', external: '看守' } }); tagMethod(me, '依附'); if (rnd(wd.rng) < 0.6) return free(wd, '三天后，看守在点名册上划掉了你的名字。'); next(); return '他拿走了他想要的，然后什么都没变。'; } }] : []),
      ],
    };
  },
});

// ---------- NPC 回来 / 被放回 ----------
defEvent({
  id: 'npc_return', needsPlayer: false,
  build: () => null,
  auto: (w, ctx) => {
    const p = P(w, ctx.id as string);
    if (!p || !p.alive || p.leftReason) return;
    if (rnd(w.rng) < 0.6) { p.present = true; p.floor = 0; p.x = ROOM.entrance.x + 20; p.action = null; addCond(w, p, 'trauma', 50); p.health = clamp(p.health - 20); log(w, `${p.name}回来了。${pron(p)}被抓去干了几天苦力，什么也不想说。`, { col: '#c8c0b0', important: true }); }
    else die(w, p, '死在了外面');
  },
});

// ---------- 被驱逐的人回来 ----------
defEvent({
  id: 'exile_returns', needsPlayer: false,
  build: (w, ctx) => {
    const p = P(w, ctx.id as string);
    if (!p || !p.alive || p.leftReason !== 'expelled') return null;
    return { id: 'exile_returns', title: '回来的人', art: 'door', text: `敲门声。观察孔外是${p.name}——瘦了一圈，嘴唇冻裂了。\n\n「让我回去。求你们。我什么都愿意干。」`, choices: [
      { label: '开门', run: (wd) => { p.present = true; p.leftReason = undefined; p.floor = 0; p.x = ROOM.entrance.x + 14; relAdd(wd, p.id, player(wd).id, { trust: 20, debt: 30 }); return `${p.name}进来了，跪在地上哭了很久。`; } },
      { label: '不开', run: (wd) => { if (rnd(wd.rng) < 0.5) die(wd, p, '冻死在门外'); return '第二天早上，门外的雪地上有一个蜷着的人形。'; } },
    ] };
  },
  auto: (w, ctx) => { const p = P(w, ctx.id as string); if (p && p.alive && p.leftReason === 'expelled' && rnd(w.rng) < 0.5) die(w, p, '冻死在门外'); },
});

// ---------- 玩家被驱逐 ----------
defEvent({
  id: 'expelled', needsPlayer: true,
  build: (w) => ({ id: 'expelled', title: '驱逐', art: 'outside', text: '他们把你推出了防爆门。门在身后关上的声音，你会记一辈子。\n\n外面零下二十度。', choices: [
    { label: '去军营碰碰运气', run: (wd) => { const me = player(wd); if (rnd(wd.rng) < 0.5) { leaveForever(wd, me, 'joined'); wd.facts.joinedOrg = 'mil-exile'; return '你在军营门口站了一夜。第二天，有人给了你一把铁锹。'; } die(wd, me, '冻死在路上'); return ''; } },
    { label: '往河边走', run: (wd) => { const me = player(wd); if (rnd(wd.rng) < 0.3) { leaveForever(wd, me, 'crossed'); wd.facts.crossedBy = 'exile'; return '你不知道自己是怎么过的河。'; } die(wd, me, '死在了界河边'); return ''; } },
  ] }),
});

// ---------- 军方眼线的义务 ----------
defEvent({
  id: 'informant_due', needsPlayer: true,
  build: (w) => {
    const me = player(w);
    if (w.facts[`patron:${me.id}`] !== 'mil') return null;
    const targets = present(w).filter((p) => !p.isPlayer && p.secrets.some((s) => s.known.includes(me.id)));
    return { id: 'informant_due', title: '汇报', art: 'outside', text: '军需官托人捎来一张纸条：「该汇报了。」', choices: [
      { label: '编点无关紧要的事', run: (wd) => { if (rnd(wd.rng) < 0.3) { delete wd.facts[`patron:${me.id}`]; return '他们不满意。从此，军营的门对你关上了。'; } return '暂时糊弄过去了。'; } },
      ...targets.slice(0, 2).map((t) => ({ label: `说出${t.name}的秘密`, tags: [['告密', '#c05050']] as [string, string][], run: (wd: World) => { wd.pending.push({ id: 'arrest', t: wd.t + 900, ctx: { target: t.id, by: me.id } }); addItem(me.inv, 'food', 3); tagMethod(me, '告密'); return `你写下了${t.name}的名字。`; } })),
      { label: '不再替他们干', run: (wd) => { delete wd.facts[`patron:${me.id}`]; return '你把纸条扔进了炉子里。'; } },
    ] };
  },
});

// ---------- 禁令下的亲密被发现 ----------
defEvent({ id: 'violation_intimacy', needsPlayer: false, build: () => null, auto: (w, ctx) => { const a = P(w, ctx.a as string), b = P(w, ctx.b as string); const l = P(w, w.politics.leader); if (a && b && l && !l.isPlayer && l !== a && l !== b) { punish(w, a, 'ration', l); punish(w, b, 'ration', l); log(w, `${l.name}以「破坏秩序」为由，扣了${a.name}和${b.name}的口粮。`, { col: '#e8a060', important: true }); } } });

// ---------- 崩溃 ----------
defEvent({
  id: 'breakdown', needsPlayer: false,
  build: (w, ctx) => {
    const p = P(w, ctx.id as string); const me = player(w);
    if (!p || !p.present || !p.alive) return null;
    return { id: 'breakdown', title: '崩溃', speaker: p.id, art: 'dark', text: `${p.name}突然开始尖叫，用头撞墙。「我受不了了！我们都会死在这里！都会死！」`, choices: [
      { label: '抱住' + pron(p) + '，陪着', run: (wd) => { p.needs.stress = clamp(p.needs.stress - 35); relAdd(wd, p.id, me.id, { affection: 15, trust: 10, debt: 10 }); me.needs.stress = clamp(me.needs.stress + 5); return `${p.name}在你怀里哭到睡着。`; } },
      { label: '给' + pron(p) + '一瓶酒', ok: cnt(me.inv, 'alcohol') > 0, why: '你没有酒', run: (wd) => { takeItem(me.inv, 'alcohol', 1); p.needs.stress = clamp(p.needs.stress - 25); relAdd(wd, p.id, me.id, { affection: 5 }); return '酒让' + pron(p) + '安静了下来。'; } },
      { label: '不管', run: (wd) => { if (rnd(wd.rng) < 0.25) { die(wd, p, '自杀'); return `第二天早上，有人在厕所里发现了${p.name}。`; } p.needs.stress = clamp(p.needs.stress - 10); return `${p.name}哭累了，自己缩到了角落里。`; } },
    ] };
  },
  auto: (w, ctx) => { const p = P(w, ctx.id as string); if (p && p.alive && rnd(w.rng) < 0.12) die(w, p, '自杀'); else if (p) p.needs.stress = clamp(p.needs.stress - 20); },
});

// ---------- 终局 ----------
defEvent({
  id: 'final', needsPlayer: false,
  build: (w) => {
    if (!w.war.outcome) {
      const o = pickOutcome(w);
      w.war.outcome = o;
    }
    const t: Record<string, string> = {
      ceasefire: '收音机里传来一个疲惫的声音：停火协议今天零点生效。\n\n外面很安静。安静得让人不敢相信。',
      regime: '「阵线之声」又回来了。领袖的声音说：叛乱已被平定，所有在战争中坚守岗位的公民将受到表彰——所有动摇分子，将受到审查。\n\n卡车开进了灰河镇。',
      occupation: '新的边界线画好了。灰河镇不再属于原来的国家。占领当局宣布：所有居民须重新登记身份。',
      collapse: '没有停火，也没有胜利。军队都走了，政府不见了。只剩下雪，和饿疯了的人。',
    };
    return { id: 'final', title: '终局', art: 'outside', text: t[w.war.outcome!], choices: [{ label: '走出避难所', run: (wd) => { wd.ending = computeEnding(wd, 'final'); return ''; } }] };
  },
  auto: (w) => { if (!w.war.outcome) w.war.outcome = pickOutcome(w); w.ending = computeEnding(w, 'final'); },
});
function pickOutcome(w: World): 'ceasefire' | 'regime' | 'occupation' | 'collapse' {
  const r = rnd(w.rng);
  return r < 0.35 ? 'ceasefire' : r < 0.6 ? 'regime' : r < 0.85 ? 'occupation' : 'collapse';
}

// ---------- 怀孕 ----------
defEvent({
  id: 'pregnant', needsPlayer: false,
  build: (w, ctx) => {
    const p = P(w, ctx.id as string);
    if (!p || !p.alive || !p.present) return null;
    const father = P(w, w.facts[`father:${p.id}`] as string);
    return { id: 'pregnant', title: '消息', speaker: p.id, art: 'dark', adultCtx: { hook: 'pregnancy', initiator: p.id, partner: father?.id }, text: p.isPlayer ? '你已经两个月没来月事了。早上起来，你吐了。' : `${p.name}早上吐了。${pron(p)}看着你的眼神，像是在求你什么也别说。`, choices: [{ label: '……', run: (wd) => { for (const q of present(wd)) if (q !== p) q.knows[`pregnant:${p.id}`] = true; if (father && father.alive) relAdd(wd, father.id, p.id, { affection: father.pers.morality > 50 ? 10 : -5 }); return ''; } }] };
  },
});

export const PHASE_EVENT = true;
export { isNight, roomOf, willingness, giveKey, setLeader };

// ---------- 广播里的名单 ----------
defEvent({
  id: 'radio_list', needsPlayer: false,
  build: (w, ctx) => {
    const d = P(w, ctx.id as string); const me = player(w);
    if (!d || !d.present) return null;
    const listeners = present(w).filter((p) => roomOf(p) === 'kitchen' && !p.isPlayer && p !== d);
    const realName = d.name.length > 1 ? d.name : d.name + '某';
    return {
      id: 'radio_list', title: '广播', art: 'dark',
      text: `晚上七点，「阵线之声」开始念名单。\n\n「……以下逃兵、动摇分子，任何公民发现其下落，须立即向最近的宪兵或民防岗位报告：王德顺，二营……孙立新，四营……${realName}……」\n\n公共区里一下子安静了。${listeners.length ? listeners.map((p) => p.name).join('、') + '都听见了。' : ''}${d.name}的脸白得像墙。`,
      choices: [
        { label: '「同名同姓的多了。」（替' + pron(d) + '打圆场）', tags: [[`说服 ${me.skills.persuade}`, '#d8b060']], run: (wd) => { relAdd(wd, d.id, me.id, { trust: 15, affection: 10, debt: 15 }); if (rnd(wd.rng) * 100 < me.skills.persuade + 20) return '有人干笑了一声。话题被岔开了。但大家都记住了这个名字。'; for (const q of listeners) { const s = d.secrets.find((x) => x.id.includes('deserter')); if (s && !s.known.includes(q.id)) s.known.push(q.id); } return '没人接话。所有人都知道了。'; } },
        { label: '把收音机关掉', run: (wd) => { relAdd(wd, d.id, me.id, { trust: 8 }); for (const q of listeners) relAdd(wd, q.id, me.id, { trust: -2 }); return '你走过去拧掉了开关。屋里只剩下发电机的声音。'; } },
        { label: '看着' + pron(d), run: (wd) => { for (const q of listeners) { const s = d.secrets.find((x) => x.id.includes('deserter')); if (s && !s.known.includes(q.id)) s.known.push(q.id); } const s = d.secrets.find((x) => x.id.includes('deserter')); if (s && !s.known.includes(me.id)) s.known.push(me.id); d.needs.stress = clamp(d.needs.stress + 25); return `${d.name}低下头，起身走开了。今晚，避难所里多了一个所有人都知道、却没人说出口的秘密。`; } },
      ],
    };
  },
  auto: (w, ctx) => { const d = P(w, ctx.id as string); if (!d) return; for (const q of present(w)) { if (roomOf(q) === 'kitchen' && q !== d) { const s = d.secrets.find((x) => x.id.includes('deserter')); if (s && !s.known.includes(q.id)) s.known.push(q.id); } } d.needs.stress = clamp(d.needs.stress + 20); log(w, `广播念到了一个名字。${d.name}一晚上没说话。`, { col: '#c8b890' }); },
});

// ---------- 账对不上（可能冤枉人） ----------
defEvent({
  id: 'theft_noticed', needsPlayer: false,
  build: (w) => {
    const k = P(w, w.shelter.keyHolder); const me = player(w);
    if (!k || !k.present || k.isPlayer) return null;
    // 保管人怀疑谁：真偷了的人，或者他最看不顺眼的人
    const thieves = present(w).filter((p) => p !== k && p.tags['偷窃']);
    const suspect = present(w).filter((p) => p !== k).sort((a, b) => (opinion(w, k.id, a.id) - (thieves.includes(a) ? 25 : 0)) - (opinion(w, k.id, b.id) - (thieves.includes(b) ? 25 : 0)))[0];
    if (!suspect) return null;
    const guilty = thieves.includes(suspect);
    const pr: Proposal = { kind: 'punish', target: suspect.id, value: 'ration', label: `惩罚${suspect.isPlayer ? '你' : suspect.name}：扣口粮` };
    return {
      id: 'theft_noticed', title: '账对不上', speaker: k.id, art: 'meeting',
      text: `${k.name}把账本摔在桌上：「少了。又少了。」\n\n${pron(k)}的目光在每个人脸上停了一下，最后停在了${suspect.isPlayer ? '你' : suspect.name}身上。「是不是你？」`,
      lines: [say(w, suspect.id, suspect.isPlayer ? '' : guilty ? pick(w.rng, ['……', '你有证据吗？']) : pick(w.rng, ['不是我！', '你凭什么怀疑我？', '我发誓我没碰过。']))].filter((l) => l.text),
      choices: suspect.isPlayer
        ? [{ label: guilty ? '「……是我。」' : '「不是我。」', run: (wd) => { if (guilty) { punish(wd, me, 'ration', k); return '你低下了头。'; } relAdd(wd, k.id, me.id, { trust: -5 }); return holdVote(wd, pr, k, 'no').text; } }, { label: '「你自己就拿着钥匙。」', tags: [['反咬', '#d8b060']], run: (wd) => { for (const q of others(wd)) relAdd(wd, q.id, k.id, { trust: -6 }); relAdd(wd, k.id, me.id, { resentment: 15 }); return '屋里的目光从你身上移到了' + k.name + '身上。'; } }]
        : [...voteChoices(w, pr, k), { label: `「我看见是谁拿的——不是${pron(suspect)}。」`, ok: thieves.length > 0 && thieves[0] !== suspect && !thieves[0].isPlayer, why: '你不知道是谁', run: (wd) => { const t = thieves.find((x) => x !== suspect && !x.isPlayer)!; relAdd(wd, suspect.id, player(wd).id, { trust: 15, debt: 15 }); relAdd(wd, t.id, player(wd).id, { resentment: 25 }); return holdVote(wd, { kind: 'punish', target: t.id, value: 'ration', label: `惩罚${t.name}：扣口粮` }, player(wd), 'yes').text; } }],
    };
  },
  auto: (w) => { const k = P(w, w.shelter.keyHolder); if (!k) return; const s = present(w).filter((p) => p !== k).sort((a, b) => opinion(w, k.id, a.id) - opinion(w, k.id, b.id))[0]; if (s) holdVote(w, { kind: 'punish', target: s.id, value: 'ration', label: `惩罚${s.name}：扣口粮` }, k, 'abstain'); },
});

// ---------- 最后一支药 ----------
defEvent({
  id: 'last_meds', needsPlayer: true,
  build: (w, ctx) => {
    const a = P(w, ctx.a as string), b = P(w, ctx.b as string); const me = player(w);
    if (!a || !b || cnt(w.storage, 'meds') < 1) return null;
    const give = (t: Person) => (wd: World) => { takeItem(wd.storage, 'meds', 1); const c = t.conds.find((x) => ['infection', 'fever'].includes(x.type)); if (c) c.sev = clamp(c.sev - 60); t.health = clamp(t.health + 10); relAdd(wd, t.id, me.id, { trust: 15, debt: 25 }); const o = t === a ? b : a; relAdd(wd, o.id, me.id, { resentment: 15 }); for (const q of others(wd)) if (q !== a && q !== b && q.partner === o.id) relAdd(wd, q.id, me.id, { resentment: 20 }); tagMethod(me, '牺牲他人'); return `你把药给了${t.isPlayer ? '自己' : t.name}。${o.isPlayer ? '你' : o.name}看着你，什么也没说。`; };
    return { id: 'last_meds', title: '最后一支药', art: 'dark', text: `药柜里只剩一支抗生素。\n\n${a.isPlayer ? '你' : a.name}在发烧，伤口在化脓。${b.isPlayer ? '你' : b.name}也是。\n\n两个人都在看着你。`, choices: [
      { label: `给${a.isPlayer ? '自己' : a.name}`, run: give(a) },
      { label: `给${b.isPlayer ? '自己' : b.name}`, run: give(b) },
      { label: '抽签', run: (wd) => (rnd(wd.rng) < 0.5 ? give(a) : give(b))(wd) + '\n（抽签决定的。没人怪你——表面上。）' },
      { label: '开会让大家决定', run: (wd) => { const pick2 = opinion(wd, a.id, me.id) + others(wd).reduce((s, q) => s + opinion(wd, q.id, a.id), 0) > others(wd).reduce((s, q) => s + opinion(wd, q.id, b.id), 0) ? a : b; takeItem(wd.storage, 'meds', 1); const c = pick2.conds.find((x) => ['infection', 'fever'].includes(x.type)); if (c) c.sev = clamp(c.sev - 60); wd.politics.meetings++; return `大家选了${pick2.isPlayer ? '你' : pick2.name}。少数服从多数——这次，是另一个人的命。`; } },
    ] };
  },
});

// ---------- 冷夜 ----------
defEvent({
  id: 'cold_night', needsPlayer: false,
  build: (w) => {
    const me = player(w);
    const ppl = present(w);
    const fuel = cnt(w.storage, 'fuel');
    return { id: 'cold_night', title: '冷夜', art: 'dark', text: `停电了。外面零下${Math.abs(Math.round(w.shelter.tempOut))}度，墙上结了霜。\n\n炉子边只够三四个人。${fuel > 2 ? '仓库里还有一点燃料。' : '燃料已经烧完了。'}`, choices: [
      { label: '所有人挤到宿舍，盖上所有的毯子', run: (wd) => { for (const p of present(wd)) { p.needs.warmth = clamp(p.needs.warmth + 20); p.action = null; } for (const a of present(wd)) for (const b of present(wd)) if (a !== b) relAdd(wd, a.id, b.id, { affection: 2, desire: a.partner === b.id ? 0 : 1 }); return '十几只脚挤在一起。有人在黑暗里笑了一声，又有人在哭。天亮的时候，所有人都还活着。'; } },
      { label: '把炉子边的位置留给病人和最冷的人', run: (wd) => { const weak = present(wd).sort((a, b) => a.needs.warmth + a.health - b.needs.warmth - b.health).slice(0, 3); for (const p of weak) p.needs.warmth = clamp(p.needs.warmth + 35); for (const q of present(wd)) if (!weak.includes(q)) q.needs.warmth = clamp(q.needs.warmth - 5); for (const p of weak) relAdd(wd, p.id, me.id, { trust: 6 }); return `${weak.map((p) => (p.isPlayer ? '你' : p.name)).join('、')}守着炉子。其他人缩在角落里。`; } },
      { label: '自己先占一个炉子边的位置', run: (wd) => { me.needs.warmth = clamp(me.needs.warmth + 40); for (const q of others(wd)) relAdd(wd, q.id, me.id, { respect: -4, resentment: 3 }); tagMethod(me, '特权'); return '你挤到了炉子边。没人说什么。'; } },
      { label: '烧掉最后的燃料', ok: fuel > 1, why: '没有燃料了', run: (wd) => { takeItem(wd.storage, 'fuel', Math.min(4, fuel)); for (const p of present(wd)) p.needs.warmth = clamp(p.needs.warmth + 30); return '火苗蹿起来的时候，所有人都把手伸了过去。明天的事，明天再说。'; } },
    ] };
  },
  auto: (w) => { for (const p of present(w)) p.needs.warmth = clamp(p.needs.warmth + 12); log(w, '停电的冷夜。所有人挤在宿舍里熬到了天亮。', { col: '#a0c0d8' }); },
});

// ---------- 推心置腹 ----------
defEvent({
  id: 'confide', needsPlayer: true,
  build: (w, ctx) => {
    const p = P(w, ctx.id as string); const me = player(w);
    if (!p || !p.present) return null;
    const sec = p.secrets.find((s) => s.id === ctx.sec);
    if (!sec) return null;
    return { id: 'confide', title: '夜谈', speaker: p.id, art: 'dark', text: `夜里，${p.name}坐到你旁边，很久没说话。\n\n「……有件事，我从来没跟别人说过。」\n\n${sec.text.replace(p.name, '我').replace(/^他|^她/, '我')}`, choices: [
      { label: '「我不会说出去。」', run: (wd) => { if (!sec.known.includes(me.id)) sec.known.push(me.id); relAdd(wd, p.id, me.id, { trust: 8, affection: 6 }); p.needs.stress = clamp(p.needs.stress - 15); return `${p.name}靠在你肩上，像是终于放下了什么。`; } },
      { label: '「你为什么要告诉我？」', run: (wd) => { if (!sec.known.includes(me.id)) sec.known.push(me.id); relAdd(wd, p.id, me.id, { trust: 3 }); return '「因为……这里只有你了。」'; } },
    ] };
  },
});

// ---------- 线索 ----------
defEvent({
  id: 'hint', needsPlayer: true,
  build: (w) => {
    const me = player(w);
    const facts = ['K_MIL', 'K_SMUG', 'K_REDCROSS', 'K_DRAIN'].filter((f) => !me.knows[f] && (f !== 'K_REDCROSS' || w.war.phase >= 3));
    const teller = present(w).filter((p) => !p.isPlayer).sort((a, b) => rel(w, b.id, me.id).trust - rel(w, a.id, me.id).trust)[0];
    if (!facts.length || !teller) return null;
    const f = facts[0];
    const t: Record<string, string> = { K_MIL: '我听说火车站那边有军队设的交换点，探照灯整夜开着。', K_SMUG: '老电影院的地下室……有人在那儿做过河的生意。', K_REDCROSS: '有人看见教堂后面搭了白帐篷，上面画着红十字。', K_DRAIN: '坍塌区那边，你注意到没有——瓦砾后面有风吹出来。' };
    return { id: 'hint', title: '闲话', speaker: teller.id, text: `${teller.name}一边烤火一边说：「${t[f]}」`, choices: [{ label: '记下了', run: (wd) => { if (f !== 'K_DRAIN') { me.knows[f] = true; wd.discovered[f] = true; if (f === 'K_MIL') wd.locs.camp.known = true; if (f === 'K_SMUG') { wd.locs.market.known = true; wd.discovered.C_SMUG = true; } if (f === 'K_REDCROSS') wd.locs.redcross.known = true; } else wd.discovered.K_DRAIN = true; return ''; } }] };
  },
});

// ---------- 尸体 ----------
defEvent({
  id: 'body', needsPlayer: false,
  build: (w, ctx) => {
    const d = P(w, ctx.id as string); const me = player(w);
    if (!d || d.alive) return null;
    return { id: 'body', title: '尸体', art: 'dark', text: `${d.name}的身体躺在${ctx.room === 'infirmary' ? '病床上' : '地上'}，已经开始变冷。\n\n避难所里没有地方放死人。`, choices: [
      { label: '抬到外面，埋进雪里（要出去一趟）', run: (wd) => { me.needs.warmth = clamp(me.needs.warmth - 15); for (const q of others(wd)) { q.needs.stress = clamp(q.needs.stress - 4); relAdd(wd, q.id, me.id, { respect: 3 }); } return '你们在掩体后面挖了一个浅坑。雪落进去，很快就看不出来了。'; } },
      { label: '放进坍塌区', run: (wd) => { wd.facts.bodiesInCollapse = Number(wd.facts.bodiesInCollapse || 0) + 1; for (const q of present(wd)) q.needs.stress = clamp(q.needs.stress + 4); return '坍塌区很冷，暂时不会有味道。暂时。'; } },
      { label: '大家围着说几句话', run: (wd) => { for (const q of present(wd)) { q.needs.stress = clamp(q.needs.stress - 8); for (const r of present(wd)) if (q !== r) relAdd(wd, q.id, r.id, { affection: 1.5 }); } const he = present(wd).find((p) => p.traits.includes('虔诚')); return he ? `${he.name}念了一段很久没人念过的经文。` : '没有人会念经。有人说了句「走好」，就没人再说话了。'; } },
      { label: '先翻一翻' + pron(d) + '的口袋', run: (wd) => { const got = Object.entries(d.inv).filter(([, v]) => v); for (const [k, v] of got) addItem(me.inv, k as ItemKey, v || 0); d.inv = {}; for (const q of others(wd)) relAdd(wd, q.id, me.id, { respect: -5, trust: -3 }); return got.length ? '你在口袋里摸到了些东西。有人看见了。' : '口袋是空的。有人看见了你在翻。'; } },
    ] };
  },
  auto: (w, ctx) => { const d = P(w, ctx.id as string); if (d) { for (const [k, v] of Object.entries(d.inv)) addItem(w.storage, k as ItemKey, v || 0); d.inv = {}; } for (const q of present(w)) q.needs.stress = clamp(q.needs.stress + 2); },
});
