import { describe, expect, it, vi } from 'vitest';
import { AndroidAudioRecordAdapter, CapabilityUnavailableError, CloudLanguageModelAdapter, DemoRecordingAdapter, FunAsrAdapter, IOSAVAudioEngineAdapter, PyannoteAdapter } from '../src/adapters';
import { classifyScene, createDemoSession, formatDuration, generateNotes, searchMemory } from '../src/engine';
import { createSeedState, seedPeople, seedRelations, seedSessions } from '../src/seed';
import type { Scene } from '../src/domain';

describe('demo fixtures retain their source references', () => {
  it('includes all required scenes, people and readable transcript timestamps', () => {
    expect(seedSessions.length).toBeGreaterThanOrEqual(6);
    expect(seedPeople.length).toBeGreaterThanOrEqual(8);
    expect(new Set(seedSessions.map(session => session.scene)).size).toBe(4);
    const personIds = new Set(seedPeople.map(person => person.id));
    for (const session of seedSessions) {
      expect(session.audioKind).toBe('synthetic');
      expect(session.isDemo).toBe(true);
      expect(session.notes.source).toBe('demo');
      expect(Number.isNaN(Date.parse(session.date))).toBe(false);
      expect(session.transcript.length).toBeGreaterThan(0);
      let previousEnd = 0;
      for (const segment of session.transcript) {
        expect(personIds.has(segment.speakerId)).toBe(true);
        expect(session.participants).toContain(segment.speakerId);
        expect(segment.start).toBeGreaterThanOrEqual(previousEnd);
        expect(segment.end).toBeGreaterThan(segment.start);
        expect(segment.end).toBeLessThanOrEqual(session.duration);
        previousEnd = segment.end;
      }
    }
  });

  it('every relation has a resolvable source quote and never marks inference as confirmed', () => {
    expect(seedRelations.some(relation => relation.status === 'inferred')).toBe(true);
    expect(seedRelations.some(relation => relation.status === 'confirmed')).toBe(true);
    for (const relation of seedRelations) {
      expect(seedPeople.some(person => person.id === relation.sourceId)).toBe(true);
      expect(seedPeople.some(person => person.id === relation.targetId)).toBe(true);
      expect(relation.evidence.length).toBeGreaterThan(0);
      for (const evidence of relation.evidence) {
        const source = seedSessions.find(session => session.id === evidence.sessionId)?.transcript.find(segment => segment.id === evidence.segmentId);
        expect(source?.text).toContain(evidence.quote);
      }
    }
  });

  it('returns isolated state so tasks and fixtures cannot mutate one another', () => {
    const first = createSeedState();
    const second = createSeedState();
    first.sessions[0].notes.tasks[0].done = true;
    expect(second.sessions[0].notes.tasks[0].done).toBe(false);
    expect(seedSessions[0].notes.tasks[0].done).toBe(false);
  });
});

describe('transparent local scene classification', () => {
  it.each(seedSessions.map(session => [session.title, session.scene, session.transcript] as const))('classifies %s as %s', (_title, scene, transcript) => {
    const result = classifyScene(transcript);
    expect(result.scene).toBe(scene);
    expect(result.source).toBe('local-rules');
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(1);
  });

  it('marks empty input as insufficient information', () => {
    const result = classifyScene([]);
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.reasons[0]).toContain('信息不足');
  });

  it('does not turn a casual reference to a previous meeting into a meeting', () => {
    const result = classifyScene([
      { id: 'a', speakerId: 'me', start: 0, end: 10, text: '上次会议为什么决定先做 Android？' },
      { id: 'b', speakerId: 'lin', start: 10, end: 20, text: '我们喝咖啡的时候再聊聊吧。' },
    ]);
    expect(result.scene).toBe('one-to-one');
  });
});

describe('extractive notes do not invent source content', () => {
  it('extracts meeting decisions and action ownership from source sentences', () => {
    const source = seedSessions.find(session => session.id === 'nexus-review')!;
    const notes = generateNotes(source.transcript, 'meeting');
    expect(notes.source).toBe('local-rules');
    expect(notes.decisions.some(decision => decision.includes('桌面浏览器原型'))).toBe(true);
    expect(notes.tasks.some(task => task.ownerId === 'zhou' && task.text.includes('视觉稿'))).toBe(true);
    const raw = source.transcript.map(segment => segment.text).join(' ');
    for (const text of [...notes.keyPoints, ...notes.decisions, ...notes.knowledge, ...notes.tasks.map(task => task.text)]) expect(raw).toContain(text);
  });

  it('separates classroom knowledge from meeting decisions', () => {
    const source = seedSessions.find(session => session.scene === 'class')!;
    const notes = generateNotes(source.transcript, 'class');
    expect(notes.knowledge.some(text => text.includes('编码'))).toBe(true);
    expect(notes.decisions).toEqual([]);
    expect(notes.tasks.some(task => task.text.includes('作业'))).toBe(true);
    expect(notes.tasks.find(task => task.text.includes('作业'))?.ownerId).toBeUndefined();
  });

  it('handles an empty transcript without fabricated notes', () => {
    const notes = generateNotes([], 'meeting');
    expect(notes.keyPoints).toEqual([]);
    expect(notes.tasks).toEqual([]);
    expect(notes.summary).toContain('暂无转写');
  });
});

