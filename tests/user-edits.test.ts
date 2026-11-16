import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialWorkspace, loadWorkspace, saveWorkspace, STORAGE_KEY } from '../src/storage';
describe('user-authored profile and session changes', () => {
  beforeEach(() => { const values = new Map<string,string>(); vi.stubGlobal('localStorage', { getItem:(key:string)=>values.get(key)??null, setItem:(key:string,value:string)=>values.set(key,value), removeItem:(key:string)=>values.delete(key) }); });
  it.each(['zh','zh-Hant','en','vi','ja','ko','es','ar'] as const)('preserves %s as the chosen interface language', language => {
    const workspace = initialWorkspace(); workspace.language = language;
    expect(saveWorkspace(workspace)).toBe(true); expect(loadWorkspace().language).toBe(language);
  });
  it('preserves edited notes and attached photo references without rewriting original evidence', () => {
    const workspace=initialWorkspace(), original=structuredClone(workspace.sessions[0].transcript);
    workspace.people[0].name='我的名字'; workspace.people[0].avatarPhotoId='avatar-photo';
    workspace.sessions[0].title='自己的会话名称'; workspace.sessions[0].userNote='我的补充'; workspace.sessions[0].photoIds=['photo-1'];
    workspace.sessions[0].notes.summary='修改后的摘要'; workspace.sessions[0].notes.source='user-edited';
    saveWorkspace(workspace); const loaded=loadWorkspace();
    expect(loaded.people[0].avatarPhotoId).toBe('avatar-photo'); expect(loaded.sessions[0].photoIds).toEqual(['photo-1']);
    expect(loaded.sessions[0].notes.summary).toBe('修改后的摘要'); expect(loaded.sessions[0].transcript).toEqual(original);
  });
  it('recovers safely from malformed edited photo references', () => {
    const workspace=initialWorkspace(); Object.assign(workspace.sessions[0],{photoIds:[123]});
    localStorage.setItem(STORAGE_KEY,JSON.stringify(workspace)); expect(loadWorkspace().sessions[0].photoIds).toBeUndefined();
  });
});
