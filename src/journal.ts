export interface JournalEntry {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  /** Binary photo data lives in IndexedDB, never in this JSON document. */
  photoIds: string[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO-8601 instant with Z or an explicit numeric UTC offset. */
  startsAt: string;
  durationMinutes: number;
  /** Page-open browser notification state; not a background scheduling guarantee. */
  notified: boolean;
}

export interface JournalData {
  entries: JournalEntry[];
  events: CalendarEvent[];
  focusMinutes: number;
}

const seedReference = new Date();

export function toShanghaiDateKey(date: Date | string = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(typeof date === 'string' ? new Date(date) : date);
}

/** Stable within the current app run; fresh examples follow the client day. */
export function createInitialJournal(reference: Date = seedReference): JournalData {
  const today = toShanghaiDateKey(reference);
  const yesterday = toShanghaiDateKey(new Date(reference.getTime() - 86_400_000));
  const roundedReference = Math.ceil(reference.getTime() / 60_000) * 60_000;
  return {
    entries: [
      { id: 'journal-today', title: '给今天留下一点光', body: '这是一篇示例日记。\n\n今天最值得记住的，是把一个想法变成了可以体验的东西。慢一点，给重要的对话和自己的感受留出空间。\n\n你可以编辑这篇日记，也可以新建一页，加入自己的文字和照片。', createdAt: `${today}T08:30:00+08:00`, updatedAt: `${today}T08:30:00+08:00`, photoIds: [] },
      { id: 'journal-yesterday', title: '散步时想到的事', body: '这是一篇示例日记。\n\n好的记忆工具应该像一盏小灯：需要的时候亮起，平时安静地陪伴。今天散步时想到，记录生活不必面面俱到，留下一个片段就很好。', createdAt: `${yesterday}T20:30:00+08:00`, updatedAt: `${yesterday}T20:30:00+08:00`, photoIds: [] },
    ],
    events: [
      { id: 'event-review-memory', title: '示例 · 整理今天的关键记忆', startsAt: new Date(roundedReference + 30 * 60_000).toISOString(), durationMinutes: 25, notified: false },
      { id: 'event-product-plan', title: '示例 · 梳理下一版产品计划', startsAt: new Date(roundedReference + 120 * 60_000).toISOString(), durationMinutes: 45, notified: false },
      { id: 'event-evening-note', title: '示例 · 写下今天的小收获', startsAt: new Date(roundedReference + 240 * 60_000).toISOString(), durationMinutes: 15, notified: false },
    ],
    focusMinutes: 0,
  };
}

export function sortCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.id.localeCompare(right.id));
}

export function sortJournalEntries(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.id.localeCompare(right.id));
}

function escapeCalendarText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

/** RFC 5545 content-line folding: at most 75 UTF-8 octets per physical line. */
function foldCalendarLine(line: string): string {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = '', bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) { lines.push(current); current = ' '; bytes = 1; }
    current += character; bytes += size;
  }
  lines.push(current);
  return lines.join('\r\n');
}

const utcCalendarDate = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** Exports a local event; delivery of an imported alarm is controlled by the calendar app. */
export function exportEventICS(event: CalendarEvent, generatedAt: Date = new Date()): string {
  const start = new Date(event.startsAt);
  if (!Number.isFinite(start.getTime()) || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(event.startsAt)
    || !Number.isFinite(event.durationMinutes) || event.durationMinutes <= 0 || event.durationMinutes > 10_080
    || !event.id.trim() || !event.title.trim() || !Number.isFinite(generatedAt.getTime())) throw new Error('日程时间、标题或时长无效，无法导出。');
  const end = new Date(start.getTime() + event.durationMinutes * 60_000);
  const title = escapeCalendarText(event.title);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NEXUS AI//Local Journal 1.0//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${encodeURIComponent(event.id)}@nexus.local`, `DTSTAMP:${utcCalendarDate(generatedAt)}`,
    `DTSTART:${utcCalendarDate(start)}`, `DTEND:${utcCalendarDate(end)}`, `SUMMARY:${title}`,
    `DESCRIPTION:${escapeCalendarText('NEXUS AI 本地日程。导入后由日历应用负责提醒；时间与通知取决于设备和日历设置。')}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0S', `DESCRIPTION:${title}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(foldCalendarLine).join('\r\n') + '\r\n';
}
