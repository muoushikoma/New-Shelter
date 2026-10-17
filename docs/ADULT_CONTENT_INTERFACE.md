# 成人内容接口规范 v0.1

> 本文档是成人内容的专项规范。剧情事件、文本、人物、图片等其他内容的填写方法见 [CONTENT_GUIDE.md](CONTENT_GUIDE.md)。

本文档说明：游戏引擎会在什么时候请求成人内容、会传给内容什么信息、内容需要按什么格式写、以及如何交给 Grok 批量填写。

**分工原则**
- 引擎（我负责）：决定**是否**发生、**谁和谁**、**为什么**（动机）、**情不情愿**（意愿度）、**在哪**、**谁看见了**，以及事后的**全部系统后果**。
- 内容（你 / Grok 负责）：只负责**这件事被写成什么样、画成什么样**。
- 内容层**无法**改变参与者、无法改变意愿度、无法写入任意系统后果，只能从白名单里选择少量"余韵"效果（见 §5）。这保证内容不会把模拟搞坏。

---

## 1. 文件位置与加载

```
public/content/adult/          （打包后位于游戏目录的 content/adult/）
├─ manifest.json               内容包信息；files 列出要加载的 JSON 文件
├─ scenes/
│   ├─ _template.json          自动生成的空白模板（只有占位符，游戏不会加载）
│   ├─ example.json            一个可运行的示例条目
│   └─ 你的文件.json            复制模板条目到这里填写，并加进 manifest 的 files
└─ cg/                         CG 图像（PNG，像素风，建议 480×270 或 240×135，整数倍）
```

- 内容包不存在时，游戏以「默认淡出文本」代替（例："灯灭了。"），所有系统后果照常发生。
- 游戏设置中的开关会过滤场景（见 §6）。
- 只有占位符（整段都是「【……】」）的条目不会加载，所以模板文件可以一直留在 files 里。

---

## 2. 触发时机（hook 列表）

| hook | 什么时候触发 | 说明 |
|---|---|---|
| `flirt` | 一方对另一方调情 / 示好 | 短对白，可多次 |
| `proposal` | 一方提出发生关系（含交易提议） | 输出提议对白；引擎再根据意愿度算出回应 |
| `refusal` | 被拒绝 | 拒绝的说法、被拒者的反应 |
| `scene` | 关系发生（主场景） | 主体内容 |
| `aftermath` | 事后 | 事后对白 / 独白 |
| `discovered` | 被第三人撞见 | 撞见者视角 |
| `rumor` | 流言被转述时 | 一句话的流言文本 |
| `memory` | 角色回忆起这件事（如压力高时闪回） | 独白片段 |
| `jealousy` | 伴侣/情人得知 | 对质对白 |
| `pregnancy` | 发现怀孕（若开启） | |

---

## 3. 引擎传入的上下文（SceneContext）

内容中可以用 `{变量}` 引用，也可以在 `when` 条件里判断。

```jsonc
{
  "hook": "scene",
  "initiator": {                  // 发起者
    "id": "c_lin_qiu",
    "name": "林秋",
    "age": 31,                    // 引擎保证 >= 20
    "gender": "female",           // male | female | other
    "body": "slim",               // slim | average | sturdy | heavy
    "origin": "nurse",            // 出身
    "traits": ["温柔", "失眠"],
    "mood": "anxious",            // calm | anxious | desperate | numb | aroused | angry | grieving
    "health": "weak",             // healthy | weak | injured | sick
    "hygiene": "dirty",           // clean | dirty | filthy
    "experience": "some"          // none | some | much  —— 与对方的历史次数分档
  },
  "partner": { /* 同上结构 */ },
  "relation": {
    "state": "lovers",            // strangers | acquainted | flirting | lovers | affair | transactional | patronage | domination
    "trust": 62, "affection": 70, "fear": 5, "desire": 81, "resentment": 0,   // 0–100，partner 对 initiator 的看法
    "times": 3                    // 两人发生过几次
  },
  "motive": ["慰藉", "取暖"],     // 发起者的动机标签，见 §4
  "consent": "willing",           // 对方意愿度：eager | willing | reluctant | coerced  （refused 只会进入 refusal hook）
  "powerGap": 35,                 // -100..100，发起者相对对方的权力差（正 = 发起者更强）
  "isLeader": { "initiator": false, "partner": true },
  "deal": { "item": "罐头", "qty": 2 },   // 交易时存在，否则为 null
  "location": "dormitory",        // dormitory | storage | generator | infirmary | kitchen | hidden_room | surface | ...
  "privacy": "curtain",           // none | dark | curtain | locked
  "temperature": -4,              // 室温 °C
  "timeOfDay": "night",           // dawn | day | dusk | night
  "day": 17,
  "warPhase": 2,                  // 1–4
  "witnesses": [],                // discovered hook 中为撞见者对象
  "shelterRegime": "dictatorship" // commune | oligarchy | dictatorship | anarchy | theocracy
}
```

