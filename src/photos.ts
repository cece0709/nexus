const DB_NAME = 'nexus-journal-photos';
const memory = new Map<string, Blob>();
const protectedDrafts = new Set<string>();
export function releasePhotoDrafts(ids: string[]): void { ids.forEach(id => protectedDrafts.delete(id)); }
let diskEnabled = true;
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task); queue = result.catch(() => {}); return result;
}
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Browser photo storage unavailable')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('photos'); };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}
async function operation<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', mode), req = run(tx.objectStore('photos'));
    let result: T; req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || req.error); };
  });
}
export async function putPhoto(file: Blob, persist: boolean): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('PHOTO_SIZE_TYPE');
  const id = crypto.randomUUID();
  await serialized(async () => { if (persist && diskEnabled) await operation('readwrite', store => store.put(file, id)); memory.set(id, file); protectedDrafts.add(id); });
  return id;
}
export async function getPhoto(id: string): Promise<Blob | undefined> {
  if (memory.has(id)) return memory.get(id);
  if (!diskEnabled) return undefined;
  const blob = await operation<Blob | undefined>('readonly', store => store.get(id));
  if (blob) memory.set(id, blob); return blob;
}
export async function removePhoto(id: string): Promise<void> {
  await serialized(async () => { memory.delete(id); protectedDrafts.delete(id); await operation('readwrite', store => store.delete(id)); });
}
export async function prunePhotos(validIds: string[]): Promise<void> {
  await serialized(async () => { const valid = new Set([...validIds,...protectedDrafts]);
    for (const id of memory.keys()) if (!valid.has(id)) memory.delete(id);
    const keys = await operation('readonly', store => store.getAllKeys());
    for (const key of keys) if (!valid.has(String(key))) await operation('readwrite', store => store.delete(key));
  });
}
export async function setPhotoPersistence(enabled: boolean): Promise<void> {
  diskEnabled = enabled;
  await serialized(async () => { if (!enabled) {
    const keys = await operation('readonly', store => store.getAllKeys());
    for (const key of keys) { const blob = await operation<Blob>('readonly', store => store.get(key)); memory.set(String(key), blob); }
    await operation('readwrite', store => store.clear());
  } else {
    for (const [id, blob] of memory) await operation('readwrite', store => store.put(blob, id));
  } });
}
export async function clearPhotos(): Promise<void> { await serialized(async () => { memory.clear(); protectedDrafts.clear(); await operation('readwrite', store => store.clear()); }); }
