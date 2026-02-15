#!/usr/bin/env node
/**
 * Stop hook — 每次 Claude 回复后运行
 * 仅做状态管理：检测上次交接是否失败
 */
const { readStdin } = require('../scripts/lib');

async function main() {
  await readStdin();
  // 不再做 in_progress → failed 转换，交接可能跨多轮工具调用
  process.exit(0);
}

main().catch(() => process.exit(0));
