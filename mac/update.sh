#!/bin/bash
# Atualiza e recompila o app de Mac a partir do repositório.
# Uso: ./update.sh  (rodar dentro de repo-extra/mac, no clone do GitHub)
set -e
cd "$(dirname "$0")"
git -C ../.. pull --ff-only
swift build -c release
echo "Pronto: $(pwd)/.build/release/TempoMac"
