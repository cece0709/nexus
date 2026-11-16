import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDemoWav } from '../src/audio';
import { createDemoSession, mergeDemoRelations, searchMemory } from '../src/engine';
import { seedPeople, seedRelations } from '../src/seed';
import { deleteSession, initialWorkspace, loadWorkspace, saveWorkspace, STORAGE_KEY, PERSISTENCE_PREFERENCE_KEY } from '../src/storage';
import type { Workspace } from '../src/storage';

describe('simulated relation evidence reconciliation', () => {
  it('appends resolvable evidence to existing edges and preserves confirmed corrections', () => {
    const session = createDemoSession('meeting', 60);
    const existing = structuredClone(seedRelations);
    const chen = existing.find(relation => relation.id === 'rel-chen')!;
    chen.status = 'confirmed';
    chen.label = '我的工程搭档';
    const snapshot = structuredClone(existing);
    const merged = mergeDemoRelations(existing, session, seedPeople);
    const updated = merged.find(relation => relation.id === 'rel-chen')!;
    expect(updated.status).toBe('confirmed');
    expect(updated.label).toBe('我的工程搭档');
    expect(updated.confidence).toBe(chen.confidence);
    expect(updated.evidence.length).toBe(chen.evidence.length + 1);
    const evidence = updated.evidence.find(item => item.sessionId === session.id)!;
    expect(session.transcript.find(segment => segment.id === evidence.segmentId)?.text).toContain(evidence.quote);
    expect(existing).toEqual(snapshot);
  });

  it('does not duplicate evidence when the same session is reconciled twice', () => {
    const session = createDemoSession('class', 90);
    const once = mergeDemoRelations(seedRelations, session, seedPeople);
    expect(mergeDemoRelations(once, session, seedPeople)).toEqual(once);
  });

  it('creates only supported candidates, with inferred status until authorized', () => {
    const session = createDemoSession('meeting', 60);
    const candidates = mergeDemoRelations([], session, seedPeople);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every(relation => relation.status === 'inferred')).toBe(true);
    expect(candidates.some(relation => relation.targetId === 'lin')).toBe(false); // Her product-partner evidence is in a different conversation.
    expect(mergeDemoRelations([], session, seedPeople, false).every(relation => relation.status === 'confirmed')).toBe(true);
  });

  it('never infers from a profile role, mere presence, changed attribution, or real audio', () => {
    const session = createDemoSession('meeting', 60);
    expect(mergeDemoRelations([], { ...session, transcript: [{ id: 'hello', speakerId: 'chen', start: 0, end: 60, text: '大家下午好。' }] }, seedPeople)).toEqual([]);
    expect(mergeDemoRelations([], { ...session, isDemo: false }, seedPeople)).toEqual([]);
    expect(mergeDemoRelations([], { ...session, audioKind: 'microphone' }, seedPeople)).toEqual([]);
    const chenQuote = session.transcript.find(segment => segment.speakerId === 'chen')!;
    const changed = { ...session, transcript: [{ ...chenQuote, speakerId: 'zhou' }] };
    expect(mergeDemoRelations([], changed, seedPeople)).toEqual([]);
    expect(mergeDemoRelations([], session, seedPeople.filter(person => person.id !== 'chen')).some(relation => relation.targetId === 'chen')).toBe(false);
  });

  it('recognizes reversed existing edges without replacing their user labels', () => {
    const template = structuredClone(seedRelations.find(relation => relation.id === 'rel-chen')!);
    [template.sourceId, template.targetId] = [template.targetId, template.sourceId];
    template.label = '自定义关系';
    const session = createDemoSession('meeting', 60);
    const merged = mergeDemoRelations([template], session, seedPeople);
    expect(merged.filter(relation => [relation.sourceId, relation.targetId].includes('chen'))).toHaveLength(1);
    expect(merged.find(relation => relation.id === template.id)?.label).toBe('自定义关系');
    expect(merged.find(relation => relation.id === template.id)?.evidence.some(evidence => evidence.sessionId === session.id)).toBe(true);
  });
});

