@echo off
REM ─────────────────────────────────────────────────────────────
REM  DataMuse Launcher — starts Qdrant, Backend, and Frontend
REM ─────────────────────────────────────────────────────────────

title DataMuse Launcher
echo.
echo  ╔══════════════════════════════════════╗
echo  ║         DataMuse Launcher            ║
echo  ╚══════════════════════════════════════╝
echo.

REM ── 1. Start Qdrant (Docker) ──
echo [1/3] Starting Qdrant (Docker)...
docker compose up -d 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [!] Docker Compose failed. Is Docker running?
    echo     Trying 'docker-compose' instead...
    docker-compose up -d 2>nul
    if %ERRORLEVEL% NEQ 0 (
        echo [!] WARNING: Could not start Qdrant. Make sure Docker Desktop is running.
        echo     Continuing anyway — Qdrant may already be running.
    )
)
echo     Qdrant: http://localhost:6333
echo.

REM ── 2. Start Backend ──
echo [2/3] Starting Backend (FastAPI)...
if exist "venv\Scripts\activate.bat" (
    start "DataMuse Backend" cmd /k "title DataMuse Backend && venv\Scripts\activate && cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
) else (
    echo [!] No venv found. Creating one...
    python -m venv venv
    start "DataMuse Backend" cmd /k "title DataMuse Backend && venv\Scripts\activate && pip install -r backend\requirements.txt && cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
)
echo     Backend: http://localhost:8000
echo.

REM ── 3. Start Frontend ──
echo [3/3] Starting Frontend (Vite)...
if exist "frontend\node_modules" (
    start "DataMuse Frontend" cmd /k "title DataMuse Frontend && cd frontend && npm run dev"
) else (
    echo [!] node_modules not found. Installing dependencies first...
    start "DataMuse Frontend" cmd /k "title DataMuse Frontend && cd frontend && npm install && npm run dev"
)
echo     Frontend: http://localhost:5173
echo.

REM ── Done ──
echo  ──────────────────────────────────────
echo   All services starting!
echo.
echo   Frontend:  http://localhost:5173
echo   Backend:   http://localhost:8000
echo   Qdrant:    http://localhost:6333
echo.
echo   Close this window or press Ctrl+C to stop.
echo  ──────────────────────────────────────
echo.
pause
