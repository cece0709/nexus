import type { SceneClassification, StructuredNotes, TranscriptSegment } from './domain';

export interface AdapterCapability {
  id: string;
  label: string;
  available: boolean;
  mode: 'demo' | 'native' | 'cloud';
  limitation: string;
}

export interface AudioChunk {
  sequence: number;
  startedAt: string;
  durationMs: number;
  sampleRate: number;
  channels: number;
  mimeType: string;
  blob: Blob;
}

export interface RecordingResult {
  chunks: AudioChunk[];
  duration: number;
  simulated: boolean;
}

export interface RecordingAdapter {
  capability: AdapterCapability;
  start(onChunk?: (chunk: AudioChunk) => void): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<RecordingResult>;
}

export interface AsrAdapter {
  capability: AdapterCapability;
  transcribe(audio: AudioChunk[], signal?: AbortSignal): Promise<TranscriptSegment[]>;
}

export interface SpeakerTurn { speakerId: string; start: number; end: number; confidence?: number }
export interface DiarizationAdapter {
  capability: AdapterCapability;
  diarize(audio: AudioChunk[], signal?: AbortSignal): Promise<SpeakerTurn[]>;
}

export interface LanguageModelAdapter {
  capability: AdapterCapability;
  classify(transcript: TranscriptSegment[], signal?: AbortSignal): Promise<SceneClassification>;
  summarize(transcript: TranscriptSegment[], signal?: AbortSignal): Promise<StructuredNotes>;
}

export class CapabilityUnavailableError extends Error {
  constructor(readonly capabilityId: string, detail: string) {
    super(detail);
    this.name = 'CapabilityUnavailableError';
  }
}

function unavailable(capability: AdapterCapability): never {
  throw new CapabilityUnavailableError(capability.id, capability.limitation);
}

abstract class NativeRecordingPlaceholder implements RecordingAdapter {
  abstract capability: AdapterCapability;
  async start(_onChunk?: (chunk: AudioChunk) => void): Promise<void> { unavailable(this.capability); }
  async pause(): Promise<void> { unavailable(this.capability); }
  async resume(): Promise<void> { unavailable(this.capability); }
  async stop(): Promise<RecordingResult> { return unavailable(this.capability); }
}

/** Integration seam only. This does not ask for microphone permissions. */
export class AndroidAudioRecordAdapter extends NativeRecordingPlaceholder {
  capability: AdapterCapability = { id: 'android-audiorecord', label: 'Android Kotlin / AudioRecord', available: false, mode: 'native', limitation: '尚未实现 Android 原生录音桥接，无法在此浏览器中提供后台录音。' };
}

export class IOSAVAudioEngineAdapter extends NativeRecordingPlaceholder {
  capability: AdapterCapability = { id: 'ios-avaudioengine', label: 'iOS Swift / AVAudioEngine', available: false, mode: 'native', limitation: '尚未实现 iOS 原生录音桥接；系统后台能力需要另行验证。' };
}

export class FunAsrAdapter implements AsrAdapter {
  capability: AdapterCapability = { id: 'funasr', label: 'FunASR 中文语音转写', available: false, mode: 'cloud', limitation: 'FunASR 服务尚未接入，演示转写来自预设文本，不是语音识别结果。' };
  async transcribe(_audio: AudioChunk[], _signal?: AbortSignal): Promise<TranscriptSegment[]> { return unavailable(this.capability); }
}

export class PyannoteAdapter implements DiarizationAdapter {
  capability: AdapterCapability = { id: 'pyannote', label: 'pyannote 说话人分离', available: false, mode: 'cloud', limitation: 'pyannote 尚未接入，演示人物与说话人均为预设，不提供声纹识别。' };
  async diarize(_audio: AudioChunk[], _signal?: AbortSignal): Promise<SpeakerTurn[]> { return unavailable(this.capability); }
}

export class CloudLanguageModelAdapter implements LanguageModelAdapter {
  capability: AdapterCapability = { id: 'cloud-language-model', label: '云端大模型', available: false, mode: 'cloud', limitation: '云端大模型尚未接入，分类和笔记仅由本地演示规则生成。' };
  async classify(_transcript: TranscriptSegment[], _signal?: AbortSignal): Promise<SceneClassification> { return unavailable(this.capability); }
  async summarize(_transcript: TranscriptSegment[], _signal?: AbortSignal): Promise<StructuredNotes> { return unavailable(this.capability); }
}

/** State machine for simulating capture; it never accesses the user's microphone. */
export class DemoRecordingAdapter implements RecordingAdapter {
  capability: AdapterCapability = { id: 'demo-capture', label: '模拟录音', available: true, mode: 'demo', limitation: '只模拟录音状态与时间；不采集麦克风，不产生真实对话音频。' };
  private state: 'idle' | 'recording' | 'paused' = 'idle';
  private elapsed = 0;
  private started = 0;
  async start(): Promise<void> {
    if (this.state !== 'idle') throw new Error('模拟录音已经开始。');
    this.elapsed = 0;
    this.started = Date.now();
    this.state = 'recording';
  }
  async pause(): Promise<void> {
    if (this.state !== 'recording') throw new Error('只有正在进行的模拟录音可以暂停。');
    this.elapsed += Date.now() - this.started;
    this.state = 'paused';
  }
  async resume(): Promise<void> {
    if (this.state !== 'paused') throw new Error('只有暂停的模拟录音可以继续。');
    this.started = Date.now();
    this.state = 'recording';
  }
  async stop(): Promise<RecordingResult> {
    if (this.state === 'idle') throw new Error('尚未开始模拟录音。');
    if (this.state === 'recording') this.elapsed += Date.now() - this.started;
    this.state = 'idle';
    return { chunks: [], duration: this.elapsed / 1000, simulated: true };
  }
}

export const integrationCapabilities: AdapterCapability[] = [
  new DemoRecordingAdapter().capability,
  new AndroidAudioRecordAdapter().capability,
  new IOSAVAudioEngineAdapter().capability,
  new FunAsrAdapter().capability,
  new PyannoteAdapter().capability,
  new CloudLanguageModelAdapter().capability,
];
