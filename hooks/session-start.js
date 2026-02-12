#!/usr/bin/env node
/**
 * SessionStart hook — 静默写入默认配置，无输出
 */
const { readStdin, writeConfig, readConfig } = require('../scripts/lib');

async function main() {
  await readStdin();
  // 每次新会话重置配置为默认值
  writeConfig({ enabled: true, threshold: 1.5 });
  process.exit(0);
}

main().catch(() => process.exit(0));
