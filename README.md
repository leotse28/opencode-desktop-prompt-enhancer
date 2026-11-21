# opencode-desktop-prompt-enhancer

OpenCode **Desktop** 的 GUI 插件(实验性通道):在会话输入框里把随手写的草稿,用**当前模型**增强成更清晰、更可执行的提示词。

## 用法

- 命令面板(或输入框斜杠菜单)里 `/enhance` —— 或带斜杠参数 `/enhance <draft>`(斜杠参数未接入,当前请把草稿写在输入框里再触发)。
- 行为:读当前草稿(纯文本,提及按 `@text` 读、附件不读)→ 用当前模型生成增强结果 → **只在结果非空成功时**用 `setText` 等位替换草稿。附件保留;**不自动发送**,发送仍由你。
- 空草稿 / 取不到当前模型 / 生成失败 / 结果为空 → Toast 提示,草稿原样不动。生成中命令禁用。

## 要求

- OpenCode Desktop **2.2.6**(桌面端运行时提供 `@opencode/plugin/gui`,类型按 2.2.6 核验过)。
- GUI 插件通道在 2.2 系列仍标为 **experimental**,个别版本间形态可能变;构建/挂载按本机版本。

## 构建与挂载

```sh
npm install       # 装构建依赖
npm run typecheck # 类型核查
npm run build     # 产出 dist/gui-experimental.cjs(单文件 CommonJS,等 vite gui() 预设)
# 改源码后:npm run dev (vite build --watch) —— 按文档,每次重建时 GUI 在各窗口重载
```

把插件目录加进**全局** `~/.config/opencode/opencode.json` 的 `plugins` 数组(Desktop 从全局 config 读 GUI 插件;TUI 插件才走 `cli.json`):

```jsonc
{ "plugins": ["C:/Users/BY/OpencodeProjects/opencode-desktop-prompt-enhancer"] }
```

相对路径按 config 文件所在目录解析,绝对路径直接可用。改动后按文档应自动重载;若命令没出现,重启 Desktop,或 Settings > Extensions > Plugins 里看加载状态/开关/Reload。

## 行为边界(设计取舍)

- **草稿等位替换,但不发送** —— 决定权在用户。
- 只读写**当前路由会话**的 composer;Home / 草稿页 / 子代理会话等无 composer 的情形读不到,如实报错不猜。
- 增强走桌面自带 server 的无状态生成端(`experimental.generate.text`,入参 `{prompt, model}`),模型取 `composer.model()`;这条是 **experimental**,且用的是你配置的模型/额度——成本归属请自觉。
- 未做:git 初始化(目录不在 git 仓库;需要历史/标签请自己加,或告诉我)、自动化测试(无 GUI 自动化面;纯字符串逻辑未单测,诚实标注)、动 Desktop 版本、动既有 `cli.json` 上的 `opencode-prompt-optimizer` 注册。

## 设计记录(ADR-lite)

- 上下文/选项:server 插件 + RPC 暴露增强端点,或者 GUI 直接调无状态生成。
- 选择:GUI-only 插件,Command 触发,直接 `experimental.generate.text`。
- 后果:无 server 面;草稿等位替换但不发送;改源码要重建(watch 可重载);API experimental、版本耦定;改模型失败反馈方式等都只在本目录。

## 卸载

`opencode.json` 的 `plugins` 数组删掉本项;删除目录即可(该目录在 `.gitignore` 之外由你决定是否留源码)。

## 状态(诚实模式)

- 已实现并通过 `npm run typecheck` + `npm run build` 的**文件状态**核验;Desktop 内真实渲染/斜杠菜单/Toast/模型调用**未实测**——无 GUI 自动化手段,需人工验收。
- 请确认你的 Desktop 构建在加载本地插件前**没有拒绝第三方 GUI 插件**(设置里看 Extensions > Plugins 状态)。
