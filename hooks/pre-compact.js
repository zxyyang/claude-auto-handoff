#!/usr/bin/env node
/**
 * PreCompact hook — compact 前无条件触发交接（最后防线）
 * 此时上下文即将被压缩，必须立即保存
 */
const { readStdin, wasRecentlyTriggered, markTriggered, getTranscriptSize } = require('../scripts/lib');
const path = require('path');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');

function buildMessage(sizeKB) {
  return `[AUTO-HANDOFF 紧急] 上下文即将被压缩（compact），信息将会丢失！

你必须立即自动执行以下操作（不需要询问用户）：

1. 运行以下命令生成交接文档骨架：
   node "${PLUGIN_ROOT}/scripts/create-handoff.js" --cwd "${process.cwd()}"

2. 读取生成的交接文档，将所有 [TODO: ...] 段落替换为本次会话的实际内容：
   - 当前状态摘要：正在做什么、进度、停在哪里
   - 重要上下文：关键决策、发现、架构洞察（这是最重要的段落，要详细）
   - 已完成任务和修改的文件
   - 做出的决策及原因
   - 下一步待办（清晰可执行）
   - 注意事项和可能踩坑的地方

3. 在 ~/.claude/CLAUDE.md 末尾追加简短摘要（覆盖旧的同名段落）：
   ## 会话上下文 (自动保存)
   - 任务：[当前任务]
   - 进度：[完成了什么，还剩什么]
   - 关键决策：[重要选择及原因]
   - 下一步：[最优先待办]
   - 交接文档：[文档路径]

4. 告知用户（简短一行）：
   "上下文已自动保存到 [交接文档路径]。新会话中输入 /handoff-resume 即可无缝恢复。"

这是 compact 前的最后机会，必须立即执行！`;
}

async function main() {
  const input = await readStdin();
  const sessionId = input.session_id || 'unknown';
  const transcriptPath = input.transcript_path || '';

  if (wasRecentlyTriggered(sessionId)) process.exit(0);

  const sizeKB = Math.round(getTranscriptSize(transcriptPath) / 1024);
  markTriggered(sessionId);

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreCompact',
      additionalContext: buildMessage(sizeKB)
    }
  }));

  process.exit(0);
}

main().catch(() => process.exit(0));
