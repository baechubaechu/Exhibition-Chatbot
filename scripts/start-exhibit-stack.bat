@echo off
setlocal

echo [1/2] Starting Next.js dev server...
start "exhibit-next" cmd /k "cd /d %~dp0.. && npm run dev"

echo [2/2] Starting Spatial Environment Service...
start "exhibit-env" cmd /k "cd /d %~dp0..\spatial-environment-agent && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

echo Done. Open tablet URL: http://<laptop-ip>:3000
