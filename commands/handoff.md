---
description: 手动创建上下文交接文档
argument-hint: [任务名称]
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep]
---

# 手动创建交接文档

用户要求手动保存当前会话上下文。

## 执行步骤

1. 运行以下命令生成交接文档骨架（如果用户提供了任务名称，替换 auto-handoff）：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/create-handoff.js" "$ARGUMENTS"
   ```

2. 读取生成的文档，将所有 `[TODO: ...]` 替换为本次会话的实际内容。
   参考 auto-handoff 技能中的填写规则，确保关键段落完整。

3. 在 `~/.claude/CLAUDE.md` 末尾追加摘要（覆盖旧的 `## 会话上下文 (自动保存)` 段落）。

4. 告知用户交接文档路径和恢复方式。
