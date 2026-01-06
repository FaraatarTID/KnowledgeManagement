@echo off
TITLE AIKB - AI-Native Knowledge Base Startup

echo ==========================================
echo    AIKB - AI-Native Knowledge Base
echo ==========================================
echo.

:: Check for node_modules in server
if not exist "server\node_modules\" (
    echo [1/4] Installing backend dependencies...
    cd server && npm install && cd ..
) else (
    echo [1/4] Backend dependencies already installed.
)

:: Check for node_modules in client
if not exist "client\node_modules\" (
    echo [2/4] Installing frontend dependencies...
    cd client && npm install && cd ..
) else (
    echo [2/4] Frontend dependencies already installed.
)

echo [3/4] Starting Backend Server...
start "AIKB-SERVER" cmd /k "cd server && npm run dev"

echo [4/4] Starting Frontend Client...
start "AIKB-CLIENT" cmd /k "cd client && npm run dev"

echo.
echo ==========================================
echo    READY! 
echo    - API:     http://localhost:3001
echo    - Frontend: http://localhost:3000
echo ==========================================
echo.
pause
