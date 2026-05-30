#!/bin/bash
# 打包 Bob 插件为 .bobplugin 文件
# 用法：./scripts/pack.sh [版本号]

set -e

PLUGIN_NAME="bob-universal-processor"
VERSION=${1:-$(date +%Y%m%d%H%M)}

# 确保在项目根目录
cd "$(dirname "$0")/.."

# 清理旧产物
rm -f "${PLUGIN_NAME}.bobplugin" "${PLUGIN_NAME}.zip"

# 需要包含的文件
FILES=(
  "info.json"
  "main.js"
  "README.md"
)

# 创建 zip（Bob 插件本质是 zip）
zip -r "${PLUGIN_NAME}.zip" "${FILES[@]}"

# 重命名为 .bobplugin
mv "${PLUGIN_NAME}.zip" "${PLUGIN_NAME}-${VERSION}.bobplugin"

echo "✅ 打包完成：${PLUGIN_NAME}-${VERSION}.bobplugin"
echo "双击安装或拖入 Bob 插件管理即可。"
