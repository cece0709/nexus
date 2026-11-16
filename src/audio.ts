import { saveNativeBlob } from './native';

// Procedural tone fixture. This is never represented as a captured voice recording.
export function makeDemoWav(seconds = 12): Blob {
  const rate = 8000, count = rate * seconds;
  const buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const t = i / rate, envelope = Math.min(1, t * 10, (seconds - t) * 10);
    const sample = (Math.sin(t * Math.PI * 2 * 220) + Math.sin(t * Math.PI * 2 * 330) * .25) * .08 * envelope;
    view.setInt16(44 + i * 2, sample * 32767, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
export async function download(name: string, content: Blob | string, type = 'application/json'): Promise<'native-picker' | 'browser-download' | 'failed'> {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  try {
    if (await saveNativeBlob(name, blob) === 'picker-opened') return 'native-picker';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'browser-download';
  } catch (error) {
    window.dispatchEvent(new CustomEvent('nexus-native-export-result', { detail: { ok: false, name, error: error instanceof Error ? error.message : 'export_failed' } }));
    return 'failed';
  }
}
