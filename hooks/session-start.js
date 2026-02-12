#!/usr/bin/env node
/**
 * SessionStart hook — 静默初始化配置和状态
 */
const { readStdin, readConfig, writeConfig, writeState } = require('../scripts/lib');

async function main() {
  await readStdin();
  // 读取现有配置（自动补全新字段），写回
  writeConfig(readConfig());
  writeState({ status: 'idle' });
  process.exit(0);
}

main().catch(() => process.exit(0));
