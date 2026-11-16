import { sceneLabels } from './domain';
import type { MemoryResult, Person, Relation, RelationEvidence, Scene, SceneClassification, Session, StructuredNotes, TranscriptSegment } from './domain';
import { seedRelations, seedSessions } from './seed';

/** A transparent demo heuristic, not a machine-learning model or calibrated score. */
export function classifyScene(transcript: TranscriptSegment[]): SceneClassification {
  const text = transcript.map(segment => segment.text).join(' ');
  const classTerms = ['同学们', '这节课', '本节课', '课堂', '作业', '教授', '考试', '老师', '知识点'];
  const meetingTerms = ['评审', '会议', '项目', '待办', '负责人', '里程碑', '交付', '决定', '同步', '截止'];
  const classroom = classTerms.filter(term => text.includes(term));
  const meeting = meetingTerms.filter(term => text.includes(term));
  const speakers = new Set(transcript.filter(segment => segment.text.trim()).map(segment => segment.speakerId)).size;
  if (classroom.length >= 2 && classroom.length >= meeting.length) {
    return { scene: 'class', confidence: Math.min(0.94, 0.64 + classroom.length * 0.05), reasons: [`命中课堂线索：${classroom.join('、')}`, `${speakers} 位预设说话人`], source: 'local-rules' };
  }
  // Two people referring to a previous meeting are not sufficient meeting evidence.
  if (meeting.length >= 3 || (meeting.length >= 2 && speakers >= 3)) {
    return { scene: 'meeting', confidence: Math.min(0.92, 0.62 + meeting.length * 0.05), reasons: [`命中会议线索：${meeting.join('、')}`, `${speakers} 位预设说话人`], source: 'local-rules' };
  }
  if (speakers > 2) {
    return { scene: 'group', confidence: 0.68, reasons: ['存在三位及以上预设说话人', '未发现足够课堂或会议关键词'], source: 'local-rules' };
  }
  return { scene: 'one-to-one', confidence: speakers === 2 ? 0.72 : 0.35, reasons: [speakers === 2 ? '存在两位预设说话人' : '信息不足，暂归入对话场景', '结果来自本地关键词规则，可手动修改'], source: 'local-rules' };
}

function uniqueText(rows: string[]): string[] {
  return [...new Set(rows.map(row => row.trim()).filter(Boolean))];
}

/** Extracts source sentences. No invented facts, summaries from a remote model, or ASR. */
export function generateNotes(transcript: TranscriptSegment[], scene: Scene, _people: Person[] = []): StructuredNotes {
  const rows = transcript.filter(segment => segment.text.trim());
  if (!rows.length) return { summary: '暂无转写内容，无法提取笔记。', keyPoints: [], decisions: [], tasks: [], knowledge: [], source: 'local-rules' };
  const nonQuestions = rows.filter(row => !/[？?]$/.test(row.text.trim()));
  const keyRows = nonQuestions.filter(row => /目标|核心|重点|需要|希望|建议|先|保留|原则|理解|概念/.test(row.text));
  const decisions = scene === 'meeting'
    ? uniqueText(rows.filter(row => /决定|最后确认|确认隐私|先交付|先完成|首轮验证/.test(row.text)).map(row => row.text)).slice(0, 4)
    : [];
  const taskRows = rows.filter(row => /我来|我负责|我会|作业是|周三前|下周的作业|待办确认|下次我们|我把.*补充/.test(row.text));
  const tasks = taskRows.slice(0, 5).map((row, index) => ({ id: `rule-task-${row.id}-${index}`, text: row.text, ownerId: /我来|我负责|我会|我把/.test(row.text) ? row.speakerId : undefined, done: false }));
  const knowledge = scene === 'class' ? uniqueText(rows.filter(row => /概念|知识|重点|编码|提取|定义/.test(row.text)).map(row => row.text)).slice(0, 4) : [];
  return {
    summary: (nonQuestions[0]?.text ?? rows[0].text).slice(0, 180),
    keyPoints: uniqueText((keyRows.length ? keyRows : nonQuestions).map(row => row.text)).slice(0, 4),
    decisions,
    tasks,
    knowledge,
    source: 'local-rules',
  };
}

