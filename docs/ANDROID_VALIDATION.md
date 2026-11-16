# Android 录音能力验证计划

本文件是一份待执行的**原生录音**验证方案。当前源码已有 Kotlin / Gradle 的 Android 原型宿主，接入本地网页、图片选择、文件导出和原生日程通知；APK 编译结果以交付报告为准。**宿主没有实现 AudioRecord 录音，也没有真机录音结果。** TypeScript 录音适配器仍是边界占位，调用未接入的采集能力必须报告不可用，不能返回假录音成功。以下录音门槛均为建议目标，尚未达成或测量。

初次检查未在常见位置找到 Android 工具，随后为本项目准备 JDK、Gradle 与 Android SDK。工具可编译项目不代表已有连接的手机或完成真机测试；设备、系统版本、安装结果与测试记录应另行报告。浏览器构建也不能证明手机录音的后台连续性。

## 1. 第一阶段要证明什么

先证明用户从可见界面主动启动后，应用能够持续采集、保留文件、正确应对中断。暂不运行大模型，不用 UI 动画或模拟计时证明“后台可录”。

明确不包括：静默录音、开机自动启动麦克风、绕过系统权限、保证永不被系统终止、录下普通电话/其他应用的内部通话声音。

Android 官方当前文档说明，麦克风前台服务受 while-in-use 权限与后台启动限制；应在可见界面启动并符合系统条件。仅获得 `RECORD_AUDIO` 并不意味着可以随时从后台开始。[启动限制](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)、[麦克风前台服务类型](https://developer.android.com/develop/background-work/services/fgs/service-types)

## 2. 原生模块建议

```text
android/
  app/                  # 可见的开始、暂停、停止及状态界面
  capture/              # AudioRecord、音频线程、采样计数、路由事件
  recording-service/    # microphone 类型前台服务、常驻录音通知
  audio-store/          # 分片写入、清单、校验、崩溃恢复
  bridge/               # 原生事件 -> 共享 RecordingAdapter 协议
  diagnostics/          # 丢帧、读写耗时、空间、电量和中断日志
```

此目录结构是后续采集工程建议，不是当前宿主的实际目录。当前 `android/app/` 只有界面宿主和本地提醒相关源码，没有 `capture/` 或录音服务。先独立验证采集，再把事件接入共享前端；不要把 WebView 生命周期当作采集线程的生命周期。

生产工程的 Manifest 设计示意，不能单独编译为应用：

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />

<application>
  <service
    android:name=".recording.RecordingService"
    android:exported="false"
    android:foregroundServiceType="microphone" />
</application>
```

用户在可见 Activity 点击开始 → 请求并确认录音授权 → 创建满足系统条件的前台服务 → 及时显示录音通知 → 初始化 `AudioRecord` → 成功采集后更新 UI。各步失败均以错误状态结束，不悄悄退化为假录音。

## 3. 采集、分片与完整性

- 初始实验参数：PCM 16-bit、单声道、16 kHz；这是 ASR 友好的候选配置，真实硬件支持与录音质量需实测。更高质量方案可保存设备原生采样率，再为 ASR 派生重采样副本。
- 用 `AudioRecord` 的最小缓冲区能力与实际支持格式初始化。工作线程持续读取，处理部分读取、0 返回、错误和设备失效。官方 API 明确区分读取模式和错误返回，不应把所有非正数当作静音。[AudioRecord API](https://developer.android.com/reference/android/media/AudioRecord)
- 音频线程只做采集与投递；磁盘写入、加密、重采样及模型推理由有界队列的独立执行器处理，记录背压，避免无限占用内存。
- 每 30–60 秒落盘一个分片作为实验起点；写临时文件、完成校验与长度记录，再原子更新清单并提交数据库。需要评估落盘频率与断电损失窗口。
- 每个分片记录 `chunkId/sessionId`、采样率、声道、PCM 格式、起止帧、字节数、SHA-256、加密 nonce/keyId、完成状态。CRC/哈希用于完整性核对，不替代认证加密。
- 音频位置使用实际读取的帧数；会话墙上时间及暂停区间单独保存。每段录音之间有缺口必须显示，不能伪造连续音频。
- 异常退出后扫描临时文件，恢复可验证帧，隔离损坏资产，更新缺口；不能把未封装的临时文件直接当成成功完成。
- 原始录音是不可变资产；ASR、降噪、压缩副本都保留来源映射。生成笔记不能自动覆盖或删除原始文件。

容量基线：16 kHz × 1 声道 × 16 bit = 32,000 字节/秒，约 115.2 MB/小时、921.6 MB/8 小时（十进制，不含封装与加密开销）。这是参数算术，不是真机测量。低码率压缩可用于派生副本；若用户选择保留无损原始采集，不可为了节省空间静默替换为有损文件。

## 4. 状态机与事件协议

```text
idle -> requesting_permission -> starting -> recording
recording <-> paused
recording / paused -> stopping -> completed
starting / recording / paused / stopping -> interrupted / failed
interrupted -> 用户明确恢复 -> starting（保留时间缺口）
```

扩展事件建议：`permission-required`、`started`、`level`、`chunk-finalized`、`paused`、`resumed`、`route-changed`、`interrupted`、`storage-low`、`stopped`、`error`。所有事件包含单调时间、会话 ID 与序号；音频分片事件额外包含实际帧区间。前端不能仅凭计时器自行断言后台采集正常。

适配器应提供能力检测和显式错误，例如 `unsupported-platform`、`permission-denied`、`start-not-allowed`、`audio-device-lost`、`storage-full`、`write-failed`。模型服务断网只暂停处理队列，不中断已经获得权限的本机采集。

## 5. 真机验证矩阵

建议覆盖一台接近原生系统设备、至少两家目标 OEM、一台低内存设备；覆盖目标最低版本、Android 14、15 及当前目标版本。每项记录 OS/安全补丁、targetSdk、机型、构建号与电池健康情况，不能只写“Android 已测试”。

| 测试 | 操作 | 验收与记录 |
| --- | --- | --- |
| 首次授权 | 允许、拒绝、仅本次、再次撤回 | 状态与系统一致；拒绝后不写假音频 |
| 启动条件 | 可见界面开始；后台开始；开机事件 | 允许路径可录；受限路径明确失败，不尝试绕过 |
| 锁屏 | 前台开始后锁屏 30 分钟、2 小时、8 小时 | 帧计数、时长、清单连续性、真实播放核对 |
| 应用切换 | 多次切换应用、回到前台 | 采集服务与 UI 正确重连，状态不丢失 |
| 系统干预 | 低电量、节电、内存压力、系统回收 | 分片可恢复；中断有记录与用户提示 |
| 用户强制停止 | 系统设置强停/撤销权限 | 立即遵守，不能自动偷偷恢复 |
| 麦克风冲突 | 来电、语音通话、其他录音应用 | 正确记录中断/静音/路由异常，不伪称录下通话 |
| 输入路由 | 有线耳机、蓝牙、断开及重连 | 实际路由记录、格式变化处理、异常缺口可见 |
| 空间不足 | 接近阈值、写满磁盘、写入失败 | 预警、关闭当前分片、安全停止；已有资产完好 |
| 崩溃与重启 | 写入中结束进程，再启动 | 可恢复已写分片；不凭空补齐未录内容 |
| 无网络 | 录音中断网、重连 | 采集不丢；转写队列可恢复且不重复入库 |
| 时间变化 | 手工改时间、跨时区 | 采样轴不回退；日历显示与时区一致 |
| 导出与校验 | 导出整场及所有分片 | 时长/帧数/校验一致，可用独立播放器打开 |

## 6. 电量、热量与音质测量

至少进行三组对照：相同设备待机、仅采集、采集加本地模型；每组重复运行，屏幕、网络、环境温度、电池起始区间尽量一致。

记录每小时电量变化、平均/峰值温度、CPU、内存、磁盘吞吐、读写延迟分位、丢帧、录音音量与路由。以设备实际可获得的数据为准，使用 Android Studio Profiler / 系统诊断工具；不能把推算的 PCM 数据率称为功耗数据。

初步目标（需要产品和设备实验校准）：

- 8 小时会话有完整清单，所有已封存分片可校验与解码。
- 静音与真实信号在波形/能量上可区分，避免“计时正常但文件全静音”。
- 无未解释的时间缺口；若系统造成缺口，准确报告发生时间与原因。
- 仅采集的额外耗电先以 < 3% 电池/小时作为探索目标，记录相对待机增量；这不是承诺，也不能跨设备泛化。
- 内存随录制时长保持有界；磁盘队列在正常存储性能下不会持续积压。

音质集建议：安静一对一、空调噪声、户外风噪、课堂远场、4 人会议、重叠说话、中英混杂和方言。每段有知情参与者及人工参考转写；建立 CER、说话人错误率、时间定位误差等评测，模型成绩与采集可靠性分别报告。

## 7. 接入 ASR 与说话人分离

采集证明完成后，再把完成分片交给受限服务；流式初稿与离线校订分开存版本。FunASR 的流式模型和离线模型不能随意互换，pyannote 的说话人标签也不是人物身份。[FunASR 官方项目](https://github.com/modelscope/FunASR)、[pyannote.audio 官方项目](https://github.com/pyannote/pyannote-audio)

服务端接口需有鉴权、最大音频长度、采样格式校验、任务取消、超时、幂等键和版本记录。密钥只保存在后端。尚未授予上传同意时，只排本地任务，不能为了“自动处理”发送音频。

## 8. 验证报告模板

```text
构建/提交：
设备/OS/targetSdk：
采集参数/输入路由：
启动路径及授权：
预期时长/实际帧数/实际时长：
完成分片数/恢复分片数/校验失败数：
时间缺口及原因：
待机耗电/采集耗电/模型耗电：
温度/峰值内存/磁盘队列：
异常操作与结果：
导出文件独立解码结果：
结论：通过 / 有条件通过 / 未通过
附件：日志、分片清单、测量截图（不含参与者隐私正文）
```

只有这类真实报告及相应构建存在，才可在产品中标注“已验证 Android 后台录音”。当前版本应始终标注“模拟录音”。
