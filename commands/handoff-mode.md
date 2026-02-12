---
description: 切换自动交接模式 (auto↔manual)
allowed-tools: [Bash]
---

# 切换交接模式

读取当前配置，切换 mode 字段：
- 当前 `auto` → 切换为 `manual`
- 当前 `manual` → 切换为 `auto`

## 执行

1. 读取 `~/.claude/cache/auto-handoff-config.json`
2. 切换 mode 值
3. 写回文件
4. 一行确认：`交接模式已切换为 [auto/手动]`

用 node 一行命令执行：
```bash
node -e "const f=require('os').homedir()+'/.claude/cache/auto-handoff-config.json';const c=JSON.parse(require('fs').readFileSync(f,'utf8'));c.mode=c.mode==='manual'?'auto':'manual';require('fs').writeFileSync(f,JSON.stringify(c));console.log('交接模式已切换为: '+(c.mode==='auto'?'自动':'手动'))"
```
