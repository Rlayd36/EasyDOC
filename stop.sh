#!/usr/bin/env bash
# start.sh 로 띄운 parser(8000) / document-api(8002) / ocr(8001) / backend(8080) / frontend(5173) 종료
for port in 5173 8080 8002 8001 8000; do
  pids=$(lsof -ti:"$port" 2>/dev/null) || true
  if [[ -n "$pids" ]]; then
    kill $pids 2>/dev/null || true
  fi
done

# 정상 종료가 안 된 프로세스만 강제 종료
sleep 1
for port in 5173 8080 8002 8001 8000; do
  pids=$(lsof -ti:"$port" 2>/dev/null) || true
  [[ -n "$pids" ]] && kill -9 $pids 2>/dev/null || true
done

echo "종료: 5173, 8080, 8002, 8001, 8000"
