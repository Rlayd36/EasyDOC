#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG="$ROOT/.easydoc-logs"
mkdir -p "$LOG"

# DB_HOST, DB_USER, DB_PASSWORD 등 — 루트 .env 와 동일하게 Spring·하위 프로세스에 전달
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ROOT/.env"
  set +a
fi

# 1) 파서 서버 (8000)
cd "$ROOT/EasyDOC-frontend/easydoc-parser" && nohup python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload >"$LOG/parser.log" 2>&1 &

# 2) 최근 문서 / document-api 서버 (8002)
cd "$ROOT" && nohup python -m uvicorn database_document.document_api:app --host 0.0.0.0 --port 8002 --reload >"$LOG/document-api.log" 2>&1 &

# 3) OCR 서버 (8001)
cd "$ROOT/backend-OCR" && nohup python -m uvicorn ocr_server:app --host 0.0.0.0 --port 8001 --reload >"$LOG/ocr.log" 2>&1 &

# 4) Spring 백엔드 (8080)
cd "$ROOT/EasyDOC-backend" && chmod +x ./gradlew 2>/dev/null && nohup ./gradlew bootRun >"$LOG/backend.log" 2>&1 &

# 5) 프론트엔드 Vite (5173, foreground)
echo "parser http://localhost:8000  |  document-api http://localhost:8002  |  ocr http://localhost:8001"
echo "backend http://localhost:8080"
echo "프론트 (아래에 Vite 링크 표시). 끄려면 Ctrl+C"
echo "---"
cd "$ROOT/EasyDOC-frontend" && exec npm run dev