describe('session deletion cascades into retrieval and graph evidence', () => {
  it('removes transcript/notes/search and drops unsupported relations, while preserving people', () => {
    const workspace = initialWorkspace();
    const original = structuredClone(workspace);
    const deleted = deleteSession(workspace, 'family-call');
    expect(deleted.sessions.some(session => session.id === 'family-call')).toBe(false);
    expect(deleted.relations.some(relation => relation.evidence.some(evidence => evidence.sessionId === 'family-call'))).toBe(false);
    expect(deleted.relations.some(relation => relation.targetId === 'mom')).toBe(false);
    expect(deleted.people).toEqual(workspace.people);
    expect(searchMemory('周日吃饭', deleted.sessions, deleted.people)).toEqual([]);
    expect(workspace).toEqual(original);
  });

  it('retains an edge with another surviving evidence source', () => {
    const workspace = initialWorkspace();
    const session = createDemoSession('meeting', 60);
    workspace.sessions.unshift(session);
    workspace.relations = mergeDemoRelations(workspace.relations, session, workspace.people);
    const deleted = deleteSession(workspace, 'nexus-review');
    const chen = deleted.relations.find(relation => relation.targetId === 'chen' && relation.sourceId === 'me');
    expect(chen?.evidence.some(evidence => evidence.sessionId === session.id)).toBe(true);
    expect(deleted.relations.every(relation => relation.evidence.every(evidence => evidence.sessionId !== 'nexus-review'))).toBe(true);
  });
});

