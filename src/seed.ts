import type { Person, Relation, Session, TranscriptSegment } from './domain';

export const seedPeople: Person[] = [
  { id: 'me', name: '我', role: '空间主人', organization: 'NEXUS 私人空间', color: '#b0eaff', initials: '我', tags: ['产品设计', '终身学习'], description: '把日常对话变成可以回到的记忆。你是这张关系网络的中心。' },
  { id: 'lin', name: '林知夏', role: '产品搭档', organization: '无界设计工作室', color: '#60d7f6', initials: '夏', tags: ['同事', '产品', 'NEXUS'], description: '一起推进 NEXUS 的产品方向，关注产品体验与长期价值。' },
  { id: 'chen', name: '陈默', role: '前端工程师', organization: '无界设计工作室', color: '#a39aff', initials: '默', tags: ['同事', '工程', '可视化'], description: '负责交互开发与可视化，对性能和细节有很高要求。' },
  { id: 'zhou', name: '周予安', role: '交互设计师', organization: '无界设计工作室', color: '#f6b079', initials: '安', tags: ['同事', '设计', '朋友'], description: '擅长把复杂信息转成直观的界面，正在探索关系图谱的交互。' },
  { id: 'xu', name: '许教授', role: '认知科学老师', organization: '城市大学', color: '#bc9df5', initials: '许', tags: ['老师', '认知科学', '学习'], description: '讲授认知科学与人机交互。你们在课堂上讨论过记忆的提取与编码。' },
  { id: 'su', name: '苏晚', role: '学习伙伴', organization: '城市大学', color: '#80d9b8', initials: '晚', tags: ['同学', '读书会', '朋友'], description: '认知科学课程的学习伙伴，也一起参加周末读书会。' },
  { id: 'gao', name: '高远', role: '项目负责人', organization: '无界设计工作室', color: '#ed9ac3', initials: '远', tags: ['领导', '项目', '里程碑'], description: '关注产品交付节奏、隐私边界与工程可行性。关系类别来自演示记录，需由你确认。' },
  { id: 'mom', name: '妈妈', role: '家人', organization: '家', color: '#f2ca81', initials: '妈', tags: ['家人', '生活'], description: '平常聊家里的近况，也会约好周末一起吃饭。' },
  { id: 'lu', name: '陆言', role: '读书会伙伴', organization: '星期六读书会', color: '#7eb9f1', initials: '言', tags: ['朋友', '阅读', '摄影'], description: '在读书会认识的伙伴，喜欢摄影与讨论技术如何改变日常。' },
];

function segments(rows: Array<[string, number, string]>, duration: number): TranscriptSegment[] {
  return rows.map(([speakerId, start, text], index) => ({ id: `seg-${index + 1}`, speakerId, start, end: rows[index + 1]?.[1] ?? duration, text }));
}

