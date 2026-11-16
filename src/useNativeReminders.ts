import { useEffect, useRef } from 'react';
import type { CalendarEvent } from './journal';
import { cancelAllNativeEvents, cancelNativeEvent, readNativeCapabilities, scheduleNativeEvent } from './native';
/** Reconcile all app-owned alarms with the saved workspace; never schedule seed examples. */
export function useNativeReminders(events: CalendarEvent[], remember: boolean): void {
  const scheduled = useRef(new Map<string,string>());
  const initialized = useRef(false);
  useEffect(() => {
    const sync = () => {
      if (!readNativeCapabilities()) return;
      if (!initialized.current || !remember || events.length === 0) {
        cancelAllNativeEvents(events.map(event => event.id)); scheduled.current.clear(); initialized.current = true;
      }
      if (!remember) return;
      const currentIds = new Set(events.map(event => event.id));
      for (const id of scheduled.current.keys()) if (!currentIds.has(id)) { cancelNativeEvent(id); scheduled.current.delete(id); }
      for (const event of events) {
        if (event.id.startsWith('event-') || event.notified || Date.parse(event.startsAt) <= Date.now()) continue;
        const signature = JSON.stringify([event.title,event.startsAt]);
        if (scheduled.current.get(event.id) === signature) continue;
        if (scheduleNativeEvent(event).ok) scheduled.current.set(event.id,signature);
      }
    };
    sync();
    window.addEventListener('nexus-native-capabilities', sync);
    return () => window.removeEventListener('nexus-native-capabilities', sync);
  }, [events, remember]);
}
