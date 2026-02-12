#!/usr/bin/env node
/**
 * Stop hook — 每次 Claude 回复后运行
 * auto 模式下超阈值时注入交接指令
 * 阈值判断优先用 statusline 写入 state 的实时 token 数据
 */
const { readStdin, readConfig, readState, wasRecentlyTriggered, markTriggered, writeState, parseThreshold } = require('../scripts/lib');
const path = require('path');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');

function buildMessage(info) {
  return `[AUTO-HANDOFF 警告] 上下文用量 (${info}) 已超过阈值。

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

以上操作立即执行，优先于其他工作。不要询问用户确认。`;
}

async function main() {
  const input = await readStdin();
  const config = readConfig();
  const state = readState();

  // 上次触发了交接但 create-handoff.js 没被执行 → failed
  if (state.status === 'in_progress') {
    writeState({ ...state, status: 'failed' });
  }

  if (!config.enabled || config.mode === 'manual') {
    process.exit(0);
  }

  const sessionId = input.session_id || 'unknown';

  if (wasRecentlyTriggered(sessionId)) {
    process.exit(0);
  }

  // 判断是否超阈值（用 statusline 写入 state 的实时数据）
  const th = parseThreshold(config.threshold);
  let triggerInfo = null;

  if (th.type === 'absolute') {
    // 优先用 statusline 写入的 usedTokens（精确）
    const usedK = Math.round((state.usedTokens || 0) / 1000);
    if (usedK >= th.kTokens) {
      triggerInfo = `已用 ${usedK}K tokens, 阈值 ${th.label}`;
    }
  } else if (th.type === 'percent') {
    if (state.remainingPct != null) {
      const usedPct = Math.round(100 - state.remainingPct);
      if (usedPct >= th.pct) {
        triggerInfo = `已用 ${usedPct}%, 阈值 ${th.label}`;
      }
    }
  }

  if (!triggerInfo) {
    process.exit(0);
  }

  markTriggered(sessionId);
  writeState({ ...state, status: 'in_progress' });

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'Stop',
      additionalContext: buildMessage(triggerInfo)
    }
  }));

  process.exit(0);
}

main().catch(() => process.exit(0));
