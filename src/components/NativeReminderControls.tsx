import { useEffect, useState } from 'react';
import { Bell, Check, Settings2 } from 'lucide-react';
import { readNativeCapabilities, requestNativeExactAlarms, requestNativeNotifications } from '../native';
import { useI18n } from '../i18n';
export default function NativeReminderControls({ remember }: { remember:boolean }) {
  const { t }=useI18n(); const [capabilities,setCapabilities]=useState(readNativeCapabilities);
  useEffect(()=>{const refresh=()=>setCapabilities(readNativeCapabilities());window.addEventListener('nexus-native-capabilities',refresh);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('nexus-native-capabilities',refresh);window.removeEventListener('focus',refresh)}},[]);
  if(!capabilities)return null;
  return <div className="native-reminder-controls"><strong><Bell size={14}/>{t('Android 本地日程通知')}</strong><p>{t(remember?'通知状态由系统权限决定。精确闹钟未获允许时，提醒可能延迟。':'未开启本地保存，后台提醒已暂停。')}</p><button className="secondary-button" onClick={()=>requestNativeNotifications()}>{capabilities.notificationsEnabled?<Check size={12}/>:<Bell size={12}/>} {t(capabilities.notificationsEnabled?'系统通知已允许':'允许 Android 通知')}</button>{!capabilities.exactAlarms&&<button className="text-button" onClick={requestNativeExactAlarms}><Settings2 size={12}/>{t('精确提醒设置')}</button>}</div>;
}
