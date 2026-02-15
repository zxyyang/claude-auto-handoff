---
description: 修改自动交接阈值设置
argument-hint: "[阈值]"
allowed-tools: [Bash, AskUserQuestion]
---

# 修改交接阈值

如果用户没有提供参数，使用 AskUserQuestion 工具让用户选择或输入阈值：

问题：「设置记忆保护触发阈值」
选项：
- `200k` — 在约 200K tokens 时触发（推荐）
- `80%` — 上下文用到 80% 时触发
- `off` — 关闭自动记忆保护

用户也可以选择 Other 输入自定义值，如 `150k`、`60%` 等。

如果用户已提供参数（如 `/handoff-config 80%`），直接使用该值，不再询问。

## 支持的格式

- `70%`、`80%` — 百分比，基于 context window 已用比例
- `180k`、`120k` — 绝对值，基于 token 数
- `off` / `关闭` — 关闭自动保护

## 执行

拿到阈值后，用 Bash 执行：

如果是 `off` 或 `关闭`：
```bash
node -e "const f=require('os').homedir()+'/.claude/cache/auto-handoff-config.json';const c=JSON.parse(require('fs').readFileSync(f,'utf8'));c.enabled=false;require('fs').writeFileSync(f,JSON.stringify(c));console.log('自动记忆保护已关闭')"
```

否则：
```bash
node -e "const f=require('os').homedir()+'/.claude/cache/auto-handoff-config.json';const c=JSON.parse(require('fs').readFileSync(f,'utf8'));c.enabled=true;c.threshold='用户选择的值';require('fs').writeFileSync(f,JSON.stringify(c));console.log('阈值已设为 '+c.threshold)"
```

确认修改结果，一行即可。
