#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  DataMuse Launcher — starts Qdrant, Backend, and Frontend
# ─────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║         DataMuse Launcher            ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Cleanup on exit — kill background processes
cleanup() {
    echo ""
    echo "  Shutting down..."
    [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
    echo "  All services stopped."
    exit 0
}
trap cleanup SIGINT SIGTERM

# ── 1. Start Qdrant (Docker) ──
echo "[1/3] Starting Qdrant (Docker)..."
if command -v docker &>/dev/null; then
    docker compose up -d 2>/dev/null || docker-compose up -d 2>/dev/null || {
        echo "  [!] WARNING: Could not start Qdrant. Is Docker running?"
        echo "      Continuing anyway — Qdrant may already be running."
    }
else
    echo "  [!] Docker not found. Skipping Qdrant start."
    echo "      Make sure Qdrant is running on localhost:6333."
fi
echo "      Qdrant: http://localhost:6333"
echo ""

# ── 2. Start Backend ──
echo "[2/3] Starting Backend (FastAPI)..."
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "  [!] No venv found. Creating one..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r backend/requirements.txt
fi

cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd "$SCRIPT_DIR"
echo "      Backend: http://localhost:8000 (PID: $BACKEND_PID)"
echo ""

# ── 3. Start Frontend ──
echo "[3/3] Starting Frontend (Vite)..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "  [!] node_modules not found. Installing dependencies..."
    npm install
fi
npm run dev &
FRONTEND_PID=$!
cd "$SCRIPT_DIR"
echo "      Frontend: http://localhost:5173 (PID: $FRONTEND_PID)"
echo ""

# ── Done ──
echo "  ──────────────────────────────────────"
echo "   All services running!"
echo ""
echo "   Frontend:  http://localhost:5173"
echo "   Backend:   http://localhost:8000"
echo "   Qdrant:    http://localhost:6333"
echo ""
echo "   Press Ctrl+C to stop all services."
echo "  ──────────────────────────────────────"
echo ""

# Wait for background processes
wait
