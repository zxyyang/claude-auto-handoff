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
 * index 文件 — 精华摘要，SessionStart 自动注入
 */
function getMemoryPath(cwd, sessionId) {
  const short = String(sessionId || 'unknown').slice(0, 8);
  const dir = path.join(cwd, '.claude');
  ensureDir(dir);
  return path.join(dir, `auto-handoff-memory-${short}.md`);
}

/**
 * full 记忆文件路径 — 完整详细记忆，按需读取
 */
function getMemoryFullPath(cwd, sessionId) {
  const short = String(sessionId || 'unknown').slice(0, 8);
  const dir = path.join(cwd, '.claude');
  ensureDir(dir);
  return path.join(dir, `auto-handoff-memory-${short}-full.md`);
}

/**
 * observation 日志路径 — 原始操作记录，按需读取
 */
function getObsPath(cwd, sessionId) {
  const short = String(sessionId || 'unknown').slice(0, 8);
  const dir = path.join(cwd, '.claude');
  ensureDir(dir);
  return path.join(dir, `auto-handoff-obs-${short}.jsonl`);
}

/**
 * 追加一条 observation 到 JSONL 文件（同步，不阻塞）
 * 参考 claude-mem 的 PostToolUse observation 捕获
 */
function appendObservation(obsPath, toolName, toolInput, toolOutput) {
  try {
    const truncate = (s, max) => {
      s = String(s || '');
      return s.length > max ? s.slice(0, max) + '...[truncated]' : s;
    };
    const obs = {
      ts: Date.now(),
      tool: toolName,
      input: truncate(typeof toolInput === 'object' ? JSON.stringify(toolInput) : toolInput, 300),
      output: truncate(typeof toolOutput === 'object' ? JSON.stringify(toolOutput) : toolOutput, 800),
    };
    fs.appendFileSync(obsPath, JSON.stringify(obs) + '\n');
  } catch {}
}

/**
 * 根据上下文总量和阈值计算记忆 token 预算
 * 基准 = min(阈值对应的 tokens, 模型总量)
 * 预算 = 基准 × 40%
 * 最小 10K，最大 500K
 */
function calcMemoryBudget(totalTokens, threshold) {
  const th = parseThreshold(threshold || '70%');
  let budgetBase;
  if (th.type === 'percent') {
    budgetBase = (totalTokens || 200000) * (th.pct / 100);
  } else {
    budgetBase = Math.min(th.kTokens * 1000, totalTokens || 200000);
  }
  const budget = Math.round(budgetBase * 0.4);
  return Math.max(10000, Math.min(500000, budget));
}

/**
 * 构建「静默保存记忆」指令 — 三层渐进式记忆架构
 * Layer 1: index 文件（精华摘要，SessionStart 自动注入）
 * Layer 2: full 文件（完整详细记忆，按需读取）
 * Layer 3: observation 日志（原始操作记录，按需读取）
 *
 * @param {string} memoryPath - index 记忆文件路径
 * @param {number} totalTokens - 模型上下文总量
 * @param {string} threshold - 用户配置的阈值
 * @param {string} cwd - 工作目录
 * @param {string} sessionId - 会话 ID
 */
function buildSaveMessage(memoryPath, totalTokens, threshold, cwd, sessionId) {
  const budget = calcMemoryBudget(totalTokens, threshold);
  const approxLines = Math.round(budget / 33);
  const fullPath = getMemoryFullPath(cwd || process.cwd(), sessionId || 'unknown');
  const obsPath = getObsPath(cwd || process.cwd(), sessionId || 'unknown');
  return `[AUTO-HANDOFF] 请立即使用 Task 工具启动一个后台 agent 保存会话记忆，不要阻塞当前回复。

Task 参数：
- subagent_type: "general-purpose"
- run_in_background: true
- description: "保存会话记忆"
- prompt: 内容见下方

---BEGIN MEMORY PROMPT---
你需要写入两个记忆文件，实现三层渐进式记忆（参考 claude-mem 架构）。

操作日志（Layer 3）已自动捕获在：${obsPath}
请先用 Read 工具读取该文件，了解本次会话的完整操作历史，然后基于操作日志 + 你对会话的理解写入以下两个文件。

## 文件 1: 完整记忆（Layer 2）
路径：${fullPath}
预算：${budget} tokens（约 ${approxLines} 行），尽可能写满

这是完整的会话记忆，恢复后按需读取。按以下 8 段结构写入，全部必填，越详细越好：

### 写入原则
1. 提取原始数据 — 贴实际代码而非"修改了代码"，贴完整错误信息而非"遇到了错误"
2. 保留因果链 — "因为 X 所以做了 Y，导致 Z"
3. 保留用户原始指令和反馈
4. 文件操作记录路径和关键内容

### 8 段结构

# 会话记忆（完整版）

## 1. 当前任务和进度
3-5 句话：正在做什么、整体目标、当前进度、在哪里停下的、为什么停下。

## 2. 关键上下文 — 架构和约定
极度详细，compact 后靠这段恢复全局：
- 项目架构（目录结构、模块关系、数据流）
- 代码约定（命名规则、设计模式、配置方式）
- 业务逻辑（核心流程、边界条件、隐含假设）
- 环境和工具链的特殊配置
- 关键文件的作用和相互关系

## 3. 已完成的工作
每项：文件路径:行号 + 具体改动（贴代码 diff）+ 原因

## 4. 关键决策和原因
每个决策：内容 + 考虑的方案 + 选择原因 + 推翻影响

## 5. 失败的尝试和踩坑
每个失败：方案 + 完整错误信息 + 根因 + 解决方式

## 6. 关键代码片段和接口
直接贴代码（代码块 + 文件路径:行号）：函数签名、数据结构、配置、API 格式

## 7. 当前状态
能用的功能 + 有问题的功能（贴错误）+ 测试状态 + git status

## 8. 恢复指令
每步：文件路径:行号 + 具体操作（贴代码）+ 预期结果 + 可能的问题

---

## 文件 2: 精华摘要（Layer 1）
路径：${memoryPath}
限制：200 行以内（这个文件会在 compact 后自动注入上下文，要精炼）

这是精华索引，compact 后自动注入。格式：

# 会话记忆摘要

## 任务
[一句话描述当前任务和进度]

## 架构要点
- [每条一行，最关键的架构发现和约定]

## 已完成
- [文件路径] — [一句话说明改动]

## 关键决策
- [决策] — [原因]

## 踩坑记录
- [问题] — [解决方式]

## 关键代码引用
- [文件路径:行号] — [一句话说明]

## 当前状态
- 正常：[列出]
- 异常：[列出 + 错误信息]

## 下一步
1. [文件路径:行号] — [具体操作]
2. ...

## 深度恢复
完整记忆：${fullPath}
操作日志：${obsPath}
需要详细信息时用 Read 工具读取以上文件。

---

写入顺序：先写 full 文件（Write + Edit 追加），再写 index 文件（Write）。
如果内容超过 150 行，先 Write 前 50 行再用 Edit 追加。
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
  parseThreshold, calcSavePoint, calcMemoryBudget,
  getMemoryPath, getMemoryFullPath, getObsPath, appendObservation,
  buildSaveMessage, buildCompactPrompt,
  wasRecentlyTriggered, markTriggered,
  getGitInfo, generateHandoffDoc, listHandoffs
};
