export type Scene = 'meeting' | 'class' | 'one-to-one' | 'group';
export const sceneLabels: Record<Scene, string> = {
  meeting: '工作会议',
  class: '课堂学习',
  'one-to-one': '一对一对话',
  group: '多人交流',
};

export interface Person {
  avatarPhotoId?: string;
  id: string;
  name: string;
  role: string;
  organization: string;
  color: string;
  initials: string;
  tags: string[];
  description: string;
  /** User-written context, never an inferred personality or sensitive trait. */
  memo?: string;
}

export interface TranscriptSegment {
  id: string;
  speakerId: string;
  /** Seconds relative to the beginning of the audio. */
  start: number;
  end: number;
  text: string;
}

export interface NoteTask {
  id: string;
  text: string;
  ownerId?: string;
  done: boolean;
}

export interface StructuredNotes {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  tasks: NoteTask[];
  knowledge: string[];
  /** No model is connected in this MVP. */
  source?: 'demo' | 'local-rules' | 'user-edited';
}

export interface Session {
  userNote?: string;
  photoIds?: string[];
  id: string;
  title: string;
  /** ISO-8601 with an explicit timezone. */
  date: string;
  duration: number;
  scene: Scene;
  participants: string[];
  transcript: TranscriptSegment[];
  notes: StructuredNotes;
  tags: string[];
  audioKind: 'synthetic' | 'microphone' | 'none';
  favorite: boolean;
  /** Demo fixtures must remain visibly distinguishable from real captures. */
  isDemo?: boolean;
}

export interface RelationEvidence {
  sessionId: string;
  segmentId: string;
  quote: string;
}

export interface Relation {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  confidence: number;
  status: 'inferred' | 'confirmed';
  evidence: RelationEvidence[];
}

export interface SceneClassification {
  scene: Scene;
  confidence: number;
  reasons: string[];
  source: 'local-rules';
}

export interface MemoryResult {
  id: string;
  sessionId: string;
  sessionTitle: string;
  date: string;
  scene: Scene;
  excerpt: string;
  score: number;
  segmentId?: string;
  timestamp?: number;
  personId?: string;
  kind: 'transcript' | 'note';
  matchedTerms: string[];
}

export interface PrivacySettings {
  localOnly: boolean;
  rememberSessions: boolean;
  relationshipInference: boolean;
  reducedMotion: boolean;
}

export interface NexusState {
  people: Person[];
  sessions: Session[];
  relations: Relation[];
  privacy: PrivacySettings;
}

export const defaultPrivacy: PrivacySettings = {
  localOnly: true,
  rememberSessions: true,
  relationshipInference: true,
  reducedMotion: false,
};
