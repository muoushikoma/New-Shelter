// 目标节点网络：节点 = 世界状态；解法 = 前提 + 去哪里做什么；玩家与 NPC 共用
import type { Person, World, ItemKey } from './types';
import { cnt, has, P, alive, present, rel, day, nm, log, knowFact, bagValue, opinion, hasCond } from './util';

export type Route = '生存' | '离开' | '掌权' | '财富' | '爱情' | '集体' | '重建' | '依附' | '反抗' | '复仇' | '信息';
export interface Req { text: string; ok: (w: World, p: Person) => boolean }
export interface Method { id: string; label: string; tags: string[]; adult?: boolean; reqs: Req[]; how: string; hidden?: (w: World, p: Person) => boolean }
export interface GoalNode {
  id: string; title: string; desc: string; routes: Route[]; terminal?: boolean;
  done: (w: World, p: Person) => boolean;
  methods: Method[];
  prereq?: string[];       // 通常需要先完成的节点（用于提示与 NPC 规划）
  visible?: (w: World, p: Person) => boolean; // 何时出现在玩家日志里（未设置则需 discovered）
}

const R = (text: string, ok: Req['ok']): Req => ({ text, ok });
const know = (f: string, label: string) => R(label, (w, p) => !!p.knows[f]);
const item = (k: ItemKey, n: number, label: string) => R(label, (w, p) => cnt(p.inv, k) + cnt(p.stash, k) >= n);
const doneN = (id: string) => (w: World, p: Person) => !!w.done[p.id]?.[id];
const milOp = (w: World) => (w.war.phase >= 3 ? 'occupier' : 'regime');
export const hasMil = (w: World, p: Person) => w.facts[`C_MIL:${p.id}`] === milOp(w);
const hasSmug = (w: World, p: Person) => !!w.facts[`C_SMUG:${p.id}`];
const isLeader = (w: World, p: Person) => w.politics.leader === p.id;
const someone = (w: World, p: Person, f: (q: Person) => boolean) => present(w).some((q) => q !== p && f(q));
const skillOrHelper = (w: World, p: Person, k: 'forgery' | 'mechanic' | 'medic', n: number) => p.skills[k] >= n || someone(w, p, (q) => q.skills[k] >= n && rel(w, q.id, p.id).trust >= 55);

