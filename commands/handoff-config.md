---
description: 修改自动交接阈值设置
argument-hint: <180k|120k|off>
allowed-tools: [Bash]
---

# 修改交接阈值

修改本次会话的自动交接触发阈值。

## 参数说明

- `180k` — 在约 180K tokens 时触发（默认，推荐）
- `120k` — 在约 120K tokens 时触发（保守，适合复杂任务）
- `off` / `关闭` — 关闭本次会话的自动交接

## 执行

根据用户输入的参数执行对应命令：

- 180k: `echo '{"enabled":true,"threshold":1.5}' > ~/.claude/cache/auto-handoff-config.json`
- 120k: `echo '{"enabled":true,"threshold":1.0}' > ~/.claude/cache/auto-handoff-config.json`
- off/关闭: `echo '{"enabled":false,"threshold":0}' > ~/.claude/cache/auto-handoff-config.json`

确认修改结果，一行即可。
