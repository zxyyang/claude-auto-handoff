#!/usr/bin/env node
/**
 * PreCompact hook — compact 前无条件保存记忆（最后防线）
 */
const { readStdin, readConfig, readState, writeState, getMemoryPath, buildSaveMessage, wasRecentlyTriggered, markTriggered } = require('../scripts/lib');

async function main() {
  const input = await readStdin();
  const config = readConfig();
  const state = readState();
  const sessionId = input.session_id || 'unknown';

  const memoryPath = getMemoryPath(process.cwd(), sessionId);

  // 无论是否已保存，都再保存一次（compact 前最后机会）
  if (!wasRecentlyTriggered(sessionId)) markTriggered(sessionId);
  writeState({ ...state, status: 'saved', memoryPath, sessionId });

  console.log(JSON.stringify({
    continue: true,
    systemMessage: buildSaveMessage(memoryPath, state.totalTokens || 0, config.threshold)
  }));

  process.exit(0);
}

main().catch(() => process.exit(0));
