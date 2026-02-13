@echo off
setlocal ENABLEDELAYEDEXPANSION
TITLE AIKB - AI-Native Knowledge Base Startup


echo ==========================================
echo    AIKB - AI-Native Knowledge Base
echo ==========================================
echo.

set "NODE_EXE="
if exist "%ProgramFiles%\nodejs\node.exe" (
    set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
) else (
    for /f "delims=" %%i in ('where node 2^>nul') do (
        if not defined NODE_EXE set "NODE_EXE=%%i"
    )
)

if not defined NODE_EXE (
    echo [ERROR] Node.js was not found in PATH.
    echo Install Node.js 20 LTS and retry.
    goto :end
)

for %%i in ("!NODE_EXE!") do set "NODE_BIN=%%~dpi"
if defined NODE_BIN (
    set "PATH=!NODE_BIN!;!PATH!"
)

set "NODE_MAJOR="
for /f %%a in ('"!NODE_EXE!" -p "process.versions.node.split('.')[0]" 2^>nul') do (
  set NODE_MAJOR=%%a
)
if not defined NODE_MAJOR set NODE_MAJOR=0
if !NODE_MAJOR! LSS 20 (
    echo [ERROR] Detected Node.js major version !NODE_MAJOR!.
    echo This project requires Node.js 20+ ^(Node 20 LTS recommended^).
    goto :end
)
echo [INFO] Using Node executable: !NODE_EXE!

echo [0/6] Checking OCR dependencies ^(tesseract + pdftoppm^)...
call :refresh_ocr_paths
call :ensure_tool "tesseract" "tesseract-ocr.tesseract" "Tesseract OCR"
call :ensure_tool "pdftoppm" "oschwartz10612.Poppler" "Poppler pdftoppm"

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
"!NODE_EXE!" -e "import('./src/config/env.ts').then(()=>console.log('env-ok'))" >nul 2>nul
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

goto :eof

:refresh_ocr_paths
set "TESSERACT_HINT=C:\Program Files\Tesseract-OCR"
if exist "!TESSERACT_HINT!\tesseract.exe" (
    set "TESSERACT_PATH=!TESSERACT_HINT!\tesseract.exe"
    set "PATH=!TESSERACT_HINT!;!PATH!"
)

set "POPPLER_HINT=C:\Program Files\Poppler\Library\bin"
if exist "!POPPLER_HINT!\pdftoppm.exe" (
    if not defined PDFTOPPM_PATH set "PDFTOPPM_PATH=!POPPLER_HINT!\pdftoppm.exe"
    set "PATH=!POPPLER_HINT!;!PATH!"
)

for /d %%d in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\oschwartz10612.Poppler_*") do (
    for /d %%v in ("%%d\poppler-*") do (
        if exist "%%v\Library\bin\pdftoppm.exe" (
            if not defined PDFTOPPM_PATH set "PDFTOPPM_PATH=%%v\Library\bin\pdftoppm.exe"
            set "PATH=%%v\Library\bin;!PATH!"
        )
    )
)
goto :eof

:ensure_tool
set "TOOL=%~1"
set "WINGET_ID=%~2"
set "TOOL_NAME=%~3"

where !TOOL! >nul 2>nul
if errorlevel 1 (
    echo [WARN] !TOOL_NAME! not found in PATH.
    where winget >nul 2>nul
    if errorlevel 1 (
        echo [WARN] winget is unavailable. Install !TOOL_NAME! manually.
        echo [WARN] OCR for scanned PDFs will be disabled.
        goto :eof
    )

    echo [INFO] Attempting to install !TOOL_NAME! via winget...
    winget install --id !WINGET_ID! --exact --accept-source-agreements --accept-package-agreements >nul
    if errorlevel 1 (
        echo [WARN] Automatic install for !TOOL_NAME! failed.
    ) else (
        echo [INFO] Installed !TOOL_NAME!.
    )
    call :refresh_ocr_paths
)

where !TOOL! >nul 2>nul
if errorlevel 1 (
    echo [WARN] !TOOL_NAME! is still unavailable.
    echo [WARN] Scanned PDF OCR fallback will be disabled.
) else (
    echo [INFO] !TOOL_NAME! is available.
    set "FOUND_TOOL_PATH="
    for /f "delims=" %%i in ('where !TOOL! 2^>nul') do if not defined FOUND_TOOL_PATH set "FOUND_TOOL_PATH=%%i"
    if defined FOUND_TOOL_PATH (
        if /I "!TOOL!"=="tesseract" set "TESSERACT_PATH=!FOUND_TOOL_PATH!"
        if /I "!TOOL!"=="pdftoppm" set "PDFTOPPM_PATH=!FOUND_TOOL_PATH!"
    )
)
goto :eof
