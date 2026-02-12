/**
 * claude-auto-handoff 共享工具库
 * 零外部依赖，纯 Node.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const HOME = os.homedir();
const CACHE_DIR = path.join(HOME, '.claude', 'cache');
const CONFIG_FILE = path.join(CACHE_DIR, 'auto-handoff-config.json');
const COOLDOWN_SECONDS = 300;

// ============ 基础工具 ============

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

// ============ 配置管理 ============

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch {}
  return { enabled: true, threshold: 1.5 };
}

function writeConfig(config) {
  ensureDir(CACHE_DIR);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config));
}

// ============ Transcript 检测 ============

function getTranscriptSize(transcriptPath) {
  try {
    if (transcriptPath && fs.existsSync(transcriptPath)) {
      return fs.statSync(transcriptPath).size;
    }
  } catch {}
  return 0;
}

// ============ 冷却机制 ============

function wasRecentlyTriggered(sessionId) {
  try {
    const f = path.join(CACHE_DIR, `handoff-${sessionId}.json`);
    if (fs.existsSync(f)) {
      const state = JSON.parse(fs.readFileSync(f, 'utf8'));
      return (Date.now() - state.ts) / 1000 < COOLDOWN_SECONDS;
    }
  } catch {}
  return false;
}

function markTriggered(sessionId) {
  ensureDir(CACHE_DIR);
  try {
    fs.writeFileSync(
      path.join(CACHE_DIR, `handoff-${sessionId}.json`),
      JSON.stringify({ ts: Date.now() })
    );
  } catch {}
}

// ============ Git 信息采集 ============

function runCmd(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch { return ''; }
}

function getGitInfo(cwd) {
  const branch = runCmd('git branch --show-current', cwd);
  if (!branch) return null;
  const commits = runCmd('git log --oneline -5 --no-decorate', cwd);
  const modified = runCmd('git diff --name-only', cwd);
  const staged = runCmd('git diff --name-only --cached', cwd);
  return {
    branch,
    commits: commits ? commits.split('\n') : [],
    modified: [...new Set([
      ...(modified ? modified.split('\n') : []),
      ...(staged ? staged.split('\n') : [])
    ])].filter(Boolean)
  };
}

// ============ 交接文档生成 ============

function generateHandoffDoc(cwd, slug) {
  const now = new Date();
  const ts = now.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  const pad = (n) => String(n).padStart(2, '0');
  const fileTs = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  slug = (slug || 'auto-handoff').toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
  const filename = `${fileTs}-${slug}.md`;

  const handoffsDir = path.join(cwd, '.claude', 'handoffs');
  ensureDir(handoffsDir);

  const git = getGitInfo(cwd);
  const branchLine = git ? git.branch : '[非 git 仓库]';
  const commitsSection = git && git.commits.length
    ? git.commits.map(c => `  - ${c}`).join('\n')
    : '  - [无近期提交]';
  const modifiedSection = git && git.modified.length
    ? git.modified.map(f => `| ${f} | [待填写] | [待填写] |`).join('\n')
    : '| [无检测到的修改文件] | | |';

  const content = `# 交接文档: [任务标题 - 请替换]

## 会话元数据
- 创建时间: ${ts}
- 项目路径: ${cwd}
- Git 分支: ${branchLine}

### 近期提交
${commitsSection}

## 当前状态摘要

[TODO: 用一段话描述当前正在做什么、进度如何、在哪里停下的]

## 重要上下文

[TODO: 下一个 agent 必须知道的关键信息 — 这是最重要的段落]

## 已完成的工作

### 已完成任务
- [ ] [TODO: 列出已完成的任务]

### 修改的文件
| 文件 | 改动内容 | 原因 |
|------|---------|------|
${modifiedSection}

### 做出的决策
| 决策 | 考虑的方案 | 选择原因 |
|------|-----------|---------|
| [TODO: 记录关键决策] | | |

## 待办工作

### 下一步（按优先级）
1. [TODO: 最关键的下一步]
2. [TODO: 第二优先]
3. [TODO: 第三优先]

### 阻塞项/未解决问题
- [ ] [TODO: 列出阻塞项]

## 恢复指引

### 关键文件
| 文件 | 用途 |
|------|------|
| [TODO: 添加关键文件] | |

### 注意事项
- [TODO: 可能踩坑的地方]

### 环境状态
- [TODO: 相关工具和配置（不要包含密钥）]
`;

  const filepath = path.join(handoffsDir, filename);
  fs.writeFileSync(filepath, content);
  return filepath;
}

// ============ 交接文档列表 ============

function listHandoffs(cwd) {
  const dir = path.join(cwd, '.claude', 'handoffs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      const titleMatch = content.match(/^#\s+(?:交接文档:\s*)?(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : f;
      const hasTodo = (content.match(/\[TODO:/g) || []).length;
      return { filename: f, path: path.join(dir, f), title, todos: hasTodo };
    })
    .sort((a, b) => b.filename.localeCompare(a.filename));
}

// ============ 导出 ============

module.exports = {
  HOME, CACHE_DIR, CONFIG_FILE,
  ensureDir, readStdin, readConfig, writeConfig,
  getTranscriptSize, wasRecentlyTriggered, markTriggered,
  getGitInfo, generateHandoffDoc, listHandoffs
};
