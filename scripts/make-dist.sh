#!/bin/bash
# Script autônomo para build distribuição TreeLine sem sudo
# Roda em GitHub Actions ubuntu-latest ou qualquer ambiente Linux
set -e

echo "📦 Iniciando build distribution TreeLine..."

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
echo "📋 Versão: $VERSION"

# Build .deb and AppImage using electron-builder
# A confiança que removedos o sudo do workflow depende disto funcionar
echo "🔨 Build .deb..."
npx electron-builder --linux deb --publish never --config linux.nodeOptions=--no-sandbox 2>&1 || {
  echo "⚠️ Build .deb falhou, tentando AppImage apenas..."
  BUILD_DEB_FAILED=true
}

echo "🔨 Build AppImage..."
npx electron-builder --linux appimage --publish never --config linux.nodeOptions=--no-sandbox 2>&1 || {
  echo "⚠️ Build AppImage falhou também..."
  BUILD_APPIMAGE_FAILED=true
}

# Check what was built
echo "📁 Verificando arquivos gerados..."
ls -la dist/ 2>/dev/null || {
  echo "❌ Nenhum arquivo gerado em dist/"
  exit 1
}

# List generated files
echo "✅ Arquivos gerados:"
ls dist/

# Generate checksums if not already present
if [ -f dist/SHA256SUMS ]; then
  echo "✅ Checksums SHA256SUMS já existentes"
else
  echo "🔢 Gerando checksums SHA256SUMS..."
  cd dist
  sha256sum ./*.deb ./*.AppImage > SHA256SUMS 2>/dev/null || echo "⚠️ Não foi possível gerar checksums"
  cd ..
fi

echo "🏁 Build distribution concluído!"
echo "📦 Para publicar: faça upload dos arquivos em dist/ ou use GitHub Actions"
