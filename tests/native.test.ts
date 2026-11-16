import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelAllNativeEvents, cancelNativeEvent, readNativeCapabilities, requestNativeExactAlarms, requestNativeNotifications, saveNativeBlob, scheduleNativeEvent } from '../src/native';

const trustedOrigin = 'https://appassets.androidplatform.net';
const now = new Date('2026-11-16T02:00:00Z');
const futureEvent = { id: 'personal-event', title: '课堂复习', startsAt: '2026-11-16T11:00:00+08:00' };
const capabilities = { platform: 'android', bridgeVersion: 1, notificationPermission: 'granted', notificationsEnabled: true,
  exactAlarms: false, backgroundReminders: true, recording: 'demo', downloads: true };

function installBridge(origin = trustedOrigin) {
  const bridge = {
    getCapabilities: vi.fn(() => JSON.stringify(capabilities)),
    scheduleEvent: vi.fn((_id: string, _title: string, _epoch: number) => JSON.stringify({ ok: true, mode: 'inexact', notificationsEnabled: true })),
    cancelEvent: vi.fn((_id: string) => JSON.stringify({ ok: true })),
    cancelAllEvents: vi.fn(() => JSON.stringify({ ok: true })),
    requestNotifications: vi.fn(() => JSON.stringify({ ok: true, pending: true, permission: 'requested' })),
    requestExactAlarmPermission: vi.fn(() => JSON.stringify({ ok: true, pending: true })),
    saveBase64: vi.fn((_name: string, _mime: string, _data: string) => JSON.stringify({ ok: true })),
  };
  vi.stubGlobal('window', { location: { origin }, NexusAndroid: bridge });
  return bridge;
}

