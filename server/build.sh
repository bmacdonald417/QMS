#!/bin/bash
set -e

echo "Building backend..."
# Frontend is pre-built and committed in dist/
npm ci
npx prisma generate

echo "Build complete!"
