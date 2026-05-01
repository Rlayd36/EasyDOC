@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ========================================
echo    EasyDOC 전체 서버 시작
echo ========================================
echo.

REM 1) 파싱 서버 시작 (포트 8000)
echo [1/5] 파싱 서버 시작 중... (포트 8000)
start "EasyDOC Parser Server" powershell -ExecutionPolicy Bypass -NoExit -Command "$envFile = Join-Path '%CD%' '.env'; if (Test-Path $envFile) { Get-Content $envFile | ForEach-Object { if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }; $parts = $_ -split '=', 2; if ($parts.Length -eq 2) { [Environment]::SetEnvironmentVariable($parts[0], $parts[1], 'Process') } } }; Set-Location 'EasyDOC-frontend\easydoc-parser'; py -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload --reload-include *.json"

REM 2) Spring Boot 백엔드 시작 (포트 8080)
echo [2/5] Spring Boot 백엔드 시작 중... (포트 8080)
start "EasyDOC Backend Server" powershell -ExecutionPolicy Bypass -NoExit -Command "$envFile = Join-Path '%CD%' '.env'; if (Test-Path $envFile) { Get-Content $envFile | ForEach-Object { if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }; $parts = $_ -split '=', 2; if ($parts.Length -eq 2) { [Environment]::SetEnvironmentVariable($parts[0], $parts[1], 'Process') } } }; Set-Location 'EasyDOC-backend'; .\gradlew.bat bootRun"

REM 3) 최근 문서 서버 시작 (포트 8002)
echo [3/5] 최근 문서 서버 시작 중... (포트 8002)
start "EasyDOC Document API Server" powershell -ExecutionPolicy Bypass -NoExit -Command "$envFile = Join-Path '%CD%' '.env'; if (Test-Path $envFile) { Get-Content $envFile | ForEach-Object { if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }; $parts = $_ -split '=', 2; if ($parts.Length -eq 2) { [Environment]::SetEnvironmentVariable($parts[0], $parts[1], 'Process') } } }; Set-Location '%CD%'; py -m uvicorn database_document.document_api:app --host 0.0.0.0 --port 8002 --reload"

REM 4) OCR 서버 시작 (포트 8001)
echo [4/5] OCR 서버 시작 중... (포트 8001)
start "EasyDOC OCR Server" powershell -ExecutionPolicy Bypass -NoExit -Command "$envFile = Join-Path '%CD%' '.env'; if (Test-Path $envFile) { Get-Content $envFile | ForEach-Object { if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }; $parts = $_ -split '=', 2; if ($parts.Length -eq 2) { [Environment]::SetEnvironmentVariable($parts[0], $parts[1], 'Process') } } }; Set-Location 'backend-OCR'; py -m uvicorn ocr_server:app --host 0.0.0.0 --port 8001 --reload"

REM 5) 프론트엔드 시작 (포트 5173)
echo [5/5] 프론트엔드 시작 중... (포트 5173)
start "EasyDOC Frontend Server" powershell -ExecutionPolicy Bypass -NoExit -Command "Set-Location 'EasyDOC-frontend'; npm run dev"

echo.
echo ========================================
echo    모든 서버가 시작되었습니다!
echo ========================================
echo    - 파싱 서버: http://localhost:8000
echo    - 백엔드: http://localhost:8080
echo    - 최근 문서 DB: http://localhost:8002
echo    - OCR 서버:  http://localhost:8001
echo    - 프론트엔드: http://localhost:5173
echo ========================================
echo.
pause
