#!/usr/bin/env bash
set -euo pipefail
source "$HOME/.nvm/nvm.sh"
nvm use 22

WIN_REPO="/mnt/c/Users/USER/ekpomalife"
LINUX_REPO="$HOME/ekpomalife"

mkdir -p "$LINUX_REPO"
rsync -a --delete \
  --exclude node_modules \
  --exclude node_modules.win.bak \
  --exclude .next \
  --exclude .open-next \
  --exclude .wrangler \
  --exclude vendor \
  --exclude .git \
  "$WIN_REPO/" "$LINUX_REPO/"

cd "$LINUX_REPO"
rm -rf .next .open-next

npm ci --no-fund --no-audit
npm uninstall @next/swc-win32-x64-msvc --no-save 2>/dev/null || true

export NEXT_PUBLIC_API_URL=https://api.ekpomalife.app
export NEXT_PUBLIC_USE_MOCKS=false

export CLOUDFLARE_ACCOUNT_ID=62e712ff3be5c917ea6b72c4ca948cd4
mkdir -p "$HOME/.config/.wrangler/config"
WIN_CFG="/mnt/c/Users/USER/AppData/Roaming/xdg.config/.wrangler/config/default.toml"
if [ -f "$WIN_CFG" ]; then
  cp "$WIN_CFG" "$HOME/.config/.wrangler/config/default.toml"
fi

rm -f public/models/hostelbuildings.zip
npm run pages:build
find .open-next -type f \( -name '*.zip' -size +24M -o -iname 'hostelbuildings.zip' \) -print -delete 2>/dev/null || true
npx wrangler deploy
