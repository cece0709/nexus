import { createContext, createElement, useContext } from 'react';
import type { ReactNode } from 'react';
import { baseMessages } from './locales/base';
import traditional from './locales/zh-Hant';
import spanish from './locales/es';
import japanese from './locales/ja';
import vietnamese from './locales/vi';
import korean from './locales/ko';
import arabic from './locales/ar';
import { extraMessages } from './locales/extras';
export type Language = 'zh'|'zh-Hant'|'en'|'vi'|'ja'|'ko'|'es'|'ar';
export const languageOptions: {value:Language;label:string;dir:'ltr'|'rtl'}[] = [
{value:'zh',label:'简体中文',dir:'ltr'},{value:'zh-Hant',label:'繁體中文',dir:'ltr'},{value:'en',label:'English',dir:'ltr'},{value:'vi',label:'Tiếng Việt',dir:'ltr'},{value:'ja',label:'日本語',dir:'ltr'},{value:'ko',label:'한국어',dir:'ltr'},{value:'es',label:'Español',dir:'ltr'},{value:'ar',label:'العربية',dir:'rtl'}];
export const languageDirection=(language:Language):'ltr'|'rtl'=>language==='ar'?'rtl':'ltr';
export const languageLocale=(language:Language):string=>({'zh':'zh-CN','zh-Hant':'zh-TW',en:'en-GB',vi:'vi-VN',ja:'ja-JP',ko:'ko-KR',es:'es-ES',ar:'ar'})[language];
export const localeMessages:Record<Exclude<Language,'zh'>,Record<string,string>>={en:baseMessages,'zh-Hant':traditional,es:spanish,ja:japanese,vi:vietnamese,ko:korean,ar:arabic};
export function translate(text:string, language:Language, variables?:Record<string,string|number>):string {
let translated=language==='zh'?text:extraMessages[language]?.[text]??localeMessages[language]?.[text]??baseMessages[text]??text;
return variables?translated.replace(/\{(\w+)\}/g,(_,key:string)=>String(variables[key]??'{'+key+'}')):translated;
}
const I18nContext=createContext<Language>('zh');
export function I18nProvider({language,children}:{language:Language;children:ReactNode}){return createElement(I18nContext.Provider,{value:language},children);}
export function useI18n(){const language=useContext(I18nContext);return {language,t:(text:string,variables?:Record<string,string|number>)=>translate(text,language,variables)};}
