import { beforeEach, describe, expect, it } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { clearPhotos, getPhoto, prunePhotos, putPhoto, releasePhotoDrafts, setPhotoPersistence } from '../src/photos';
globalThis.indexedDB = indexedDB;
function diskKeys():Promise<IDBValidKey[]> { return new Promise((resolve,reject)=>{const req=indexedDB.open('nexus-journal-photos',1);req.onsuccess=()=>{const db=req.result;const query=db.transaction('photos','readonly').objectStore('photos').getAllKeys();query.onsuccess=()=>{db.close();resolve(query.result)};query.onerror=()=>reject(query.error)};req.onerror=()=>reject(req.error)}); }
describe('local photo retention and privacy',()=>{
  beforeEach(async()=>{await clearPhotos();await setPhotoPersistence(true)});
  it('keeps unsaved draft photos during unrelated workspace pruning',async()=>{
    const id=await putPhoto(new Blob(['photo'],{type:'image/png'}),true);
    await prunePhotos([]);expect(await getPhoto(id)).toBeDefined();expect(await diskKeys()).toContain(id);
    releasePhotoDrafts([id]);await prunePhotos([]);expect(await diskKeys()).not.toContain(id);
  });
  it('purges disk content when persistence is turned off but retains current-page access',async()=>{
    const id=await putPhoto(new Blob(['photo'],{type:'image/png'}),true);
    await setPhotoPersistence(false);expect(await diskKeys()).toEqual([]);expect(await getPhoto(id)).toBeDefined();
  });
  it('serializes a queued write and opt-out without leaving a persisted blob',async()=>{
    const write=putPhoto(new Blob(['photo'],{type:'image/png'}),true);const optOut=setPhotoPersistence(false);
    await Promise.all([write,optOut]);expect(await diskKeys()).toEqual([]);
  });
  it('applies the last policy in a rapid opt-out/opt-in/opt-out sequence',async()=>{
    await putPhoto(new Blob(['photo'],{type:'image/png'}),true);
    await Promise.all([setPhotoPersistence(false),setPhotoPersistence(true),setPhotoPersistence(false)]);
    expect(await diskKeys()).toEqual([]);
  });
  it('rejects oversized files and unaccepted image types',async()=>{
    await expect(putPhoto(new Blob([new Uint8Array(2*1024*1024+1)],{type:'image/png'}),true)).rejects.toThrow();
    await expect(putPhoto(new Blob(['<svg/>'],{type:'image/svg+xml'}),true)).rejects.toThrow();
  });
  it('clears saved and protected draft photos',async()=>{
    const id=await putPhoto(new Blob(['photo'],{type:'image/png'}),true);await clearPhotos();
    expect(await diskKeys()).toEqual([]);expect(await getPhoto(id)).toBeUndefined();
  });
});
