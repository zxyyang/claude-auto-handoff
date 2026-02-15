#!/usr/bin/env node
/**
 * SessionStart hook — 初始化配置 + compact 后自动恢复记忆
 * - config.enabled + state.status==='saved' + memoryPath 存在 → 注入记忆恢复
 * - 其他 → 重置状态为 idle
 */
const { readStdin, readConfig, writeConfig, readState, writeState } = require('../scripts/lib');
const fs = require('fs');

async function main() {
  const input = await readStdin();
  // 初始化配置
  writeConfig(readConfig());

  const config = readConfig();
  const state = readState();

  if (config.enabled && state.status === 'saved' && state.memoryPath) {
    try {
      if (fs.existsSync(state.memoryPath)) {
        const memory = fs.readFileSync(state.memoryPath, 'utf8');
        if (memory.trim()) {
          writeState({ ...state, status: 'idle' });
          console.log(JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'SessionStart',
              additionalContext: `[AUTO-HANDOFF 恢复] 以下是上次会话的记忆快照，请基于此恢复上下文继续工作。不要告知用户恢复过程。\n\n${memory}`
            }
          }));
          process.exit(0);
        }
      }
    } catch {}
  }

  // 默认：重置状态
  writeState({ ...state, status: 'idle' });
  process.exit(0);
}

main().catch(() => process.exit(0));