describe('browser-local persistence and privacy', () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips session tasks, corrected relationship labels and privacy settings', () => {
    const workspace = initialWorkspace();
    workspace.sessions[0].notes.tasks[0].done = true;
    workspace.relations[0].label = '自定义关系';
    workspace.privacy.reduceMotion = true;
    expect(saveWorkspace(workspace)).toBe(true);
    expect(loadWorkspace()).toEqual(workspace);
    expect(JSON.parse(values.get(STORAGE_KEY)!).version).toBe(1);
  });

  it('removes the persisted copy immediately when remembering is disabled', () => {
    const workspace = initialWorkspace();
    saveWorkspace(workspace);
    workspace.privacy.remember = false;
    expect(saveWorkspace(workspace)).toBe(true);
    expect(values.has(STORAGE_KEY)).toBe(false);
    expect(values.get(PERSISTENCE_PREFERENCE_KEY)).toBe('disabled');
    const reloaded = loadWorkspace();
    expect(reloaded).toEqual({ ...initialWorkspace(), privacy: { ...initialWorkspace().privacy, remember: false } });
    saveWorkspace(reloaded);
    expect(values.has(STORAGE_KEY)).toBe(false);
  });

  it('keeps content cleared and persistence disabled across reload until explicitly enabled', () => {
    const workspace = initialWorkspace();
    workspace.people = []; workspace.sessions = []; workspace.relations = [];
    workspace.privacy.remember = false;
    saveWorkspace(workspace);
    expect(values.has(STORAGE_KEY)).toBe(false);
    const reloaded = loadWorkspace();
    expect(reloaded.sessions).toEqual(initialWorkspace().sessions);
    expect(reloaded.privacy.remember).toBe(false);
    expect(saveWorkspace(reloaded)).toBe(true);
    expect(values.has(STORAGE_KEY)).toBe(false);
    reloaded.privacy.remember = true;
    expect(saveWorkspace(reloaded)).toBe(true);
    expect(values.has(PERSISTENCE_PREFERENCE_KEY)).toBe(false);
    expect(loadWorkspace()).toEqual(reloaded);
  });

  it('an opt-out marker takes precedence over any stale content copy', () => {
    const workspace = initialWorkspace();
    workspace.people[0].name = '应被忽略的旧保存';
    values.set(STORAGE_KEY, JSON.stringify(workspace));
    values.set(PERSISTENCE_PREFERENCE_KEY, 'disabled');
    const reloaded = loadWorkspace();
    expect(reloaded.people[0].name).toBe('我');
    expect(reloaded.privacy.remember).toBe(false);
    saveWorkspace(reloaded);
    expect(values.has(STORAGE_KEY)).toBe(false);
  });

  it.each(['not-json', JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, sessions: null, people: [], relations: [], privacy: {} })])('recovers from malformed or incompatible stored state', raw => {
    values.set(STORAGE_KEY, raw);
    expect(loadWorkspace()).toEqual(initialWorkspace());
  });

  const corruptions: Array<[string, (state: Workspace) => void]> = [
    ['missing nested note arrays', state => { Reflect.deleteProperty(state.sessions[0].notes, 'keyPoints'); }],
    ['invalid person tags', state => { Object.assign(state.people[0], { tags: null }); }],
    ['duplicate people ids', state => { state.people.push(structuredClone(state.people[0])); }],
    ['duplicate session ids', state => { state.sessions.push(structuredClone(state.sessions[0])); }],
    ['duplicate relation ids', state => { state.relations.push(structuredClone(state.relations[0])); }],
    ['duplicate transcript ids', state => { state.sessions[0].transcript.push(structuredClone(state.sessions[0].transcript[0])); }],
    ['duplicate task ids', state => { state.sessions[0].notes.tasks.push(structuredClone(state.sessions[0].notes.tasks[0])); }],
    ['invalid scene', state => { Object.assign(state.sessions[0], { scene: 'unknown' }); }],
    ['invalid audio kind', state => { Object.assign(state.sessions[0], { audioKind: 'recorded' }); }],
    ['invalid date', state => { state.sessions[0].date = 'yesterday'; }],
    ['nonfinite duration', state => { state.sessions[0].duration = Infinity; }],
    ['negative transcript time', state => { state.sessions[0].transcript[0].start = -1; }],
    ['transcript past end of audio', state => { state.sessions[0].transcript[0].end = state.sessions[0].duration + 1; }],
    ['backwards transcript range', state => { state.sessions[0].transcript[1].end = state.sessions[0].transcript[1].start - 1; }],
    ['unknown participant', state => { state.sessions[0].participants.push('unknown-person'); }],
    ['unknown speaker', state => { state.sessions[0].transcript[0].speakerId = 'unknown-person'; }],
    ['unknown task owner', state => { state.sessions[0].notes.tasks[0].ownerId = 'unknown-person'; }],
    ['nonboolean task state', state => { Object.assign(state.sessions[0].notes.tasks[0], { done: 'true' }); }],
    ['nonboolean privacy setting', state => { Object.assign(state.privacy, { remember: 'false' }); }],
    ['missing privacy setting', state => { Reflect.deleteProperty(state.privacy, 'confirmRelations'); }],
    ['unknown relation endpoint', state => { state.relations[0].targetId = 'unknown-person'; }],
    ['invalid relation confidence', state => { state.relations[0].confidence = 1.1; }],
    ['invalid relation status', state => { Object.assign(state.relations[0], { status: 'guessed' }); }],
    ['missing evidence session', state => { state.relations[0].evidence[0].sessionId = 'deleted-session'; }],
    ['missing evidence segment', state => { state.relations[0].evidence[0].segmentId = 'deleted-segment'; }],
    ['invented evidence quotation', state => { state.relations[0].evidence[0].quote = '原文中没有这句话。'; }],
    ['duplicate evidence', state => { state.relations[0].evidence.push(structuredClone(state.relations[0].evidence[0])); }],
  ];

  it.each(corruptions)('safely resets stored data with %s', (_label, mutate) => {
    const workspace = initialWorkspace();
    workspace.people[0].name = 'this corrupted state must not be loaded';
    mutate(workspace);
    values.set(STORAGE_KEY, JSON.stringify(workspace));
    expect(loadWorkspace()).toEqual(initialWorkspace());
  });

  it('keeps an intentionally empty workspace valid', () => {
    const workspace = initialWorkspace();
    workspace.people = []; workspace.sessions = []; workspace.relations = [];
    saveWorkspace(workspace);
    expect(loadWorkspace()).toEqual(workspace);
  });

  it('round-trips newly processed evidence and optional note metadata', () => {
    const workspace = initialWorkspace();
    const session = createDemoSession('meeting', 40);
    session.notes = { summary: '笔记关闭', keyPoints: [], decisions: [], tasks: [], knowledge: [] };
    workspace.sessions.unshift(session);
    workspace.relations = mergeDemoRelations(workspace.relations, session, workspace.people);
    saveWorkspace(workspace);
    expect(loadWorkspace()).toEqual(workspace);
  });

  it('handles blocked storage and quota errors without throwing', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Blocked'); }, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => { throw new Error('Blocked'); } });
    expect(loadWorkspace()).toEqual(initialWorkspace());
    expect(saveWorkspace(initialWorkspace())).toBe(false);
    const workspace = initialWorkspace();
    workspace.privacy.remember = false;
    expect(saveWorkspace(workspace)).toBe(false);
  });
});

describe('synthetic WAV fixture integrity', () => {
  it('produces a valid mono PCM WAV with the requested duration', async () => {
    const seconds = 2;
    const wav = makeDemoWav(seconds);
    expect(wav.type).toBe('audio/wav');
    const bytes = await wav.arrayBuffer();
    const view = new DataView(bytes);
    const ascii = (start: number, length: number) => new TextDecoder().decode(new Uint8Array(bytes, start, length));
    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(ascii(12, 4)).toBe('fmt ');
    expect(ascii(36, 4)).toBe('data');
    expect(view.getUint32(4, true)).toBe(bytes.byteLength - 8);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(seconds * 8000 * 2);
    expect(bytes.byteLength).toBe(44 + seconds * 8000 * 2);
  });

  it('generates a quiet nonempty tone, never voice capture', async () => {
    const view = new DataView(await makeDemoWav(1).arrayBuffer());
    let peak = 0;
    for (let offset = 44; offset < view.byteLength; offset += 2) peak = Math.max(peak, Math.abs(view.getInt16(offset, true)));
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(5000);
    expect(view.getInt16(44, true)).toBe(0);
  });
});
