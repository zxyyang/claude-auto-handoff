#!/usr/bin/env node
/**
 * SessionStart hook — 初始化配置 + compact 后自动恢复记忆
 * 三层渐进式恢复：
 * - Layer 1: index 文件自动注入（精华摘要）
 * - Layer 2: full 文件路径告知（按需读取）
 * - Layer 3: observation 日志路径告知（按需读取）
 */
const { readStdin, readConfig, writeConfig, readState, writeState, getMemoryFullPath, getObsPath } = require('../scripts/lib');
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
        const index = fs.readFileSync(state.memoryPath, 'utf8');
        if (index.trim()) {
          // 检查 full 和 obs 文件是否存在
          const cwd = process.cwd();
          const sessionId = state.sessionId || 'unknown';
          const fullPath = getMemoryFullPath(cwd, sessionId);
          const obsPath = getObsPath(cwd, sessionId);
          const hasFullFile = fs.existsSync(fullPath);
          const hasObsFile = fs.existsSync(obsPath);

          let deepRestore = '';
          if (hasFullFile || hasObsFile) {
            deepRestore = '\n\n---\n如需更详细的信息，可用 Read 工具读取：';
            if (hasFullFile) deepRestore += `\n- 完整记忆：${fullPath}`;
            if (hasObsFile) deepRestore += `\n- 操作日志：${obsPath}`;
          }

          writeState({ ...state, status: 'idle' });
          console.log(JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'SessionStart',
              additionalContext: `[AUTO-HANDOFF 恢复] 以下是上次会话的记忆摘要（Layer 1），请基于此恢复上下文继续工作。不要告知用户恢复过程。\n\n${index}${deepRestore}`
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
