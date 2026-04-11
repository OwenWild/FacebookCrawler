@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0OpenListingShelf.ps1"
if errorlevel 1 exit /b 1
endlocal
