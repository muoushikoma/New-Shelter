# 避难所 / New Shelter

本格生存 × 涌现式社会模拟 × 成人向叙事 · 精致像素风

战争爆发的那一夜，几个互不相识的人逃进了独裁国家边境上一座废弃的民防避难所。门关上以后，这里就成了一个新的国家。

## 运行

```bash
npm install
npm run dev          # 开发服务器 http://localhost:5173
npm run build        # 打包到 dist/（纯静态，任何静态服务器都能跑）
```

其他命令：

| 命令 | 作用 |
|---|---|
| `npm run sim -- 8 1000` | 无头模拟 8 局（种子从 1000 开始），检查崩溃与数值平衡 |
| `npm run validate:content` | 校验成人内容包与目标网络 |
| `npm run template:adult` | 重新生成成人内容空白模板 |
| `npm run typecheck` | 类型检查 |

## 文档

- 策划案：[docs/GDD.md](docs/GDD.md)
- 目标节点网络与开放式结局（叙事骨架）：[docs/GOAL_NETWORK.md](docs/GOAL_NETWORK.md)
- 成人内容接口规范（供内容作者 / Grok 填写）：[docs/ADULT_CONTENT_INTERFACE.md](docs/ADULT_CONTENT_INTERFACE.md)

## 代码结构

```
src/engine     像素缓冲与光照、像素字 UI、随机数
src/art        角色、避难所剖面、地表全景（全部程序化绘制）
src/sim        模拟层（纯数据，可无头运行）：需求与环境、行动、AI、社交、亲密、政治、目标网络、外部世界、事件、结局
src/content    数据：角色池、物品、布局、地点、叙事事件、成人内容加载器
src/ui         主循环、HUD、各种窗口、标题/新游戏/结局
public/content/adult   成人内容包（JSON）
concept/       早期概念图生成器
tools/         无头模拟、内容校验、截图与自动试玩脚本
```

像素字体：Fusion Pixel（SIL OFL 1.1），见 `public/fonts/`。


## 打包与发布

| 命令 | 产物 |
|---|---|
| `npm run electron` | 本地用 Electron 运行桌面版 |
| `npm run dist:win` | `release/` 下的 Windows 安装版和便携版 exe（在 Linux 上打包需要 wine，建议交给 CI） |
| `npm run dist:linux` | Linux AppImage |
| `npm run android:sync` | 生成或同步 `android/` 工程（Capacitor），之后 `cd android && ./gradlew assembleDebug` |
| `npm run icons` | 重新生成应用图标（`tools/make-icons.mjs`） |

**自动发布**：`.github/workflows/release.yml` 在推送 `v*` 标签、提交信息含 `[release]`、或手动运行时触发。它会构建 Windows exe（安装版和便携版）、安卓 APK、Linux AppImage 和 `content-template.zip`，然后发布到 GitHub Releases，说明文字取自 `docs/RELEASE_NOTES.md`。

- 安卓签名：在仓库的 Settings → Secrets 里配置 `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` 后会出正式签名的 APK；没有配置时出调试签名的 APK（可以安装，但以后换成正式签名后需要先卸载旧版）。
- 桌面版会先在 exe 旁边的 `content/` 文件夹里找内容文件，找不到再用游戏自带的（`electron/main.cjs`）。

## 内容填充

见 [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md)：剧情事件、文本与台词、新增人物、图片、成人内容的规范，以及 `npm run validate:content`（校验并试跑）和 `npm run export:content`（导出参考数据）。
