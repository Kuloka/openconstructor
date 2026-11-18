@echo off
rem openconstructor desktop: double-click to start (or run from any terminal, PowerShell included).
rem Installs Electron on the first run. ELECTRON_RUN_AS_NODE is cleared: VS Code terminals set it, and then
rem Electron would start as plain Node instead of opening the window.
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing Electron, one time only...
  call npm.cmd install || (echo npm install failed & pause & exit /b 1)
)
start "" "node_modules\electron\dist\electron.exe" .
