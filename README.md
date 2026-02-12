# claude-auto-handoff

自动上下文交接插件 — 解决 Claude Code 长会话记忆丢失问题。

## 功能

- **自动检测**：监控上下文使用量，接近阈值时自动触发交接
- **无感交接**：Claude 自动创建交接文档、保存关键记忆，用户只看到结果
- **一键恢复**：新会话中输入 `/handoff-resume` 即可无缝继续
- **状态栏**：实时显示 `claude-auto-handoff 自动 145K/180K 无需交接`
- **灵活阈值**：支持绝对值（`180k`）和百分比（`80%`）
- **模式切换**：支持自动/手动模式，命令一键切换
- **零依赖**：纯 Node.js 实现，不依赖 Python 或其他外部工具

## 安装

```bash
# 一键安装（推荐）
curl -sL https://raw.githubusercontent.com/zxyyang/claude-auto-handoff/main/install.sh | bash

# 或手动安装
git clone https://github.com/zxyyang/claude-auto-handoff.git \
  ~/.claude/plugins/cache/claude-auto-handoff/claude-auto-handoff/1.0.0
```

安装后重启 Claude Code 生效。

## 命令

| 命令 | 说明 |
|------|------|
| `/handoff` | 手动创建交接文档 |
| `/handoff-resume` | 从交接文档恢复上下文 |
| `/handoff-mode` | 切换自动↔手动模式 |
| `/handoff-config <180k\|120k\|80%\|off>` | 修改触发阈值 |
| `/handoff-status` | 查看当前配置和状态 |

## 状态栏

```
claude-auto-handoff 自动 120K/180K 无需交接      ← 正常工作
claude-auto-handoff 自动 160K/180K ⚠️等待交接    ← 接近阈值
claude-auto-handoff 自动 180K/180K 🔄交接中..    ← 正在保存
claude-auto-handoff 自动 180K/180K ❌交接失败     ← Claude 未执行
claude-auto-handoff 自动 12%/80% 无需交接        ← 百分比模式
claude-auto-handoff 手动 50K/180K 无需交接       ← 手动模式
claude-auto-handoff 关闭                         ← 已关闭
```

格式：`claude-auto-handoff [模式] [当前用量]/[阈值] [状态]`

阈值支持两种格式：
- 绝对值：`180k`、`120k`、`150k` 等（基于实时 token 数）
- 百分比：`80%`、`70%` 等（基于 context window 已用百分比判断）

## 工作原理

```
正常工作 → Stop hook 静默检测上下文用量
         → 未超阈值：无感，继续工作
         → 超阈值(auto模式)：自动创建交接文档 → 保存记忆 → 提示用户
         → 超阈值(manual模式)：仅状态栏显示警告
         → PreCompact：compact 前兜底触发（最后防线）
```

## 默认配置

- 模式：auto（自动）
- 阈值：180k（约 180K tokens）
- 冷却：触发后 5 分钟内不重复
- 存储：`.claude/handoffs/` 目录

## 许可证

MIT
