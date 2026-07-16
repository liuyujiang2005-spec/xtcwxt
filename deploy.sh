#!/bin/bash
set -e

cd /opt/caiwuxitong

echo ">>> git pull"
git pull

if [ -f package-lock.json ]; then
  echo ">>> npm install (if needed)"
  npm install --prefer-offline
fi

echo ">>> npm run build"
npm run build

echo ">>> pm2 restart"
pm2 restart finance-system

echo ">>> pm2 save"
pm2 save

echo ">>> done"
pm2 list
