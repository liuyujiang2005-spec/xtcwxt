#!/bin/bash
set -e

cd /app

# 加载环境变量
export $(grep -v '^#' .env.local | xargs) 2>/dev/null || true

# 激活 Python 虚拟环境
source venv/bin/activate 2>/dev/null || true

# 启动 Python 表格解析服务
pm2 delete table-parser 2>/dev/null || true
pm2 start table_parser.py --name table-parser --interpreter ./venv/bin/python3 -- --serve

# 启动 Next.js
pm2 delete finance-system 2>/dev/null || true
pm2 start npm --name finance-system -- start

# 保存 pm2 配置（重启后自动恢复）
pm2 save

echo "✅ table-parser (8800) + finance-system (3000) 已启动"
echo "验证: curl http://localhost:8800/api/health"
