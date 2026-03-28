@echo off
chcp 65001 > nul
echo ========================================
echo    EasyDOC 전체 서버 종료
echo ========================================
echo.

echo [1/5] 프론트엔드 종료 중...
taskkill /FI "WindowTitle eq EasyDOC Frontend Server*" /F > nul 2>&1

echo [2/5] 백엔드 종료 중...
taskkill /FI "WindowTitle eq EasyDOC Backend Server*" /F > nul 2>&1

echo [3/5] 파싱 서버 종료 중...
taskkill /FI "WindowTitle eq EasyDOC Parser Server*" /F > nul 2>&1

echo [4/5] 최근 문서 DB 서버 종료 중...
taskkill /FI "WindowTitle eq EasyDOC Document API Server*" /F > nul 2>&1

echo [5/5] Java/Node 프로세스 정리 중...
taskkill /IM java.exe /F > nul 2>&1
taskkill /IM node.exe /F > nul 2>&1
taskkill /IM python.exe /F > nul 2>&1

echo.
echo ========================================
echo    모든 서버가 종료되었습니다!
echo ========================================
echo.
pause
