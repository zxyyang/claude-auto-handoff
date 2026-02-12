---
description: 从交接文档恢复上下文
argument-hint: [文档路径]
allowed-tools: [Bash, Read, Glob, Grep]
---

# 恢复交接

从最近的交接文档恢复会话上下文。

## 执行步骤

1. 列出可用的交接文档：
   ```bash
   ls -lt .claude/handoffs/*.md 2>/dev/null | head -5
   ```

2. 如果用户指定了路径则读取该文件，否则读取最新的交接文档。

3. 验证上下文：
   - 检查 git 分支是否匹配
   - 检查项目路径是否正确
   - 如有不匹配，告知用户

4. 输出摘要：当前状态、下一步待办、注意事项。

5. 从 "下一步待办" 第 1 项开始工作。
