---
description: 更新 claude-auto-handoff 插件到最新版本
allowed-tools: [Bash]
---

# 更新插件

执行以下步骤更新 claude-auto-handoff 到最新版本：

```bash
node -e "
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const HOME = require('os').homedir();

const MARKETPLACE_DIR = path.join(HOME, '.claude/plugins/marketplaces/claude-auto-handoff');
const INSTALLED_JSON = path.join(HOME, '.claude/plugins/installed_plugins.json');

// 1. 读取当前版本
let oldVer = 'unknown';
try {
  const pj = path.join(MARKETPLACE_DIR, '.claude-plugin/plugin.json');
  oldVer = JSON.parse(fs.readFileSync(pj, 'utf8')).version || 'unknown';
} catch {}
console.log('当前版本: v' + oldVer);

// 2. 拉取最新代码
console.log('拉取最新代码...');
try {
  execSync('git -C \"' + MARKETPLACE_DIR + '\" pull --quiet', { stdio: 'pipe' });
} catch {
  console.error('git pull 失败，尝试重新克隆...');
  execSync('rm -rf \"' + MARKETPLACE_DIR + '\"');
  execSync('git clone --quiet https://github.com/zxyyang/claude-auto-handoff.git \"' + MARKETPLACE_DIR + '\"');
}

// 3. 读取新版本
let newVer = 'unknown';
try {
  const pj = path.join(MARKETPLACE_DIR, '.claude-plugin/plugin.json');
  newVer = JSON.parse(fs.readFileSync(pj, 'utf8')).version || 'unknown';
} catch {}

// 4. 找到 cache 目录并同步
const installed = JSON.parse(fs.readFileSync(INSTALLED_JSON, 'utf8'));
const entry = installed.plugins['claude-auto-handoff@claude-auto-handoff'];
if (entry && entry[0]) {
  const cachePath = entry[0].installPath;
  execSync('rsync -a --delete --exclude=.git \"' + MARKETPLACE_DIR + '/\" \"' + cachePath + '/\"');
  // 更新注册信息
  const sha = execSync('git -C \"' + MARKETPLACE_DIR + '\" rev-parse HEAD', { encoding: 'utf8' }).trim();
  entry[0].version = newVer;
  entry[0].lastUpdated = new Date().toISOString();
  entry[0].gitCommitSha = sha;
  fs.writeFileSync(INSTALLED_JSON, JSON.stringify(installed, null, 2));
  console.log('缓存已同步: ' + cachePath);
}

// 5. 清除更新检查缓存
const checkFile = path.join(HOME, '.claude/cache/auto-handoff-update-check.json');
try { fs.unlinkSync(checkFile); } catch {}

if (oldVer === newVer) {
  console.log('\\n✅ 已是最新版本 v' + newVer);
} else {
  console.log('\\n✅ 更新完成: v' + oldVer + ' → v' + newVer);
  console.log('重启 Claude Code 后生效。');
}
"
```

执行完毕后，告知用户更新结果。如果版本有变化，提醒重启 Claude Code。
