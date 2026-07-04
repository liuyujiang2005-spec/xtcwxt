#!/bin/bash
set -e

cd /app

# 加载环境变量
export $(grep -v '^#' .env.local | xargs) 2>/dev/null || true

# 清理 3000 端口旧进程
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# 保持 Hermes gateway 启动逻辑不变
# （如已有 Hermes 相关命令，请保留在此处）

# 统一走 pm2 管理启动
chmod +x start.sh 2>/dev/null || true
./start.sh
