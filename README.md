# claude-auto-handoff

> 三层渐进式自动记忆保护 — 让 Claude Code 长会话再也不丢上下文

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Claude Code 内置的 auto-compact 会在上下文接近容量时自动压缩，但压缩后的摘要质量有限，重要上下文经常丢失。

**claude-auto-handoff** 采用三层渐进式记忆架构（参考 [claude-mem](https://github.com/thedotmack/claude-mem)），在压缩前自动保存高质量记忆，压缩后自动恢复。全程零感知，记忆质量远超内置摘要。

## 它解决什么问题？

- 🧠 compact 后 Claude 忘了之前讨论的架构决策
- 🔄 反复解释同样的项目约定和踩过的坑
- 📝 手动写交接文档太麻烦，经常忘记
- 💥 上下文爆满导致会话崩溃，所有进度丢失

## 安装

### 方式一：Claude Code 原生安装（推荐）

在 Claude Code 中依次输入：

```
/plugin marketplace add zxyyang/claude-auto-handoff
/plugin install claude-auto-handoff
```

### 方式二：一键脚本安装

```bash
curl -sL https://raw.githubusercontent.com/zxyyang/claude-auto-handoff/main/install.sh | bash
```

安装后重启 Claude Code 即可生效，零配置开箱即用。

## 核心特性

### 三层渐进式记忆架构（Progressive Disclosure）

| 层级 | 文件 | 用途 | 大小 | 触发方式 |
|------|------|------|------|---------|
| **Layer 1** | `memory-{id}.md` | 精华摘要 | ~200 行 | compact 后自动注入 |
| **Layer 2** | `memory-{id}-full.md` | 完整详细记忆（8 段结构） | 按预算动态计算 | 按需 Read |
| **Layer 3** | `obs-{id}.jsonl` | 原始操作日志 | 每次工具调用自动追加 | 按需 Read |

**记忆预算公式**：`min(阈值 tokens, 模型总量) × 40%`

例如 1M context / 70% 阈值 → Layer 2 预算 280K tokens，足够保存极其详细的会话记忆。

### 工作时间线

```
0%          55%(保存点)     ~78%(auto-compact)     100%
|______________|_________________|___________________|
               ↑                 ↑                   ↑
          ① 后台保存记忆    ② compact 前再保存    ③ 崩溃点
               │                 │
               │            ③ compact 后自动恢复
               │                 ├─ 注入 Layer 1（精华摘要）
               │                 └─ 告知 Layer 2/3 路径（按需深度恢复）
               │
          状态栏显示 💾 → /compact
```

### Layer 2: 完整记忆（8 段结构）

后台 agent 自动写入，包含：

1. **当前任务和进度** — 在做什么、停在哪里、为什么停
2. **关键上下文 — 架构和约定** — 目录结构、设计模式、业务逻辑（最关键）
3. **已完成的工作** — 文件路径:行号 + 代码 diff + 原因
4. **关键决策和原因** — 考虑的方案 + 选择原因 + 推翻影响
5. **失败的尝试和踩坑** — 完整错误信息 + 根因 + 解决方式
6. **关键代码片段和接口** — 直接贴代码块
7. **当前状态** — 能用的 + 有问题的 + 测试状态
8. **恢复指令** — 具体到文件:行号的操作步骤

### Layer 3: 操作日志（自动捕获）

每次工具调用自动记录到 JSONL 文件：

```jsonl
{"ts":1708000000,"tool":"Edit","input":"file.js:42...","output":"success..."}
{"ts":1708000001,"tool":"Bash","input":"npm test...","output":"PASS..."}
```

恢复时 agent 可读取完整操作历史，精确还原会话上下文。

## 恢复流程

```
compact 完成
    ↓
SessionStart hook 检测 state.status === 'saved'
    ↓
自动注入 Layer 1 精华摘要（零额外工具调用）
    ↓
告知 Layer 2 / Layer 3 文件路径
    ↓
Claude 需要细节时自行 Read 对应文件
    ↓
无缝继续工作，用户无感知
```

## 状态栏

插件在 Claude Code 状态栏实时显示记忆保护状态：

```
██░░░░░░░░ 35%/70%                    ← 正常（绿色）
██████░░░░ 52%/70%  ⚠️ 接近保存点      ← 警告（橙色）
███████░░░ 68%/70%  💾 记忆已保存 → /compact  ← 已保存（青色）
██████████ 95%/70%  🔴 超阈值          ← 危险（红色）
```

## 命令

| 命令 | 说明 |
|------|------|
| `/handoff` | 手动创建交接文档 |
| `/handoff-resume` | 从交接文档恢复上下文 |
| `/handoff-mode` | 切换自动↔手动模式 |
| `/handoff-config <值>` | 修改阈值，如 `70%`、`180k`、`off` |
| `/handoff-status` | 查看当前配置和状态 |
| `/handoff-update` | 一键更新到最新版本 |

## 配置

默认配置开箱即用，无需修改：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| 模式 | `auto` | 自动保存记忆（可切换为 `manual`） |
| 阈值 | `70%` | 上下文使用超过 70% 时触发保存 |
| 保存点 | 阈值 - 15pp | 百分比模式：70% → 55% 时开始保存 |
| 记忆预算 | 基准 × 40% | 基准 = min(阈值 tokens, 模型总量) |
| 冷却 | 5 分钟 | 触发后 5 分钟内不重复 |

### 阈值格式

- **百分比**：`70%`、`80%` — 基于 context window 已用百分比
- **绝对值**：`180k`、`120k` — 基于实际 token 数（适合精确控制）

```bash
/handoff-config 80%     # 上下文用到 80% 时触发
/handoff-config 150k    # 用到 150K tokens 时触发
/handoff-config off     # 关闭自动保护
```

## 记忆隔离

每个项目、每个会话的记忆文件完全独立，多开不冲突：

```
项目A/.claude/
├── auto-handoff-memory-a8c49974.md       ← 会话 1 Layer 1（精华摘要）
├── auto-handoff-memory-a8c49974-full.md  ← 会话 1 Layer 2（完整记忆）
├── auto-handoff-obs-a8c49974.jsonl       ← 会话 1 Layer 3（操作日志）
├── auto-handoff-memory-b3f21e05.md       ← 会话 2 Layer 1
├── auto-handoff-memory-b3f21e05-full.md  ← 会话 2 Layer 2
└── auto-handoff-obs-b3f21e05.jsonl       ← 会话 2 Layer 3

项目B/.claude/
└── auto-handoff-memory-c7d88a12.md       ← 另一个项目，完全隔离
```

建议将 `.claude/auto-handoff-*` 加入 `.gitignore`。

## 技术架构

```
┌──────────────────────────────────────────────────────────┐
│                      Claude Code                          │
│                                                           │
│  PostToolUse ──→ 每次工具调用自动捕获 observation (L3)    │
│               ──→ 达到保存点？──→ 后台 agent 写 L1 + L2  │
│                                                           │
│  UserPromptSubmit ──→ 补充阈值检测（纯对话场景）          │
│                                                           │
│  PreCompact ──→ 无条件保存记忆（最后防线）                │
│                                                           │
│  SessionStart ──→ 检测 saved 状态                         │
│               ──→ 注入 Layer 1 精华摘要                   │
│               ──→ 告知 Layer 2/3 路径供按需读取           │
│                                                           │
│  Statusline ──→ █░ 进度条 + 状态文字                      │
└──────────────────────────────────────────────────────────┘
```

### 写入原则（参考 claude-mem）

1. **提取原始数据** — 贴实际代码而非"修改了代码"，贴完整错误信息而非"遇到了错误"
2. **保留因果链** — "因为 X 所以做了 Y，导致 Z"
3. **保留用户原始指令和反馈**
4. **文件操作记录路径和关键内容**

### 文件结构

```
claude-auto-handoff/
├── .claude-plugin/
│   ├── plugin.json            # 插件清单
│   └── marketplace.json       # Marketplace 元数据
├── hooks/
│   ├── hooks.json             # Hook 配置（5 个生命周期钩子）
│   ├── post-tool-use.js       # 工具调用后：捕获 observation + 阈值检测
│   ├── user-prompt-submit.js  # 用户消息时：补充阈值检测（纯对话场景）
│   ├── pre-compact.js         # compact 前：无条件保存（最后防线）
│   ├── session-start.js       # 会话启动/compact 后：三层渐进式恢复
│   └── stop.js                # 空操作
├── scripts/
│   └── lib.js                 # 共享工具库（零外部依赖，纯 Node.js）
├── commands/
│   ├── handoff.md             # /handoff — 手动创建交接文档
│   ├── handoff-resume.md      # /handoff-resume — 恢复上下文
│   ├── handoff-mode.md        # /handoff-mode — 切换 auto↔manual
│   ├── handoff-config.md      # /handoff-config — 修改阈值
│   └── handoff-status.md      # /handoff-status — 查看状态
├── skills/
│   └── auto-handoff/SKILL.md  # Skill 定义（三层架构规范）
├── install.sh                 # 一键安装脚本
└── README.md
```

## 与内置 auto-compact 的对比

| | 内置 auto-compact | claude-auto-handoff |
|---|---|---|
| 记忆架构 | 单层通用摘要 | 三层渐进式（摘要 + 完整记忆 + 操作日志） |
| 记忆质量 | 经常丢失关键细节 | 8 段结构化记忆，贴代码贴错误信息 |
| 记忆预算 | 固定 | 动态计算：min(阈值, 模型总量) × 40% |
| 触发时机 | ~78% 固定 | 用户可配置（百分比或绝对值） |
| 恢复方式 | 自动但质量有限 | Layer 1 自动注入 + Layer 2/3 按需深度恢复 |
| 操作日志 | 无 | 每次工具调用自动捕获（JSONL） |
| 用户感知 | 无 | 状态栏实时显示进度 |
| 崩溃保护 | 无 | PreCompact 最后防线 |
| 会话隔离 | 无 | 每项目每会话独立记忆文件 |

## 常见问题

<details>
<summary><b>安装后没有效果？</b></summary>

插件 hooks 需要重启 Claude Code 才加载。重启后查看状态栏是否显示 `██░░░░░░░░` 进度条。

如果使用原生安装（`/plugin install`），确认插件已启用：`/plugin list`。
</details>

<details>
<summary><b>记忆文件存在哪里？</b></summary>

```
{项目目录}/.claude/auto-handoff-memory-{sessionId前8位}.md       # Layer 1
{项目目录}/.claude/auto-handoff-memory-{sessionId前8位}-full.md  # Layer 2
{项目目录}/.claude/auto-handoff-obs-{sessionId前8位}.jsonl       # Layer 3
```

建议在 `.gitignore` 中添加：
```
.claude/auto-handoff-*
```
</details>

<details>
<summary><b>会影响性能吗？</b></summary>

不会。Layer 3 操作日志是同步追加（单行 JSONL，微秒级）。Layer 1/2 记忆保存通过后台 agent 异步执行，不阻塞你的正常工作。
</details>

<details>
<summary><b>支持哪些模型？</b></summary>

支持所有 Claude Code 支持的模型。记忆预算根据模型的 context window 大小自动适配。
</details>

<details>
<summary><b>和 claude-mem 有什么区别？</b></summary>

claude-mem 使用 SQLite + Chroma 向量数据库，功能更强大但依赖更多。claude-auto-handoff 是零外部依赖的轻量实现，纯 Node.js，借鉴了 claude-mem 的三层渐进式架构思想，用 Markdown + JSONL 文件替代数据库。
</details>

<details>
<summary><b>多个会话同时打开会冲突吗？</b></summary>

不会。每个会话有独立的 sessionId，记忆文件路径包含 sessionId 前 8 位，完全隔离。
</details>

## 许可证

MIT

## Star History

如果这个插件帮到了你，给个 ⭐ 吧！

[![Star History Chart](https://api.star-history.com/svg?repos=zxyyang/claude-auto-handoff&type=Date)](https://star-history.com/#zxyyang/claude-auto-handoff&Date)
