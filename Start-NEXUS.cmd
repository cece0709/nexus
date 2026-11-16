@echo off
setlocal
cd /d "%~dp0"
set "NEXUS_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  set "NEXUS_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
if not exist dist\index.html (
  echo Build missing. Run pnpm install and pnpm build first.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4173 in your browser after the server starts.
"%NEXUS_NODE%" scripts\serve.mjs
pause
