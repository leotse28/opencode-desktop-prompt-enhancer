# opencode-desktop-prompt-enhancer

OpenCode **Desktop** 的 GUI 插件(实验性通道):在会话输入框里把随手写的草稿,用**当前模型**增强成更清晰、更可执行的提示词。

## 用法(v0.2.0)

- **增强**:`/enhance` 命令或输入框上方「增强 / Enhance」按钮。
  - 触发后先弹出**附加指示**输入框(可留空、可 Esc 取消,指示只注入改写指令、不会写进草稿);
  - 然后读当前草稿(纯文本,提及按 `@text` 读、附件不读)→ 用当前模型生成增强结果;
  - **默认开启预览确认**:改写结果先弹确认框,你点「替换」才写入草稿,取消则原稿不动(设置可关闭预览,回到 v0.1.0 的直替换行为);
  - 替换成功后 Toast 带「撤销」按钮,或用 `/enhance-undo` 命令 / 输入框上方「撤销 / Undo」按钮恢复增强前的原文(仅最近一次,插件重载后清空)。
- **语言控制**:输出语言跟随草稿(默认);设置存储里可选中文/英文。
- 空草稿 → 引导性提示(非报错);取不到当前模型 / 生成失败 / 结果为空 → Toast 提示,草稿原样不动。生成中命令禁用。
- **不自动发送**,发送仍由你。

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

- **草稿等位替换,但不发送** —— 决定权在用户;替换前有预览确认,替换后有撤销。
- 只读写**当前路由会话**的 composer;Home / 草稿页 / 子代理会话等无 composer 的情形读不到,如实报错不猜。
- 增强走桌面自带 server 的无状态生成端(`experimental.generate.text`,入参 `{prompt, model}`),模型取 `composer.model()`;这条是 **experimental**,且用的是你配置的模型/额度——成本归属请自觉。
- 附加指示与草稿内容只在内存中使用,不持久化;持久化的只有两项设置(预览开关、语言选择)。
- 未做:多次历史撤销(仅最近一次)、预览双栏对照视图(现为原生确认框)、设置界面(设置项由存储默认值控制)。

## 设计记录(ADR-lite)

- 上下文/选项:server 插件 + RPC 暴露增强端点,或者 GUI 直接调无状态生成。
- 选择:GUI-only 插件,Command 触发,直接 `experimental.generate.text`。
- 后果:无 server 面;草稿等位替换但不发送;改源码要重建(watch 可重载);API experimental、版本耦定;改模型失败反馈方式等都只在本目录。

## 卸载

`opencode.json` 的 `plugins` 数组删掉本项;删除目录即可(该目录在 `.gitignore` 之外由你决定是否留源码)。

## 状态(诚实模式)

- v0.2.0:类型检查、构建、buildPrompt 单元测试(11 项断言)、i18n key 一致性检查均通过;Desktop 内真实渲染/对话框/Toast/模型调用**未实测**——无 GUI 自动化手段,需人工验收。
- 请确认你的 Desktop 构建在加载本地插件前**没有拒绝第三方 GUI 插件**(设置里看 Extensions > Plugins 状态)。
