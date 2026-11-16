import { useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, UserRound, X } from 'lucide-react';
import type { Person } from '../domain';
import { getPhoto, putPhoto, releasePhotoDrafts, removePhoto } from '../photos';
import { useI18n } from '../i18n';
import './ProfileSettings.css';

export function PhotoAvatar({ photoId, name, className = '' }: { photoId?: string; name: string; className?: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true, objectUrl = ''; setUrl('');
    if (photoId) getPhoto(photoId).then(blob => { if (active && blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(() => {});
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photoId]);
  return <span className={`photo-avatar ${className}`}>{url ? <img src={url} alt={name} /> : name.trim().slice(0, 1) || <UserRound size={22} />}</span>;
}

interface Props { person: Person; remember: boolean; onSave: (profile: { name: string; avatarPhotoId?: string }) => void; onToast: (text: string) => void }
export default function ProfileSettings({ person, remember, onSave, onToast }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState(person.name), [photoId, setPhotoId] = useState(person.avatarPhotoId);
  const [processing, setProcessing] = useState(false), [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null), drafts = useRef(new Set<string>()), active = useRef(true);
  useEffect(() => { setName(person.name); setPhotoId(person.avatarPhotoId); }, [person.id, person.name, person.avatarPhotoId]);
  useEffect(() => { active.current = true; return () => { active.current = false; for (const id of drafts.current) void removePhoto(id).catch(() => {}); drafts.current.clear(); }; }, []);
  const upload = async (files: FileList | null) => {
    if (!files?.[0]) return; setProcessing(true); setError('');
    try {
      const id = await putPhoto(files[0], remember);
      if (!active.current) { await removePhoto(id); return; }
      for (const old of drafts.current) await removePhoto(old).catch(() => {});
      drafts.current.clear(); drafts.current.add(id); setPhotoId(id);
    } catch { setError(t('头像保存失败，请使用不超过 2 MB 的 JPG、PNG 或 WebP 图片。')); }
    finally { if (active.current) setProcessing(false); if (picker.current) picker.current.value = ''; }
  };
  const save = () => {
    if (!name.trim()) { setError(t('请输入姓名。')); return; }
    releasePhotoDrafts([...drafts.current]); drafts.current.clear();
    onSave({ name: name.trim(), avatarPhotoId: photoId }); onToast(t('个人资料已更新。')); setError('');
  };
  return <section className="profile-settings-card panel">
    <div className="profile-settings-cover"><span className="profile-cover-orbit" /><span className="profile-cover-dot">✦</span><small>YOUR OWN LITTLE UNIVERSE</small></div>
    <div className="profile-settings-body">
      <div className="profile-settings-portrait"><PhotoAvatar photoId={photoId} name={name || person.name} className="profile-settings-avatar" /><button className="avatar-camera" disabled={processing} aria-label={t('更换头像')} onClick={() => picker.current?.click()}><Camera size={15} /></button></div>
      <div className="profile-settings-intro"><div className="eyebrow">{t('个人资料')}</div><h2>{t('让这个空间更像你。')}</h2><p>{t('头像仅保存在当前设备。支持 JPG、PNG、WebP，单张不超过 2 MB。')}</p></div>
      <div className="profile-settings-form"><label htmlFor="self-name">{t('显示姓名')}</label><input className="text-input" id="self-name" maxLength={40} value={name} onChange={e => { setName(e.target.value); setError(''); }} /><div className="profile-settings-controls"><button className="secondary-button" disabled={processing} onClick={() => picker.current?.click()}><ImagePlus size={14} />{t('更换头像')}</button>{photoId && <button className="text-button" disabled={processing} onClick={() => setPhotoId(undefined)}><X size={13} />{t('移除头像')}</button>}<button className="primary-button" disabled={processing} onClick={save}><Check size={15} />{t('保存个人资料')}</button></div>{processing && <p className="profile-progress" role="status">{t('正在处理图片…')}</p>}{error && <p className="profile-error" role="alert">{error}</p>}</div>
      <input ref={picker} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={event => void upload(event.target.files)} />
    </div>
  </section>;
}
