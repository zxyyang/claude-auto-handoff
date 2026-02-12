#!/bin/bash
# claude-auto-handoff 一键安装脚本
# 用法: curl -sL https://raw.githubusercontent.com/zxyyang/claude-auto-handoff/main/install.sh | bash

set -e

REPO="https://github.com/zxyyang/claude-auto-handoff.git"
PLUGIN_DIR="$HOME/.claude/plugins/cache/claude-auto-handoff/claude-auto-handoff/1.0.0"
SETTINGS="$HOME/.claude/settings.local.json"
PLUGIN_KEY="claude-auto-handoff@claude-auto-handoff"

echo "📦 安装 claude-auto-handoff..."

# 1. 克隆到插件目录
if [ -d "$PLUGIN_DIR" ]; then
  echo "   更新已有安装..."
  cd "$PLUGIN_DIR" && git pull --quiet
else
  echo "   克隆仓库..."
  git clone --quiet "$REPO" "$PLUGIN_DIR"
fi

# 2. 写入默认配置
mkdir -p "$HOME/.claude/cache"
if [ ! -f "$HOME/.claude/cache/auto-handoff-config.json" ]; then
  echo '{"enabled":true,"mode":"auto","threshold":"180k"}' > "$HOME/.claude/cache/auto-handoff-config.json"
fi

# 3. 启用插件（修改 settings.local.json）
if [ ! -f "$SETTINGS" ]; then
  echo "{\"enabledPlugins\":{\"$PLUGIN_KEY\":true}}" > "$SETTINGS"
  echo "   创建 settings.local.json"
elif grep -q "$PLUGIN_KEY" "$SETTINGS" 2>/dev/null; then
  echo "   插件已在配置中"
else
  # 用 node 安全地修改 JSON（避免 sed 破坏格式）
  node -e "
    const fs = require('fs');
    const f = '$SETTINGS';
    const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!c.enabledPlugins) c.enabledPlugins = {};
    c.enabledPlugins['$PLUGIN_KEY'] = true;
    fs.writeFileSync(f, JSON.stringify(c, null, 2));
  " && echo "   已添加到 enabledPlugins"
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
