#!/usr/bin/env bash
#
# Captura os prints do manual (manual/prints) e os assets do site em tema
# escuro, a partir de repositórios de DEMONSTRAÇÃO (dados fictícios).
#
# Uso:
#   scripts/shots-run.sh            # captura os 17 prints do manual
#   scripts/shots-run.sh --site     # também copia as 6 imagens do site
#   scripts/shots-run.sh --only=01,05
#
# Requisitos: app empacotado em dist/linux-unpacked (npm run build &&
# npx electron-builder --dir). Ver scripts/manual-shots.cjs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${SHOTS_BASE:-/tmp/opencode/treeline-shots}"
export DEMO_DIR="${DEMO_DIR:-/tmp/opencode/treeline-demo}"
APP="$ROOT/dist/linux-unpacked/treeline-git-gui"
PORT="${SHOTS_PORT:-9222}"

# 1. repositórios de demonstração (idempotente)
node "$ROOT/scripts/make-demo-repo.js"

# 2. o app precisa estar empacotado
if [ ! -x "$APP" ]; then
  echo "build ausente: rode 'npm run build && npx electron-builder --dir'" >&2
  exit 1
fi

# 3. perfil isolado (sem bookmarks/abas/config pessoais)
rm -rf "$BASE"
mkdir -p "$BASE/home" "$BASE/config/TreeLine"
cat > "$BASE/home/.bashrc" <<'EOF'
export PS1='\W $ '
export HISTFILE=/dev/null
EOF
printf '["%s/aurora"]' "$DEMO_DIR" > "$BASE/config/TreeLine/bookmarks.json"

# 4. derruba instância anterior (o comm corta o nome em 15 chars)
pkill -x treeline-git-gu 2>/dev/null || true
sleep 1

# 5. sobe o app com a porta de debug
HOME="$BASE/home" XDG_CONFIG_HOME="$BASE/config" SHELL=/bin/bash \
  ELECTRON_ENABLE_LOGGING=1 setsid nohup "$APP" \
  --no-sandbox --disable-setuid-sandbox --disable-gpu --ozone-platform-hint=auto \
  --remote-debugging-port="$PORT" > "$BASE/app.log" 2>&1 < /dev/null &
for _ in $(seq 1 60); do
  curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1 && break
  sleep 0.5
done

# 6. captura (sempre limpa o app ao terminar, mesmo em erro)
trap 'pkill -x treeline-git-gu 2>/dev/null || true' EXIT
node "$ROOT/scripts/manual-shots.cjs" "$@"
