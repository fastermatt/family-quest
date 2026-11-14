@echo off
setlocal DisableDelayedExpansion
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v ChoreZap >nul 2>&1
if errorlevel 1 (
 echo ChoreZap automatic startup is already disabled for this account.
) else (
 reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v ChoreZap /f
 if errorlevel 1 (
  echo Could not disable automatic startup.
  pause
  exit /b 1
 )
 echo ChoreZap automatic startup disabled. Saved data and installed files remain.
)
pause
