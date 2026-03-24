# Book Reader - 《小而美》读书视频

基于 Remotion 的读书视频生成工具，将《小而美：持续盈利的经营法则》PDF 章节转化为带 AI 配音的竖屏视频。

## 技术栈

| 组件 | 技术 |
|------|------|
| 视频框架 | [Remotion](https://remotion.dev) 4.x |
| 语音合成 | 阿里云 DashScope CosyVoice (`cosyvoice-v3-flash`) |
| 字体 | Google Fonts `Noto Serif SC` |
| 语言 | TypeScript / Python |

## 项目结构

```
book-reader/
├── src/
│   ├── index.ts                    # Remotion 入口
│   ├── Root.tsx                    # Composition 注册
│   ├── data/chapter5.ts            # 章节文本（结构化段落数据）
│   ├── compositions/
│   │   └── BookSegment.tsx         # 主 Composition（calculateMetadata 音频同步）
│   └── components/
│       ├── TitleCard.tsx           # 章节标题过场卡片
│       └── ParagraphDisplay.tsx    # 段落朗读页面（文字 + 音频 + 进度条）
├── public/audio/                   # TTS 生成的 MP3 文件
│   └── seg-01/                     # 每个片段一个目录
│       ├── seg-01-p01.mp3
│       ├── seg-01-p02.mp3
│       └── ...
├── scripts/
│   └── generate-tts.py             # DashScope TTS 生成脚本
├── remotion.config.ts
├── package.json
└── tsconfig.json
```

## 视频规格

| 属性 | 值 |
|------|------|
| 分辨率 | 1080 × 1920 (竖屏 9:16) |
| 帧率 | 30 fps |
| 时长 | 由音频自动计算（`calculateMetadata`） |
| 风格 | 深色书卷感背景，金色装饰线，衬线字体 |

## 快速开始

### 1. 安装依赖

```bash
cd book-reader
npm install
```

### 2. 配置 API Key

确保 `.env` 文件中有 DashScope API Key：

```
DASHSCOPE_API_KEY=sk-xxx
```

或直接在 `scripts/generate-tts.py` 中修改。

### 3. 生成 TTS 音频

```bash
python3.11 scripts/generate-tts.py seg-01
```

脚本会调用 CosyVoice API，为每个段落生成 MP3 文件到 `public/audio/seg-01/`。

- 模型：`cosyvoice-v3-flash`（性价比最高）
- 音色：`longanyang`（沉稳男声）
- 已生成的文件会自动跳过

### 4. 预览

```bash
npm start
```

打开 Remotion Studio 在浏览器中实时预览。

### 5. 渲染导出

```bash
npm run render
```

输出到 `../outputs/chapter5/seg-01.mp4`。

## 内容分段

第五章「通过做自己来营销」分为 6 个视频片段（每段约 5 分钟）：

| 片段 | 内容 | 状态 |
|------|------|------|
| seg-01 | 章节导读 + 受众的力量 + 制造粉丝 | ✅ |
| seg-02 | 极简主义营销漏斗 + 漏斗顶部 | 待补充 |
| seg-03 | 社交媒体如何开始 + 三层内容 | 待补充 |
| seg-04 | 漏斗中部：邮件和社区 | 待补充 |
| seg-05 | 劳拉案例 + 不到最后不花钱 | 待补充 |
| seg-06 | 付费广告 + 漏斗底部 + 关键要点 | 待补充 |

## 工作原理

```
PDF 文本 → data/chapter5.ts（结构化）
                ↓
    generate-tts.py（DashScope CosyVoice）
                ↓
        public/audio/seg-XX/*.mp3
                ↓
    BookSegment.tsx（calculateMetadata 读取音频时长）
                ↓
    Series<Sequence> 按段落顺序播放
                ↓
        remotion render → MP4
```

每个段落对应一个 `<Sequence>`，时长由其 MP3 音频自动决定。`calculateMetadata` 在渲染前测量所有音频时长，动态设置 Composition 总帧数。

## 已知问题

- macOS 12 (Monterey) 上 Remotion 内置的 compositor 二进制文件 (`ffmpeg` / `ffprobe`) 可能因 `_AVCaptureDeviceTypeDeskViewCamera` 符号缺失而崩溃。解决方案：将系统 ffmpeg/ffprobe 复制到 `node_modules/@remotion/compositor-darwin-x64/` 目录下覆盖。