---

## 4. 动机标签与意愿度（必读）

**动机（motive）** —— 引擎给出 1–3 个，内容应当让读者感受到动机：

| 标签 | 含义 |
|---|---|
| 爱慕 | 真心喜欢 |
| 慰藉 | 寻求安慰、逃避恐惧 |
| 取暖 | 字面意义的取暖，从身体接近开始 |
| 交易 | 以性换物资/保护/职位，`deal` 字段给出筹码 |
| 讨好 | 向权力者示好以求庇护 |
| 依附 | 情感与生存上依赖对方 |
| 支配 | 确认自己对对方的控制 |
| 报复 | 针对第三人（如对方的伴侣） |
| 胁迫 | 利用权力差施压 |
| 好奇 | |
| 逃避 | 麻木、自毁 |

**意愿度（consent）** —— 由引擎计算，**内容不可修改**：

| 值 | 含义 | 写作要求 |
|---|---|---|
| `eager` | 主动渴望 | |
| `willing` | 情愿 | |
| `reluctant` | 勉强、为了某种目的接受 | 应体现犹豫、交易感、事后的复杂情绪 |
| `coerced` | 被权力或威胁压迫而屈从 | 仅当设置中开启「胁迫主题」时才会请求。**必须以受害者视角/后果为重心**，不得写成受害者享受；可以只写前后，不写过程。引擎会在之后施加创伤、怨恨等后果。 |

---

## 5. 场景定义格式

```jsonc
{
  "id": "intimacy.dorm.warmth.01",       // 全局唯一，建议：分类.地点.主题.序号
  "hook": "scene",
  "when": {                               // 全部满足才可选（缺省字段 = 不限）
    "motive.any": ["取暖", "慰藉"],
    "consent.in": ["eager", "willing"],
    "relation.state.in": ["flirting", "lovers"],
    "location.in": ["dormitory"],
    "temperature.lt": 5,
    "initiator.gender.in": ["male", "female"],
    "partner.gender.in": ["male", "female"],
    "powerGap.between": [-30, 30],
    "relation.times.gte": 0
  },
  "weight": 10,                           // 多个场景同时满足时的抽取权重
  "once": false,                          // true = 每局只出现一次
  "tags": ["vanilla"],                    // 用于设置过滤：vanilla | transaction | power | coercion | group | ...
  "cg": "cg/dorm_warmth_01.png",          // 可选
  "sfx": "sfx/blanket.ogg",               // 可选
  "pages": [                              // 分页文本，玩家点击翻页
    { "speaker": null,         "text": "【内容作者填写：环境描写，可用 {temperature}°C 等变量】" },
    { "speaker": "partner",    "text": "【内容作者填写：{partner.name} 的对白】" },
    { "speaker": "initiator",  "text": "【内容作者填写】" },
    { "speaker": null,         "text": "【内容作者填写】" }
  ],
  "choices": [                            // 可选：仅当玩家是参与者之一时显示
    { "text": "【选项文本】", "goto": 2, "aftertaste": ["tender"] },
    { "text": "【选项文本】", "goto": 3, "aftertaste": ["distant"] }
  ],
  "aftertaste": ["tender"]                // 余韵效果（白名单，见下）
}
```

**余韵白名单（aftertaste）** —— 内容层唯一能影响系统的地方，影响幅度由引擎限定在小范围：

| 值 | 效果 |
|---|---|
| `tender` | 双方好感 +小 |
| `distant` | 双方好感 -小，压力 +小 |
| `relief` | 双方压力 -小 |
| `shame` | 发起者/双方羞耻记忆 |
| `bond` | 依附 +小 |
| `bitter` | 怨恨 +小（适用于 reluctant/transactional） |
| `noisy` | 被目击概率 +（隐私低时） |

