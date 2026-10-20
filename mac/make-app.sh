#!/bin/bash
# Monta ~/Applications/Tempo.app (ícone do Tempo, para fixar no Dock). Chamado pelo update.sh.
set -e
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
BIN=".build/release/TempoMac"
APP="$HOME/Applications/Tempo.app"
if [ ! -x "$BIN" ]; then swift build -c release -q; fi
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/TempoMac"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Tempo</string>
<key>CFBundleDisplayName</key><string>Tempo</string>
<key>CFBundleIdentifier</key><string>com.tulio.tempomac</string>
<key>CFBundleExecutable</key><string>TempoMac</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
SRC="$ROOT/icons/icon-mac-512.png"
TMP="$(mktemp -d)"
ICONSET="$TMP/AppIcon.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$SRC" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s*2))
  sips -z $d $d "$SRC" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
# Assinatura: com o certificado "Tempo Local" (criado uma vez no Acesso às Chaves), a permissão de Acessibilidade
# continua valendo depois das atualizações. Sem ele, usa a assinatura automática (a permissão cai a cada build).
if security find-identity -p codesigning | grep -q "Tempo Local"; then
  codesign --force --sign "Tempo Local" "$APP" >/dev/null 2>&1 || codesign --force --sign - "$APP" >/dev/null 2>&1 || true
else
  codesign --force --sign - "$APP" >/dev/null 2>&1 || true
fi
rm -rf "$TMP"
echo "APP_OK"
