// 导出参考资料：npm run export:content → public/content/_reference/
// 把游戏里现有的物品、地点、人物、出身、台词池、目标节点、内置事件等写成 JSON，方便写内容时查阅、复制后改写
import { mkdirSync, writeFileSync } from 'fs';
import { ITEMS } from '../src/content/items';
import { LOCS } from '../src/content/locations';
import { POOL, ORIGINS, MALE_NAMES, FEMALE_NAMES } from '../src/content/people';
import { LINE_KEYS } from '../src/content/lines';
import { NODES } from '../src/sim/goals';
import { EVENTS } from '../src/sim/events';
import '../src/sim/tick';
import { EFFECT_OPS, PERSON_FIELDS } from '../src/content/story';
import { OBJECTS } from '../src/content/layout';

const out = 'public/content/_reference/';
mkdirSync(out, { recursive: true });
const w = (f: string, d: unknown) => writeFileSync(out + f, JSON.stringify(d, null, 2) + '\n');
w('items.json', ITEMS);
w('locations.json', Object.fromEntries(Object.entries(LOCS).map(([k, v]) => [k, { name: v.name, desc: v.desc }])));
w('people.json', { people: POOL });
w('origins.json', ORIGINS.map((o) => ({ key: o.key, label: o.label, desc: o.desc, secret: o.secret })));
w('names.json', { male: MALE_NAMES, female: FEMALE_NAMES });
w('lines.json', LINE_KEYS);
w('goals.json', NODES.map((n) => ({ id: n.id, title: n.title, methods: n.methods.map((m) => ({ id: m.id, label: m.label, adult: !!m.adult })) })));
w('builtin_events.json', Object.keys(EVENTS).sort());
w('story_api.json', { effectOps: EFFECT_OPS, personFields: [...PERSON_FIELDS], traitsInUse: [...new Set(POOL.flatMap((p) => p.traits))], objects: Object.fromEntries(OBJECTS.map((o) => [o.id, o.name])) });
console.log('已导出到 ' + out);