export const seedSessions: Session[] = [
  {
    id: 'nexus-review', title: '让记忆有迹可循 · NEXUS 产品评审', date: '2026-11-15T10:00:00+08:00', duration: 1860,
    scene: 'meeting', participants: ['me', 'lin', 'chen', 'zhou'], tags: ['NEXUS', '产品设计', 'MVP'], audioKind: 'synthetic', favorite: true, isDemo: true,
    transcript: segments([
      ['lin', 0, '今天评审 NEXUS 的第一版。我们的目标是让每一段重要对话都能被轻松找回，不需要用户主动整理。'],
      ['me', 46, '我希望从录音到记忆是一个连续的体验。课堂整理知识，会议整理决策，人物对话则沉淀关系线索。'],
      ['zhou', 130, '关系网用深色空间和悬浮的光点，但信息要克制。点击人物才展开档案和关联对话。'],
      ['chen', 265, '我建议第一版用 React 和 Three.js 验证交互。后台录音必须单独用 Android 原生服务验证。'],
      ['lin', 412, '决定先完成桌面浏览器原型。周三前我来整理录音、转写和笔记的主流程。'],
      ['me', 625, '关系推断要能看到原文证据。比如同事、老师这类标签，默认只是待确认的建议，不能当成事实。'],
      ['zhou', 845, '我负责关系网视觉稿和交互规范。人物节点用颜色区分关系类别，支持筛选、旋转和聚焦。'],
      ['chen', 1080, '我来补充 Android 录音验证清单，优先测锁屏、来电中断、低电量和文件恢复。'],
      ['lin', 1395, '待办确认：我整理流程，予安完成视觉稿，陈默验证原生录音方案。下一次评审放在周三。'],
      ['me', 1730, '最后确认隐私原则：原始音频和完整转写可追溯，云端处理必须明确同意。这个原型只用演示数据。'],
    ], 1860),
    notes: { source: 'demo', summary: '围绕「可回溯的个人记忆」确认 NEXUS MVP 方向：先验证桌面体验，再验证 Android 原生后台录音。', keyPoints: ['录音、转写、结构化笔记形成连续工作流', '关系推断必须附带原文证据，并允许用户确认或纠正', '以深色空间、悬浮光点呈现关系网络，人物详情按需展开'], decisions: ['MVP 先交付桌面浏览器交互原型', '真实后台录音独立在 Android 原生工程验证', '未经同意不上传原始音频或转写'], tasks: [{ id: 'review-task-1', text: '周三前整理录音到笔记的主流程', ownerId: 'lin', done: false }, { id: 'review-task-2', text: '完成关系网视觉稿与交互规范', ownerId: 'zhou', done: false }, { id: 'review-task-3', text: '补充 Android 后台录音验证清单', ownerId: 'chen', done: true }], knowledge: [] },
  },
  {
    id: 'cognitive-class', title: '认知科学 · 我们如何记住一段对话', date: '2026-11-14T14:00:00+08:00', duration: 2730,
    scene: 'class', participants: ['me', 'xu', 'su'], tags: ['认知科学', '记忆', '课堂'], audioKind: 'synthetic', favorite: true, isDemo: true,
    transcript: segments([
      ['xu', 0, '同学们，今天这节课讨论记忆的编码与提取。记忆不是简单地储存一份录音，而是重新建构经验。'],
      ['xu', 220, '核心概念是提取线索。一个时间、地点或者熟悉的人，都可以成为重新进入某段经历的入口。'],
      ['me', 510, '老师，如果把对话按人物和场景连接起来，是否能更容易找到相关记忆？'],
      ['xu', 710, '可以把它当作一个设计假设。但要区分原始记录与系统推断，不能让推断替代事实。'],
      ['su', 1070, '我理解为既保留完整转写，也提供多个入口，比如人物、主题和时间。'],
      ['xu', 1370, '这就是本节课的重点：编码特异性，以及情境对提取的影响。不要只背概念，要用自己的例子解释。'],
      ['me', 1820, '我会把这个思路放到个人记忆软件的设计里，用原始音频作为可以回溯的证据。'],
      ['xu', 2310, '下周的作业是画一张自己的知识网络，并说明每一条连接的依据。课堂笔记里请保留不确定性。'],
      ['su', 2575, '我们周末一起复习编码特异性吧，也可以互相检查知识网络。'],
    ], 2730),
    notes: { source: 'demo', summary: '以记忆编码与提取为主题，讨论人物、时间与情境如何成为记忆入口，以及原始记录与系统推断的边界。', keyPoints: ['多维检索入口可以辅助重新进入一段经历', '设计假设需要验证，不能直接当作认知规律', '原始记录与系统推断应当清楚区分'], decisions: [], tasks: [{ id: 'class-task-1', text: '下周前绘制个人知识网络并标注连接依据', ownerId: 'me', done: false }, { id: 'class-task-2', text: '周末和苏晚复习编码特异性', ownerId: 'me', done: false }], knowledge: ['记忆编码与提取：理解信息如何进入记忆，以及如何被重新访问', '提取线索：人物、时间与情境都可能成为检索入口', '编码特异性：课堂讨论的核心概念，需结合课后资料复习'] },
  },
  {
    id: 'coffee-lin', title: '一杯咖啡的时间 · 和知夏聊产品', date: '2026-11-14T11:30:00+08:00', duration: 1260,
    scene: 'one-to-one', participants: ['me', 'lin'], tags: ['产品灵感', '咖啡', '关系'], audioKind: 'synthetic', favorite: false, isDemo: true,
    transcript: segments([
      ['lin', 0, '我们作为产品搭档，最需要对齐的是第一版究竟帮用户解决什么。不是记录越多越好，是找得回来。'],
      ['me', 170, '对，我想要的是一个安静的记忆空间。忙的时候自动整理，需要的时候自然地问一句。'],
      ['lin', 380, '比如问，上次我们为什么决定先做 Android？答案应该带上那次会议的原文。'],
      ['me', 605, '搜索结果可以是几段对话，再提供一个回到音频的时间点。没有证据就明确说没找到。'],
      ['lin', 860, '还有人物档案，不要为了显得智能去猜敏感信息。关系建议让用户自己确认就好。'],
      ['me', 1080, '我记下了：少一点打扰，多一点可回溯。下周我们找几个朋友试用。'],
    ], 1260),
    notes: { source: 'demo', summary: '知夏与我讨论产品价值：让重要对话容易被找回，通过原文和时间戳提供可信的记忆入口。', keyPoints: ['以「找得回来」衡量价值', '搜索回答需要原文证据', '不推断敏感信息，人物关系由用户确认'], decisions: [], tasks: [{ id: 'coffee-task-1', text: '下周邀请朋友试用 NEXUS 原型', ownerId: 'me', done: false }], knowledge: [] },
  },
  {
    id: 'android-sync', title: 'Android 录音 · 工程可行性同步', date: '2026-11-13T16:00:00+08:00', duration: 1980,
    scene: 'meeting', participants: ['me', 'chen', 'gao'], tags: ['Android', '后台录音', '隐私'], audioKind: 'synthetic', favorite: false, isDemo: true,
    transcript: segments([
      ['gao', 0, '作为项目负责人，我想先确认原型与正式产品的能力边界。浏览器演示不能代表全天候后台录音可用。'],
      ['chen', 215, 'Android 计划用 Kotlin 和 AudioRecord，分段写入本地文件。前台服务、权限和系统版本限制都要在真机验证。'],
      ['me', 540, '先验证用户主动开始的一次长录音，覆盖锁屏与中断恢复。不要承诺永不间断。'],
      ['chen', 780, 'ASR 接口预留 FunASR，分离说话人预留 pyannote。现在不接真实模型，先用预设转写验证界面。'],
      ['gao', 1130, '决定把录音稳定性、温升、耗电和磁盘占用作为第一批验证指标。真实音频默认只在设备本地。'],
      ['me', 1430, '我来整理验收表，陈默准备最小录音工程。所有设备型号和系统版本都记录在测试报告里。'],
      ['chen', 1740, '还要测拒绝权限、可用空间不足和应用进程被系统结束的情况，确保已经落盘的分段可恢复。'],
    ], 1980),
    notes: { source: 'demo', summary: '讨论 Android 原生录音验证范围，确认浏览器原型与真实长期录音的能力边界。', keyPoints: ['原生 Kotlin / AudioRecord 分段写入本地', '覆盖锁屏、来电、拒绝权限、低空间与进程结束', 'ASR 和说话人分离暂留接口，尚未接入真实模型'], decisions: ['首轮验证稳定性、温升、耗电与磁盘占用', '先验证主动开始的长录音，再评估持续记录', '真实音频默认保留在设备本地'], tasks: [{ id: 'android-task-1', text: '整理 Android 录音真机验收表', ownerId: 'me', done: false }, { id: 'android-task-2', text: '准备 AudioRecord 最小录音工程', ownerId: 'chen', done: false }], knowledge: [] },
  },
  {
    id: 'book-club', title: '星期六读书会 · 技术与日常生活', date: '2026-11-12T19:00:00+08:00', duration: 2280,
    scene: 'group', participants: ['me', 'su', 'lu', 'zhou'], tags: ['读书会', '朋友', '生活'], audioKind: 'synthetic', favorite: false, isDemo: true,
    transcript: segments([
      ['lu', 0, '今天读书会聊技术与日常。我的感觉是，好工具应该帮我们更专注当下。'],
      ['su', 250, '我们班最近在学记忆，我在想记录很多东西之后，会不会反而更少主动回想。'],
      ['zhou', 590, '我和他在工作室一起做设计，也经常讨论这个问题。界面需要留白，给人思考的空间。'],
      ['me', 910, '所以个人记录工具最好保持安静。遇到不想记录的场合，一键暂停比自动判断更可靠。'],
      ['lu', 1380, '下次读书会可以带上原型。我也想试一下按人物找回聊过的书。'],
      ['su', 1790, '那下次我们带一个关于记忆的小问题，每个人分享一个真实经历。'],
      ['me', 2100, '好，我会先征求大家同意，再演示录音。今天这些内容只作为示例故事。'],
    ], 2280),
    notes: { source: 'demo', summary: '读书会围绕工具与注意力展开交流，讨论安静的记录体验与清楚的暂停控制。', keyPoints: ['工具应当帮助专注当下', '记录与主动回想之间需要平衡', '任何录音演示都应先征求参与者同意'], decisions: [], tasks: [{ id: 'book-task-1', text: '下次读书会分享原型，并准备一个关于记忆的问题', ownerId: 'me', done: false }], knowledge: [] },
  },
  {
    id: 'family-call', title: '和妈妈的电话 · 周末回家吃饭', date: '2026-11-11T20:10:00+08:00', duration: 840,
    scene: 'one-to-one', participants: ['me', 'mom'], tags: ['家人', '周末', '生活'], audioKind: 'synthetic', favorite: false, isDemo: true,
    transcript: segments([
      ['mom', 0, '这周忙不忙？周日晚上回家吃饭吧，给你做你喜欢的番茄牛腩。'],
      ['me', 150, '好呀妈妈，周日下午我把工作收尾就回去，大概六点到家。'],
      ['mom', 335, '不用带东西。路上注意安全，到之前发个消息。'],
      ['me', 520, '记住了，周日六点。我最近在做一个帮人整理记忆的小软件，回去给你看看。'],
      ['mom', 710, '那挺好，不过别忙得忘了休息。周末见。'],
    ], 840),
    notes: { source: 'demo', summary: '与妈妈约好周日晚上六点回家吃饭，到家之前发消息。', keyPoints: ['周日晚上六点回家', '到家前发一条消息'], decisions: [], tasks: [{ id: 'family-task-1', text: '周日六点回家吃饭，提前发消息', ownerId: 'me', done: false }], knowledge: [] },
  },
  {
    id: 'design-walk', title: '午后散步 · 关系网的第一束光', date: '2026-11-10T15:15:00+08:00', duration: 1140,
    scene: 'one-to-one', participants: ['me', 'zhou'], tags: ['视觉设计', '关系网', '灵感'], audioKind: 'synthetic', favorite: true, isDemo: true,
    transcript: segments([
      ['zhou', 0, '我想让关系网像一片小宇宙，但不是难以阅读的特效。中心是你，其他人像不同距离的星体。'],
      ['me', 225, '节点可以缓慢悬浮，连接用很淡的光。不要根据距离暗示关系好坏。'],
      ['zhou', 460, '对，位置只是布局。点击之后显示共同对话、最近一次联系，以及关系标签的来源。'],
      ['me', 730, '保留一个列表模式，设备不支持三维画面时，也能完整看人物信息。'],
      ['zhou', 990, '我把低动态效果和键盘操作也加到设计规范里。让高级感来自秩序，而不只是发光。'],
    ], 1140),
    notes: { source: 'demo', summary: '探索全息人物网络的视觉方向：宇宙般的空间感、克制的连接线与可访问的信息视图。', keyPoints: ['位置只是布局，不代表关系亲疏', '人物详情展示关联对话与关系来源', '提供列表模式、低动态效果与键盘入口'], decisions: [], tasks: [{ id: 'design-task-1', text: '将低动态效果与键盘操作补充进设计规范', ownerId: 'zhou', done: false }], knowledge: [] },
  },
];

