#!/bin/bash
set -e

echo "Building frontend..."
cd ..
if [ -d "node_modules" ]; then
  rm -rf node_modules
fi
npm install
npm run build

echo "Building backend..."
cd server
if [ -d "node_modules" ]; then
  rm -rf node_modules
fi
npm install
npx prisma generate

echo "Build complete!"
