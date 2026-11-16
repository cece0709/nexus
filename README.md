# NEXUS AI · 个人智能录音与关系管理原型

浏览器交互式 MVP 与 Android 原型宿主：把会话、可编辑笔记、人物关系、日常手记和日历安排连接起来。采用 React + TypeScript + Three.js / React Three Fiber。界面语言选择按本地写法显示：简体中文、繁體中文、English、Tiếng Việt、日本語、한국어、Español、العربية；人物姓名、示例原文和用户内容不自动翻译，阿拉伯语界面采用从右向左排版。

**本版本是产品原型。录音会话、说话人、转写与关系候选使用演示数据；没有采集麦克风，没有全天候后台录音，没有接入 ASR、声纹识别或云端大模型。** 页面中的图谱、过滤、播放进度演示、搜索、笔记与本地状态交互用于验证产品体验，不能用于保存真实生活录音。

## 两种交付

- `NEXUS-AI-Cloudflare.zip`：预先构建的网站资源，ZIP 根目录含 `index.html`、`assets/` 和 `_headers`，供 Cloudflare Pages 直接上传。
- `NEXUS-AI-Android-debug.apk`：Android 调试签名原型，加载内置网页；原生接入图片选择、文件导出与本地日程通知，录音仍是演示。
- `NEXUS-AI-Source.zip`：前端、Android 工程、测试与说明文档。

安装和上传步骤见 [交付使用说明](docs/DELIVERY.md)。文件是否已生成、编译是否通过及实际验证范围，以交付时的测试报告为准；没有连接手机时不能声称已做真机验证。

## 本地启动

