# Cloudflare 网站部署

交付的网站包是已经构建的静态前端，可上传至 Cloudflare Pages。它不需要 Node 服务、数据库、API 密钥或模型环境变量；托管不会让模拟录音变成真实录音，也不会建立多设备数据同步。

本文是上传说明，不表示已经登录、修改或部署到你的 Cloudflare 账号。

## 直接上传网站 ZIP

1. 登录 Cloudflare，进入 **Workers & Pages**。
2. 创建应用，选择 **Pages / Direct Upload / Drag and drop** 一类的上传入口。
3. 输入项目名，上传 `NEXUS-AI-Cloudflare.zip`，或将它解压后的静态资源文件夹拖入。
4. 确认后部署，打开 Cloudflare 返回的 `pages.dev` 网站地址。

上传的 ZIP 根目录应直接包含 `index.html` 和 `assets/`，而不是将整个源码工程、`node_modules/`、Android 工程或 APK 一起上传。控制台的拖放方式接受 ZIP 或文件夹；命令行上传使用目录。[Cloudflare Pages Direct Upload 官方说明](https://developers.cloudflare.com/pages/get-started/direct-upload/)

正确的结构示意：

```text
网站 ZIP 根目录/
  index.html
  _headers
  assets/
    ...构建后的 JS 与 CSS...
  ...图标等静态资源...
```

这是预先构建的产物，直接上传时无需填写 `pnpm build` 等构建命令，也无需配置后端地址或服务器入口。若你改为 Git 构建，则需要使用源码并配置 Node/包管理器，那是另一种部署方式。

## 更新网站

修改源码后，在 `nexus-ai` 项目目录运行：

```bash
pnpm install
pnpm build
```

将新的 `dist/` **内部内容**打成 ZIP，再创建一次 Pages 上传部署。不要只替换 `index.html` 而遗漏带哈希名称的资源；整个构建目录应来自同一次构建。

有命令行环境时，也可以按 Cloudflare 文档使用已登录的 Wrangler 上传 `dist/` 目录：

```bash
npx wrangler pages deploy dist
```

命令会访问你的账号并创建或更新部署；需你自行登录和选择目标项目。此交付没有包含账号凭据。

## 上线后核对

- 首页正常，导航、人物网络、手记与设置可打开。
- 图谱可用；不支持 WebGL 的设备仍可使用降级入口。
- 八种语言切换及阿拉伯语 RTL 正常；个人头像/姓名、人物备注、会话标题、笔记编辑及本地照片正常。
- 上传后仍显示“模拟录音”“合成提示音”等能力边界。
- 浏览器通知由用户主动授权；拒绝通知不影响页面内文字和手记功能。

网页数据属于当前浏览器与站点来源，保存在本机 `localStorage / IndexedDB`。不同 `pages.dev` 地址、自定义域名、浏览器、手机与 APK 之间不自动共享数据。部署包中只有静态程序与虚构示例，不包含你已经保存在浏览器里的私有工作空间。

## 常见问题

| 现象 | 检查 |
| --- | --- |
| 打开后 404 | ZIP 是否多包了一层源码/项目目录；入口应在上传根目录 |
| 白屏或资源 404 | 是否上传完整同次构建的 `dist/` 内容；是否遗漏 `assets/` |
| 新域名上没有之前的日记 | 本地数据按站点来源隔离，没有云同步；导出文字、照片备份后自行保管 |
| 手机关网页后没有提醒 | 网站没有可靠关页推送；可导出 ICS，Android APK 的原生提醒是另一项能力 |
| 照片无法保存 | 检查支持格式、单张大小、每篇张数、浏览器配额及无痕模式限制 |
| 想上传 APK | APK 安装到 Android 手机，不是 Pages 网站资源；不要把它当首页上传 |
