# claude-auto-handoff

自动上下文交接插件 — 解决 Claude Code 长会话记忆丢失问题。

## 功能

- **自动检测**：监控上下文使用量，接近阈值时自动触发交接
- **无感交接**：Claude 自动创建交接文档、保存关键记忆，用户只看到结果
- **一键恢复**：新会话中输入 `/handoff-resume` 即可无缝继续
- **状态栏**：实时显示 `交接:自动 45%/180K ✅可用`
- **灵活阈值**：支持绝对值（`180k`）和百分比（`80%`）
- **模式切换**：支持自动/手动模式，命令一键切换
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
| `/handoff-mode` | 切换自动↔手动模式 |
| `/handoff-config <180k\|120k\|80%\|off>` | 修改触发阈值 |
| `/handoff-status` | 查看当前配置和状态 |

## 状态栏

```
交接:自动 45%/180K ✅可用      ← 正常工作
交接:自动 78%/80% ⚠需交接     ← 接近阈值
交接:自动 85%/180K 🔄交接中   ← 正在保存
交接:手动 30%/180K ✅可用      ← 手动模式
交接:关                        ← 已关闭
```

格式：`交接:[模式] [已用%]/[阈值] [状态]`

阈值支持两种格式：
- 绝对值：`180k`、`120k`、`150k` 等（基于 transcript 文件大小判断）
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
