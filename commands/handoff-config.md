---
description: 修改自动交接阈值设置
argument-hint: <180k|120k|80%|off>
allowed-tools: [Bash]
---

# 修改交接阈值

修改自动交接触发阈值。支持绝对值和百分比两种格式。

## 参数说明

- `180k` — 在约 180K tokens 时触发（默认，推荐）
- `120k` — 在约 120K tokens 时触发（保守）
- `80%` — 在上下文使用 80% 时触发
- `70%` — 在上下文使用 70% 时触发
- 任意数字+k — 自定义绝对值，如 `150k`
- 任意数字+% — 自定义百分比，如 `75%`
- `off` / `关闭` — 关闭自动交接

## 执行

读取配置，更新 threshold 字段，写回：

```bash
node -e "const f=require('os').homedir()+'/.claude/cache/auto-handoff-config.json';const c=JSON.parse(require('fs').readFileSync(f,'utf8'));c.enabled=true;c.threshold='用户输入的值';require('fs').writeFileSync(f,JSON.stringify(c));console.log('阈值已设为 '+c.threshold)"
```

如果参数是 `off` 或 `关闭`：
```bash
node -e "const f=require('os').homedir()+'/.claude/cache/auto-handoff-config.json';const c=JSON.parse(require('fs').readFileSync(f,'utf8'));c.enabled=false;require('fs').writeFileSync(f,JSON.stringify(c));console.log('自动交接已关闭')"
```

确认修改结果，一行即可。
