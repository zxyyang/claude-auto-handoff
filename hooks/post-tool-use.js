#!/usr/bin/env node
/**
 * PostToolUse hook — 每次工具调用后运行
 * 1. 自动捕获 observation（参考 claude-mem）
 * 2. 达到保存点 → 静默保存三层记忆
 */
const { readStdin, readConfig, readState, writeState, parseThreshold, calcSavePoint, getMemoryPath, getObsPath, appendObservation, buildSaveMessage, wasRecentlyTriggered, markTriggered } = require('../scripts/lib');

async function main() {
  const input = await readStdin();
  const config = readConfig();
  const state = readState();
  const sessionId = input.session_id || 'unknown';
  const cwd = process.cwd();

  // Layer 3: 自动捕获 observation（每次工具调用都记录）
  if (config.enabled && input.tool_name) {
    const obsPath = getObsPath(cwd, sessionId);
    appendObservation(obsPath, input.tool_name, input.tool_input, input.tool_response);
  }

  if (!config.enabled || config.mode === 'manual') process.exit(0);

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

  const memoryPath = getMemoryPath(cwd, sessionId);
  markTriggered(sessionId);
  writeState({ ...state, status: 'saved', memoryPath, sessionId });

  const message = buildSaveMessage(memoryPath, state.totalTokens || 0, config.threshold, cwd, sessionId);

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: message
    }
  }));

  process.exit(0);
}

main().catch(() => process.exit(0));
