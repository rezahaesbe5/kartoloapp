#!/usr/bin/env bash
# ============================================================================
# Kartolo SuperApps — Build & Run Script (Source-Based)
# ============================================================================
set -euo pipefail

# Script ada di scripts/, compose ada di dockerconfig/ (sibling folder).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_DIR="$(cd "$SCRIPT_DIR/../dockerconfig" && pwd)"
cd "$COMPOSE_DIR"

echo "══════════════════════════════════════"
echo "  Kartolo SuperApps — Docker Manager"
echo "══════════════════════════════════════"

# 1. Cek prerequisite
command -v docker >/dev/null 2>&1 || { echo "ERROR: docker tidak ditemukan."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: docker compose plugin tidak ada."; exit 1; }

# 2. Build images (dari source)
echo "[1/3] Building images (this might take a while for the first time)..."
docker compose build

# 3. Up services
echo "[2/3] Starting services..."
docker compose up -d

# 4. Wait & Check
echo "[3/3] Checking status..."
sleep 5
docker compose ps

echo ""
echo "✅ Kartolo SuperApps is running!"
echo "   Frontend: http://127.0.0.1:8080"
echo "   Gateway : http://127.0.0.1:3000"
echo "   Logs    : Use 'docker compose logs -f' to see logs."
echo "══════════════════════════════════════"
