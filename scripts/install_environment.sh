#!/usr/bin/env bash
set -euo pipefail
cd /workspace/Research
export npm_config_cache=/workspace/.npm-cache
npm ci
npm run setup
npm run build
