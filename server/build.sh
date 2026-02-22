#!/bin/bash
set -e

# Kill any existing npm processes
pkill -f npm || true
sleep 1

echo "Building frontend..."
cd ..
rm -rf node_modules .npm package-lock.json 2>/dev/null || true
# Use a fresh npm cache location
export npm_config_cache=/tmp/npm-cache-$$
npm install --cache /tmp/npm-cache-$$
npm run build
rm -rf /tmp/npm-cache-$$

echo "Building backend..."
cd server
rm -rf node_modules .npm 2>/dev/null || true
export npm_config_cache=/tmp/npm-cache-backend-$$
npm install --cache /tmp/npm-cache-backend-$$
npx prisma generate
rm -rf /tmp/npm-cache-backend-$$

echo "Build complete!"
