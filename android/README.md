# NEXUS Android 原型宿主

这是安装在 Android 上、加载 APK 内置网页资源的原生壳工程。网页中的录音、转写与人物识别仍是明确标注的演示流程。**本工程没有申请麦克风权限，没有实现原生录音或语音识别。**

## 当前原生功能

- 本地 HTTPS 资源宿主：`https://appassets.androidplatform.net/assets/index.html`。支持 WebGL、浏览器本地存储与 IndexedDB；资源来自 APK 内部，不访问远程网页。
- 系统图片选择器，供笔记添加 JPG、PNG、WebP。不会请求整机照片库权限，也没有直接打开相机的原生实现；桌面与手机系统选择器提供的能力可能不同。
- 用户主动授权后的 Android 通知。日程保存在应用私有 SharedPreferences，并交给 AlarmManager 调度。精确闹钟许可可用时使用精确调度，否则退回可能延迟的调度。
- 重启、应用更新和时间调整后重新注册尚未到期的提醒。系统强行停止、厂商省电限制、通知渠道关闭或权限撤回仍可能阻止提醒。
- 通过系统“保存文档”界面导出 JSON、ICS、文字、合成音或照片。单次导出上限 8 MiB，不请求任意存储写入权限。

原生桥只向内置网页暴露，不允许导航至其他站点。当前应用没有 `INTERNET`、`RECORD_AUDIO`、`CAMERA` 或广泛存储权限。通知和闹钟权限只用于用户添加的本地日程。

## 构建

要求 JDK 17、Gradle 8.9、Android SDK Platform 35 与对应 Build Tools；插件为 AGP 8.7.3 和 Kotlin 2.0.21。最低 Android 版本为 8.0（API 26）。

1. 在前端项目目录运行 `pnpm install` 和 `pnpm build`。Vite 使用相对资源基路径 `base: './'`。
2. 将 `dist/` 下的内容复制到 `android/app/src/main/assets/`，保留 `index.html` 与 `assets/` 的层级。不要复制成 `assets/dist/index.html`。
3. 用本机 `ANDROID_HOME` 环境变量或不提交的 `android/local.properties` 指定 SDK 位置。
4. 在 `android/` 目录运行 `gradle assembleDebug`。
5. 调试 APK 输出到 `app/build/outputs/apk/debug/app-debug.apk`。调试签名仅适合测试安装；正式发布需要自有受保护的签名密钥与分发流程。

## 原生桥协议

`window.NexusAndroid` 的公开方法均返回 JSON 字符串，遵循 `src/native.ts` 的协议：

| 方法 | 作用 |
| --- | --- |
| `getCapabilities()` | 返回平台、桥版本、通知许可、系统通知状态、精确闹钟状态、原生导出能力；录音始终为 `demo` |
| `scheduleEvent(id,title,epochMs)` | 保存并调度未来的日程，返回 `exact` 或 `inexact` |
| `cancelEvent(id)` / `cancelAllEvents()` | 取消系统闹钟，删除原生调度记录并撤下相关已显示通知；网页事件数据由界面另行更新 |
| `requestNotifications()` | 用户点击后请求通知权限；返回值表示已发起请求，最终状态通过回调更新 |
| `requestExactAlarmPermission()` | 打开 Android 的精确闹钟许可设置（系统支持时） |
| `saveBase64(name,mime,data)` | 打开系统保存文档界面，等待用户决定保存位置 |

回调事件：`nexus-native-capabilities`、`nexus-native-export-result`（另有 `nexus-native-save-result` 同义回调）和 `nexus-native-open-event`。导出返回 `pending` 不代表文件已经写入成功，只有结果事件中的 `ok: true` 表示成功。

## 必须完成的真机检查

本文件描述已实现的代码，不代表已在手机上验收。交付报告应单列编译与真机结果。

1. 安装、首次启动、断网启动、旋转屏幕、键盘输入；至少覆盖 Android 8、13、15。
2. 笔记与照片在重启应用后仍可读取，关闭保存后不再留存内容；清空与恢复同时取消原生日程。
3. 拒绝/允许通知、关闭通知渠道、关闭精确闹钟许可后，界面准确反映实际能力。
4. 在前台、退到桌面、锁屏后测试到点提醒；记录误差，不将一次成功推广为全天可靠。
5. 重启手机后未来日程恢复；系统强行停止后的限制需在用户说明中明确。
6. 图片选择与多图上传、取消选择、单图超过限制、照片删除、保存文档成功/取消/空间不足。
7. 检查 APK 权限与网络行为，确认没有实际麦克风采集、ASR、模型调用或隐藏上传。
