import { baseMessages } from './base';
export const messageKeys = Object.keys(baseMessages);
/** Stable numbered catalog keeps translations compact; coverage is checked in tests. */
export function indexedCatalog(rows: string): Record<string, string> {
  const result: Record<string,string> = {};
  let previous: string | undefined;
  for (const line of rows.trim().split('\n')) {
    const divider = line.indexOf('|'), index = Number(line.slice(0, divider));
    if (divider < 1 && previous) { result[previous] += '\n' + line; continue; }
    if (divider < 1 || !Number.isInteger(index) || !messageKeys[index] || result[messageKeys[index]]) throw new Error('Invalid locale catalog entry: ' + line);
    previous = messageKeys[index];
    result[previous] = line.slice(divider + 1).replace(/\\n/g, '\n');
  }
  return result;
}