const topics: Record<string, string[]> = {
  android: ['android', '安卓', '原生', 'audiorecord'],
  录音: ['录音', '麦克风', '音频'],
  后台: ['后台', '锁屏', '中断', '长录音'],
  隐私: ['隐私', '同意', '上传', '权限'],
  关系网: ['关系网', '关系图谱', '人物', '关系'],
  记忆: ['记忆', '提取', '编码', '认知'],
  课堂: ['课堂', '老师', '课程', '作业', '复习'],
  会议: ['会议', '评审'],
  待办: ['待办', '任务', '负责', '整理', '完成'],
  设计: ['设计', '视觉', '界面', '交互', '原型'],
  mvp: ['mvp', '第一版', '首版'],
  搜索: ['搜索', '检索', '找回', '证据'],
  周日: ['周日', '星期日', '周天'],
  吃饭: ['吃饭', '回家', '晚饭'],
  读书会: ['读书会', '阅读', '书'],
};
const stopPairs = new Set(['上次', '最近', '什么', '时候', '怎么', '为什么', '为什', '么先', '谁说', '说过', '说了', '聊了', '聊过', '我们', '我的', '我和', '和我', '帮我', '一下', '哪些', '关于', '有关', '事情', '现在', '可以', '找到', '找出', '去了', '几点', '告诉', '告诉我', '的事', '记得', '有哪', '说的', '做了', '今天', '有没有', '没有', '还有', '了吗', '的是', '为了', '什么时']);

function queryTerms(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  const terms = new Set<string>();
  for (const [topic, variants] of Object.entries(topics)) {
    if (variants.some(variant => normalized.includes(variant))) {
      terms.add(topic);
      for (const variant of variants) if (variant.length > 1) terms.add(variant);
    }
  }
  const words = normalized.match(/[a-z0-9]{2,}|[\u4e00-\u9fa5]+/g) ?? [];
  for (const word of words) {
    if (/^[a-z0-9]+$/.test(word)) terms.add(word);
    else {
      if (word.length >= 2 && word.length <= 5 && !stopPairs.has(word)) terms.add(word);
      for (let index = 0; index < word.length - 1; index++) {
        const pair = word.slice(index, index + 2);
        if (!stopPairs.has(pair)) terms.add(pair);
      }
    }
  }
  return [...terms];
}

function personMatches(query: string, people: Person[]): Person[] {
  return people.filter(person => person.id !== 'me' && [person.name, person.name.length === 3 ? person.name.slice(1) : person.name]
    .some(alias => alias.length >= 2 && query.includes(alias)));
}

/** Small published lexicon for the English UI; no language model or translation service. */
function expandEnglishSearchTerms(query: string): string {
  const aliases: Array<[RegExp, string]> = [
    [/\b(?:knowledge\s+points?|knowledge|concepts?)\b/gi, '知识'],
    [/\bfollow[\s-]*up\b/gi, '跟进'],
    [/\b(?:action\s+items?|to[\s-]*dos?|tasks?)\b/gi, '待办'],
    [/\b(?:decide[ds]?|deciding|decisions?)\b/gi, '决定'],
    [/\b(?:meetings?|reviews?)\b/gi, '会议'],
    [/\b(?:teachers?|professors?)\b/gi, '老师'],
    [/\b(?:class(?:es)?|lectures?)\b/gi, '课堂'],
    [/\b(?:friends?|friendship)\b/gi, '朋友'],
    [/\bone[\s-]to[\s-]one\b/gi, '一对一'],
    [/\bgroup\s+chats?\b/gi, '多人交流'],
    [/\b(?:privacy|consent)\b/gi, '隐私'],
    [/\b(?:recording|audio)\b/gi, '录音'],
  ];
  let expanded = query;
  for (const [pattern, replacement] of aliases) expanded = expanded.replace(pattern, replacement);
  return expanded.replace(/\b(?:what|did|do|does|we|in|the|a|an|of|for|our|my|me|about|please|show|find|need|needs)\b/gi, ' ');
}