export const NODES: GoalNode[] = [
  // ---------- 信息 ----------
  {
    id: 'K_MIL', title: '知道军方驻点', desc: '军队在哪里设了交换点？那里可能有通行证，也可能有枪口。', routes: ['信息', '离开', '依附'],
    done: (w, p) => !!p.knows.K_MIL,
    methods: [
      { id: 'kmil_radio', label: '修好电台，收听军方频道', tags: ['技术'], reqs: [R('电台已修好', (w) => w.shelter.radioFixed)], how: '公共区的收音机 →「听广播」' },
      { id: 'kmil_station', label: '去火车站一带打探', tags: ['探索'], reqs: [], how: '地表 → 火车站' },
      { id: 'kmil_ask', label: '向知情的人打听', tags: ['合作'], reqs: [R('有知情者信任你（信任≥55）', (w, p) => someone(w, p, (q) => !!q.knows.K_MIL && rel(w, q.id, p.id).trust >= 55))], how: '和知情者聊天，或「打听」军方' },
    ],
  },
  {
    id: 'K_SMUG', title: '知道走私路线', desc: '河对岸有人收钱带人过河。', routes: ['信息', '离开', '财富'],
    done: (w, p) => !!p.knows.K_SMUG,
    methods: [
      { id: 'ksmug_ask', label: '向知情的人打听', tags: ['合作'], reqs: [R('有知情者信任你（信任≥55）', (w, p) => someone(w, p, (q) => !!q.knows.K_SMUG && rel(w, q.id, p.id).trust >= 55))], how: '和知情者聊天，或「打听」走私' },
      { id: 'ksmug_church', label: '去教堂找线索', tags: ['探索'], reqs: [], how: '地表 → 教堂' },
      { id: 'ksmug_radio', label: '夜里收听对岸的电台', tags: ['技术'], reqs: [R('电台已修好', (w) => w.shelter.radioFixed), R('战争进入第二阶段', (w) => w.war.phase >= 2)], how: '收音机 →「听广播」' },
    ],
  },
  {
    id: 'K_DRAIN', title: '找到排水暗渠', desc: '坍塌区后面似乎有风。也许能通到河边。', routes: ['信息', '离开'],
    done: (w, p) => !!p.knows.K_DRAIN || w.shelter.drainFound && !!w.facts.drainKnownAll,
    visible: (w) => w.shelter.collapseWork > 5 || !!w.discovered.K_DRAIN,
    methods: [{ id: 'kdrain_clear', label: '清理坍塌区的瓦砾', tags: ['劳动'], reqs: [], how: '下层 → 坍塌区 →「清理瓦砾」（很费时间）' }],
  },
  {
    id: 'K_ARCHIVE', title: '打开档案室', desc: '封条后面是民防委员会的档案。空白证件、印章、人们的秘密。', routes: ['信息', '离开', '反抗'],
    done: (w) => w.shelter.archiveOpen,
    methods: [
      { id: 'arch_key', label: '用钥匙开门', tags: ['合作'], reqs: [item('archiveKey', 1, '持有档案室钥匙')], how: '下层小间 → 档案室的门' },
      { id: 'arch_getkey', label: '从持钥匙的人手里弄到钥匙（交易/偷/求）', tags: ['交易', '偷窃'], reqs: [R('知道谁拿着钥匙', (w, p) => w.people.some((q) => q.alive && cnt(q.inv, 'archiveKey') > 0 && q !== p))], how: '找持钥匙的人交易，或趁他睡着时偷' },
      { id: 'arch_crowbar', label: '用撬棍撬开', tags: ['暴力'], reqs: [item('crowbar', 1, '持有撬棍')], how: '下层小间 → 档案室的门 →「撬开」' },
      { id: 'arch_pick', label: '请会机械的人撬锁', tags: ['合作'], reqs: [R('有机械≥60 的人信任你', (w, p) => p.skills.mechanic >= 60 || someone(w, p, (q) => q.skills.mechanic >= 60 && rel(w, q.id, p.id).trust >= 55))], how: '找他「请求帮忙」' },
    ],
  },
  {
    id: 'R_RADIO', title: '修好电台', desc: '公共区那台只能收到「阵线之声」的收音机，换几个零件就能听到别的声音。', routes: ['信息', '集体'],
    done: (w) => w.shelter.radioFixed,
    methods: [{ id: 'radio_fix', label: '找到电台零件，由会机械的人修理', tags: ['技术'], reqs: [R('有电台零件', (w, p) => cnt(p.inv, 'radioParts') + cnt(w.storage, 'radioParts') > 0 || w.shelter.radioWork > 0), R('自己或帮手机械≥40', (w, p) => skillOrHelper(w, p, 'mechanic', 40))], how: '收音机 →「修电台」。零件可在车站、党部找到' }],
  },
  // ---------- 外部接触 ----------
  {
    id: 'C_MIL', title: '与军方建立联系', desc: '战线这一边，谁有枪谁就有通行证。', routes: ['离开', '依附', '掌权'], prereq: ['K_MIL'],
    done: (w, p) => hasMil(w, p),
    methods: [
      { id: 'cmil_supply', label: '送物资上门', tags: ['交易'], reqs: [know('K_MIL', '知道军方驻点'), item('food', 6, '带上至少 6 份口粮')], how: '地表 → 军方营地 →「送物资」' },
      { id: 'cmil_gifts', label: '结交军需官（烟、酒）', tags: ['交易', '合作'], reqs: [know('K_MIL', '知道军方驻点'), R('带上烟（≥5）或酒', (w, p) => cnt(p.inv, 'cigs') >= 5 || cnt(p.inv, 'alcohol') >= 1)], how: '地表 → 军方营地 →「打点关系」' },
      { id: 'cmil_inform', label: '告发避难所里的逃兵', tags: ['告密', '牺牲他人'], reqs: [know('K_MIL', '知道军方驻点'), R('知道某人是逃兵', (w, p) => w.people.some((q) => q.alive && q !== p && q.secrets.some((s) => s.id.includes('deserter') && s.known.includes(p.id)))), R('现在是政府军（阶段一、二）', (w) => w.war.phase < 3)], how: '地表 → 军方营地 →「举报」' },
      { id: 'cmil_leader', label: '以避难所领导者身份用电台谈判', tags: ['威望'], reqs: [R('你是领导者', (w, p) => isLeader(w, p)), R('电台已修好', (w) => w.shelter.radioFixed)], how: '收音机 →「呼叫军方」' },
      { id: 'cmil_intim', label: '和军官发展关系', tags: ['亲密'], adult: true, reqs: [know('K_MIL', '知道军方驻点')], how: '地表 → 军方营地 →「接近军官」' },
    ],
  },
  {
    id: 'C_SMUG', title: '与走私者搭上线', desc: '他们不问你是谁，只问你带了什么。', routes: ['离开', '财富'], prereq: ['K_SMUG'],
    done: (w, p) => hasSmug(w, p),
    methods: [
      { id: 'csmug_pay', label: '带上值钱的东西去黑市', tags: ['交易'], reqs: [know('K_SMUG', '知道走私路线'), R('值钱物件≥2 或 药≥2', (w, p) => cnt(p.inv, 'valuables') >= 2 || cnt(p.inv, 'meds') >= 2)], how: '地表 → 黑市 →「找走私的人」' },
      { id: 'csmug_intro', label: '请认识他们的人引荐', tags: ['合作'], reqs: [R('有人认识走私者并信任你（≥60）', (w, p) => someone(w, p, (q) => !!q.secrets.find((s) => s.id === 'ana_smuggler') || (q.id === 'wang' && q.knows.K_SMUG)) && someone(w, p, (q) => (q.id === 'ana' || q.id === 'wang') && rel(w, q.id, p.id).trust >= 60))], how: '找阿娜或王翠「请求帮忙」' },
      { id: 'csmug_job', label: '替他们跑一趟货', tags: ['冒险'], reqs: [know('K_SMUG', '知道走私路线')], how: '地表 → 黑市 →「接活」（有风险）' },
    ],
  },
  // ---------- 离开 ----------
  {
    id: 'E_PASS', title: '取得通行资格', desc: '一张纸，决定你是难民还是逃犯。', routes: ['离开'],
    done: (w, p) => cnt(p.inv, 'pass') + cnt(p.inv, 'forgedPass') + cnt(p.inv, 'papers') > 0,
    methods: [
      { id: 'pass_buy', label: '用物资向军方换', tags: ['交易'], reqs: [R('与军方建立了联系', hasMil), R('口粮≥12 或 药≥2 或 值钱物件≥4', (w, p) => cnt(p.inv, 'food') >= 12 || cnt(p.inv, 'meds') >= 2 || cnt(p.inv, 'valuables') >= 4), R('军方手里还有名额', (w) => w.war.passSlots > 0)], how: '地表 → 军方营地 →「换通行证」' },
      { id: 'pass_favor', label: '军需官的人情', tags: ['合作'], reqs: [R('与军方建立了联系', hasMil), R('打点过两次以上', (w, p) => Number(w.facts[`milFavor:${p.id}`] || 0) >= 2), R('军方手里还有名额', (w) => w.war.passSlots > 0)], how: '地表 → 军方营地 →「求个人情」' },
      { id: 'pass_leader', label: '用避难所的物资做交换（以领导者身份）', tags: ['威望', '牺牲他人'], reqs: [R('你是领导者', (w, p) => isLeader(w, p)), R('与军方建立了联系', hasMil), R('仓库口粮≥20', (w) => cnt(w.storage, 'food') >= 20)], how: '地表 → 军方营地 →「以避难所名义交换」' },
      { id: 'pass_forge', label: '伪造通行证', tags: ['欺骗', '技术'], reqs: [R('有空白通行证', (w, p) => cnt(p.inv, 'blankPermit') > 0), R('有印章或档案室已打开', (w, p) => cnt(p.inv, 'stamp') > 0 || w.shelter.archiveOpen), R('自己伪造≥40（或请人帮忙）', (w, p) => skillOrHelper(w, p, 'forgery', 40))], how: '下层小间 →「伪造证件」，或请会写字的人帮忙' },
      { id: 'pass_steal', label: '从军官身上偷', tags: ['潜入', '偷窃'], reqs: [know('K_MIL', '知道军方驻点'), R('潜行≥45', (w, p) => p.skills.stealth >= 45)], how: '地表 → 军方营地 →「偷」' },
      { id: 'pass_dead', label: '冒用死人的证件', tags: ['欺骗'], reqs: [], how: '地表 → 边境哨所，搜搜尸体' },
      { id: 'pass_intim', label: '和军官做交易', tags: ['亲密', '交易'], adult: true, reqs: [R('与军方建立了联系', hasMil)], how: '地表 → 军方营地 →「私下交易」' },
    ],
  },
  {
    id: 'E_SEAT', title: '买到偷渡名额', desc: '一条小船，夜里，不点灯。', routes: ['离开'], prereq: ['C_SMUG'],
    done: (w, p) => !!w.facts[`seat:${p.id}`],
    methods: [
      { id: 'seat_pay', label: '付钱', tags: ['交易'], reqs: [R('与走私者搭上线', hasSmug), R('值钱物件≥4 或 药≥3', (w, p) => cnt(p.inv, 'valuables') >= 4 || cnt(p.inv, 'meds') >= 3), R('还有名额', (w) => w.war.smugSeats > 0)], how: '地表 → 黑市 →「买名额」' },
      { id: 'seat_work', label: '替他们干活抵账', tags: ['冒险'], reqs: [R('与走私者搭上线', hasSmug), R('跑过一趟货', (w, p) => !!w.facts[`smugJob:${p.id}`])], how: '地表 → 黑市 →「抵账」' },
      { id: 'seat_intim', label: '和走私头子做交易', tags: ['亲密', '交易'], adult: true, reqs: [R('与走私者搭上线', hasSmug)], how: '地表 → 黑市 →「私下交易」' },
    ],
  },
  {
    id: 'E_CROSS', title: '越过边境', desc: '过了河，就是另一个国家。也许是另一种活法。', routes: ['离开'], terminal: true,
    done: (w, p) => p.leftReason === 'crossed',
    methods: [
      { id: 'cross_pass', label: '持通行证走检查站', tags: ['合法'], reqs: [R('持有通行证（真或假）', (w, p) => cnt(p.inv, 'pass') + cnt(p.inv, 'forgedPass') + cnt(p.inv, 'papers') > 0)], how: '地表 → 边境哨所 →「过检查站」（假证有风险）' },
      { id: 'cross_boat', label: '跟走私船过河', tags: ['交易'], reqs: [R('买到偷渡名额', (w, p) => !!w.facts[`seat:${p.id}`])], how: '地表 → 边境哨所 →「等船」（夜里）' },
      { id: 'cross_drain', label: '钻排水渠，涉过界河', tags: ['冒险'], reqs: [R('知道排水暗渠', (w, p) => !!p.knows.K_DRAIN && w.shelter.drainFound)], how: '坍塌区尽头 →「钻进暗渠」（极冷；有地图更安全）' },
      { id: 'cross_rc', label: '跟红十字车队撤离', tags: ['合作'], reqs: [R('避难所已在红十字登记', (w) => !!w.facts.rcRegistered), R('战争进入第三阶段以后', (w) => w.war.phase >= 3), R('外国人或伤病员优先', (w, p) => p.origin === 'foreigner' || p.health < 50 || hasCond(p, 'pregnant'))], how: '地表 → 红十字站 →「申请撤离」' },
    ],
  },
  // ---------- 掌权 ----------
  {
    id: 'P_KEY', title: '掌管仓库钥匙', desc: '谁拿着钥匙，谁就决定谁吃饭。', routes: ['掌权', '财富'],
    done: (w, p) => w.shelter.keyHolder === p.id,
    visible: (w) => w.politics.rules.storageLocked || !!w.shelter.keyHolder,
    methods: [
      { id: 'key_vote', label: '在会上被推选为保管人', tags: ['威望'], reqs: [R('今天还没开过会', (w) => day(w) * 1440 - w.politics.lastMeeting > 600)], how: '公共区长桌 →「召集开会」→ 提议由你保管钥匙' },
      { id: 'key_take', label: '从保管人身上拿（偷 / 抢）', tags: ['偷窃', '暴力'], reqs: [R('有人拿着钥匙', (w) => !!w.shelter.keyHolder)], how: '保管人睡着时靠近 →「偷钥匙」；或「威胁」' },
      { id: 'key_ask', label: '让保管人交给你', tags: ['合作'], reqs: [R('保管人信任你≥70 或怕你≥60', (w, p) => { const k = P(w, w.shelter.keyHolder); return !!k && (rel(w, k.id, p.id).trust >= 70 || rel(w, k.id, p.id).fear >= 60); })], how: '和保管人交谈 →「要钥匙」' },
      { id: 'key_intim', label: '成为保管人的枕边人', tags: ['亲密'], adult: true, reqs: [R('与保管人是恋人/情人', (w, p) => { const k = w.shelter.keyHolder; return !!k && ['lovers', 'affair'].includes(rel(w, k, p.id).state); })], how: '和保管人交谈 →「要钥匙」' },
    ],
  },
  {
    id: 'P_WEAPON', title: '掌握武器', desc: '在没有法律的地方，枪就是法律。', routes: ['掌权'],
    done: (w, p) => cnt(p.inv, 'pistol') + cnt(p.inv, 'rifle') > 0,
    visible: () => true,
    methods: [
      { id: 'wpn_storage', label: '从仓库拿（如果规矩允许）', tags: ['合法'], reqs: [R('仓库里有枪', (w) => cnt(w.storage, 'pistol') + cnt(w.storage, 'rifle') > 0)], how: '仓库铁笼 →「拿」' },
      { id: 'wpn_take', label: '从持枪的人那里偷 / 换', tags: ['偷窃', '交易'], reqs: [R('有人持枪', (w, p) => w.people.some((q) => q !== p && q.alive && cnt(q.inv, 'pistol') > 0))], how: '交易，或趁其睡着时偷' },
      { id: 'wpn_outside', label: '在边境哨所或车站搜', tags: ['探索'], reqs: [], how: '地表 → 边境哨所 / 车站' },
    ],
  },
  {
    id: 'P_LEADER', title: '成为公认的领导者', desc: '让所有人听你的。至少，让大多数人。', routes: ['掌权'],
    done: (w, p) => isLeader(w, p),
    methods: [
      { id: 'lead_vote', label: '在会上当选', tags: ['威望'], reqs: [R('今天还没开过会', (w) => day(w) * 1440 - w.politics.lastMeeting > 600)], how: '公共区长桌 →「召集开会」→ 推举自己' },
      { id: 'lead_coup', label: '政变', tags: ['暴力'], reqs: [R('持有武器', (w, p) => cnt(p.inv, 'pistol') + cnt(p.inv, 'rifle') > 0), R('至少两个人站在你这边（信任≥60）', (w, p) => present(w).filter((q) => q !== p && rel(w, q.id, p.id).trust >= 60 && opinion(w, q.id, p.id) > 40).length >= 2), R('现在有领导者', (w) => !!w.politics.leader)], how: '公共区 →「夺权」（会流血）' },
      { id: 'lead_mil', label: '被军方任命', tags: ['依附'], reqs: [R('与军方建立了联系', hasMil)], how: '地表 → 军方营地 →「请求任命」' },
      { id: 'lead_merit', label: '众望所归', tags: ['合作'], reqs: [R('大家普遍尊重你（平均≥60）', (w, p) => avgRespect(w, p) >= 60)], how: '多干活、救人、公平分东西，然后在会上被推举' },
    ],
  },
  {
    id: 'P_STABLE', title: '建立稳定的秩序', desc: '当了七天领导者，而且大家还认你。', routes: ['掌权', '重建'], prereq: ['P_LEADER'],
    done: (w, p) => isLeader(w, p) && Number(w.facts.leaderSince ?? 1e9) <= w.t - 7 * 1440 && w.politics.legitimacy >= 60,
    visible: (w, p) => isLeader(w, p),
    methods: [{ id: 'stable_fair', label: '公平地分配，兑现承诺', tags: ['合作'], reqs: [R('合法性≥60', (w) => w.politics.legitimacy >= 60)], how: '少滥用特权，多回应抱怨' }, { id: 'stable_fear', label: '让所有人都怕你', tags: ['暴力'], reqs: [R('多数人怕你（平均畏惧≥55）', (w, p) => avgFear(w, p) >= 55)], how: '惩罚、威胁、枪' }],
  },
  // ---------- 财富 ----------
  {
    id: 'W_HOARD', title: '攒下一份家底', desc: '私藏价值至少 25 份口粮的东西。别让人知道。', routes: ['财富', '生存'],
    done: (w, p) => bagValue(p.stash) >= 25,
    methods: [
      { id: 'hoard_save', label: '省下自己的配给，藏起来', tags: ['节俭'], reqs: [], how: '把东西放进下层小间或床底（物品栏 →「藏起来」）' },
      { id: 'hoard_steal', label: '从仓库里偷', tags: ['偷窃'], reqs: [], how: '仓库铁笼 →「偷拿」（会被看见）' },
      { id: 'hoard_trade', label: '倒卖', tags: ['交易'], reqs: [], how: '低买高卖：烟、药、酒' },
    ],
  },
  {
    id: 'W_MARKET', title: '打通黑市渠道', desc: '在黑市做成三笔买卖。', routes: ['财富'],
    done: (w, p) => Number(w.facts[`marketDeals:${p.id}`] || 0) >= 3,
    visible: (w, p) => !!p.knows.K_MARKET || !!p.knows.K_SMUG,
    methods: [{ id: 'market_trade', label: '在黑市交易', tags: ['交易'], reqs: [R('知道黑市', (w, p) => !!p.knows.K_MARKET || !!p.knows.K_SMUG)], how: '地表 → 黑市' }],
  },
  // ---------- 爱情 ----------
  {
    id: 'L_PARTNER', title: '有一个伴侣', desc: '在这种地方，有个人可以抱着睡，就是活下去的理由。', routes: ['爱情'],
    done: (w, p) => !!p.partner && !!P(w, p.partner)?.alive,
    methods: [
      { id: 'love_court', label: '追求：聊天、陪伴、送东西', tags: ['合作'], reqs: [R('有你喜欢、也可能喜欢你的人', (w, p) => present(w).some((q) => q !== p && rel(w, q.id, p.id).affection >= 45))], how: '和对方交谈 →「聊天」「安慰」「示好」，最后在私密处「亲近」' },
      { id: 'love_crisis', label: '一起熬过难关', tags: ['合作'], reqs: [], how: '在对方生病、悲伤、挨饿时出现' },
    ],
  },
  {
    id: 'L_PLAN', title: '和伴侣有共同的打算', desc: '一起走，或者一起留下。', routes: ['爱情', '离开', '重建'], prereq: ['L_PARTNER'],
    done: (w, p) => !!w.facts[`plan:${p.id}`],
    visible: (w, p) => !!p.partner,
    methods: [{ id: 'plan_talk', label: '和伴侣商量将来', tags: ['合作'], reqs: [R('伴侣信任你≥65', (w, p) => !!p.partner && rel(w, p.partner, p.id).trust >= 65)], how: '和伴侣交谈 →「商量将来」' }],
  },
  // ---------- 集体 ----------
  {
    id: 'S_FOOD', title: '地下种出食物', desc: '蘑菇和豆芽不需要阳光。', routes: ['集体', '重建'],
    done: (w) => !!w.facts.harvests,
    methods: [{ id: 'food_farm', label: '找到菌种和种子，搭种植床，照料到收获', tags: ['劳动'], reqs: [R('有菌种与种子（或已搭好）', (w, p) => w.shelter.farmBuilt || cnt(p.inv, 'seeds') + cnt(w.storage, 'seeds') > 0)], how: '下层小间 → 种植床 →「种植/照料」。种子在粮站、教堂可以找到' }],
  },
  {
    id: 'S_WATER', title: '自己的水源', desc: '墙角一直在渗水。过滤一下就能喝。', routes: ['集体', '重建'],
    done: (w) => w.shelter.filterBuilt,
    methods: [{ id: 'water_filter', label: '找到滤水器材并装好', tags: ['技术'], reqs: [R('有滤水器材', (w, p) => cnt(p.inv, 'filter') + cnt(w.storage, 'filter') > 0), R('自己或帮手机械≥30', (w, p) => skillOrHelper(w, p, 'mechanic', 30))], how: '水房 → 储水罐 →「装滤水器」。器材在医院、车站' }],
  },
  {
    id: 'S_SELF', title: '避难所能自给自足', desc: '有食物，有水，不再靠外面。', routes: ['集体', '重建'], prereq: ['S_FOOD', 'S_WATER'],
    done: (w) => !!w.facts.harvests && w.shelter.filterBuilt,
    methods: [{ id: 'self_both', label: '完成「地下种出食物」和「自己的水源」', tags: ['劳动'], reqs: [R('已有收获', (w) => !!w.facts.harvests), R('已装滤水器', (w) => w.shelter.filterBuilt)], how: '—' }],
  },
  {
    id: 'S_RC', title: '联系上救援组织', desc: '让外面的人知道这里还有活人。', routes: ['集体'],
    done: (w) => !!w.facts.rcRegistered,
    visible: (w, p) => !!p.knows.K_REDCROSS || w.war.phase >= 3,
    methods: [
      { id: 'rc_visit', label: '去红十字站登记', tags: ['合作'], reqs: [know('K_REDCROSS', '知道红十字站'), R('战争第三阶段以后', (w) => w.war.phase >= 3)], how: '地表 → 红十字站 →「登记避难所」' },
      { id: 'rc_radio', label: '用电台呼叫', tags: ['技术'], reqs: [R('电台已修好', (w) => w.shelter.radioFixed), R('战争第三阶段以后', (w) => w.war.phase >= 3)], how: '收音机 →「呼叫救援」' },
    ],
  },
  {
    id: 'S_REBUILD', title: '一个能长久运转的小社会', desc: '自给自足、有大家认可的规矩、还有足够的人。', routes: ['重建'], prereq: ['S_SELF'],
    done: (w) => !!w.facts.harvests && w.shelter.filterBuilt && present(w).length >= 4 && (w.politics.leader ? w.politics.legitimacy >= 55 : w.politics.meetings >= 3) && day(w) >= 25,
    visible: (w) => !!w.facts.harvests || w.shelter.filterBuilt,
    methods: [{ id: 'rebuild', label: '自给 + 规矩 + 人', tags: ['合作'], reqs: [R('自给自足', (w) => !!w.facts.harvests && w.shelter.filterBuilt), R('至少 4 个人', (w) => present(w).length >= 4), R('规矩被认可（领导者合法性≥55，或开过 3 次会）', (w) => (w.politics.leader ? w.politics.legitimacy >= 55 : w.politics.meetings >= 3)), R('坚持到第 25 天', (w) => day(w) >= 25)], how: '—' }],
  },
  // ---------- 依附 ----------
  {
    id: 'D_PATRON', title: '找到靠山', desc: '跟着一个强者。他吃肉，你喝汤。', routes: ['依附'],
    done: (w, p) => !!w.facts[`patron:${p.id}`],
    visible: (w, p) => !!w.politics.leader && w.politics.leader !== p.id,
    methods: [
      { id: 'patron_serve', label: '为领导者效力，成为亲信', tags: ['依附'], reqs: [R('有领导者', (w) => !!w.politics.leader), R('领导者信任你≥65', (w, p) => !!w.politics.leader && rel(w, w.politics.leader, p.id).trust >= 65)], how: '和领导者交谈 →「效忠」' },
      { id: 'patron_mil', label: '替军方做眼线', tags: ['告密', '依附'], reqs: [R('与军方建立了联系', hasMil)], how: '地表 → 军方营地 →「当眼线」' },
      { id: 'patron_intim', label: '成为强者的情人', tags: ['亲密', '依附'], adult: true, reqs: [R('与领导者是情人', (w, p) => !!w.politics.leader && ['lovers', 'affair', 'patronage', 'transactional'].includes(rel(w, w.politics.leader, p.id).state))], how: '和领导者交谈 →「效忠」' },
    ],
  },
  {
    id: 'D_ORG', title: '加入外面的组织', desc: '穿上制服，或者跟着走私船。从此不再是难民。', routes: ['依附', '离开'], terminal: true,
    done: (w, p) => p.leftReason === 'joined',
    visible: (w, p) => hasMil(w, p) || hasSmug(w, p),
    methods: [
      { id: 'org_mil', label: '参军 / 给军方当差', tags: ['依附'], reqs: [R('与军方建立了联系', hasMil)], how: '地表 → 军方营地 →「留下来当差」' },
      { id: 'org_smug', label: '入伙走私团伙', tags: ['依附'], reqs: [R('与走私者搭上线', hasSmug), R('跑过一趟货', (w, p) => !!w.facts[`smugJob:${p.id}`])], how: '地表 → 黑市 →「入伙」' },
    ],
  },
  // ---------- 反抗 ----------
  {
    id: 'R_DEPOSE', title: '推翻现在的领导者', desc: '他已经不配了。', routes: ['反抗', '掌权'],
    done: (w, p) => !!w.facts[`deposed:${p.id}`],
    visible: (w, p) => !!w.politics.leader && w.politics.leader !== p.id,
    methods: [
      { id: 'depose_vote', label: '发起不信任表决', tags: ['威望'], reqs: [R('有领导者', (w) => !!w.politics.leader), R('今天还没开过会', (w) => day(w) * 1440 - w.politics.lastMeeting > 600)], how: '公共区长桌 →「召集开会」→ 罢免' },
      { id: 'depose_expose', label: '在会上揭发他的秘密', tags: ['揭发'], reqs: [R('知道领导者的秘密', (w, p) => { const l = P(w, w.politics.leader); return !!l && (l.secrets.some((s) => s.known.includes(p.id)) || w.rumors.some((r) => r.about.includes(l.id) && p.knows['rumor:' + r.id] && r.severity >= 40)); })], how: '召集开会 →「揭发」' },
      { id: 'depose_coup', label: '用武力', tags: ['暴力'], reqs: [R('持有武器', (w, p) => cnt(p.inv, 'pistol') + cnt(p.inv, 'rifle') > 0)], how: '公共区 →「夺权」' },
    ],
  },
];