describe('local memory search', () => {
  it('maps an English meeting question through the small lexicon and keeps original Chinese evidence', () => {
    const results = searchMemory('What did we decide in the meeting?', seedSessions, seedPeople);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(result => result.scene === 'meeting')).toBe(true);
    expect(results[0].excerpt).toContain('决定先完成桌面浏览器原型');
    expect(results.some(result => result.sessionId === 'coffee-lin' || result.sessionId === 'family-call')).toBe(false);
  });

  it('maps English teacher-knowledge intent into classroom source results', () => {
    const results = searchMemory('teacher knowledge points', seedSessions, seedPeople);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(result => result.scene === 'class')).toBe(true);
    expect(results.some(result => result.excerpt.includes('编码特异性'))).toBe(true);
  });

  it('supports English follow-up and friends queries without fabricating translated excerpts', () => {
    const tasks = searchMemory('follow up tasks', seedSessions, seedPeople);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.some(result => /负责|整理|待办|补充|准备/.test(result.excerpt))).toBe(true);
    const friends = searchMemory('friends', seedSessions, seedPeople);
    expect(friends.length).toBeGreaterThan(0);
    expect(friends.some(result => result.sessionId === 'book-club')).toBe(true);
    for (const result of [...tasks, ...friends]) {
      const session = seedSessions.find(item => item.id === result.sessionId)!;
      const storedText = [...session.transcript.map(segment => segment.text), ...session.notes.tasks.map(task => task.text), session.notes.summary].join(' ');
      expect(storedText).toContain(result.excerpt);
    }
  });

  it('answers a meeting-decision query with actual meeting decisions, without casual or family matches', () => {
    const results = searchMemory('会议里决定了什么', seedSessions, seedPeople);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(result => result.scene === 'meeting')).toBe(true);
    expect(results.some(result => result.sessionId === 'coffee-lin' || result.sessionId === 'family-call')).toBe(false);
    expect(results[0].excerpt).toMatch(/决定|确认|决策/);
    expect(results[0].excerpt).toContain('决定先完成桌面浏览器原型');
    expect(results[0].excerpt).not.toContain('今天评审');
    expect(results.some(result => result.excerpt.includes('我希望从录音到记忆') || result.excerpt.includes('我想先确认'))).toBe(false);
    expect(results.some(result => result.excerpt.includes('桌面浏览器原型'))).toBe(true);
  });

  it('restricts teacher knowledge questions to sourced classroom concepts', () => {
    const results = searchMemory('老师讲过的知识点', seedSessions, seedPeople);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(result => result.scene === 'class')).toBe(true);
    expect(results[0].excerpt).toMatch(/概念|知识|编码|提取|记忆|重点/);
    expect(results.some(result => result.excerpt.includes('编码特异性'))).toBe(true);
  });

  it('prioritizes stored actions and actionable sentences for follow-up queries', () => {
    const results = searchMemory('需要跟进的待办', seedSessions, seedPeople);
    expect(results.length).toBeGreaterThan(0);
    const sourceTaskTexts = seedSessions.flatMap(session => session.notes.tasks.map(task => task.text));
    expect(results.slice(0, 4).every(result => sourceTaskTexts.includes(result.excerpt)
      || /负责|待办|准备|补充|我来|我会|作业|周三前/.test(result.excerpt))).toBe(true);
    expect(results.some(result => result.excerpt.includes('录音') || result.excerpt.includes('视觉稿'))).toBe(true);
    expect(results.some(result => result.excerpt === '今天评审 NEXUS 的第一版。我们的目标是让每一段重要对话都能被轻松找回，不需要用户主动整理。')).toBe(false);
  });

  it('returns no invented decision for a scene with no stored decision', () => {
    expect(searchMemory('课堂里决定了什么', seedSessions, seedPeople)).toEqual([]);
  });

  it('retrieves the Android decision with source timestamps', () => {
    const results = searchMemory('为什么先做 Android 后台录音', seedSessions, seedPeople);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(result => result.sessionId === 'android-sync')).toBe(true);
    expect(results[0].segmentId).toBeDefined();
    expect(results[0].timestamp).toBeGreaterThanOrEqual(0);
    const session = seedSessions.find(item => item.id === results[0].sessionId)!;
    expect(session.transcript.find(segment => segment.id === results[0].segmentId)?.text).toBe(results[0].excerpt);
  });

  it('understands person aliases while keeping matches inside that person’s sessions', () => {
    const results = searchMemory('上次和知夏聊了什么', seedSessions, seedPeople);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(result => result.sessionId === 'coffee-lin')).toBe(true);
    for (const result of results) expect(seedSessions.find(session => session.id === result.sessionId)?.participants).toContain('lin');
  });

  it('finds the original family plan from a natural language question', () => {
    const results = searchMemory('周日几点回家吃饭', seedSessions, seedPeople);
    expect(results[0].sessionId).toBe('family-call');
    expect(results.some(result => /六点/.test(result.excerpt))).toBe(true);
  });

  it('uses simple synonyms, returns no fake answer for unmatched or empty queries', () => {
    expect(searchMemory('安卓', seedSessions, seedPeople).some(result => result.sessionId === 'android-sync')).toBe(true);
    expect(searchMemory('量子纠缠实验', seedSessions, seedPeople)).toEqual([]);
    expect(searchMemory('   ', seedSessions, seedPeople)).toEqual([]);
  });

  it('deleted sessions immediately disappear from retrieval', () => {
    const withoutFamily = seedSessions.filter(session => session.id !== 'family-call');
    expect(searchMemory('周日几点回家吃饭', withoutFamily, seedPeople).some(result => result.sessionId === 'family-call')).toBe(false);
  });
});

