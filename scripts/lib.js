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
const STATE_FILE = path.join(CACHE_DIR, 'auto-handoff-state.json');
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

const DEFAULT_CONFIG = {
  enabled: true,
  mode: 'auto',          // auto | manual
  threshold: '70%',     // 支持 "180k"/"120k" 或 "80%"/"70%" 或用户自定义如 "150k"
};

// 解析阈值字符串
// 返回 { type: 'absolute', mb: 1.5, label: '180K' }
// 或   { type: 'percent', pct: 80, label: '80%' }
function parseThreshold(threshold) {
  const s = String(threshold).trim().toLowerCase();
  const pctMatch = s.match(/^(\d+)%$/);
  if (pctMatch) {
    return { type: 'percent', pct: Number(pctMatch[1]), label: `${pctMatch[1]}%` };
  }
  const kMatch = s.match(/^(\d+)k$/);
  if (kMatch) {
    const k = Number(kMatch[1]);
    return { type: 'absolute', kTokens: k, label: `${k}K` };
  }
  // 兼容旧配置（纯数字 = MB）
  const num = Number(s);
  if (!isNaN(num) && num > 0) {
    const k = Math.round((num * 1024) / 8.5);
    return { type: 'absolute', kTokens: k, label: `${k}K` };
  }
  return { type: 'absolute', kTokens: 180, label: '180K' };
}

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      // 兼容旧配置：threshold 为数字时转为字符串
      if (typeof cfg.threshold === 'number') {
        const k = Math.round((cfg.threshold * 1024) / 8.5);
        cfg.threshold = `${k}k`;
      }
      return { ...DEFAULT_CONFIG, ...cfg };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

function writeConfig(config) {
  ensureDir(CACHE_DIR);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config));
}

// ============ 运行时状态 ============

function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch {}
  return { status: 'idle', ts: 0 };
}

function writeState(state) {
  ensureDir(CACHE_DIR);
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...state, ts: Date.now() }));
}

// ============ 记忆保护 ============

/**
 * 根据用户阈值计算保存点
 * 百分比：pct - 15pp（如 70% → 55%）
 * 绝对值：k * 0.75（如 30k → 22.5k）
 */
function calcSavePoint(threshold) {
  const th = parseThreshold(threshold);
  if (th.type === 'percent') {
    return { type: 'percent', pct: Math.max(1, th.pct - 15), label: `${Math.max(1, th.pct - 15)}%` };
  }
  const saveK = Math.round(th.kTokens * 0.75);
  return { type: 'absolute', kTokens: saveK, label: `${saveK}K` };
}

/**
 * 会话级记忆文件路径（按项目+会话隔离）
 */
function getMemoryPath(cwd, sessionId) {
  const short = String(sessionId || 'unknown').slice(0, 8);
  const dir = path.join(cwd, '.claude');
  ensureDir(dir);
  return path.join(dir, `auto-handoff-memory-${short}.md`);
}

/**
 * 根据上下文总量计算记忆行数上限
 * 公式：totalTokens * 5% / 33（每行约 33 tokens）
 * 最小 200 行，最大 2000 行
 */
function calcMemoryLimit(totalTokens) {
  if (!totalTokens || totalTokens <= 0) return 500;
  return Math.max(200, Math.min(2000, Math.round(totalTokens * 0.05 / 33)));
}

/**
 * 构建「静默保存记忆」指令 — 使用后台 agent，不阻塞用户任务
 * @param {string} memoryPath - 记忆文件路径
 * @param {number} totalTokens - 模型上下文总量（用于动态计算行数上限）
 */
function buildSaveMessage(memoryPath, totalTokens) {
  const maxLines = calcMemoryLimit(totalTokens);
  return `[AUTO-HANDOFF] 请立即使用 Task 工具启动一个后台 agent 保存会话记忆，不要阻塞当前回复。

Task 参数：
- subagent_type: "general-purpose"
- run_in_background: true
- description: "保存会话记忆"
- prompt: 内容见下方

---BEGIN MEMORY PROMPT---
将当前会话的完整记忆写入 ${memoryPath}（使用 Write 工具，如果内容超过 150 行则先 Write 前 50 行再用 Edit 追加）。

目标：恢复后和没压缩一样，零信息丢失。行数上限 ${maxLines} 行，尽可能写满。

# 会话记忆快照

按以下 8 个段落结构写入，每段都必须填写，越详细越好：

## 1. 当前任务和进度
用 3-5 句话描述：正在做什么、整体目标是什么、当前进度百分比、在哪里停下的、为什么停下。

## 2. 关键上下文（架构和约定）
这是最关键的段落，compact 后靠这段恢复全局理解：
- 项目架构的关键发现（目录结构、模块关系、数据流）
- 代码中不明显但重要的约定（命名规则、设计模式、配置方式）
- 业务逻辑的关键理解（核心流程、边界条件、隐含假设）
- 环境和工具链的特殊配置

## 3. 已完成的工作
列出本次会话完成的所有工作，每项包括：
- 修改的文件路径
- 具体改了什么（不是"更新了文件"，而是"在 auth.js:42 添加了 JWT 刷新逻辑"）
- 为什么这样改

## 4. 关键决策和原因
每个重要决策记录为一行：
- 决策内容
- 考虑过的其他方案
- 最终选择的原因
- 如果推翻这个决策会影响什么

## 5. 失败的尝试和踩坑（极其重要）
这是防止下一个 agent 重复犯错的关键段落：
- 试过什么方案、为什么失败
- 遇到的具体错误信息和堆栈
- 如何绕过或解决的
- 哪些看起来可行但实际有坑的路径

## 6. 关键代码片段和接口
不是描述代码，而是直接贴关键代码：
- 核心函数签名和参数说明
- 重要的数据结构/接口定义
- 关键配置项
- API 端点和请求/响应格式
用 markdown 代码块包裹，标注文件路径和行号。

## 7. 当前状态
- 什么功能已经能正常工作
- 什么功能还有问题（具体错误信息）
- 测试状态（哪些通过、哪些失败）
- 未提交的改动（git status）

## 8. 恢复指令（下一步）
按优先级列出具体可执行的步骤，每步包括：
- 要操作的文件路径和行号
- 具体要做什么
- 预期结果是什么
- 可能遇到的问题

"继续开发"不是好的恢复指令。"在 src/hooks/post-tool-use.js:43 修改 buildSaveMessage 调用，传入 state.totalTokens 参数"才是。
---END MEMORY PROMPT---

执行完 Task 调用后，正常回复用户的问题。不要提及记忆保存过程。`;}

/**
 * 构建「提示用户 compact」指令
 */
function buildCompactPrompt(info) {
  return `

在回复末尾另起一行，用以下格式提示用户：

✅ 已保存完整会话记忆（${info}）。输入 /compact 压缩上下文（压缩后自动恢复记忆），或继续当前工作。`;
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
  HOME, CACHE_DIR, CONFIG_FILE, STATE_FILE, DEFAULT_CONFIG,
  ensureDir, readStdin, readConfig, writeConfig, readState, writeState,
  parseThreshold, calcSavePoint, calcMemoryLimit, getMemoryPath, buildSaveMessage, buildCompactPrompt,
  wasRecentlyTriggered, markTriggered,
  getGitInfo, generateHandoffDoc, listHandoffs
};
