---
description: 查看自动交接当前状态
allowed-tools: [Bash, Read]
---

# 查看交接状态

显示当前自动交接的完整配置和运行状态。

## 执行

1. 读取配置和状态：
   ```bash
   cat ~/.claude/cache/auto-handoff-config.json 2>/dev/null || echo '{}'
   cat ~/.claude/cache/auto-handoff-state.json 2>/dev/null || echo '{}'
   ```

2. 列出现有交接文档：
   ```bash
   ls .claude/handoffs/*.md 2>/dev/null | wc -l
   ```

3. 用简洁格式输出：
   - 开关：已启用 / 已关闭
   - 模式：自动(auto) / 手动(manual)
   - 阈值：180K / 120K / 80% 等
   - 运行状态：可用 / 需交接 / 交接中
   - 交接文档数量
   - 最近一次交接时间（如有）

4. 提示可用命令：
   - `/handoff-mode` — 切换 auto↔手动
   - `/handoff-config <180k|120k|80%|off>` — 修改阈值（支持绝对值和百分比）
