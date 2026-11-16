import type { Person, Relation, Session } from './domain';
import { seedPeople, seedRelations, seedSessions } from './seed';
import { createInitialJournal } from './journal';
import type { JournalData } from './journal';
import type { Language } from './i18n';
export type Privacy = { remember: boolean; reduceMotion: boolean; autoNotes: boolean; confirmRelations: boolean };
export type Workspace = { version: 1; people: Person[]; relations: Relation[]; sessions: Session[]; privacy: Privacy; language: Language; journal: JournalData };
export const STORAGE_KEY = 'nexus-ai-workspace-v1';
/** Contains only a content-free opt-out marker; no conversations or profiles. */
export const PERSISTENCE_PREFERENCE_KEY = 'nexus-ai-persistence-preference-v1';
export function initialWorkspace(): Workspace {
  return structuredClone({ version: 1, people: seedPeople, relations: seedRelations, sessions: seedSessions, language: 'zh', journal: createInitialJournal(),
    privacy: { remember: true, reduceMotion: false, autoNotes: true, confirmRelations: true } });
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isId = (value: unknown): value is string => isString(value) && value.trim().length > 0;
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isUniqueIds = (values: unknown[]): boolean => values.every(value => isRecord(value) && isId(value.id))
  && new Set(values.map(value => (value as Record<string, unknown>).id)).size === values.length;

function validPerson(value: unknown): value is Person {
  return isRecord(value) && isId(value.id) && isString(value.name) && isString(value.role)
    && isString(value.organization) && isString(value.color) && isString(value.initials)
    && isString(value.description) && isStringArray(value.tags) && (value.memo === undefined || isString(value.memo))
    && (value.avatarPhotoId === undefined || isId(value.avatarPhotoId));
}

function validJournal(value: unknown): value is JournalData {
  if (!isRecord(value) || !Array.isArray(value.entries) || !isUniqueIds(value.entries)
    || !Array.isArray(value.events) || !isUniqueIds(value.events) || !isFiniteNumber(value.focusMinutes) || value.focusMinutes < 0) return false;
  const validInstant = (instant: unknown) => isString(instant) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(instant) && Number.isFinite(Date.parse(instant));
  return value.entries.every(entry => isRecord(entry) && isString(entry.title) && isString(entry.body)
    && validInstant(entry.createdAt) && validInstant(entry.updatedAt) && Date.parse(entry.updatedAt as string) >= Date.parse(entry.createdAt as string)
    && isStringArray(entry.photoIds) && entry.photoIds.every(isId) && new Set(entry.photoIds).size === entry.photoIds.length)
    && value.events.every(event => isRecord(event) && isString(event.title) && validInstant(event.startsAt)
      && isFiniteNumber(event.durationMinutes) && event.durationMinutes > 0 && event.durationMinutes <= 10_080 && typeof event.notified === 'boolean');
}

function validSession(value: unknown, personIds: Set<string>): value is Session {
  if (!isRecord(value) || !isId(value.id) || !isString(value.title) || !isString(value.date) || !Number.isFinite(Date.parse(value.date))
    || !isFiniteNumber(value.duration) || value.duration < 0 || !['meeting', 'class', 'one-to-one', 'group'].includes(value.scene as string)
    || !['synthetic', 'microphone', 'none'].includes(value.audioKind as string) || typeof value.favorite !== 'boolean'
    || (value.isDemo !== undefined && typeof value.isDemo !== 'boolean') || !isStringArray(value.tags)
    || !isStringArray(value.participants) || new Set(value.participants).size !== value.participants.length
    || !value.participants.every(id => personIds.has(id)) || !Array.isArray(value.transcript) || !isUniqueIds(value.transcript)) return false;
  const participants = new Set(value.participants);
  const duration = value.duration;
  let lastStart = 0;
  for (const segment of value.transcript) {
    if (!isRecord(segment) || !isString(segment.text) || !isId(segment.speakerId) || !participants.has(segment.speakerId)
      || !isFiniteNumber(segment.start) || !isFiniteNumber(segment.end)
      || segment.start < lastStart || segment.start < 0 || segment.end < segment.start || segment.end > duration) return false;
    // Overlapping turns are allowed; segments must still be sorted by start time.
    lastStart = segment.start;
  }
  const notes = value.notes;
  if (!isRecord(notes) || !isString(notes.summary) || !isStringArray(notes.keyPoints) || !isStringArray(notes.decisions)
    || !isStringArray(notes.knowledge) || !Array.isArray(notes.tasks) || !isUniqueIds(notes.tasks)
    || (notes.source !== undefined && !['demo', 'local-rules', 'user-edited'].includes(notes.source as string))
    || (value.userNote !== undefined && !isString(value.userNote))
    || (value.photoIds !== undefined && (!isStringArray(value.photoIds) || !value.photoIds.every(isId) || new Set(value.photoIds).size !== value.photoIds.length))) return false;
  return notes.tasks.every(task => isRecord(task) && isString(task.text) && typeof task.done === 'boolean'
    && (task.ownerId === undefined || (isId(task.ownerId) && personIds.has(task.ownerId))));
}

/** Reject corrupted snapshots before any nested value reaches a component. */
function validWorkspace(value: unknown): value is Workspace {
  if (!isRecord(value) || value.version !== 1 || !['zh', 'zh-Hant', 'en', 'vi', 'ja', 'ko', 'es', 'ar'].includes(value.language as string) || !validJournal(value.journal)
    || !Array.isArray(value.people) || !isUniqueIds(value.people)
    || !value.people.every(validPerson) || !Array.isArray(value.sessions) || !isUniqueIds(value.sessions)
    || !Array.isArray(value.relations) || !isUniqueIds(value.relations) || !isRecord(value.privacy)
    || !['remember', 'reduceMotion', 'autoNotes', 'confirmRelations'].every(key => typeof (value.privacy as Record<string, unknown>)[key] === 'boolean')) return false;
  const personIds = new Set(value.people.map(person => person.id));
  if (!value.sessions.every(session => validSession(session, personIds))) return false;
  const sessions = new Map(value.sessions.map(session => [(session as Session).id, session as Session]));
  return value.relations.every(relation => {
    if (!isRecord(relation) || !isId(relation.sourceId) || !isId(relation.targetId)
      || !personIds.has(relation.sourceId) || !personIds.has(relation.targetId) || relation.sourceId === relation.targetId
      || !isString(relation.label) || !isFiniteNumber(relation.confidence) || relation.confidence < 0 || relation.confidence > 1
      || !['inferred', 'confirmed'].includes(relation.status as string) || !Array.isArray(relation.evidence) || !relation.evidence.length) return false;
    const evidenceKeys = new Set<string>();
    return relation.evidence.every(evidence => {
      if (!isRecord(evidence) || !isId(evidence.sessionId) || !isId(evidence.segmentId) || !isId(evidence.quote)) return false;
      const segment = sessions.get(evidence.sessionId)?.transcript.find(item => item.id === evidence.segmentId);
      const key = JSON.stringify([evidence.sessionId, evidence.segmentId, evidence.quote]);
      if (!segment || !segment.text.includes(evidence.quote) || evidenceKeys.has(key)) return false;
      evidenceKeys.add(key);
      return true;
    });
  });
}

export function loadWorkspace(): Workspace {
  try {
    if (localStorage.getItem(PERSISTENCE_PREFERENCE_KEY) === 'disabled') {
      const workspace = initialWorkspace();
      workspace.privacy.remember = false;
      return workspace;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialWorkspace();
    const value = JSON.parse(raw);
    // Add newly introduced fields to earlier v1 snapshots without dropping edits.
    if (isRecord(value) && value.version === 1) {
      if (value.language === undefined) value.language = 'zh';
      if (value.journal === undefined) value.journal = createInitialJournal();
    }
    return validWorkspace(value) ? value : initialWorkspace();
  } catch { return initialWorkspace(); }
}
export function saveWorkspace(state: Workspace): boolean {
  try {
    if (state.privacy.remember) {
      localStorage.removeItem(PERSISTENCE_PREFERENCE_KEY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(PERSISTENCE_PREFERENCE_KEY, 'disabled');
    }
    return true;
  } catch { return false; }
}
export function deleteSession(state: Workspace, id: string): Workspace {
  return { ...state, sessions: state.sessions.filter(s => s.id !== id), relations: state.relations
    .map(r => ({ ...r, evidence: r.evidence.filter(e => e.sessionId !== id) }))
    .filter(r => r.evidence.length > 0) };
}
