$ErrorActionPreference = "Stop"

Write-Host "[1/3] Next.js dev server should be running on :3000"
Write-Host "[2/3] Start FastAPI environment service on :8000"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
