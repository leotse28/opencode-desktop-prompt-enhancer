# opencode-desktop-prompt-enhancer

OpenCode **Desktop** 的 GUI 插件(实验性通道):在会话输入框里把随手写的草稿,用**当前模型**增强成更清晰、更可执行的提示词。

## 用法(v0.3.1)

- **增强**:`/enhance` 命令或输入框上方「增强 / Enhance」按钮。
  - 读当前草稿(纯文本,提及按 `@text` 读、附件不读)→ 用当前模型生成增强结果;
  - **全自动替换**:模型返回后**直接写入输入框**,不再弹预览确认框;后悔可用 Toast 上的「撤销」按钮 / 「撤销」pill / `/enhance-undo` 一键恢复原文;
  - **结构化输出**:改写结果固定为四段结构——`## Goal`(目标)/ `## Context`(上下文)/ `## Constraints`(约束)/ `## Output Requirements`(输出要求),便于 AI 高效解析;
  - **会话绑定与送达**:增强全程绑定发起时的会话。若增强期间切走,结果**不会丢弃**,而是暂存绑定原会话;**切回原会话时自动写入输入框**并提示(带撤销按钮);绝不写进别的对话框;撤销同样校验会话;
  - 替换成功后 Toast 带「撤销」按钮,或用 `/enhance-undo` 命令 / 输入框上方「撤销 / Undo」按钮恢复增强前的原文(仅最近一次,插件重载后清空)。
- **语言控制**:输出语言跟随草稿(默认);设置存储里可选中文/英文。
- **错误提示**:增强失败(API 失效/网络错误/格式异常等)时,Toast 会展示具体失败原因(如 `UnexpectedStatus: 502`),不再静默。
- 空草稿 → 引导性提示(非报错);取不到当前模型 / 结果为空 → Toast 提示,草稿原样不动。生成中命令禁用。
- **不自动发送**,发送仍由你。

## 要求

- OpenCode Desktop **2.2.6**(桌面端运行时提供 `@opencode/plugin/gui`,类型按 2.2.6 核验过)。
- GUI 插件通道在 2.2 系列仍标为 **experimental**,个别版本间形态可能变;构建/挂载按本机版本。

## 安装

### 方式一：从 GitHub 直接安装（推荐，含预构建产物）

```sh
opencode plugin add github:leotse28/opencode-desktop-prompt-enhancer
```

或直接写进**全局** `~/.config/opencode/opencode.json`（Desktop 只读这个文件）：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:leotse28/opencode-desktop-prompt-enhancer"]
}
```

> 部分旧版 OpenCode V2 对 `github:` 规格支持不稳定；若安装失败，用方式二。

### 方式二：从源码构建

```sh
git clone https://github.com/leotse28/opencode-desktop-prompt-enhancer.git
cd opencode-desktop-prompt-enhancer
npm install       # 装构建依赖
npm run typecheck # 类型核查
npm run build     # 产出 dist/gui-experimental.cjs(单文件 CommonJS,等 vite gui() 预设)
# 改源码后:npm run dev (vite build --watch) —— 按文档,每次重建时 GUI 在各窗口重载
```

然后把克隆目录的**绝对路径**加进全局 `~/.config/opencode/opencode.json` 的 `plugins` 数组:

```jsonc
{ "plugins": ["C:/Users/BY/OpencodeProjects/opencode-desktop-prompt-enhancer"] }
```

相对路径按 config 文件所在目录解析,绝对路径直接可用。改动后按文档应自动重载;若命令没出现,重启 Desktop,或 Settings > Extensions > Plugins 里看加载状态/开关/Reload。

## 行为边界(设计取舍)

- **草稿等位替换,但不发送** —— 决定权在用户;v0.3.1 起替换全自动(无确认框),撤销是后悔药。
- 只读写**当前路由会话**的 composer;Home / 草稿页 / 子代理会话等无 composer 的情形读不到,如实报错不猜。
- **跨会话送达是内存级**:增强期间切走时结果暂存在插件内存并绑定原会话,切回时自动写入;插件重载/应用重启后暂存清空(此时结果丢失,与撤销栈同策略)。
- 增强走桌面自带 server 的无状态生成端(`experimental.generate.text`,入参 `{prompt, model}`),模型取 `composer.model()`;这条是 **experimental**,且用的是你配置的模型/额度——成本归属请自觉。
- 草稿与生成内容只在内存中使用,不持久化;持久化的只有一项设置(语言选择;预览开关已随全自动替换移除)。
- 未做:多次历史撤销(仅最近一次)、设置界面、切换会话事件的自动增强(宿主无切换事件订阅;当前是"增强结果跨会话送达",不是"切换时自动触发增强")。

## 版本历史

| 版本 | 要点 |
|---|---|
| v0.3.1 | **替换全自动**:移除预览确认框,模型返回直接写入输入框;撤销为后悔药 |
| v0.3.0 | **跨会话送达**:增强期间切走,结果暂存绑定原会话,切回自动写入并提示 |
| v0.2.1 | 移除附加指示;失败 toast 显示具体原因;会话绑定防错误投放;结构化四段输出 |
| v0.2.0 | 撤销增强、附加指示、语言控制、空草稿引导 |
| v0.1.0 | 首版:/enhance 命令 + Enhance 按钮,直替换 |

## 设计记录(ADR-lite)

- 上下文/选项:server 插件 + RPC 暴露增强端点,或者 GUI 直接调无状态生成。
- 选择:GUI-only 插件,Command 触发,直接 `experimental.generate.text`。
- 后果:无 server 面;草稿等位替换但不发送;改源码要重建(watch 可重载);API experimental、版本耦定;改模型失败反馈方式等都只在本目录。

## 卸载

`opencode.json` 的 `plugins` 数组删掉本项;删除目录即可(该目录在 `.gitignore` 之外由你决定是否留源码)。

## 状态(诚实模式)

- v0.3.1:类型检查、构建、单元测试(17 项断言)、i18n key 一致性检查均通过;Desktop 内真实渲染/Toast/模型调用/跨会话送达**未实测**——无 GUI 自动化手段,需人工验收。
- 请确认你的 Desktop 构建在加载本地插件前**没有拒绝第三方 GUI 插件**(设置里看 Extensions > Plugins 状态)。