describe('new simulated sessions', () => {
  it.each(['meeting', 'class', 'one-to-one', 'group'] as Scene[])('creates an honestly labelled %s session within its duration', scene => {
    const session = createDemoSession(scene, 42, '我的模拟录音');
    expect(session.id).toMatch(/^demo-/);
    expect(session.title).toBe('我的模拟录音');
    expect(session.scene).toBe(scene);
    expect(session.isDemo).toBe(true);
    expect(session.audioKind).toBe('synthetic');
    expect(session.duration).toBe(42);
    expect(session.transcript.at(-1)?.end).toBe(42);
    expect(session.notes.source).toBe('local-rules');
    expect(session.notes.tasks.every(task => !task.done)).toBe(true);
  });

  it('creates independent ids and sanitizes invalid duration', () => {
    expect(createDemoSession('meeting').id).not.toBe(createDemoSession('meeting').id);
    expect(createDemoSession('meeting', -10).duration).toBe(5);
    expect(createDemoSession('meeting', Number.NaN).duration).toBe(90);
  });
});

describe('recording and AI capability boundaries', () => {
  it('native recording placeholders fail clearly rather than simulating success', async () => {
    for (const adapter of [new AndroidAudioRecordAdapter(), new IOSAVAudioEngineAdapter()]) {
      expect(adapter.capability.available).toBe(false);
      await expect(adapter.start()).rejects.toBeInstanceOf(CapabilityUnavailableError);
      await expect(adapter.stop()).rejects.toBeInstanceOf(CapabilityUnavailableError);
    }
  });

  it('unconfigured ASR, diarization and LLM fail clearly', async () => {
    await expect(new FunAsrAdapter().transcribe([])).rejects.toThrow('尚未接入');
    await expect(new PyannoteAdapter().diarize([])).rejects.toThrow('尚未接入');
    await expect(new CloudLanguageModelAdapter().summarize([])).rejects.toThrow('尚未接入');
    await expect(new CloudLanguageModelAdapter().classify([])).rejects.toBeInstanceOf(CapabilityUnavailableError);
  });

  it('simulated recording excludes paused time and never returns captured chunks', async () => {
    vi.useFakeTimers();
    try {
      const adapter = new DemoRecordingAdapter();
      await adapter.start();
      vi.advanceTimersByTime(1200);
      await adapter.pause();
      vi.advanceTimersByTime(6000);
      await adapter.resume();
      vi.advanceTimersByTime(800);
      const result = await adapter.stop();
      expect(result).toEqual({ chunks: [], duration: 2, simulated: true });
      await expect(adapter.stop()).rejects.toThrow('尚未开始');
    } finally { vi.useRealTimers(); }
  });

  it('prevents invalid simulation state transitions', async () => {
    const adapter = new DemoRecordingAdapter();
    await expect(adapter.pause()).rejects.toThrow();
    await expect(adapter.resume()).rejects.toThrow();
    await adapter.start();
    await expect(adapter.start()).rejects.toThrow('已经开始');
    await adapter.stop();
  });
});

describe('duration formatting', () => {
  it.each([[0, '00:00'], [61, '01:01'], [3661, '1:01:01'], [-5, '00:00'], [Number.NaN, '00:00']])('formats %s as %s', (input, expected) => {
    expect(formatDuration(input as number)).toBe(expected);
  });
});