**这台电脑快速体验：双击 `Start-NEXUS.cmd`，保持启动窗口打开，然后访问 [http://127.0.0.1:4173](http://127.0.0.1:4173)。** 交付包包含构建好的 `dist/`，此模式仅需要 Node.js，不需要重新安装依赖。启动器会优先使用已安装的 Node，也支持这台电脑已有的 Codex Node 运行环境。

按 `Ctrl+C` 停止服务。若 4173 端口已被占用，先关闭正在运行的同一原型窗口，或在命令行设置其他 `PORT` 后运行 `node scripts/serve.mjs`。修改源码或从头构建时，使用下面的开发命令。

环境：Node.js 22.12+，pnpm 10。推荐桌面版 Chrome / Edge。首次安装需要网络。

```bash
cd nexus-ai
pnpm install
pnpm dev
```

打开终端显示的本地地址，通常为 `http://127.0.0.1:5173`。如果端口被占用，使用终端实际显示的地址。请通过开发服务器或预览服务器访问，直接双击 `index.html` 不会运行 TypeScript 应用。

```bash
pnpm test       # 运行领域逻辑单元测试
pnpm build      # TypeScript 检查及生产构建，产物在 dist/
pnpm preview    # 本地预览生产构建，通常为 4173 端口
```

如果系统没有 pnpm，可先安装 pnpm 10，再执行上述命令。项目锁文件用于固定依赖；`pnpm-workspace.yaml` 的 `onlyBuiltDependencies` 仅允许 `esbuild` 所需的安装构建步骤。请保留此配置，避免安装后缺少 Vite 构建依赖。`dist/` 可由静态 HTTP 服务器托管；这不会增加后端、录音或模型能力。

## 建议体验顺序

1. 查看总览中的会话、待办和最近记忆，了解信息如何连接。
2. 开始一次**模拟录音**，体验计时、暂停、结束和整理流程。演示转写是预置文本，不是听到了你的声音。
3. 打开会话，切换带时间戳的转写与结构化笔记；播放、拖动或下载合成提示音。12 秒 WAV 提示音不是对话原音，不能与示例转写对齐。
4. 在人物关系网中拖动旋转、缩放、选择人物，并查看关系与会话证据。关系推断需要用户核对。
5. 用“会议里决定了什么”“老师讲过的知识点”“林知夏”等自然语言或人物名查找记忆。结果来自本地规则和文本匹配，不是向量检索或大模型回答；点击来源可定位到转写片段。
6. 查看隐私设置与能力说明，体验本地数据控制。设置状态不代表手机已获得权限，也不代表启用了加密。
7. 在设置顶部修改自己的头像和姓名，再从语言列表选择界面语言。进入人物档案可修改名称和备注；保存后列表与关系网使用新名称，历史引文保持原文。
8. 进入“日常手记 / Daily journal”，写文字、添加本地照片或通过系统文件选择器拍照选图；创建日历事件，体验页面内提醒或导出 ICS；选择 15 / 25 / 45 分钟专注时间。
9. 在会话详情打开笔记编辑器，修改会话名称、摘要、核心要点、决策、知识点及待办，也可在“我的补充”中添加文字和图片。原始转写与关系来源保持完整。

示例人物和对话均为虚构。浏览器保存的数据仅适合演示；清除站点数据、使用无痕模式、切换域名或浏览器后可能丢失。请勿输入敏感个人资料。

## 交付内容

最终交付包：`NEXUS-AI-Cloudflare.zip`、`NEXUS-AI-Android-debug.apk`、`NEXUS-AI-Source.zip`。操作见 [交付使用说明](docs/DELIVERY.md)，实际检查结果见 [验证记录](docs/QA_REPORT.md)。最新增量功能见 [更新说明](docs/CHANGELOG.md)。

八语言切换只在设置页下拉框提供，顶部 EN 快捷按钮已移除。设置顶部可修改个人姓名和头像；会话可改名、编辑结构化笔记和添加图片，原始转写与证据保持完整。

| 内容 | 文件 |
| --- | --- |
| 完整产品方案，按需求的十一部分组织 | [docs/PRODUCT_DESIGN.md](docs/PRODUCT_DESIGN.md) |
| 当前实现、数据流、模块接口和后续接入位置 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Android 原生录音能力验证计划 | [docs/ANDROID_VALIDATION.md](docs/ANDROID_VALIDATION.md) |
| 已实现、演示、未接入能力与已知限制 | [docs/LIMITATIONS.md](docs/LIMITATIONS.md) |
| 多语言、个人资料、笔记/照片、日历与专注使用说明 | [docs/DAILY_LIFE.md](docs/DAILY_LIFE.md) |
| 网站与 Android 文件的使用及安装 | [docs/DELIVERY.md](docs/DELIVERY.md) |
| Cloudflare Pages 上传说明 | [docs/CLOUDFLARE_DEPLOY.md](docs/CLOUDFLARE_DEPLOY.md) |
| Android 原型宿主与桥接协议 | [android/README.md](android/README.md) |
| 领域逻辑测试 | `tests/` |

## 技术与数据边界

- 前端：React 19、TypeScript、Vite、Three.js、React Three Fiber、Drei、Lucide 图标。
- 数据：虚构种子数据、用户主动填写的文字及选择的图片；文本状态存浏览器本地存储，图片附件存 IndexedDB，均未做应用级加密。无账号、云数据库、多设备同步或备份服务。
- 视觉：深色全息界面、发光节点、轨道与连接线；WebGL 不可用时提供降级交互。
- Android 原型：Kotlin Activity + 系统 WebView，本地资源、图片选择、AlarmManager 调度及系统保存文档；没有麦克风采集或网络上传。原生通知仍受系统权限、通知渠道、精确闹钟许可和省电策略影响。
- 采集与模型：保留独立适配接口，后续接 Kotlin / AudioRecord、Swift / AVAudioEngine、FunASR、pyannote 及笔记模型服务。Android 壳存在不等于原生录音已经实现。

未来真实录音版应先完成 [Android 验证计划](docs/ANDROID_VALIDATION.md)，证明权限、锁屏连续性、文件完整性及电耗，再开展自动转写与关系推断。完整原始音频长期保存是目标版设计；本原型没有采集的原始音频可供保存。

**日常功能的边界：**网站的日历提醒和专注计时需要网页保持开启，浏览器通知还需授权与平台支持。Android APK 另有原生本地日程调度，可在退出界面后由系统处理，但没有真机结果前不保证准时弹出；强行停止、厂商限制或权限撤回均可能阻止通知。ICS 由用户自行导入日历，是否提示由接收端决定。工作空间 JSON 包含文字及照片标识，不包含头像或图片文件，图片需单独备份。网站、APK、不同浏览器与域名之间没有数据同步。
