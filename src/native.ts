/** Only the bundled Android origin may expose these local native capabilities. */
export interface NativeCapabilities {
  platform: 'android';
  bridgeVersion: 1;
  notificationPermission: 'granted' | 'denied' | 'not-required';
  notificationsEnabled: boolean;
  exactAlarms: boolean;
  backgroundReminders: boolean;
  recording: 'demo';
  downloads: boolean;
}

interface AndroidBridge {
  getCapabilities(): string;
  scheduleEvent(id: string, title: string, epochMs: number): string;
  cancelEvent(id: string): string;
  cancelAllEvents?(): string;
  requestNotifications(): string;
  requestExactAlarmPermission?(): string;
  saveBase64?(name: string, mime: string, data: string): string;
}

declare global {
  interface Window { NexusAndroid?: AndroidBridge }
}

interface BridgeResult { ok: boolean; error?: string }
export interface NativeScheduleResult extends BridgeResult { available: boolean; mode?: 'exact' | 'inexact'; notificationsEnabled?: boolean }
export interface NativePermissionResult extends BridgeResult { available: boolean; pending?: boolean; permission?: string }

const TRUSTED_ANDROID_ORIGIN = 'https://appassets.androidplatform.net';

function parseResult(value: string): Record<string, unknown> | null {
  try { const result: unknown = JSON.parse(value); return result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : null; }
  catch { return null; }
}

function bridge(): AndroidBridge | null {
  if (typeof window === 'undefined' || window.location.origin !== TRUSTED_ANDROID_ORIGIN) return null;
  const candidate = window.NexusAndroid;
  if (!candidate || !['getCapabilities', 'scheduleEvent', 'cancelEvent', 'requestNotifications'].every(key => typeof candidate[key as keyof AndroidBridge] === 'function')) return null;
  try {
    const info = parseResult(candidate.getCapabilities());
    return info?.platform === 'android' && info.bridgeVersion === 1 ? candidate : null;
  } catch { return null; }
}

export function readNativeCapabilities(): NativeCapabilities | null {
  const android = bridge();
  if (!android) return null;
  try {
    const info = parseResult(android.getCapabilities());
    if (!info || info.platform !== 'android' || info.bridgeVersion !== 1) return null;
    return { platform: 'android', bridgeVersion: 1,
      notificationPermission: ['granted', 'not-required'].includes(String(info.notificationPermission)) ? info.notificationPermission as NativeCapabilities['notificationPermission'] : 'denied',
      notificationsEnabled: info.notificationsEnabled === true, exactAlarms: info.exactAlarms === true,
      backgroundReminders: info.backgroundReminders === true, recording: 'demo', downloads: info.downloads === true && typeof android.saveBase64 === 'function' };
  } catch { return null; }
}

export function scheduleNativeEvent(event: { id: string; title: string; startsAt: string }): NativeScheduleResult {
  const android = bridge();
  if (!android) return { available: false, ok: false };
  const timestamp = Date.parse(event.startsAt);
  if (!event.id.trim() || !event.title.trim() || !Number.isFinite(timestamp) || timestamp <= Date.now()) return { available: true, ok: false, error: 'invalid_event' };
  try {
    const result = parseResult(android.scheduleEvent(event.id, event.title, timestamp));
    return { available: true, ok: result?.ok === true, mode: result?.mode === 'exact' ? 'exact' : result?.mode === 'inexact' ? 'inexact' : undefined,
      notificationsEnabled: result?.notificationsEnabled === true, error: typeof result?.error === 'string' ? result.error : undefined };
  } catch { return { available: true, ok: false, error: 'bridge_unavailable' }; }
}

export function cancelNativeEvent(id: string): boolean {
  const android = bridge();
  if (!android) return false;
  try { return parseResult(android.cancelEvent(id))?.ok === true; } catch { return false; }
}

export function cancelAllNativeEvents(ids: string[] = []): boolean {
  const android = bridge();
  if (!android) return false;
  try {
    if (typeof android.cancelAllEvents === 'function') return parseResult(android.cancelAllEvents())?.ok === true;
    return ids.map(id => cancelNativeEvent(id)).every(Boolean);
  } catch { return false; }
}

export function requestNativeNotifications(): NativePermissionResult {
  const android = bridge();
  if (!android) return { available: false, ok: false };
  try {
    const result = parseResult(android.requestNotifications());
    return { available: true, ok: result?.ok === true, pending: result?.pending === true,
      permission: typeof result?.permission === 'string' ? result.permission : undefined };
  } catch { return { available: true, ok: false, error: 'permission_request_failed' }; }
}

export function requestNativeExactAlarms(): void { const android=bridge(); if (typeof android?.requestExactAlarmPermission === 'function') android.requestExactAlarmPermission(); }

/** Opens Android's save-document picker. A later native event reports completion. */
export async function saveNativeBlob(name: string, blob: Blob): Promise<'unavailable' | 'picker-opened'> {
  const android = bridge();
  if (!android || typeof android.saveBase64 !== 'function') return 'unavailable';
  if (blob.size > 8 * 1024 * 1024) throw new Error('export_too_large');
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const result = String(reader.result); resolve(result.slice(result.indexOf(',') + 1)); };
    reader.onerror = () => reject(new Error('export_read_failed'));
    reader.readAsDataURL(blob);
  });
  const result = parseResult(android.saveBase64(name, blob.type || 'application/octet-stream', base64));
  if (result?.ok !== true) throw new Error(typeof result?.error === 'string' ? result.error : 'export_failed');
  return 'picker-opened';
}