export function avgRespect(w: World, p: Person) { const o = present(w).filter((q) => q !== p); return o.length ? o.reduce((s, q) => s + rel(w, q.id, p.id).respect, 0) / o.length : 0; }
export function avgFear(w: World, p: Person) { const o = present(w).filter((q) => q !== p); return o.length ? o.reduce((s, q) => s + rel(w, q.id, p.id).fear, 0) / o.length : 0; }

export const NODE: Record<string, GoalNode> = Object.fromEntries(NODES.map((n) => [n.id, n]));

// 动态节点：复仇
export function revengeNode(target: string, name: string): GoalNode {
  return {
    id: 'REVENGE:' + target, title: `复仇：${name}`, desc: '有些事不能就这么算了。', routes: ['复仇'],
    done: (w) => { const t = P(w, target); return !t || !t.alive || !t.present || w.facts[`punished:${target}`] === true; },
    methods: [
      { id: 'rev_expose', label: '在会上揭发', tags: ['揭发'], reqs: [], how: '召集开会 →「惩罚/驱逐」' },
      { id: 'rev_report', label: '向军方告发', tags: ['告密'], reqs: [R('与军方建立了联系', hasMil)], how: '地表 → 军方营地 →「举报」' },
      { id: 'rev_violence', label: '亲手解决', tags: ['暴力'], reqs: [], how: '对他「动手」' },
    ],
  };
}

