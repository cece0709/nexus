import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialJournal, exportEventICS, sortCalendarEvents, sortJournalEntries, toShanghaiDateKey } from '../src/journal';
import type { CalendarEvent } from '../src/journal';
import { initialWorkspace, loadWorkspace, saveWorkspace, STORAGE_KEY } from '../src/storage';
import type { Workspace } from '../src/storage';

const reference = new Date('2026-11-15T11:37:20Z');
const event: CalendarEvent = { id: 'a-local-event', title: '产品复盘', startsAt: '2026-11-15T21:00:00+08:00', durationMinutes: 45, notified: false };

describe('journal and daily plan', () => {
  it('uses the Shanghai client day across UTC midnight boundaries', () => {
    expect(toShanghaiDateKey('2026-11-14T23:10:00Z')).toBe('2026-11-15');
    expect(toShanghaiDateKey('2026-11-15T16:01:00Z')).toBe('2026-11-16');
  });

  it('creates independent sample entries and future demo events', () => {
    const first = createInitialJournal(reference);
    const second = createInitialJournal(reference);
    expect(first).toEqual(second);
    expect(first.entries).toHaveLength(2);
    expect(first.events).toHaveLength(3);
    expect(first.entries[0].createdAt.startsWith('2026-11-15')).toBe(true);
    expect(first.entries[1].createdAt.startsWith('2026-11-14')).toBe(true);
    expect(first.events.every(item => Date.parse(item.startsAt) > reference.getTime() && item.title.includes('示例'))).toBe(true);
    first.entries[0].photoIds.push('private-photo');
    expect(second.entries[0].photoIds).toEqual([]);
  });

  it('orders events by actual instants rather than textual timezone offsets without mutating input', () => {
    const later = { ...event, id: 'later', startsAt: '2026-11-15T14:00:00Z' };
    const earlier = { ...event, id: 'earlier', startsAt: '2026-11-15T21:00:00+08:00' };
    const input = [later, earlier];
    expect(sortCalendarEvents(input).map(item => item.id)).toEqual(['earlier', 'later']);
    expect(input[0].id).toBe('later');
  });

  it('shows the most recently edited journal first and stabilizes equal-time order', () => {
    const entries = createInitialJournal(reference).entries;
    entries[1].updatedAt = '2026-11-15T22:00:00+08:00';
    expect(sortJournalEntries(entries)[0].id).toBe('journal-yesterday');
    expect(entries[0].id).toBe('journal-today');
    expect(sortCalendarEvents([{ ...event, id: 'z' }, { ...event, id: 'a' }]).map(item => item.id)).toEqual(['a', 'z']);
  });
});

describe('portable local calendar export', () => {
  it('exports the correct UTC start and end with an arrival-time display alarm', () => {
    const ics = exportEventICS(event, reference);
    expect(ics).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n');
    expect(ics).toContain('DTSTART:20261115T130000Z\r\n');
    expect(ics).toContain('DTEND:20261115T134500Z\r\n');
    expect(ics).toContain('DTSTAMP:20261115T113720Z\r\n');
    expect(ics).toContain('UID:a-local-event@nexus.local\r\n');
    expect(ics).toContain('BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:PT0S\r\n');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('escapes newlines and TEXT delimiters without permitting event-property injection', () => {
    const ics = exportEventICS({ ...event, id: 'id\r\nBEGIN:VEVENT', title: '复盘,计划;路径\\资料\r\nBEGIN:VEVENT' }, reference);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('SUMMARY:复盘\\,计划\\;路径\\\\资料\\nBEGIN:VEVENT\r\n');
    expect(ics.match(/(?:^|\r\n)BEGIN:VEVENT\r\n/g)).toHaveLength(1);
    expect(ics).toContain('UID:id%0D%0ABEGIN%3AVEVENT@nexus.local');
  });

  it('folds long multilingual titles at UTF-8 boundaries and at most 75 bytes per line', () => {
    const title = '记录这一天的微光与宇宙🌌'.repeat(18);
    const ics = exportEventICS({ ...event, title }, reference);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, '')).toContain(`SUMMARY:${title}\r\n`);
    expect(ics).not.toContain('\ufffd');
  });

  it.each([
    { ...event, startsAt: 'invalid' },
    { ...event, startsAt: '2026-11-15T21:00' },
    { ...event, durationMinutes: 0 },
    { ...event, durationMinutes: Infinity },
    { ...event, title: ' ' },
  ])('rejects invalid export input', invalid => {
    expect(() => exportEventICS(invalid, reference)).toThrow('无效');
  });
});

describe('journal metadata persistence and v1 migration', () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('migrates prior v1 workspaces without losing session edits', () => {
    const workspace = initialWorkspace();
    workspace.sessions[0].notes.tasks[0].done = true;
    Reflect.deleteProperty(workspace, 'journal');
    Reflect.deleteProperty(workspace, 'language');
    values.set(STORAGE_KEY, JSON.stringify(workspace));
    const restored = loadWorkspace();
    expect(restored.language).toBe('zh');
    expect(restored.journal.entries.length).toBeGreaterThan(0);
    expect(restored.sessions[0].notes.tasks[0].done).toBe(true);
  });

  it('persists language, user-written person memo, journal text, photo references and reminders', () => {
    const workspace = initialWorkspace();
    workspace.language = 'en';
    workspace.people[1].memo = '下次聊聊产品进展。';
    workspace.journal = createInitialJournal(reference);
    workspace.journal.entries[0].photoIds = ['photo-1', 'photo-2'];
    workspace.journal.focusMinutes = 25;
    workspace.journal.events[0].notified = true;
    saveWorkspace(workspace);
    expect(loadWorkspace()).toEqual(workspace);
    expect(values.get(STORAGE_KEY)).not.toContain('data:image');
  });

  const corruptions: Array<[string, (state: Workspace) => void]> = [
    ['unknown language', state => { Object.assign(state, { language: 'xx' }); }],
    ['invalid memo', state => { Object.assign(state.people[1], { memo: 123 }); }],
    ['invalid journal collection', state => { Object.assign(state.journal, { entries: null }); }],
    ['duplicate journal id', state => { state.journal.entries.push(structuredClone(state.journal.entries[0])); }],
    ['duplicate event id', state => { state.journal.events.push(structuredClone(state.journal.events[0])); }],
    ['invalid photo references', state => { Object.assign(state.journal.entries[0], { photoIds: [123] }); }],
    ['duplicate photo references', state => { state.journal.entries[0].photoIds = ['same', 'same']; }],
    ['invalid created time', state => { state.journal.entries[0].createdAt = 'bad-date'; }],
    ['updated before creation', state => { state.journal.entries[0].updatedAt = '2000-01-01T00:00:00Z'; }],
    ['ambiguous event instant', state => { state.journal.events[0].startsAt = '2026-11-15T21:00'; }],
    ['negative event duration', state => { state.journal.events[0].durationMinutes = -5; }],
    ['nonboolean reminder state', state => { Object.assign(state.journal.events[0], { notified: 'yes' }); }],
    ['invalid focus counter', state => { state.journal.focusMinutes = -1; }],
  ];
  it.each(corruptions)('rejects %s safely', (_label, mutate) => {
    const workspace = initialWorkspace();
    workspace.people[0].name = 'corrupted data';
    mutate(workspace);
    values.set(STORAGE_KEY, JSON.stringify(workspace));
    expect(loadWorkspace()).toEqual(initialWorkspace());
  });
});
