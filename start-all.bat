@echo off
chcp 65001 > nul
echo ========================================
echo    EasyDOC 전체 서버 시작
echo ========================================
echo.

REM MySQL 서비스 시작 (관리자 권한 필요)
echo [1/4] MySQL 서비스 시작 중...
powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-Command', 'Start-Service MySQL; Write-Host MySQL started; Start-Sleep -Seconds 2'"
timeout /t 3 /nobreak > nul

REM 파싱 서버 시작 (포트 8000)
echo [2/4] 파싱 서버 시작 중... (포트 8000)
start "EasyDOC Parser Server" powershell -ExecutionPolicy Bypass -NoExit -Command "cd EasyDOC-frontend\easydoc-parser; uvicorn main:app --reload"

REM 백엔드 Spring Boot 시작 (포트 8080)
echo [3/4] Spring Boot 백엔드 시작 중... (포트 8080)
start "EasyDOC Backend Server" powershell -ExecutionPolicy Bypass -NoExit -Command "cd EasyDOC-backend; .\gradlew.bat bootRun"

REM 프론트엔드 시작 (포트 5173)
echo [4/4] 프론트엔드 시작 중... (포트 5173)
start "EasyDOC Frontend Server" powershell -ExecutionPolicy Bypass -NoExit -Command "cd EasyDOC-frontend; npm run dev"

echo.
echo ========================================
echo    모든 서버가 시작되었습니다!
echo ========================================
echo    - 파싱 서버: http://localhost:8000
echo    - 백엔드: http://localhost:8080
echo    - 프론트엔드: http://localhost:5173
echo ========================================
echo.
pause