/** Local keyword + synonym retrieval only; each hit is linked to an existing source. */
export function searchMemory(query: string, sessions: Session[], people: Person[] = []): MemoryResult[] {
  if (!query.trim()) return [];
  const lexicalQuery = expandEnglishSearchTerms(query);
  const terms = queryTerms(lexicalQuery);
  const matchedPeople = personMatches(query, people);
  const normalized = query.toLowerCase();
  // Explicit scene and information-type words constrain retrieval rather than
  // expanding a meeting question into any sentence that happens to say "work".
  const scenes = new Set<Scene>();
  if (/会议|评审/.test(lexicalQuery)) scenes.add('meeting');
  if (/课堂|上课|课程|老师|教授/.test(lexicalQuery)) scenes.add('class');
  if (/一对一/.test(lexicalQuery)) scenes.add('one-to-one');
  if (/多人|闲聊|读书会/.test(lexicalQuery)) scenes.add('group');
  const wantsDecision = /决定|决策|确认了|结论|定下/.test(lexicalQuery);
  const wantsTask = /待办|任务|跟进|要做|行动清单|谁负责|作业/.test(lexicalQuery);
  const wantsKnowledge = /知识|概念|讲过|学到|学了|重点/.test(lexicalQuery);
  // Saying that meetings "organize decisions", or wanting to confirm a question,
  // is not itself a decision. Require an actual commitment / confirmation form.
  const decisionSignal = /决定|达成(?:一致|共识)|最后确认|最终确认|确认(?:了|：|:|隐私原则)|结论(?:是|：|:)|最终选择|最终采用/;
  const taskSignal = /我来|我负责|我会|我把|负责|待办|作业是|周三前|准备|补充|提前|到家前|下周.*(?:一起|试用)/;
  const knowledgeSignal = /概念|知识|编码|提取|记忆|重点|定义|原理/;
  const hits: MemoryResult[] = [];
  for (const session of sessions) {
    if (scenes.size && !scenes.has(session.scene)) continue;
    const person = matchedPeople.find(item => session.participants.includes(item.id));
    if (matchedPeople.length && !person) continue;
    const context = `${session.title} ${session.tags.join(' ')} ${sceneLabels[session.scene]}`.toLowerCase();
    const contextMatches = terms.filter(term => context.includes(term));
    const segmentHits: MemoryResult[] = [];
    for (const segment of session.transcript) {
      const haystack = segment.text.toLowerCase();
      const matchedTerms = terms.filter(term => haystack.includes(term));
      if (wantsDecision && (!decisionSignal.test(segment.text) || /[?？]|比如问|例如问/.test(segment.text))) continue;
      if (wantsTask && !taskSignal.test(segment.text)) continue;
      if (wantsKnowledge && !knowledgeSignal.test(segment.text)) continue;
      const intentBoost = (wantsDecision ? /决定/.test(segment.text) ? 36 : 24 : 0) + (wantsTask ? 12 : 0) + (wantsKnowledge ? 12 : 0);
      const score = matchedTerms.reduce((sum, term) => sum + Math.min(term.length, 5), 0) + contextMatches.length * 0.5 + (person ? 4 : 0) + (haystack.includes(normalized) ? 8 : 0) + intentBoost;
      if (!matchedTerms.length && !person && !contextMatches.length) continue;
      segmentHits.push({ id: `${session.id}:${segment.id}`, sessionId: session.id, sessionTitle: session.title, date: session.date, scene: session.scene, excerpt: segment.text, segmentId: segment.id, timestamp: segment.start, personId: segment.speakerId, kind: 'transcript', matchedTerms, score });
    }
    const targetedNotes = wantsDecision ? session.notes.decisions : wantsTask ? session.notes.tasks.map(task => task.text) : wantsKnowledge ? session.notes.knowledge : [];
    targetedNotes.forEach((text, index) => {
      const matchedTerms = terms.filter(term => text.toLowerCase().includes(term));
      // Task / knowledge / decision fields are already explicitly categorized
      // stored records. With a scene or information-type query they are valid
      // matches even when a shorter note omits the word used in the question.
      if (!matchedTerms.length && !person && !scenes.size && !(wantsTask || wantsKnowledge || wantsDecision)) return;
      if (segmentHits.some(hit => hit.excerpt === text)) return;
      const exactSource = session.transcript.find(segment => segment.text === text);
      segmentHits.push({ id: `${session.id}:note-${index}`, sessionId: session.id, sessionTitle: session.title, date: session.date, scene: session.scene,
        excerpt: text, kind: exactSource ? 'transcript' : 'note', segmentId: exactSource?.id, timestamp: exactSource?.start, personId: exactSource?.speakerId,
        matchedTerms, score: 16 + matchedTerms.reduce((sum, term) => sum + Math.min(term.length, 5), 0) + (person ? 4 : 0) });
    });
    segmentHits.sort((left, right) => right.score - left.score || (left.timestamp ?? 0) - (right.timestamp ?? 0));
    hits.push(...segmentHits.slice(0, 3));
    if (!segmentHits.length && !wantsDecision && !wantsTask && !wantsKnowledge) {
      const noteText = [session.notes.summary, ...session.notes.keyPoints, ...session.notes.decisions, ...session.notes.tasks.map(task => task.text), ...session.notes.knowledge].join(' ');
      const matchedTerms = terms.filter(term => noteText.toLowerCase().includes(term));
      if (matchedTerms.length) hits.push({ id: `${session.id}:notes`, sessionId: session.id, sessionTitle: session.title, date: session.date, scene: session.scene, excerpt: noteText.slice(0, 200), kind: 'note', matchedTerms, score: matchedTerms.length * 2 });
    }
  }
  return hits.sort((left, right) => right.score - left.score || right.date.localeCompare(left.date)).slice(0, 18);
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor(safe % 3600 / 60);
  const remainder = safe % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

/** Creates an explicitly simulated conversation, preserving timestamps in its new duration. */
export function createDemoSession(scene: Scene, duration = 90, title?: string): Session {
  const fixture = seedSessions.find(session => session.scene === scene)!;
  const session = structuredClone(fixture);
  const safeDuration = Math.max(5, Number.isFinite(duration) ? Math.round(duration) : 90);
  const scale = safeDuration / fixture.duration;
  const identifier = `demo-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  session.id = identifier;
  session.title = title?.trim() || `${sceneLabels[scene]} · 模拟录音`;
  session.date = new Date().toISOString();
  session.duration = safeDuration;
  session.favorite = false;
  session.audioKind = 'synthetic';
  session.isDemo = true;
  session.transcript = session.transcript.map((segment, index) => ({ ...segment, id: `seg-${index + 1}`, start: Number((segment.start * scale).toFixed(2)), end: Number((segment.end * scale).toFixed(2)) }));
  session.notes = generateNotes(session.transcript, scene);
  session.notes.tasks = session.notes.tasks.map(task => ({ ...task, id: `${identifier}-${task.id}` }));
  session.tags = [...session.tags, '模拟会话'];
  return session;
}

/**
 * Replays known fixture suggestions only when their actual supporting quotation
 * occurs in this simulated transcript. Co-attendance and a profile role alone
 * are never enough to infer a relationship. User corrections remain authoritative.
 * Turning requireConfirmation off is the app's explicit demo auto-confirm policy.
 */
export function mergeDemoRelations(existing: Relation[], session: Session, people: Person[], requireConfirmation = true): Relation[] {
  if (!session.isDemo || session.audioKind !== 'synthetic') return existing;
  const knownPeople = new Set(people.map(person => person.id));
  const candidates = seedRelations.filter(relation => relation.sourceId === 'me'
    && knownPeople.has(relation.sourceId) && knownPeople.has(relation.targetId)
    && session.participants.includes(relation.sourceId) && session.participants.includes(relation.targetId));
  let merged = existing;
  for (const template of candidates) {
    const additions: RelationEvidence[] = template.evidence.flatMap(evidence => {
      const original = seedSessions.find(source => source.id === evidence.sessionId)?.transcript.find(segment => segment.id === evidence.segmentId);
      if (!original) return [];
      const matchingSegment = session.transcript.find(segment => segment.speakerId === original.speakerId && segment.text.includes(evidence.quote));
      return matchingSegment ? [{ sessionId: session.id, segmentId: matchingSegment.id, quote: evidence.quote }] : [];
    });
    if (!additions.length) continue;
    const index = merged.findIndex(relation => (relation.sourceId === template.sourceId && relation.targetId === template.targetId)
      || (relation.targetId === template.sourceId && relation.sourceId === template.targetId));
    if (index >= 0) {
      const relation = merged[index];
      const newEvidence = additions.filter(addition => !relation.evidence.some(evidence => evidence.sessionId === addition.sessionId
        && evidence.segmentId === addition.segmentId && evidence.quote === addition.quote));
      if (!newEvidence.length) continue;
      merged = merged.map((item, itemIndex) => itemIndex === index ? { ...item, evidence: [...item.evidence, ...newEvidence] } : item);
    } else {
      merged = [...merged, { id: `rel-${session.id}-${template.targetId}`, sourceId: template.sourceId, targetId: template.targetId,
        label: template.label, confidence: template.confidence, status: requireConfirmation ? 'inferred' : 'confirmed', evidence: additions }];
    }
  }
  return merged;
}
