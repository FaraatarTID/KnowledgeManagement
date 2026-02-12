@echo off
setlocal ENABLEDELAYEDEXPANSION
TITLE AIKB - AI-Native Knowledge Base Startup


echo ==========================================
echo    AIKB - AI-Native Knowledge Base
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found in PATH.
    echo Install Node.js 20 LTS and retry.
    goto :end
)

for /f "tokens=1,2 delims=.v" %%a in ('node -v') do (
  set NODE_MAJOR=%%b
)
if not defined NODE_MAJOR set NODE_MAJOR=0
if !NODE_MAJOR! LSS 20 (
    echo [ERROR] Detected Node.js major version !NODE_MAJOR!.
    echo This project requires Node.js 20+ ^(Node 20 LTS recommended^).
    goto :end
)

if not exist "server\.env" (
    if exist "server\.env.example" (
        echo [0/6] Creating server\.env from server\.env.example...
        copy /Y "server\.env.example" "server\.env" >nul
    )
)

if not exist "client\.env" (
    if exist "client\.env.example" (
        echo [0/6] Creating client\.env from client\.env.example...
        copy /Y "client\.env.example" "client\.env" >nul
    )
)

:: Check for node_modules in server
if not exist "server\node_modules\" (
    echo [1/6] Installing backend dependencies...
    cd server && npm install && cd ..
    if errorlevel 1 (
        echo.
        echo [ERROR] Backend dependency install failed.
        echo If error mentions better-sqlite3/node-gyp on Windows,
        echo install Visual Studio 2022 Build Tools with Desktop development with C++,
        echo then run: npm config set msvs_version 2022
        goto :end
    )
) else (
    echo [1/6] Backend dependencies already installed.
)

:: Check for node_modules in client
if not exist "client\node_modules\" (
    echo [2/6] Installing frontend dependencies...
    cd client && npm install && cd ..
    if errorlevel 1 (
        echo.
        echo [ERROR] Frontend dependency install failed.
        goto :end
    )
) else (
    echo [2/6] Frontend dependencies already installed.
)

echo [3/6] Checking server environment validation...
cd server
node -e "import('./src/config/env.ts').then(()=>console.log('env-ok'))" >nul 2>nul
if errorlevel 1 (
    echo [WARN] Server environment validation failed.
    echo Open server\.env and ensure INITIAL_ADMIN_PASSWORD is set and strong.
    echo In LOCAL mode you can remove JWT_SECRET and the app will generate one.
    cd ..
    goto :end
)
cd ..

echo [4/6] Starting Backend Server...
start "AIKB-SERVER" cmd /k "cd server && npm run dev"

echo [5/6] Starting Frontend Client...
start "AIKB-CLIENT" cmd /k "cd client && npm run dev"

echo [6/6] Opening Browser...
start "" "http://localhost:3000"

echo.
echo ==========================================
echo    READY!
echo    - API:      http://localhost:3001
echo    - Frontend: http://localhost:3000
echo ==========================================

:end

echo.
pause
endlocal