describe('Android native capability boundary', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('has no native capability in an ordinary browser or non-browser environment', () => {
    expect(readNativeCapabilities()).toBeNull();
    expect(scheduleNativeEvent(futureEvent)).toEqual({ available: false, ok: false });
    expect(requestNativeNotifications()).toEqual({ available: false, ok: false });
  });

  it.each(['https://nexus.example', 'http://appassets.androidplatform.net', 'https://appassets.androidplatform.net.evil.example', 'file://'])('rejects an injected bridge on %s', origin => {
    const bridge = installBridge(origin);
    expect(readNativeCapabilities()).toBeNull();
    expect(cancelAllNativeEvents(['personal-event'])).toBe(false);
    expect(scheduleNativeEvent(futureEvent).available).toBe(false);
    expect(bridge.getCapabilities).not.toHaveBeenCalled();
    expect(bridge.scheduleEvent).not.toHaveBeenCalled();
  });

  it.each(['not json', '[]', 'null', '{"platform":"ios","bridgeVersion":1}', '{"platform":"android","bridgeVersion":2}'])('rejects incompatible capability response %s', response => {
    const bridge = installBridge(); bridge.getCapabilities.mockReturnValue(response);
    expect(readNativeCapabilities()).toBeNull();
    expect(scheduleNativeEvent(futureEvent).available).toBe(false);
  });

  it('requires the complete minimal bridge rather than trusting a capability declaration alone', () => {
    const bridge = installBridge();
    Reflect.deleteProperty(bridge, 'cancelEvent');
    expect(readNativeCapabilities()).toBeNull();
  });

  it('reads native capabilities without promoting simulated recording to real recording', () => {
    const bridge = installBridge();
    bridge.getCapabilities.mockReturnValue(JSON.stringify({ ...capabilities, recording: 'real' }));
    expect(readNativeCapabilities()).toEqual({ ...capabilities, recording: 'demo' });
  });

  it('treats unknown permissions and truthy non-boolean flags conservatively', () => {
    const bridge = installBridge();
    bridge.getCapabilities.mockReturnValue(JSON.stringify({ ...capabilities, notificationPermission: 'unknown', notificationsEnabled: 'true', exactAlarms: 1, backgroundReminders: 'yes', downloads: true }));
    Reflect.deleteProperty(bridge, 'saveBase64');
    expect(readNativeCapabilities()).toMatchObject({ notificationPermission: 'denied', notificationsEnabled: false, exactAlarms: false, backgroundReminders: false, downloads: false });
  });

  it('schedules the exact event instant and retains an inexact-delivery status', () => {
    const bridge = installBridge();
    expect(scheduleNativeEvent(futureEvent)).toEqual({ available: true, ok: true, mode: 'inexact', notificationsEnabled: true, error: undefined });
    expect(bridge.scheduleEvent).toHaveBeenCalledWith('personal-event', '课堂复习', Date.parse(futureEvent.startsAt));
  });

  it.each([
    { ...futureEvent, id: ' ' }, { ...futureEvent, title: '' }, { ...futureEvent, startsAt: 'not-a-date' },
    { ...futureEvent, startsAt: now.toISOString() }, { ...futureEvent, startsAt: '2026-11-15T02:00:00Z' },
  ])('rejects invalid or expired events before calling native scheduling', event => {
    const bridge = installBridge();
    expect(scheduleNativeEvent(event)).toEqual({ available: true, ok: false, error: 'invalid_event' });
    expect(bridge.scheduleEvent).not.toHaveBeenCalled();
  });

  it('reports native scheduling errors without claiming the event was registered', () => {
    const bridge = installBridge(); bridge.scheduleEvent.mockImplementation(() => { throw new Error('native unavailable'); });
    expect(scheduleNativeEvent(futureEvent)).toEqual({ available: true, ok: false, error: 'bridge_unavailable' });
  });

  it('keeps a permission request pending until the native response reports permission', () => {
    const bridge = installBridge();
    expect(requestNativeNotifications()).toMatchObject({ available: true, ok: true, pending: true, permission: 'requested' });
    bridge.requestNotifications.mockReturnValue(JSON.stringify({ ok: true, permission: 'granted' }));
    expect(requestNativeNotifications()).toMatchObject({ available: true, ok: true, pending: false, permission: 'granted' });
  });

  it('reports a permission-request exception as a failed request', () => {
    const bridge = installBridge(); bridge.requestNotifications.mockImplementation(() => { throw new Error('denied'); });
    expect(requestNativeNotifications()).toEqual({ available: true, ok: false, error: 'permission_request_failed' });
  });

  it('cancels all events through the native bulk operation when available', () => {
    const bridge = installBridge(); expect(cancelAllNativeEvents(['one', 'two'])).toBe(true);
    expect(bridge.cancelAllEvents).toHaveBeenCalledOnce(); expect(bridge.cancelEvent).not.toHaveBeenCalled();
  });

  it('falls back to individual cancellation for older native bridges', () => {
    const bridge = installBridge(); Reflect.deleteProperty(bridge, 'cancelAllEvents');
    expect(cancelAllNativeEvents(['one', 'two'])).toBe(true);
    expect(bridge.cancelEvent.mock.calls).toEqual([['one'], ['two']]);
  });

  it('does not hide an individual cancellation failure', () => {
    const bridge = installBridge(); Reflect.deleteProperty(bridge, 'cancelAllEvents');
    bridge.cancelEvent.mockReturnValueOnce('{"ok":false}');
    expect(cancelAllNativeEvents(['one', 'two'])).toBe(false); expect(bridge.cancelEvent).toHaveBeenCalledTimes(2);
    bridge.cancelEvent.mockImplementation(() => { throw new Error('service unavailable'); });
    expect(cancelNativeEvent('three')).toBe(false);
  });

  it('opens exact-alarm settings only when the bridge supports that operation', () => {
    const bridge = installBridge(); requestNativeExactAlarms(); expect(bridge.requestExactAlarmPermission).toHaveBeenCalledOnce();
    Reflect.deleteProperty(bridge, 'requestExactAlarmPermission'); expect(() => requestNativeExactAlarms()).not.toThrow();
  });

  it('rejects exports over 8 MiB before creating a file reader or opening a picker', async () => {
    const bridge = installBridge(); const oversized = new Blob([new Uint8Array(8 * 1024 * 1024 + 1)]);
    await expect(saveNativeBlob('large.png', oversized)).rejects.toThrow('export_too_large');
    expect(bridge.saveBase64).not.toHaveBeenCalled();
  });

  it('exports a blob through the native save picker and distinguishes opening from completion', async () => {
    const bridge = installBridge();
    class Reader { result = 'data:text/plain;base64,aGVsbG8='; onload: (() => void) | null = null; readAsDataURL() { this.onload?.(); } }
    vi.stubGlobal('FileReader', Reader);
    await expect(saveNativeBlob('note.txt', new Blob(['hello'], { type: 'text/plain' }))).resolves.toBe('picker-opened');
    expect(bridge.saveBase64).toHaveBeenCalledWith('note.txt', 'text/plain', 'aGVsbG8=');
  });

  it('returns unavailable without attempting browser file APIs when no trusted bridge exists', async () => {
    installBridge('https://nexus.example');
    await expect(saveNativeBlob('note.txt', new Blob(['hello']))).resolves.toBe('unavailable');
  });

  it('reports save-picker rejection rather than claiming a completed export', async () => {
    const bridge = installBridge(); bridge.saveBase64.mockReturnValue('{"ok":false,"error":"save_in_progress"}');
    class Reader { result = 'data:text/plain;base64,aGVsbG8='; onload: (() => void) | null = null; readAsDataURL() { this.onload?.(); } }
    vi.stubGlobal('FileReader', Reader);
    await expect(saveNativeBlob('note.txt', new Blob(['hello']))).rejects.toThrow('save_in_progress');
  });
});
