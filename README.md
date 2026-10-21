# ModelInspector - 纯前端单页面 AI 模型能力检测平台

OpenAI 兼容接口模型能力检测工具，**100% 纯前端浏览器直接运行（纯静态单页面应用）**，已完全本地化所有静态依赖（JS/CSS/字体/图标全部离线可用，无需担心 CDN 失效或网络受限），无需任何后端服务（无需 Node.js / Python / 任何构建与编译），直接在浏览器双击打开 [`index.html`](file:///D:/dev/web_projects/model_check/index.html) 即可使用。

---

## ⚡ 核心能力与升级特性

1. **📦 静态资源完全本地化 (100% Offline-Ready)**：
   - 使用 `image/favicon.png` 作为网站标准 Favicon 与导航栏品牌图标。
   - 所有依赖的 JS 库（`Tailwind CSS`、`Vue 3`、`Canvas Confetti`）已全部下载至本地 `js/` 目录。
   - 依赖的英文字体（`Plus Jakarta Sans` 与 `JetBrains Mono`）及 WOFF2 字体包已全部本地化至 `fonts/` 与 `css/fonts.css`，彻底解除对外部 Google Fonts 与公共 CDN 的依赖。
2. **🧠 思考输出解析与展示 (Reasoning / Thinking)**：
   - 全面兼容支持推理模型（如 DeepSeek-R1、OpenAI o1/o3-mini 系列、Claude 3.7 Sonnet 思考模式等）。
   - 请求体始终显式携带 `stream` 字段，默认 `false`；可在左栏开启「流式返回」，开启后为 `stream: true` 并按 SSE 增量还原完整思考链。
   - 请求显式携带 `reasoning_effort`（左栏可选择 high / medium / low，默认 **high**）。
   - 自动提取 `reasoning_content`、`reasoning`、`thought` 字段以及正文中内嵌的 `<think>...</think>` 思考标签。
   - 判定严格：字段为 `null`/空串/纯空白视为未返回；仅有 `reasoning_tokens` 计数而无思考文本也不算支持。
   - 思考链与最终回答自动分离展示，支持一键折叠/展开、字数统计，并在基础对话测试与报文抓包中实时可查。
3. **🚴 鹈鹕骑单车测试检测 (Pelican Riding a Bicycle Benchmark)**：
   - 针对大模型代码生成与 SVG/HTML 复杂动画能力的经典高难度基准测试。
   - 发送基准测试提示词：`生成一个svg动画：鹈鹕骑自行车，用H5给我展示下`（支持用户在面板中自定义编辑提示词）。
   - 自动检测并提取模型返回中的 ````html / ````xml / `<svg>` 代码段，严格校验是否包含完整 SVG 元素与 CSS/SMIL 动画。
4. **🎨 鹈鹕测试 HTML/SVG 动画实时渲染沙箱 (Live Sandbox Modal)**：
   - 内置安全沙箱 `iframe` 容器，直接在页面中**即时渲染运行**模型返回的 HTML/SVG 动画。
   - **多模型对比切换**：已测试模型一键切换查看不同模型生成的鹈鹕单车动画效果。
   - **实时代码编辑/黏贴**：支持在线编辑或粘贴任意 HTML/SVG 源码并即时重新渲染。
   - **画布背景切换**：支持深色背景、浅色背景、透明棋盘格背景一键切换。
   - **多端视口模拟**：支持桌面端比例、移动端比例、全屏模式自由缩放切换。
   - **动画重放与导出**：支持一键重新播放动画、在新标签页打开独立全屏预览、一键导出下载 `.html` 文件。
5. **🔍 完整请求参数与返回报文抓包查看 (Full Traffic Inspector)**：
   - 覆盖**基础对话 (Chat)**、**视觉能力 (Vision)**、**工具调用 (Tools)**、**思考输出 (Thinking)**、**鹈鹕骑单车 (Pelican)** 的全流程抓包。
   - 包含请求 URL、Headers、Payload Body 与服务端原始返回。
   - **多种视图一键切换**：支持「⫤⊨ 并排分栏 (Split View)」、「📤 完整请求 (Request)」、「📥 完整返回 (Response)」、「💻 命令行 cURL」。
   - **API Key 脱敏/明文切换**：支持在查看请求时自由切换 Key 的脱敏显示或明文复制。
   - **一键快捷复制**：支持分别复制请求 JSON、返回 JSON、终端 cURL 命令行，便于在 Terminal / Postman 中复现。
6. **🎯 待检测目标模型多选批量测试 (Multi-Select & Batch)**：
   - 支持**多模型多选/勾选**，随心挑选一个或多个想要测试的模型。
   - 提供「**全选当前筛选**」、「**反选**」、「**清空**」一键快捷操作。
   - 支持**手动添加任意自定义模型 ID** 进勾选列表。
   - 一键执行「**开始检测已选模型 (共 X 个)**」，多选自动开启流水线批量测试，并带实时进度条与随时中断支持。
7. **🔄 刷新页面 & 点击均自动刷新**：
   - 每次刷新页面或点击刷新按钮，均会实时发起网络请求，同步服务端的最新模型列表。
8. **📊 表格与卡片指标点击直达**：
   - 在结果列表中点击任意指标（基础对话、视觉能力、工具调用、思考输出、鹈鹕骑车），均可直接弹出并定位到该测试项的完整报文详情或渲染沙箱。

---

## 📁 项目目录结构

```text
model_check/
├── index.html        # 核心主页面（零后台、纯静态直接双击运行）
├── README.md         # 项目说明文档
├── image/
│   └── favicon.png   # 站点 Favicon 与 Logo 图标
├── css/
│   └── fonts.css     # 本地字体样式定义
├── fonts/            # 本地 WOFF2 字体文件库（无需外网加载 Google Fonts）
└── js/               # 本地第三方依赖库
    ├── tailwindcss.js          # Tailwind CSS 浏览器运行时
    ├── vue.global.prod.min.js   # Vue 3 核心生产构建
    └── confetti.browser.min.js  # 庆祝礼花动效
```

---

## 💡 深度严格判定原理

- **动态拉取模型**：`GET {BaseURL}/models`，自动解析 `data[].id` 或数组格式。
- **思考输出 (Thinking)**：向 `/chat/completions` 发送高难度推理问题，携带 `reasoning_effort`（默认 high），严格提取 `reasoning_content` 及 `<think>` 标签，统计思考过程长度。
- **全局 Token 长度与鹈鹕单车**：所有请求默认设置 `max_tokens=65536`（64K，可在左栏设置 0-n，设为 0 时不传），避免思考链或长 SVG/H5 代码被截断导致误判。
- **请求参数**：默认携带 `max_tokens=65536`（64K），只发送核心参数（`model`、`messages`，按维度补充 `stream`/`tools`/`reasoning_effort`），不发送 `temperature`、`top_p` 等采样参数。
- **流式兼容**：返回 SSE 时按 `data:` 增量合并后再判定；中转站忽略 `stream` 返回 JSON 时同样可解析。
- **并发调度**：任务按「模型 × 检测维度」拆入任务池，并发数默认 1（串行），可调大；设为 5 时单模型的 5 个维度会同时发起，多模型时最多同时进行 5 个请求。
- **视觉能力 (Vision)**：向 `/chat/completions` 发送动态 Canvas 绘制的 64x64 高对比纯红底色与中心蓝圆图样，排查过滤 20 余种“无法查看图片”的中转拒答假阳性，模型必须识别出色块真值方可判定支持。
- **工具调用 (Tools)**：向 `/chat/completions` 发送标准 `tools` 函数定义，深入解析服务端返回的 `tool_calls` 结构体及参数有效性，严格区分“原生结构化支持”、“仅文本模拟”与“不支持”。
- **鹈鹕骑单车 (Pelican)**：向 `/chat/completions` 发送 SVG 动画生成指令，严格分析返回文本中是否包含有效的 SVG 标签及动画关键帧，并提供一键渲染沙箱。

---

## 🚀 运行方式

无需安装任何环境，无需启动任何服务器：
直接在浏览器双击打开 [`index.html`](file:///D:/dev/web_projects/model_check/index.html) 即可使用！
