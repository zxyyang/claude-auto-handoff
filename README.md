# claude-auto-handoff

> Claude Code 自动记忆保护插件 — 让长会话再也不丢上下文

Claude Code 内置的 auto-compact 会在上下文接近容量时自动压缩，但压缩后的摘要质量有限，重要上下文经常丢失。

**claude-auto-handoff** 在压缩前自动保存高质量记忆，压缩后自动恢复。全程无感知，记忆质量远超内置摘要。

## 它解决什么问题？

在 Claude Code 长会话中，你可能遇到过：

- 🧠 compact 后 Claude 忘了之前讨论的架构决策
- 🔄 反复解释同样的项目约定和踩过的坑
- 📝 手动写交接文档太麻烦，经常忘记
- 💥 上下文爆满导致会话崩溃，所有进度丢失

这个插件让这些问题彻底消失。

## 工作原理

```
0%          55%(保存点)     ~78%(auto-compact)     100%
|______________|_________________|___________________|
               ↑                 ↑                   ↑
          ① 后台保存记忆    ② compact 前再保存    ③ 崩溃点
               │                 │
               │            ③ compact 后自动恢复记忆
               │
          状态栏显示 💾 → /compact
```

### 三层防护

| 层级 | 触发时机 | 做什么 |
|------|---------|--------|
| **PostToolUse / UserPromptSubmit** | 上下文达到保存点 | 后台 agent 异步写入记忆文件，不阻塞你的工作 |
| **PreCompact** | compact 执行前（最后防线） | 无条件保存一次记忆 |
| **SessionStart** | compact 完成后 | 自动检测并恢复记忆，无需任何操作 |

### 记忆文件包含什么？

- 当前任务和进度
- 架构发现、代码约定、踩过的坑
- 已完成的工作和关键决策
- 下一步待办（具体可执行的步骤）

比 auto-compact 的内置摘要详细得多，恢复后 Claude 能无缝继续工作。

## 安装

```bash
curl -sL https://raw.githubusercontent.com/zxyyang/claude-auto-handoff/main/install.sh | bash
```

安装后重启 Claude Code 生效。

<details>
<summary>手动安装</summary>

```bash
git clone https://github.com/zxyyang/claude-auto-handoff.git \
  ~/.claude/plugins/cache/claude-auto-handoff/claude-auto-handoff/1.0.0
```

然后在 `~/.claude/settings.local.json` 中启用插件。

</details>

## 状态栏

插件在 Claude Code 状态栏实时显示记忆保护状态：

```
██░░░░░░░░ 35%/70%                    ← 正常，绿色
██████░░░░ 52%/70%  ⚠️ 接近保存点      ← 橙色警告
███████░░░ 68%/70%  💾 记忆已保存 → /compact  ← 青色，提示压缩
██████████ 95%/70%  🔴 超阈值          ← 红色
```

## 命令

| 命令 | 说明 |
|------|------|
| `/handoff` | 手动创建交接文档 |
| `/handoff-resume` | 从交接文档恢复上下文 |
| `/handoff-mode` | 切换自动↔手动模式 |
| `/handoff-config <值>` | 修改阈值，如 `70%`、`180k`、`off` |
| `/handoff-status` | 查看当前配置和状态 |

## 配置

默认配置开箱即用，无需修改：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| 模式 | `auto` | 自动保存记忆（可切换为 `manual`） |
| 阈值 | `70%` | 上下文使用超过 70% 时触发 |
| 保存点 | 阈值 - 15pp | 百分比模式：70% → 55% 时保存 |
| 冷却 | 5 分钟 | 触发后 5 分钟内不重复 |

### 阈值格式

- **百分比**：`70%`、`80%` — 基于 context window 已用百分比
- **绝对值**：`180k`、`120k` — 基于实际 token 数（适合精确控制）

```bash
# 示例
/handoff-config 80%     # 上下文用到 80% 时触发
/handoff-config 150k    # 用到 150K tokens 时触发
/handoff-config off     # 关闭自动保护
```

## 记忆隔离

每个项目、每个会话的记忆文件完全独立，多开不冲突：

```
项目A/.claude/auto-handoff-memory-a8c49974.md  ← 会话 1
项目A/.claude/auto-handoff-memory-b3f21e05.md  ← 会话 2
项目B/.claude/auto-handoff-memory-c7d88a12.md  ← 另一个项目
```

## 技术架构

```
┌─────────────────────────────────────────────────┐
│                  Claude Code                     │
│                                                  │
│  PostToolUse ──→ 达到保存点？──→ 后台 agent      │
│  UserPromptSubmit ──→ 同上       异步写记忆文件   │
│                                                  │
│  PreCompact ──→ 无条件保存（最后防线）            │
│                                                  │
│  SessionStart ──→ 检测 saved 状态                │
│                  ──→ 读取记忆文件                 │
│                  ──→ 注入上下文恢复               │
│                                                  │
│  Statusline ──→ 实时显示进度 + 状态              │
│               ──→ 写入 token 数据供 hook 读取     │
└─────────────────────────────────────────────────┘
```

### 文件结构

```
claude-auto-handoff/
├── hooks/
│   ├── hooks.json            # Hook 配置
│   ├── post-tool-use.js      # 工具调用后检测
│   ├── user-prompt-submit.js # 用户消息时检测
│   ├── pre-compact.js        # compact 前保存（最后防线）
│   ├── session-start.js      # 会话启动/compact 后恢复
│   └── stop.js               # 空操作
├── scripts/
│   └── lib.js                # 共享工具库（零外部依赖）
├── commands/                 # 5 个 slash 命令
├── skills/
│   └── auto-handoff/SKILL.md # Skill 定义
├── install.sh                # 一键安装脚本
└── README.md
```

## 与内置 auto-compact 的区别

| | 内置 auto-compact | claude-auto-handoff |
|---|---|---|
| 触发时机 | ~78% 固定 | 用户可配置（百分比或绝对值） |
| 摘要质量 | 通用摘要，经常丢失关键细节 | 结构化记忆：任务、架构、决策、待办 |
| 恢复方式 | 自动但质量有限 | 自动恢复高质量记忆 |
| 用户感知 | 无 | 状态栏实时显示，完全不打断工作 |
| 崩溃保护 | 无 | PreCompact 最后防线 |

## 常见问题

**Q: 安装后没有效果？**
A: 插件 hooks 需要重启 Claude Code 才加载。确认重启后查看状态栏是否显示进度条。

**Q: 记忆文件存在哪里？**
A: `{项目目录}/.claude/auto-handoff-memory-{sessionId}.md`，建议加入 `.gitignore`。

**Q: 会影响性能吗？**
A: 不会。记忆保存通过后台 agent 异步执行，不阻塞你的正常工作。

**Q: 支持哪些模型？**
A: 支持所有 Claude Code 支持的模型，自动适配不同的 context window 大小。

## 许可证

MIT

## Star History

如果这个插件帮到了你，给个 ⭐ 吧！

[![Star History Chart](https://api.star-history.com/svg?repos=zxyyang/claude-auto-handoff&type=Date)](https://star-history.com/#zxyyang/claude-auto-handoff&Date)
