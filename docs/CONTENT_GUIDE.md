# 《避难所》内容填充规范 v1

这份文档说明怎样往游戏里加内容，**不需要写代码**。内容分四类：

| 类别 | 能做什么 | 文件 | 详见 |
|---|---|---|---|
| **剧情事件** | 新增带条件触发、带选项、能改变数值和关系的剧情 | `content/events/*.json` | §4 |
| **文本** | 改写物品、地点、人物、出身的文字；扩充 NPC 台词 | `content/text/*.json` | §5 |
| **人物** | 新增可被抽到的 NPC | `content/people/*.json` | §6 |
| **图片** | 替换头像、物品图标、标题背景；给事件加插图 | `content/images/` | §7 |
| **成人文本** | 亲密场景的正文（由引擎决定何时、谁、是否情愿） | `content/adult/` | §8 与 [ADULT_CONTENT_INTERFACE.md](ADULT_CONTENT_INTERFACE.md) |

所有内容都是 **JSON 文件 + PNG 图片**。写完以后运行一条命令就能检查格式（§2），游戏启动时自动加载。

---

## 目录

1. [文件放在哪](#1-文件放在哪)
2. [工作流程与校验](#2-工作流程与校验)
3. [通用语法：条件与变量](#3-通用语法条件与变量)
4. [剧情事件](#4-剧情事件)
5. [文本覆盖与台词池](#5-文本覆盖与台词池)
6. [新增人物](#6-新增人物)
7. [图片](#7-图片)
8. [成人内容](#8-成人内容)
9. [修改内置剧情](#9-修改内置剧情)
10. [交给 AI 批量生产](#10-交给-ai-批量生产)
11. [提交前检查清单](#11-提交前检查清单)
12. [附录：参考资料](#12-附录参考资料)

---

## 1. 文件放在哪

```
content/
├─ manifest.json        ← 总清单：列出要加载哪些文件（没列出的文件不会加载）
├─ events/              剧情事件
│   └─ example.json     4 个可运行的示例事件
├─ text/                文本覆盖
├─ people/              新增人物
├─ images/              图片 + 图片映射表 images.json
├─ adult/               成人内容（有自己的 manifest.json，见 §8）
├─ _examples/           各类文件的示例（不会被加载，复制出去用）
└─ _reference/          游戏现有数据的导出（只读参考，见 §12）
```

`content` 文件夹在不同版本里的位置：

| 版本 | 位置 | 改完怎么生效 |
|---|---|---|
| 源码开发 | `public/content/` | 刷新浏览器（`npm run dev`） |
| Windows 桌面版 | 在 **exe 所在的文件夹** 新建 `content/`，放进去的文件会**覆盖**游戏自带的同名文件 | 重启游戏 |
| 安卓版 | 打包在 APK 里 | 改 `public/content/` 后重新打包（推送到仓库，GitHub Actions 会自动出新 APK） |

> 桌面版提示：最省事的做法是从发布页下载 `content-template.zip`，把整个 `content` 文件夹解压到 exe 旁边，然后在里面改。只想加一个文件时，也要把 `manifest.json` 一起放过来，因为 manifest 决定加载哪些文件。

### manifest.json

```json
{
  "name": "我的内容包",
  "version": "1",
  "author": "你的名字",
  "events": ["events/example.json", "events/my_story.json"],
  "text":   ["text/override.json"],
  "people": ["people/new_people.json"],
  "images": ["images/images.json"]
}
```

- 路径都相对于 `content/`。
- 同一类可以拆成多个文件，按列出的顺序加载。文本覆盖时后加载的会覆盖先加载的。
- 某个文件出错只会跳过那个文件（或那个事件），不会让游戏崩溃。标题画面右下角会显示「内容包：剧情 N · 文本 N · … · N 个错误」，按 F12 打开控制台能看到具体错误。

---

## 2. 工作流程与校验

```bash
npm run export:content             # 导出现有数据到 content/_reference/，写之前先看
npm run validate:content           # 校验 public/content/
npm run validate:content -- 路径    # 校验别处的 content 文件夹（如桌面版 exe 旁边那个）
npm run dev                        # 打开游戏实际看看
```

校验会做这些事：

- JSON 格式；必填字段；id 是否重复、是否和内置事件重名。
- 引用是否存在：物品、技能、状态、人物字段、角色名、跳转目标、图片文件。
- 文本里的 `{变量}` 是否拼对，大括号是否成对。
- **试跑**：在测试世界里把每个剧情事件的每个选项都实际执行一遍，抓运行时错误和渲染后残留的 `{…}`。
- 成人内容：禁用词（任何未成年暗示）、胁迫标签、余韵白名单。
- 目标网络：每个人生目标节点必须至少有一个非成人解法。

输出 `通过` 才算合格。`!` 开头的是警告，可以不改；`✗` 开头的是错误，必须改。

**测试某个事件**：开发版里按 F12 打开控制台，输入

```js
app.w.pending.push({ id: '你的事件id', t: app.w.t, ctx: {} })
```

游戏继续走一分钟，事件就会弹出来（选不到合适的角色时不会弹）。

---

## 3. 通用语法：条件与变量

剧情事件、成人场景都用这一套语法。

### 3.1 条件 `when`

`when` 是一个对象，**所有条件同时满足**才算成立：

```json
"when": {
  "warPhase.gte": 2,
  "player.items.cigs.gte": 1,
  "a.rel.trust.gt": 50,
  "a.traits.any": ["烟瘾", "酗酒"],
  "leader": "player",
  "facts.story.photo_kept": true
}
```

键是「变量路径」，可以在末尾加一个运算符；不加运算符就是**完全相等**。

| 运算符 | 含义 | 值的写法 | 例子 |
|---|---|---|---|
| （无） | 等于 | 任意 | `"leader": "none"` |
| `.gt` / `.gte` | 大于 / 大于等于 | 数字 | `"day.gte": 5` |
| `.lt` / `.lte` | 小于 / 小于等于 | 数字 | `"food.lt": 10` |
| `.between` | 在区间内（含两端） | `[最小, 最大]` | `"hour.between": [20, 23]` |
| `.in` | 是其中之一 | 数组 | `"regime.in": ["dictatorship", "oligarchy"]` |
| `.not` | 不等于（或不在数组里） | 值或数组 | `"a.origin.not": "cadre"` |
| `.any` | 数组里**有任意一个** | 数组 | `"a.conds.any": ["fever", "flu"]` |
| `.all` | 数组里**全都有** | 数组 | `"a.traits.all": ["勤劳", "老实"]` |
| `.none` | 数组里**一个都没有** | 数组 | `"player.conds.none": ["wound"]` |
| `.exists` | 有值（非空、非 0、非 false） | `true` / `false` | `"leaderP.exists": true` |

### 3.2 文本变量

在 `title`、`text`、`label`、`result`、`lines`、`log` 等所有文字里都可以用：

| 写法 | 作用 | 例子 |
|---|---|---|
| `{路径}` | 填入变量的值 | `{a.name}看着你。` |
| `{男|女|其他:角色}` | 按角色性别选字（**必须三段**） | `{他|她|TA:a}笑了。` |
| `{?路径.gt:数值 ? 文本甲 | 文本乙}` | 条件分支（`gt` / `lt` / `eq`），分支里也可以嵌套 `{a.name}` | `{?a.rel.trust.gt:60 ? {a.name}信得过你 | {a.name}还在提防你}` |

- 玩家的 `name` 是「你」（写「{player.name}听我讲了家里的事」会变成「你听我讲了家里的事」）。要玩家起的名字用 `{player.realName}`。
- 中文引号推荐用「」。JSON 字符串里的英文双引号要写成 `\"`。换行写 `\n`，空一行写 `\n\n`。

### 3.3 可用的变量（上下文）

**世界**

| 变量 | 类型 | 说明 |
|---|---|---|
| `day` | 数字 | 第几天（从 1 开始） |
| `hour` | 0–23 | 当前小时 |
| `timeOfDay` | 文本 | `night` / `dawn` / `day` / `dusk` |
| `night` | 是/否 | 是否夜里（19 点–7 点） |
| `warPhase` | 1–4 | 战局：1 动员、2 炮火、3 占领、4 终局 |
| `food` / `fuel` / `meds` | 数字 | 仓库里的口粮、燃料、药品 |
| `storage.物品` | 数字 | 仓库里任意物品的数量，如 `storage.alcohol` |
| `water` | 数字 | 储水（升） |
| `power` | 是/否 | 有没有电 |
| `tempOut` | 数字 | 室外温度 |
| `damage` | 0–100 | 避难所损坏程度 |
| `population` | 数字 | 在场人数（含玩家） |
| `leader` | 文本 | `none` 无人领导 / `player` 玩家是领导 / `npc` 别人是领导 |
| `regime` | 文本 | `anarchy` 无序 / `commune` 公社（开过会、无领导） / `dictatorship` 独裁 / `oligarchy` 寡头 |
| `rules.ration` | 文本 | 口粮制度 `equal` / `contribution` / `leader` / `free` |
| `rules.door` | 文本 | 开门规矩 `closed` / `vote` / `useful` / `open` |
| `rules.intimacy` | 文本 | 亲密规矩 `free` / `banned` / `leaderPrivilege` |
| `rules.punishment` | 文本 | `warning` / `ration` / `confine` / `expel` |
| `rules.decision` | 文本 | `assembly` / `leader` |
| `rules.storageLocked` / `rules.nightWatch` | 是/否 | |
| `facts.键` | 任意 | 剧情标记（用 `fact` 效果写入，见 §4.6） |
| `settings.adult` / `settings.coercion` / `settings.pregnancy` | 是/否 | 玩家的内容设置 |
| `player` | 人物 | 玩家（字段见下表） |
| `leaderP` | 人物 | 当前领导者（没有时为空） |
| 角色名（如 `a`） | 人物 | 本事件选出的角色（§4.3） |

**人物字段**（`player.xxx`、`a.xxx`、`leaderP.xxx`）

| 字段 | 说明 |
|---|---|
| `name` | 名字（玩家是「你」） |
| `realName` | 真名（玩家起的名字） |
| `id` | 内部 id（模板人物就是模板 key，如 `lin`） |
| `age`、`gender` | 年龄；`male` / `female` |
| `origin`、`originText` | 出身代码（见 `_reference/origins.json` 与人物模板）；出身文字 |
| `traits` | 特质数组，如 `["烟瘾", "失眠"]` |
| `health` | 健康 0–100 |
| `needs.hunger` / `thirst` / `warmth` / `energy` / `hygiene` / `stress` / `desire` | 需求 0–100。注意前五项是「越高越好」（饱、水、暖、精力、干净），`stress` 和 `desire` 是越高越强烈 |
| `skills.medic` / `mechanic` / `cook` / `combat` / `stealth` / `persuade` / `forgery` / `scavenge` | 技能 0–100：医疗、机械、烹饪、格斗、潜行、说服、伪造、搜刮 |
| `items.物品` | 随身加私藏的数量，如 `items.cigs` |
| `conds` | 状态数组：`wound` 受伤、`infection` 感染、`fever` 发烧、`flu` 流感、`dysentery` 痢疾、`frostbite` 冻伤、`heart` 心脏病、`pregnant` 怀孕、`trauma` 创伤、`drunk` 醉酒、`hypothermia` 失温、`starving` 饥饿、`grief` 悲伤 |
| `isLeader`、`keyHolder` | 是不是领导者；是不是拿着仓库钥匙 |
| `partner`、`hasPartner`、`partnerIsPlayer` | 伴侣 id；有没有伴侣；伴侣是不是玩家 |
| `rel.trust` / `affection` / `fear` / `desire` / `respect` / `resentment` / `debt` | **此人对玩家**的信任、好感、畏惧、欲望、尊重、怨恨（0–100），人情（-100–100） |
| `rel.state` | 此人眼中和玩家的关系：`stranger` 陌生、`acquainted` 熟人、`friend` 朋友、`flirting` 暧昧、`lovers` 恋人、`affair` 情人、`transactional` 交易、`patronage` 庇护、`domination` 支配、`enemy` 仇人 |
| `rel.times` | 和玩家亲密过的次数 |
| `myRel.…` | **玩家对此人**的同一组数值 |
| `opinion` | 此人对玩家的综合好恶（约 -100–100） |
| `asleep` | 是否在睡觉 |
| `room` | 正在去或所在的房间：`entrance` `storage` `kitchen` `vent` `dorm` `generator` `infirmary` `washroom` `archive` `lower` `collapse` |

---

## 4. 剧情事件

剧情事件是一个弹窗：标题、正文、可选的插图和说话人头像、其他人的表态、若干选项。选项可以有前提条件、技能检定和效果，也可以跳到下一个事件。

### 4.1 完整示例

```json
{
  "id": "ex_old_photo",
  "title": "一张照片",
  "trigger": { "on": "hourly", "hours": [19, 23], "chance": 0.15, "once": true, "minDay": 3 },
  "cast": { "a": { "when": { "rel.trust.gte": 30 }, "pick": "max:rel.trust" } },
  "speaker": "a",
  "art": "dark",
  "cg": "cg.old_photo",
  "text": "{a.name}坐在床沿上，手里捏着一张边角卷起来的照片。",
  "lines": [{ "who": "a", "text": "……你也有家里人吗？" }],
  "choices": [
    {
      "label": "在{他|她|TA:a}旁边坐下，听{他|她|TA:a}说",
      "effects": [
        { "op": "rel", "from": "a", "to": "player", "trust": 6, "affection": 5 },
        { "op": "need", "who": "a", "need": "stress", "add": -10 }
      ],
      "result": "{a.name}讲了很久。",
      "next": "ex_old_photo_2"
    },
    {
      "label": "递给{他|她|TA:a}一支烟",
      "when": { "player.items.cigs.gte": 1 },
      "why": "你没有烟",
      "effects": [{ "op": "item", "who": "player", "item": "cigs", "qty": -1 }],
      "result": "烟头在黑暗里一明一暗。"
    }
  ]
}
```

一个文件里可以放一个事件对象，也可以放一个事件数组。

### 4.2 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✔ | 唯一 id，小写字母开头，只用 `a-z 0-9 _`。建议加前缀（如 `zhang_`）避免和别人冲突。不能和内置事件重名（见 `_reference/builtin_events.json`） |
| `title` | ✔ | 弹窗标题，可用变量 |
| `text` | ✔ | 正文，可用变量 |
| `choices` | ✔ | 选项数组（§4.4）。写空数组时游戏会给一个「……」 |
| `trigger` | | 什么时候自动触发（§4.3）。不写等于每小时 10% 概率 |
| `cast` | | 本事件需要的角色（§4.3） |
| `speaker` | | 显示谁的头像：角色名或 `player` |
| `lines` | | 其他人的表态，每条 `{ "who": 角色名, "text": "..." }`，最多显示 7 条 |
| `art` | | 弹窗色调与音效：`dark` 夜里、私密；`door` 门口、外人；`meeting` 众人；`outside` 外面。不写就是默认 |
| `cg` | | 插图的图片键（§7），如 `cg.old_photo` |
| `auto` | | 玩家不在场（外出、被关押、睡着且事件被跳过）时直接执行的效果数组。不写则静默跳过 |

### 4.3 触发与选角

```json
"trigger": {
  "on": "hourly",          // hourly 每小时检查 | daily 每天在 hour 点检查一次 | manual 只能被别的事件调用
  "hour": 10,              // daily 用：几点（默认 10）
  "hours": [20, 2],        // hourly 用：只在这个时段检查；可以跨午夜（20 点到次日 2 点）
  "chance": 0.15,          // 每次检查时的概率（hourly 默认 0.1，daily 默认 1）
  "once": true,            // 一局只发生一次
  "cooldown": 3,           // 两次之间至少隔几天（默认 1）
  "minDay": 3, "maxDay": 30,
  "when": { "warPhase.gte": 2 },  // 额外条件，可以引用角色，如 "a.needs.hunger.lt": 20
  "priority": 0            // 同一小时有多个事件满足时，大的先检查
}
```

- 每小时最多触发一个内容包事件，队列里最多同时排两个。
- 玩家死亡、外出、被关押时不检查。

**选角 `cast`**：给事件里出场的 NPC 起个短名（`a`、`b`、`rival`……），游戏从在场的人里挑：

```json
"cast": {
  "a": { "when": { "rel.trust.gte": 30 }, "pick": "max:rel.trust" },
  "b": { "who": "leader" },
  "c": { "who": "lin", "optional": true }
}
```

| 字段 | 说明 |
|---|---|
| `who` | `npc`（默认，任意 NPC）/ `leader` 领导者 / `keyholder` 钥匙保管人 / `partner` 玩家的伴侣 / 某个人物模板的 key（如 `lin`，只有这个人在场时才选得到） |
| `when` | 对候选人的条件，路径**直接从人物字段写起**（`rel.trust.gt`、`traits.any`、`needs.hunger.lt`……） |
| `pick` | `random`（默认）/ `max:路径` 选这一项最高的 / `min:路径` 选最低的 |
| `awake` | 默认 `true`，只选醒着的人；写 `false` 可以选睡着的人 |
| `optional` | 选不到也照样触发，此时该角色的变量为空 |

- 同一个人不会被选成两个角色；玩家永远不会被选进 `cast`（用 `player` 指代玩家）。
- 有必选角色选不到时，这次不触发。
- 角色名不能用保留字：`player` `leader` `keyholder` `all` `storage` `world` `facts` `settings` `day` `hour`，以及 §3.3 里的世界变量名。

### 4.4 选项

| 字段 | 说明 |
|---|---|
| `label` | ✔ 选项文字 |
| `when` | 前提条件。不满足时选项变灰，显示 `why` |
| `hide` | `true`：不满足条件时直接隐藏，而不是变灰 |
| `why` | 变灰时显示的原因，如「你没有烟」 |
| `tags` | 选项后面的小标签，如 `[["交易", "#d8b060"], ["亲密", "#c05a9a"]]`。颜色用 `#rrggbb` |
| `check` | 检定（§4.5）。有检定时成功走本选项，失败走 `fail` |
| `effects` | 效果数组（§4.6） |
| `result` | 选完后显示的结果文字。不写又没有 `next` 时弹窗直接关闭 |
| `next` | 选完后接着显示的事件 id：可以是另一个内容包事件（会沿用同样的角色，`result` 显示在它正文前面），也可以是内置事件 |
| `fail` | 检定失败时的分支：`{ "effects": [...], "result": "...", "next": "..." }` |

### 4.5 检定

```json
"check": { "skill": "persuade", "bonus": 10 }
```

成功率 = 技能 + bonus（限制在 5%–95% 之间）。游戏会在选项后面自动标出「说服 45」这样的标签。

- `who`：用谁的技能，默认 `player`，也可以是角色名。
- 不看技能的纯概率：`"check": { "chance": 0.4 }`，选项会标出「40%」。

### 4.6 效果

`who` / `from` / `to` 都可以写：`player`、角色名、`leader`、`keyholder`、`all`（所有在场 NPC）、`everyone`（所有在场的人，含玩家）。物品效果还可以写 `storage`（公共仓库）。

| op | 参数 | 作用 |
|---|---|---|
| `item` | `who`, `item`, `qty` | 增减物品，负数是拿走（不够就拿到 0 为止）。物品 key 见 `_reference/items.json` |
| `need` | `who`, `need`, `add` | 改需求：`hunger` `thirst` `warmth` `energy` `hygiene` `stress` `desire` |
| `health` | `who`, `add` | 改健康 |
| `skill` | `who`, `skill`, `add` | 改技能（学会、荒废） |
| `rel` | `from`, `to`（默认 player）, 任意几个：`trust` `affection` `fear` `desire` `respect` `resentment` `debt`；可加 `"both": true` | 改 from 对 to 的感情；`both` 时双向 |
| `relState` | `from`, `to`, `state`；`both` 默认 true | 直接设关系状态（`friend`、`enemy`……见 §3.3） |
| `fact` | `key`, `value` 或 `add` | 写剧情标记，之后用 `facts.键` 读。建议键名以 `story.` 开头 |
| `log` | `text`, `important` | 写一条日志（底部滚动栏）。`important: true` 会高亮 |
| `bark` | `who`, `text`, `dur` | 让人头顶冒一句话，`dur` 是持续的游戏分钟（默认 120） |
| `memory` | `who`, `text`, `about`, `kind`, `weight` | 给人加一条记忆（人物档案里能看到）。`weight` 是情绪 -100–100 |
| `cond` | `who`, `cond`, `sev` | 加状态（受伤、发烧、创伤……），`sev` 是严重度 0–100 |
| `cure` | `who`, `cond` | 去掉某个状态 |
| `shelter` | `key`, `add` | 改避难所：`water` 储水、`damage` 损坏、`genHealth` 发电机耐久、`collapseWork` 塌方清理进度、`farm` 种植进度、`candles` 点着的蜡烛 |
| `tag` | `who`, `tag`, `n` | 给人打「行为标签」，结局评价会统计（如 `依附`、`交易`、`暴力`、`庇护`） |
| `know` | `who`, `fact` | 让人知道一条情报：`K_MIL` 军方驻点、`K_SMUG` 走私、`K_REDCROSS` 红十字、`K_DRAIN` 暗渠、`K_ARCHIVE` 档案室……（见 `_reference/goals.json`） |
| `event` | `id`, `delay`, `ctx` | 过 `delay` 分钟后排一个事件。内容包事件会沿用当前角色 |
| `intimacy` | `initiator`, `partner`（默认 player）, `consent`, `motive` | 发生一次亲密关系，**只在玩家开启成人内容时生效**；`consent: "coerced"` 还要求开启胁迫主题。引擎会处理全部后果（关系、怀孕、流言、违规）并弹出成人场景（§8） |
| `leave` | `who`, `reason` | NPC 永久离开：`crossed` 过河、`joined` 投靠外面、`expelled` 被赶走、`taken` 被带走、`fled` 逃跑 |
| `die` | `who`, `cause` | 死亡（会触发收尸事件和所有人的悲伤）。慎用 |
| `join` | `kind`, `as` | 来了一个新人加入避难所。`kind`：`refugee` `deserter` `wounded`；`as` 给他起个角色名，后面的效果和文字可以用 |

### 4.7 链式剧情

- **同一时刻接着发生**：选项写 `"next": "下一个事件id"`。下一个事件通常写 `"trigger": { "on": "manual" }`，角色会沿用（`cast` 里写同名角色，如 `"a": {}`）。
- **过几天再发生**：用 `fact` 记下状态，下一个事件的 `trigger.when` 读它：

```json
// 第一个事件的选项
"effects": [{ "op": "fact", "key": "story.debt_to_wang", "value": true }]
// 后续事件
"trigger": { "on": "daily", "hour": 9, "minDay": 6, "once": true, "when": { "facts.story.debt_to_wang": true } }
```

- **过几小时**：`{ "op": "event", "id": "后续事件", "delay": 180 }`。

### 4.8 写作规范

- **基调**：冷、克制、具体。写看得见的细节（冻裂的手、罐头的标签、墙上的领袖像），少写情绪形容词。参考示例 `events/example.json` 和内置事件。
- **人称**：玩家是「你」。不要替玩家决定内心感受，让选项来表达态度。
- **长度**：正文 2–5 句（60–200 字），结果 1–3 句。弹窗高度有限，正文太长会被截掉。
- **选项**：2–4 个。要有**真的代价和取舍**，不要出现明显的「正确答案」。至少一个选项不需要任何前提。
- **数值尺度**：一次事件里关系变化一般 ±3~±10，压力 ±5~±15，物品按实际（一份口粮很珍贵）。
- **世界观**：一个虚构的独裁国家（「阵线」政权、内务处、宪兵）的边境小镇灰河镇，冬天，零下二十度。河对岸是邻国。不要出现真实国家和政党的名字。
- **成人**：剧情事件里的亲密只通过 `intimacy` 效果触发，正文里不写露骨内容（露骨内容写在成人内容包里，§8）。带亲密效果的事件，建议在 `trigger.when` 里加 `"settings.adult": true`。
- **所有角色都是成年人。** 不得出现任何未成年人参与亲密或性暗示的情节，校验会拦截。

---

## 5. 文本覆盖与台词池

一个文本文件可以只写要改的部分，其余保持原样：

```json
{
  "items": {
    "food": { "name": "口粮", "desc": "一个压扁的罐头，标签被撕掉了。", "unit": "份" }
  },
  "locations": {
    "houses": { "name": "民房", "desc": "被炸塌的居民楼。楼道里还挂着谁家的腊肉。" }
  },
  "people": {
    "lin": {
      "name": "林秋",
      "bio": "镇医院的护士……",
      "originText": "前护士",
      "traits": ["温柔", "失眠"],
      "secrets": { "lin_morphine": "她的药箱夹层里，藏着一支吗啡。" }
    }
  },
  "origins": {
    "teacher": { "label": "知识分子", "desc": "你在镇中学教语文……", "secret": "你的抽屉里有一本禁书。" }
  },
  "names": { "male": ["陈默", "李卫"], "female": ["李薇", "张宁"] },
  "lines": {
    "chat.hungry": ["我昨晚梦见了炖肉。"],
    "small.general": { "mode": "replace", "lines": ["……", "今天几号了？"] }
  }
}
```

| 部分 | 可改字段 | 对照 |
|---|---|---|
| `items` | `name` `desc` `unit` | `_reference/items.json` |
| `locations` | `name` `desc` | `_reference/locations.json` |
| `people` | `name` `bio` `originText` `traits`（整组替换） `secrets`（按秘密 id 改文字） | `_reference/people.json` |
| `origins` | `label` `desc` `secret`（玩家可选的出身） | `_reference/origins.json` |
| `names` | `male` `female`：新游戏时随机给玩家的名字 | `_reference/names.json` |
| `lines` | 台词池（下表） | `_reference/lines.json` |

**注意**：特质 `traits` 里有些词有实际效果（`烟瘾` `酗酒` `虔诚` `吝啬` `暴躁` `懒惰` `慷慨` `失眠` `勤劳` `乐观` 会影响 AI 行为），其他的只是描述。

### 台词池

`lines` 里每个键是一个台词池。写数组表示**追加**到内置台词里；写 `{ "mode": "replace", "lines": [...] }` 表示**整体替换**。

| 键 | 什么时候用 |
|---|---|
| `chat.hungry` | 玩家找人闲聊，对方很饿 |
| `chat.cold` | 对方很冷 |
| `chat.stressed` | 对方压力很大 |
| `chat.hostile` | 对方讨厌玩家 |
| `chat.partner` | 对方是玩家的恋人 |
| `chat.general` | 其他情况（和人物简介、对领导的看法混在一起随机） |
| `small.hungry` | NPC 之间头顶冒的对白：说话人很饿 |
| `small.cold` | 说话人很冷 |
| `small.stressed` | 说话人压力很大 |
| `small.lovers` | 两人是恋人或暧昧 |
| `small.hostile` | 说话人怨恨对方 |
| `small.general` | 没话找话 |
| `quarrel` | NPC 之间吵起来时的第一句 |

头顶对白要短（≤ 12 字最好），闲聊台词一两句。

---

## 6. 新增人物

新人物会进入每局随机抽取的角色池，也可能作为访客来敲门。

```json
{
  "people": [
    {
      "key": "qiao",
      "name": "乔四",
      "age": 44,
      "gender": "m",
      "orientation": "straight",
      "origin": "trader",
      "originText": "货车司机",
      "bio": "跑边境线的货车司机。他说他认识哨所里的每一个人，但没人知道真假。",
      "look": { "skin": "tan", "hair": "#2a2522", "style": "cap", "cap": "#4a3a2a", "coat": "#5a4a30", "pants": "#2e2a26", "male": true, "stubble": true, "heavy": true },
      "skills": { "scavenge": 55, "persuade": 45, "mechanic": 40 },
      "pers": { "power": 55, "morality": 40, "fear": 60, "attach": 30, "lust": 50, "social": 70, "agree": 45, "neuro": 35, "regime": "cynic" },
      "traits": ["油滑", "烟瘾"],
      "secrets": [{ "id": "qiao_smuggle", "text": "他的货车夹层里运过人。", "severity": 60 }],
      "goals": ["E_CROSS", "W_MARKET"],
      "inv": { "cigs": 12, "alcohol": 1 },
      "knows": ["K_SMUG"]
    }
  ]
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `key` | ✔ | 唯一 id（小写字母开头）。图片键、剧情选角都用它 |
| `name` `age` `gender` | ✔ | `age` 必须 18–90；`gender`：`m` / `f` |
| `orientation` | | `straight` / `gay` / `bi`，不写则大多是 straight |
| `origin` | ✔ | 出身代码：`deserter` 逃兵 `cadre` 干部 `nurse` 医护 `worker` 工人 `teacher` 知识分子 `foreigner` 外国人 `singer` 歌手 `miner` 矿工 `mechanic` 机修工 `priest` 神职 `trader` 商贩 `farmer` 农民 `soldier` 士兵 `student` 学生 |
| `originText` `bio` | ✔ | 身份文字和一两句简介 |
| `look` | ✔ | 外观，由程序绘制成像素小人和头像（下表）。也可以用 §7 的图片替换头像 |
| `skills` | | 0–100，没写的技能随机 5–25 |
| `pers` | | 性格 0–100（下表），每局会在 ±10 内浮动 |
| `traits` | ✔ | 特质数组 |
| `secrets` | ✔ | 秘密数组 `{ id, text, severity }`，severity 0–100 表示暴露后的严重程度。可以是空数组 |
| `goals` | ✔ | 这个人倾向追求的人生目标节点 id（见 `_reference/goals.json`），第一个最重要 |
| `inv` | | 随身物品 |
| `knows` | | 一开始就知道的情报（`K_MIL` 等） |
| `conds` | | 一开始就有的状态，如 `["heart"]` |

**外观 `look`**

| 字段 | 值 |
|---|---|
| `skin` | `pale` 白、`warm` 暖、`tan` 深 |
| `hair` | 发色 `#rrggbb` |
| `style` | 发型：`short` `receding`（秃顶） `shaved` `cap`（戴帽） `tied`（扎起） `bun`（发髻） `wavy` `long` `bald` |
| `coat` `pants` | 外衣、裤子颜色 `#rrggbb`。用低饱和、偏暗的颜色才和画风统一 |
| `male` | 体型：`true` 男性体型 / `false` 女性体型 |
| 可选 | `heavy` 壮实、`glasses` 眼镜、`scarf` 围巾颜色、`earring` 耳环、`scar` 伤疤、`stubble` 胡茬、`grey` 白发、`smudge` 脸上有污渍、`cap` 帽子颜色、`bandage` 头上缠绷带 |

**性格 `pers`**

| 字段 | 含义（高分） |
|---|---|
| `power` | 权力欲强，会争领导、抢钥匙 |
| `morality` | 底线高，不偷不抢不胁迫 |
| `fear` | 胆大（低分胆小，容易屈服、逃跑） |
| `attach` | 依附性强，容易依赖强者或伴侣 |
| `lust` | 欲望强 |
| `social` | 爱社交 |
| `agree` | 随和 |
| `neuro` | 神经质，压力涨得快 |
| `regime` | 对政权：`loyal` 忠诚、`cynic` 犬儒、`rebel` 反感 |

---

## 7. 图片

### 7.1 映射表

在 `content/images/images.json` 里把**图片键**对应到文件（路径相对于这个 json 文件）：

```json
{
  "portrait.lin": "portraits/lin.png",
  "head.lin": "portraits/lin_head.png",
  "portrait.player": "portraits/player.png",
  "item.food": "items/food.png",
  "cg.old_photo": "cg/old_photo.png",
  "ui.title": "ui/title.png"
}
```

然后在 `manifest.json` 的 `images` 里写上 `"images/images.json"`。以 `_` 开头的键会被忽略，可以用来写备注。

### 7.2 图片键

| 键 | 用在哪 | 尺寸 |
|---|---|---|
| `portrait.<人物key>` | 人物面板、事件弹窗、档案里的半身像。人物 key 见 `_reference/people.json`；玩家是 `portrait.player`。死去的人会自动变成灰色 | **40×48**（或整数倍 80×96、120×144），宽高比必须是 5:6 |
| `head.<人物key>` | 底栏、关系图、对话表态里的小头像。不提供时从 portrait 里自动裁出（距左 1/5、距上 3/16，取宽 3/5 的正方形） | **24×24**（或整数倍） |
| `item.<物品key>` | 背包里物品名前的图标 | **16×16** |
| `cg.<任意名字>` | 剧情事件的 `cg` 字段、成人场景的 `cg` 字段 | 像素图建议 **240×135** 或 **160×90**（会按整数倍放大）；最大显示区域约 728×190，宽度超过 360 的图会按比例缩小 |
| `ui.title` | 标题画面背景 | **480×270**（会 4 倍放大）或 1920×1080 |

随机生成的访客（不是模板人物）没有固定 key，不能单独换头像。

### 7.3 画风规范（与游戏初版画风一致）

- **PNG**，背景可以透明。**不要**模糊、不要抗锯齿边缘，游戏用最近邻放大。
- **低分辨率像素画**：按上面的原始尺寸画，不要画大图再缩小。
- **限色**：每张图 16–32 色左右。暗部偏冷蓝（`#1a1e2a` 一类），亮部偏暖黄（`#e8d8b0` 一类），整体低饱和，像冬天、地下室和煤油灯。
- **用抖动（dithering）过渡**，不要用平滑渐变。
- **头像构图**：40×48 里，脸大约占上半部分中央 20×22，肩膀到底边。背景用深色单色或者透明。光从一侧来，另一侧压暗。
- **插图（CG）**：场景为主，人物小，留白多。可以参考游戏内的场景截图。
- 头像要能看出这个人的特征：发型、眼镜、伤疤、围巾这些 `look` 里写了的东西，画像里也要有，不然会和游戏里的小人对不上。

---

## 8. 成人内容

成人内容的**完整规范**在 [ADULT_CONTENT_INTERFACE.md](ADULT_CONTENT_INTERFACE.md)，这里只说它和其他内容的关系。

- **分工**：引擎决定是否发生、谁和谁、动机、意愿度、地点、谁看见了，以及全部后果。成人内容包**只负责把它写出来**，不能改变参与者和后果。
- **文件**：`content/adult/manifest.json` + `content/adult/scenes/*.json`。`npm run template:adult` 会生成约 200 个空白条目（每种时机 × 动机 × 意愿度 × 地点），挑一批填写即可。
- **匹配**：每个条目用 `hook`（时机）和 `when`（条件，语法同 §3.1）匹配；变量语法同 §3.2，可用的变量是 `initiator.*`、`partner.*`、`relation.*`、`motive`、`consent`、`deal.*`、`location`、`privacy`、`timeOfDay` 等（见该文档 §3）。
- **插图**：条目或单页的 `cg` 可以写图片键（`cg.xxx`，来自 §7 的映射表），也可以直接写相对于 `content/adult/` 的路径（`cg/dorm_01.png`）。
- **从剧情事件触发**：剧情事件用 `intimacy` 效果（§4.6）发起一次亲密，引擎会走完全部后果，然后按 `hook: "scene"` 去成人内容包里找匹配的条目来显示。所以写一条「冷夜里来借被窝」的剧情，只需要在剧情事件里写前因和选项，正文交给成人内容包。
- **开关**：成人内容（默认关）、胁迫主题（默认关）、生育。关闭时所有成人条目都不会显示，引擎用一句淡出文字代替；带 `intimacy` 效果的选项也不会生效。
- **底线**（校验强制）：所有角色是成年人；`coerced` 必须带 `tags: ["coercion"]`，并且以受害者视角和后果为重心。

---

## 9. 修改内置剧情

游戏自带的约 35 个事件（开场、会议、敲门、政变、逮捕、战局推进……）的文字写在代码里，因为它们和数值逻辑交织在一起：

- 文件：`src/content/events.ts`，每个 `defEvent({ id: '...', build: ... })` 是一个事件。
- 只改**引号里的中文**是安全的：`title: '...'`、`text: \`...\``、`label: '...'`、`return '...'`。反引号里的 `${...}` 是变量，不要动。
- 改完运行 `npm run typecheck` 检查，然后重新打包。

如果只是想让某个时刻多一些剧情，优先用内容包新增事件，而不是改内置事件。

---

## 10. 交给 AI 批量生产

把这份文档、`_reference/` 里相关的文件，以及 `events/example.json` 一起发给 AI，再加上对应的指令。每批生成后都要跑 `npm run validate:content`，把错误信息原样贴回给 AI 让它修。

**剧情事件**

> 你是《避难所》的剧情作者。请严格按照「内容填充规范」§4 的 JSON 格式，写 10 个剧情事件，放在一个 JSON 数组里。
> 主题：〔例如：物资短缺时的人性 / 领导者滥用权力 / 外面来的消息〕。
> 要求：id 统一以 `〔前缀〕_` 开头；每个事件 2–4 个选项，至少一个选项有真实代价，至少一个选项无前提；正文 60–200 字，冷峻克制；只使用规范里列出的变量、效果和物品 key；不出现真实国家名；所有角色都是成年人；不写露骨内容，亲密只用 `intimacy` 效果表示。
> 只输出 JSON，不要解释。

**台词**

> 按规范 §5 的 `lines` 格式，为台词池 `small.general`、`small.stressed`、`chat.hungry` 各写 15 句。头顶对白 ≤ 12 字，闲聊 ≤ 30 字。冬天、地下避难所、战争、独裁小镇的语境，口语化。只输出 JSON。

**人物**

> 按规范 §6 的格式写 3 个新 NPC，放在 `{ "people": [...] }` 里。年龄 18 岁以上；出身各不相同；每人 1–2 个秘密；`goals` 从 `_reference/goals.json` 里选；`look` 的颜色用低饱和暗色。只输出 JSON。

**成人场景**

> 见 [ADULT_CONTENT_INTERFACE.md §7](ADULT_CONTENT_INTERFACE.md#7-交给-grok-的工作流)。

**图片**（给绘图工具）

> 像素画，40×48 像素，半身像，16 色，暗部冷蓝、亮部暖黄，低饱和，抖动过渡，无抗锯齿，深色纯色背景。人物：〔把 `look` 和 `bio` 翻译成外貌描述〕。

AI 生成的图片通常不是真正的像素画（尺寸大、有模糊）。要先缩小到目标尺寸，用最近邻采样，再减少颜色数量，然后手工修一下边缘。

---

## 11. 提交前检查清单

- [ ] 新文件已经加进 `manifest.json`（成人内容加进 `adult/manifest.json`）
- [ ] `npm run validate:content` 输出「通过」
- [ ] 在游戏里实际触发过每个新事件，读一遍文字，看排版有没有被截断
- [ ] 图片尺寸符合 §7.2，放大后边缘清晰
- [ ] 没有真实国家或政党的名字；没有任何未成年人相关的内容
- [ ] 事件 id 有自己的前缀，不会和别人的内容包冲突

---

## 12. 附录：参考资料

运行 `npm run export:content` 会把游戏现有的数据写到 `content/_reference/`：

| 文件 | 内容 |
|---|---|
| `items.json` | 全部物品 key、名称、价值、说明 |
| `locations.json` | 外出地点 key、名称、说明 |
| `people.json` | 全部内置人物模板（可以当作写新人物的范本） |
| `origins.json` | 玩家可选的出身 |
| `names.json` | 玩家随机名字 |
| `lines.json` | 台词池键名与说明 |
| `goals.json` | 人生目标节点和解法（`goals`、`know` 用到的 id） |
| `builtin_events.json` | 内置事件 id（新事件不能重名，`next` 可以跳到这些） |
| `story_api.json` | 剧情事件的全部效果 op、人物字段、已用过的特质 |
