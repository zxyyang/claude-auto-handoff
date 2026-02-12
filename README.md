# claude-auto-handoff

自动上下文交接插件 — 解决 Claude Code 长会话记忆丢失问题。

## 功能

- **自动检测**：监控上下文使用量，接近阈值时自动触发交接
- **无感交接**：Claude 自动创建交接文档、保存关键记忆，用户只看到结果
- **一键恢复**：新会话中输入 `/handoff-resume` 即可无缝继续
- **状态可见**：状态栏实时显示交接保护状态
- **零依赖**：纯 Node.js 实现，不依赖 Python 或其他外部工具

## 安装

```bash
# 方式 1：通过 marketplace 安装（推荐）
/plugin marketplace add zxyyang/claude-auto-handoff
/plugin install claude-auto-handoff

# 方式 2：手动安装
git clone https://github.com/zxyyang/claude-auto-handoff.git \
  ~/.claude/plugins/cache/claude-auto-handoff/claude-auto-handoff/1.0.0
```

## 命令

| 命令 | 说明 |
|------|------|
| `/handoff` | 手动创建交接文档 |
| `/handoff-resume` | 从交接文档恢复上下文 |
| `/handoff-config <180k\|120k\|off>` | 修改触发阈值 |
| `/handoff-status` | 查看当前配置和状态 |

## 工作原理

```
正常工作 → Stop hook 静默检测 transcript 大小
         → 未超阈值：无感，继续工作
         → 超阈值：自动创建交接文档 → 保存记忆 → 提示用户
         → PreCompact：compact 前兜底触发（最后防线）
```

## 默认配置

- 阈值：180K tokens（约 1.5MB transcript）
- 冷却：触发后 5 分钟内不重复
- 存储：`.claude/handoffs/` 目录

## 许可证

MIT