**变量与语法**
- `{initiator.name}` `{partner.name}` `{deal.item}` `{deal.qty}` `{location}` `{day}` 等直接替换。
- `{他|她|TA:partner}`：按 partner 性别替换代词。
- `{?relation.times.gt:0 ? 又一次| 第一次}`：简单条件文本。
- `speaker` 可为 `initiator` / `partner` / `witness` / `null`（旁白）。

**片段（fragments）格式** —— 用于 flirt / refusal / rumor 等短文本：

```jsonc
{
  "id": "rumor.transaction",
  "hook": "rumor",
  "when": { "motive.any": ["交易"] },
  "lines": [
    "【例：听说{initiator.name}昨晚又去仓库了，回来的时候兜里多了{deal.item}。】",
    "【内容作者再写 5–10 条变体】"
  ]
}
```

---

## 6. 设置开关与过滤

| 设置项 | 默认 | 过滤 |
|---|---|---|
| 成人内容 | 关 | 关闭时所有 hook 返回淡出文本 |
| 交易/权力主题 | 开 | 过滤 `tags` 含 `transaction` / `power` |
| 胁迫主题 | 关 | 关闭时 NPC 行动库中**不存在**胁迫类行动，`coerced` 永远不会出现 |
| CG 显示 | 开 | |
| 生育 | 开 | `pregnancy` hook 与怀孕模拟 |

**硬性规则（引擎强制，内容层无法绕过）**
1. 所有角色年龄 ≥ 20，角色生成器与内容加载器双重校验；内容中出现任何暗示未成年的描述将导致该条目在校验时被拒绝加载（关键词黑名单 + 人工审校）。
2. 不存在任何形式的未成年角色参与亲密 hook。
3. 尸体、动物等不在任何 hook 的可选参与者中。

---

## 7. 交给 Grok 的工作流

1. 运行 `npm run template:adult`，生成 `public/content/adult/scenes/_template.json`：每个 hook × 动机 × 意愿度 × 地点组合都有一个占位条目（共约 200 条）。挑一批复制到新文件，例如 `scenes/batch1.json`，并把文件名加进 `manifest.json` 的 `files`。
2. 把下面的提示词连同空白 JSON 一起发给 Grok：

```
你是一款名为《避难所》的成人向生存模拟游戏的文字作者。
背景：独裁国家边境的废弃民防避难所，冬季，战争中。所有角色均为成年人（20岁以上）。
请填写下面 JSON 中所有「【……】」占位文本，要求：
- 严格保持 JSON 结构、id、when、tags 不变，只替换文本；
- 文风：冷峻、克制、身体感强，避难所的寒冷、肮脏、饥饿、恐惧要渗进每一段；
- 必须体现 motive 标签所示的动机，以及 consent 所示的意愿度；
- reluctant / coerced 必须写出权力关系与代价，不可写成浪漫或享受；
- 可使用 {变量}，不要自造变量；
- 每页 text 不超过 120 字；
- 输出纯 JSON，不要额外说明。
[粘贴 JSON]
```

3. 把返回的 JSON 存回 `public/content/adult/scenes/`，运行 `npm run validate:content` 检查格式、变量、余韵白名单和未成年关键词黑名单。只有占位符的条目会被自动跳过。
4. 开始新游戏时勾选「成人内容」，新游戏界面会显示已加载的条目数。场景在对应的时机（亲密、撞见、交易、被抓时讨好看守等）弹出；没有匹配条目时显示省略文字。

> 补充：`initiator` 也可能是避难所之外的人（军官、走私头子、看守），此时只有 `name` 字段有意义，其余为默认值。

---

## 8. 最小示例（占位，未填写）

```json
{
  "id": "transaction.storage.ration.01",
  "hook": "scene",
  "when": {
    "motive.any": ["交易"],
    "consent.in": ["willing", "reluctant"],
    "location.in": ["storage"],
    "deal.exists": true
  },
  "weight": 10,
  "tags": ["transaction"],
  "pages": [
    { "speaker": null, "text": "【旁白：仓库，{temperature}°C，货架上剩下的东西】" },
    { "speaker": "initiator", "text": "【{initiator.name} 提起 {deal.qty} 个 {deal.item}】" },
    { "speaker": "partner", "text": "【{partner.name} 的回应，体现 {consent}】" },
    { "speaker": null, "text": "【省略/描写，由作者决定】" }
  ],
  "aftertaste": ["bitter"]
}
```
