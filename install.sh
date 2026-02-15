#!/bin/bash
# claude-auto-handoff 一键安装脚本
# 用法: curl -sL https://raw.githubusercontent.com/zxyyang/claude-auto-handoff/main/install.sh | bash

set -e

REPO="https://github.com/zxyyang/claude-auto-handoff.git"
MARKETPLACE_NAME="claude-auto-handoff"
PLUGIN_NAME="claude-auto-handoff"
PLUGIN_KEY="${PLUGIN_NAME}@${MARKETPLACE_NAME}"
VERSION="1.0.0"

MARKETPLACE_DIR="$HOME/.claude/plugins/marketplaces/$MARKETPLACE_NAME"
CACHE_DIR="$HOME/.claude/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION"
INSTALLED_JSON="$HOME/.claude/plugins/installed_plugins.json"
MARKETPLACES_JSON="$HOME/.claude/plugins/known_marketplaces.json"
SETTINGS="$HOME/.claude/settings.local.json"

echo "📦 安装 claude-auto-handoff..."

mkdir -p "$HOME/.claude/plugins/marketplaces"
mkdir -p "$HOME/.claude/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME"
mkdir -p "$HOME/.claude/cache"

# 1. Clone/更新 marketplace 目录
if [ -d "$MARKETPLACE_DIR/.git" ]; then
  echo "   更新 marketplace..."
  git -C "$MARKETPLACE_DIR" pull --quiet 2>/dev/null || {
    echo "   pull 失败，重新克隆..."
    rm -rf "$MARKETPLACE_DIR"
    git clone --quiet "$REPO" "$MARKETPLACE_DIR"
  }
else
  [ -d "$MARKETPLACE_DIR" ] && rm -rf "$MARKETPLACE_DIR"
  echo "   克隆 marketplace..."
  git clone --quiet "$REPO" "$MARKETPLACE_DIR"
fi

# 2. 同步到 cache 目录（插件运行时读取 cache）
if [ -d "$CACHE_DIR" ]; then
  rm -rf "$CACHE_DIR"
fi
cp -R "$MARKETPLACE_DIR" "$CACHE_DIR"
rm -rf "$CACHE_DIR/.git"
rm -f "$CACHE_DIR/.orphaned_at"

GIT_SHA=$(git -C "$MARKETPLACE_DIR" rev-parse HEAD)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# 3. 注册 marketplace（known_marketplaces.json）
if [ ! -f "$MARKETPLACES_JSON" ]; then
  echo "{}" > "$MARKETPLACES_JSON"
fi
node -e "
  const fs = require('fs');
  const c = JSON.parse(fs.readFileSync('$MARKETPLACES_JSON', 'utf8'));
  if (!c['$MARKETPLACE_NAME']) {
    c['$MARKETPLACE_NAME'] = {
      source: { source: 'github', repo: 'zxyyang/claude-auto-handoff' },
      installLocation: '$MARKETPLACE_DIR',
      lastUpdated: '$NOW'
    };
    fs.writeFileSync('$MARKETPLACES_JSON', JSON.stringify(c, null, 2));
    console.log('   已注册 marketplace');
  } else {
    c['$MARKETPLACE_NAME'].lastUpdated = '$NOW';
    fs.writeFileSync('$MARKETPLACES_JSON', JSON.stringify(c, null, 2));
    console.log('   marketplace 已存在，更新时间戳');
  }
"

# 4. 注册插件（installed_plugins.json）
if [ ! -f "$INSTALLED_JSON" ]; then
  echo '{"version":2,"plugins":{}}' > "$INSTALLED_JSON"
fi
node -e "
  const fs = require('fs');
  const c = JSON.parse(fs.readFileSync('$INSTALLED_JSON', 'utf8'));
  if (!c.plugins) c.plugins = {};
  c.plugins['$PLUGIN_KEY'] = [{
    scope: 'user',
    installPath: '$CACHE_DIR',
    version: '$VERSION',
    installedAt: c.plugins['$PLUGIN_KEY']?.[0]?.installedAt || '$NOW',
    lastUpdated: '$NOW',
    gitCommitSha: '$GIT_SHA'
  }];
  fs.writeFileSync('$INSTALLED_JSON', JSON.stringify(c, null, 2));
  console.log('   已注册插件');
"

# 5. 启用插件（settings.local.json）
if [ ! -f "$SETTINGS" ]; then
  echo "{\"enabledPlugins\":{\"$PLUGIN_KEY\":true}}" > "$SETTINGS"
  echo "   创建 settings.local.json"
elif grep -q "$PLUGIN_KEY" "$SETTINGS" 2>/dev/null; then
  echo "   插件已在配置中"
else
  node -e "
    const fs = require('fs');
    const c = JSON.parse(fs.readFileSync('$SETTINGS', 'utf8'));
    if (!c.enabledPlugins) c.enabledPlugins = {};
    c.enabledPlugins['$PLUGIN_KEY'] = true;
    fs.writeFileSync('$SETTINGS', JSON.stringify(c, null, 2));
  " && echo "   已添加到 enabledPlugins"
fi

# 6. 写入默认配置
if [ ! -f "$HOME/.claude/cache/auto-handoff-config.json" ]; then
  echo '{"enabled":true,"mode":"auto","threshold":"180k"}' > "$HOME/.claude/cache/auto-handoff-config.json"
fi

echo ""
echo "✅ 安装完成！重启 Claude Code 后生效。"
echo ""
echo "可用命令："
echo "  /handoff          手动创建交接文档"
echo "  /handoff-resume   从交接文档恢复上下文"
echo "  /handoff-mode     切换自动↔手动模式"
echo "  /handoff-config   修改阈值 (180k|120k|80%|off)"
echo "  /handoff-status   查看当前状态"
