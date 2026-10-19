#!/bin/bash
# Atualiza o código do repositório e recompila o app de Mac só quando houve mudança.
# Saída: SEM_MUDANCA ou ATUALIZADO. Usado pelo próprio app (menu "Atualizar app" e ao abrir).
set -e
cd "$(dirname "$0")"
REPO="$(cd .. && pwd)"
before=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" pull --ff-only -q
after=$(git -C "$REPO" rev-parse HEAD)
if [ "$before" = "$after" ] && [ -x .build/release/TempoMac ]; then
  if [ ! -d "$HOME/Applications/Tempo.app" ]; then bash ./make-app.sh >/dev/null; fi
  echo "SEM_MUDANCA"; exit 0
fi
swift build -c release -q
bash ./make-app.sh >/dev/null
echo "ATUALIZADO"
