#!/bin/bash
cd /root/xtcwxt
set -a
source .env
set +a
source venv/bin/activate
exec python3 table_parser.py --serve --port 8800
