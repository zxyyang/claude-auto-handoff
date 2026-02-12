#!/usr/bin/env node
/**
 * 交接文档生成器 CLI
 * 用法: node create-handoff.js [slug] [--cwd /path]
 */
const { generateHandoffDoc, readState, writeState } = require('./lib');

const args = process.argv.slice(2);
let slug = 'auto-handoff';
let cwd = process.cwd();

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--cwd' && args[i + 1]) { cwd = args[++i]; }
  else if (!args[i].startsWith('-')) { slug = args[i]; }
}

const filepath = generateHandoffDoc(cwd, slug);
// 标记交接完成
writeState({ ...readState(), status: 'completed' });
console.log(filepath);