export function nodeOf(id: string, w: World): GoalNode | undefined {
  if (id.startsWith('REVENGE:')) { const t = P(w, id.slice(8)); return revengeNode(id.slice(8), t?.name || '某人'); }
  return NODE[id];
}

export function methodVisible(m: Method, w: World, p: Person) { if (m.adult && !w.settings.adult) return false; return !m.hidden || !m.hidden(w, p); }
export function methodReady(m: Method, w: World, p: Person) { return m.reqs.every((r) => r.ok(w, p)); }

// 玩家日志里可见的节点
export function journalNodes(w: World, p: Person): GoalNode[] {
  const list = NODES.filter((n) => w.discovered[n.id] || (n.visible ? n.visible(w, p) : false) || w.done[p.id]?.[n.id]);
  for (const g of p.goals) if (g.startsWith('REVENGE:')) { const n = nodeOf(g, w); if (n) list.push(n); }
  return list;
}

// 每小时：检查节点完成、发现新节点
export function checkGoals(w: World) {
  for (const p of alive(w)) {
    const d = (w.done[p.id] = w.done[p.id] || {});
    for (const n of NODES) {
      if (d[n.id]) continue;
      if (n.done(w, p)) {
        d[n.id] = w.t;
        if (p.isPlayer) { w.discovered[n.id] = true; log(w, `【目标达成】${n.title}`, { col: '#f0d060', important: true }); unlockAfter(w, p, n.id); }
        else if (n.id === 'P_LEADER' || n.id === 'E_PASS' || n.id === 'C_MIL') { /* NPC 的进展在别处记录 */ }
      }
    }
  }
  // 玩家的发现：由知识触发
  const me = alive(w).find((p) => p.isPlayer);
  if (me) {
    if (me.knows.K_MIL) { w.discovered.C_MIL = true; w.discovered.K_MIL = true; }
    if (me.knows.K_SMUG) { w.discovered.C_SMUG = true; w.discovered.E_SEAT = true; w.discovered.K_SMUG = true; }
    if (me.knows.K_REDCROSS) w.discovered.S_RC = true;
    if (me.knows.K_DRAIN) w.discovered.K_DRAIN = true;
    if (cnt(me.inv, 'archiveKey') || w.facts.archiveSeen) w.discovered.K_ARCHIVE = true;
    if (w.shelter.radioWork > 0 || cnt(me.inv, 'radioParts')) w.discovered.R_RADIO = true;
  }
}

function unlockAfter(w: World, p: Person, id: string) {
  const map: Record<string, string[]> = {
    K_MIL: ['C_MIL'], C_MIL: ['E_PASS', 'D_ORG', 'D_PATRON'], K_SMUG: ['C_SMUG'], C_SMUG: ['E_SEAT', 'D_ORG'],
    E_PASS: ['E_CROSS'], E_SEAT: ['E_CROSS'], K_DRAIN: ['E_CROSS'], P_LEADER: ['P_STABLE'], L_PARTNER: ['L_PLAN'],
    S_FOOD: ['S_SELF'], S_WATER: ['S_SELF'], S_SELF: ['S_REBUILD'], K_ARCHIVE: ['E_PASS'], R_RADIO: ['S_RC', 'K_MIL'],
  };
  for (const n of map[id] || []) w.discovered[n] = true;
}

export function discover(w: World, id: string) { w.discovered[id] = true; }
export { knowFact, nm, log };
