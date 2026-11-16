import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Check, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import type { Session } from '../domain';
import { download } from '../audio';
import { getPhoto, putPhoto, releasePhotoDrafts, removePhoto } from '../photos';
import { useI18n } from '../i18n';
import './SessionEditor.css';

export function SessionPhoto({ id, allowDownload = false }: { id: string; allowDownload?: boolean }) {
  const { t } = useI18n(); const [url, setUrl] = useState('');
  useEffect(() => { let active = true, objectUrl = ''; getPhoto(id).then(blob => { if (blob && active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(() => {}); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [id]);
  return <div className="session-photo-image">{url ? <img src={url} alt={t('附图')} /> : <span>{t('附图')}</span>}{allowDownload && url && <button className="session-photo-download" aria-label={t('下载图片')} onClick={async () => { const photo = await getPhoto(id); if (photo) download(`nexus-note-photo.${photo.type.split('/')[1]}`, photo); }}><ArrowDownToLine size={15} /></button>}</div>;
}

interface Props { session: Session; remember: boolean; onSave: (next: Session) => void; onClose: () => void; onToast: (message: string) => void }
export default function SessionEditor({ session, remember, onSave, onClose, onToast }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => structuredClone(session)), [processing, setProcessing] = useState(false), [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null), container = useRef<HTMLDivElement>(null), createdPhotos = useRef(new Set<string>()), mounted = useRef(true), closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    mounted.current = true; const previous = document.activeElement as HTMLElement; container.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); closeRef.current(); } if (event.key === 'Tab') { const items = [...(container.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([hidden]),textarea,select') || [])]; const first = items[0], last = items[items.length - 1]; if (event.shiftKey && (document.activeElement === first || document.activeElement === container.current)) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } };
    container.current?.addEventListener('keydown', key);
    return () => { mounted.current = false; container.current?.removeEventListener('keydown', key); previous?.focus(); for (const id of createdPhotos.current) void removePhoto(id).catch(() => {}); createdPhotos.current.clear(); };
  }, []);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return; setProcessing(true); setError(''); const additions: string[] = [];
    try {
      for (const file of Array.from(files).slice(0, 4 - (draft.photoIds?.length || 0))) { const id = await putPhoto(file, remember); if (!mounted.current) { await removePhoto(id); continue; } additions.push(id); createdPhotos.current.add(id); }
      if (mounted.current) setDraft(current => ({ ...current, photoIds: [...(current.photoIds || []), ...additions] }));
    } catch { if (mounted.current) { if (additions.length) setDraft(current => ({ ...current, photoIds: [...(current.photoIds || []), ...additions] })); setError(t('图片添加失败，请检查格式、大小或可用空间。')); } }
    finally { if (mounted.current) setProcessing(false); if (picker.current) picker.current.value = ''; }
  };
  const changeArray = (field: 'keyPoints' | 'decisions' | 'knowledge', value: string) => setDraft(current => ({ ...current, notes: { ...current.notes, [field]: value.split('\n') } }));
  const save = () => {
    if (!draft.title.trim()) { setError(t('请输入会话名称。')); return; }
    const trimLines = (values: string[]) => values.map(item => item.trim()).filter(Boolean).slice(0, 100);
    const next = { ...draft, title: draft.title.trim(), userNote: draft.userNote?.trim() || '', notes: { ...draft.notes, source: 'user-edited' as const,
      summary: draft.notes.summary.trim(), keyPoints: trimLines(draft.notes.keyPoints), decisions: trimLines(draft.notes.decisions), knowledge: trimLines(draft.notes.knowledge), tasks: draft.notes.tasks.filter(task => task.text.trim()).map(task => ({ ...task, text: task.text.trim() })) } };
    releasePhotoDrafts([...createdPhotos.current]); createdPhotos.current.clear(); onSave(next); onToast(t('笔记已更新，原始转写保持完整。')); onClose();
  };
  return <div className="modal-backdrop session-editor-backdrop" onClick={() => { if (!processing) onClose(); }}><div className="modal session-editor-modal" role="dialog" aria-modal="true" aria-label={t('编辑会话与笔记')} ref={container} tabIndex={-1} onClick={e => e.stopPropagation()}><div className="modal-heading"><h2>{t('编辑会话与笔记')}</h2><button className="icon-button" aria-label={t('关闭编辑器')} disabled={processing} onClick={onClose}><X size={20} /></button></div><p className="session-editor-notice">{t('修改笔记不会覆盖原始转写，关系证据仍可回溯。')}</p>
    <label className="field-label" htmlFor="session-edit-title">{t('会话名称')}</label><input className="text-input" id="session-edit-title" value={draft.title} maxLength={120} onChange={e => { setDraft({ ...draft, title: e.target.value }); setError(''); }} />
    <label className="field-label" htmlFor="session-edit-summary">{t('这一段，聊了什么')}</label><textarea className="text-input" id="session-edit-summary" rows={4} maxLength={6000} value={draft.notes.summary} onChange={e => setDraft({ ...draft, notes: { ...draft.notes, summary: e.target.value } })} />
    <div className="session-editor-columns">{(['keyPoints', 'decisions', 'knowledge'] as const).map(field => <div key={field}><label className="field-label" htmlFor={`session-edit-${field}`}>{t(field === 'keyPoints' ? '核心要点' : field === 'decisions' ? '会议决策' : '知识与灵感')}<small>{t('每行一项')}</small></label><textarea className="text-input" id={`session-edit-${field}`} rows={4} maxLength={12000} value={draft.notes[field].join('\n')} onChange={e => changeArray(field, e.target.value)} /></div>)}</div>
    <div className="session-editor-task-heading"><label className="field-label">{t('行动清单')}</label><button className="text-button" onClick={() => setDraft({ ...draft, notes: { ...draft.notes, tasks: [...draft.notes.tasks, { id: `task-${crypto.randomUUID()}`, text: '', done: false }] } })}><Plus size={13} />{t('添加待办')}</button></div><div className="session-editor-tasks">{draft.notes.tasks.map((task, index) => <div key={task.id}><span>{String(index + 1).padStart(2, '0')}</span><input className="text-input" aria-label={`${t('行动清单')} ${index + 1}`} value={task.text} maxLength={1000} onChange={e => setDraft({ ...draft, notes: { ...draft.notes, tasks: draft.notes.tasks.map(item => item.id === task.id ? { ...item, text: e.target.value } : item) } })} /><button className="icon-button" aria-label={t('移除待办')} onClick={() => setDraft({ ...draft, notes: { ...draft.notes, tasks: draft.notes.tasks.filter(item => item.id !== task.id) } })}><X size={15} /></button></div>)}</div>
    <label className="field-label" htmlFor="session-edit-user-note">{t('我的补充')}</label><textarea className="text-input" id="session-edit-user-note" rows={5} maxLength={20000} value={draft.userNote || ''} placeholder={t('补充文字、想法或会后记录…')} onChange={e => setDraft({ ...draft, userNote: e.target.value })} />
    <div className="session-editor-photos">{(draft.photoIds || []).map(id => <div className="session-editor-photo" key={id}><SessionPhoto id={id} /><button className="icon-button" aria-label={t('移除图片')} onClick={() => setDraft({ ...draft, photoIds: draft.photoIds?.filter(item => item !== id) })}><X size={14} /></button></div>)}</div><div className="session-editor-photo-toolbar"><button className="secondary-button" disabled={processing || (draft.photoIds?.length || 0) >= 4} onClick={() => picker.current?.click()}><ImagePlus size={15} />{t('添加图片')}</button><small>{processing ? t('正在处理图片…') : t('图片仅保存在本地，最多 4 张，每张不超过 2 MB。')}</small></div><input type="file" hidden ref={picker} accept="image/jpeg,image/png,image/webp" multiple onChange={e => void upload(e.target.files)} />
    {error && <p className="profile-error" role="alert">{error}</p>}<div className="session-editor-footer"><button className="secondary-button" disabled={processing} onClick={onClose}>{t('取消')}</button><button className="primary-button" disabled={processing} onClick={save}><Check size={15} />{t('保存更改')}</button></div>
    </div></div>;
}
