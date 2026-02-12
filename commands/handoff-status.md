---
description: 查看自动交接当前状态
allowed-tools: [Bash, Read]
---

# 查看交接状态

显示当前自动交接的配置和状态。

## 执行

1. 读取配置文件：
   ```bash
   cat ~/.claude/cache/auto-handoff-config.json 2>/dev/null || echo '{"enabled":true,"threshold":1.5}'
   ```

2. 列出现有交接文档数量：
   ```bash
   ls .claude/handoffs/*.md 2>/dev/null | wc -l
   ```

3. 用简洁格式输出：
   - 状态：已启用/已关闭
   - 阈值：180K / 120K
   - 交接文档数量
   - 最近一次交接时间（如有）
