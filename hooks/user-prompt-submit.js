#!/usr/bin/env node
/**
 * UserPromptSubmit hook — 用户提交消息时运行
 * 覆盖纯对话场景（无工具调用时 PostToolUse 不触发）
 */
const { readStdin, readConfig, readState, writeState, parseThreshold, calcSavePoint, getMemoryPath, buildSaveMessage, wasRecentlyTriggered, markTriggered } = require('../scripts/lib');

async function main() {
  const input = await readStdin();
  const config = readConfig();
  const state = readState();

  if (!config.enabled || config.mode === 'manual') process.exit(0);

  const sessionId = input.session_id || 'unknown';
  if (wasRecentlyTriggered(sessionId)) process.exit(0);
  if (state.status === 'saved') process.exit(0);

  const savePoint = calcSavePoint(config.threshold);
  const th = parseThreshold(config.threshold);
  let triggerInfo = null;

  if (savePoint.type === 'absolute') {
    const usedK = Math.round((state.usedTokens || 0) / 1000);
    if (usedK >= savePoint.kTokens) {
      triggerInfo = `已用 ${usedK}K, 阈值 ${th.label}`;
    }
  } else if (savePoint.type === 'percent') {
    if (state.remainingPct != null) {
      const usedPct = Math.round(100 - state.remainingPct);
      if (usedPct >= savePoint.pct) {
        triggerInfo = `已用 ${usedPct}%, 阈值 ${th.label}`;
      }
    }
  }

  if (!triggerInfo) process.exit(0);

  const memoryPath = getMemoryPath(process.cwd(), sessionId);
  markTriggered(sessionId);
  writeState({ ...state, status: 'saved', memoryPath, sessionId });

  const message = buildSaveMessage(memoryPath, state.totalTokens || 0);

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: message
    }
  }));

  process.exit(0);
}

main().catch(() => process.exit(0));
