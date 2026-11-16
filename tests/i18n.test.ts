import { describe,expect,it } from 'vitest';
import { languageOptions,languageDirection,localeMessages,translate } from '../src/i18n';
import { baseMessages } from '../src/locales/base';
describe('eight-language interface',()=>{
  it('shows each language in its own writing system',()=>expect(languageOptions.map(l=>l.label)).toEqual(['简体中文','繁體中文','English','Tiếng Việt','日本語','한국어','Español','العربية']));
  it.each(Object.keys(localeMessages))('provides complete nonempty %s catalog',language=>{
    const catalog=localeMessages[language as keyof typeof localeMessages];
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(baseMessages).sort());
    for(const value of Object.values(catalog))expect(value.trim().length).toBeGreaterThan(0);
  });
  it('keeps unknown user content unchanged and interpolates source labels',()=>{
    expect(translate('用户自己写的内容','ar')).toBe('用户自己写的内容');
    expect(translate('查看{name}的人物档案','en',{name:'Mina'})).toContain('Mina');
    expect(translate('查看{name}的人物档案','ar',{name:'مريم'})).toContain('مريم');
  });
  it('uses RTL only for Arabic',()=>{expect(languageDirection('ar')).toBe('rtl');expect(languageDirection('ja')).toBe('ltr')});
});