export const seedRelations: Relation[] = [
  { id: 'rel-lin', sourceId: 'me', targetId: 'lin', label: '产品搭档', confidence: 0.97, status: 'confirmed', evidence: [{ sessionId: 'coffee-lin', segmentId: 'seg-1', quote: '我们作为产品搭档，最需要对齐的是第一版究竟帮用户解决什么。' }] },
  { id: 'rel-chen', sourceId: 'me', targetId: 'chen', label: '同事', confidence: 0.89, status: 'inferred', evidence: [{ sessionId: 'nexus-review', segmentId: 'seg-4', quote: '我建议第一版用 React 和 Three.js 验证交互。后台录音必须单独用 Android 原生服务验证。' }] },
  { id: 'rel-zhou', sourceId: 'me', targetId: 'zhou', label: '同事 / 朋友', confidence: 0.91, status: 'confirmed', evidence: [{ sessionId: 'book-club', segmentId: 'seg-3', quote: '我和他在工作室一起做设计，也经常讨论这个问题。' }] },
  { id: 'rel-xu', sourceId: 'me', targetId: 'xu', label: '老师', confidence: 0.94, status: 'inferred', evidence: [{ sessionId: 'cognitive-class', segmentId: 'seg-3', quote: '老师，如果把对话按人物和场景连接起来，是否能更容易找到相关记忆？' }] },
  { id: 'rel-su', sourceId: 'me', targetId: 'su', label: '同学', confidence: 0.84, status: 'inferred', evidence: [{ sessionId: 'cognitive-class', segmentId: 'seg-9', quote: '我们周末一起复习编码特异性吧，也可以互相检查知识网络。' }] },
  { id: 'rel-gao', sourceId: 'me', targetId: 'gao', label: '项目负责人', confidence: 0.90, status: 'inferred', evidence: [{ sessionId: 'android-sync', segmentId: 'seg-1', quote: '作为项目负责人，我想先确认原型与正式产品的能力边界。' }] },
  { id: 'rel-mom', sourceId: 'me', targetId: 'mom', label: '家人', confidence: 0.99, status: 'confirmed', evidence: [{ sessionId: 'family-call', segmentId: 'seg-2', quote: '好呀妈妈，周日下午我把工作收尾就回去，大概六点到家。' }] },
  { id: 'rel-lu', sourceId: 'me', targetId: 'lu', label: '读书会伙伴', confidence: 0.82, status: 'inferred', evidence: [{ sessionId: 'book-club', segmentId: 'seg-5', quote: '下次读书会可以带上原型。我也想试一下按人物找回聊过的书。' }] },
  { id: 'rel-lin-chen', sourceId: 'lin', targetId: 'chen', label: '共同项目', confidence: 0.79, status: 'inferred', evidence: [{ sessionId: 'nexus-review', segmentId: 'seg-9', quote: '待办确认：我整理流程，予安完成视觉稿，陈默验证原生录音方案。' }] },
  { id: 'rel-su-xu', sourceId: 'su', targetId: 'xu', label: '课堂参与者', confidence: 0.73, status: 'inferred', evidence: [{ sessionId: 'cognitive-class', segmentId: 'seg-5', quote: '我理解为既保留完整转写，也提供多个入口，比如人物、主题和时间。' }] },
  { id: 'rel-lu-su', sourceId: 'lu', targetId: 'su', label: '读书会伙伴', confidence: 0.76, status: 'inferred', evidence: [{ sessionId: 'book-club', segmentId: 'seg-6', quote: '那下次我们带一个关于记忆的小问题，每个人分享一个真实经历。' }] },
];

// Exports are mutable only in the app store; clone fixtures before changing them.
export const createSeedState = () => structuredClone({ people: seedPeople, sessions: seedSessions, relations: seedRelations });
