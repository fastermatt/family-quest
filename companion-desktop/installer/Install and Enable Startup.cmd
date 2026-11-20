@echo off
setlocal DisableDelayedExpansion
title ChoreZap - Enable automatic startup
echo ChoreZap will start automatically when THIS Windows account signs in.
echo Run this from your child's account, NOT from your parent account.
echo Setup will stop ChoreZap in this account, install the update, and restart it.
echo The last few seconds of unsaved tracking may be lost.
echo.
pause
set "czInstallDir=%LOCALAPPDATA%\Programs\ChoreZap"
if not exist "%~dp0ChoreZap-Desktop.exe" goto missingfiles
if not exist "%~dp0server.json" goto missingfiles
if not exist "%~dp0ChoreZap.ico" goto missingfiles
echo Stopping ChoreZap...
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; try { $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $cache=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'ChoreZapDesktop\updates'))+'\'; $targets=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'ChoreZap-Desktop.exe' -or ($_.Name -match '^[a-f0-9]{64}\.exe$' -and $_.ExecutablePath -and $_.ExecutablePath.StartsWith($cache,[StringComparison]::OrdinalIgnoreCase)) } | Where-Object { (Invoke-CimMethod -InputObject $_ -MethodName GetOwnerSid).Sid -eq $sid } | Sort-Object @{Expression={if($_.Name -eq 'ChoreZap-Desktop.exe' -and $_.CommandLine -notmatch '(?i)(^|\s)-worker(\s|$)'){0}else{1}}}); foreach($item in $targets) { $proc=Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue; if($proc){ Stop-Process -InputObject $proc -Force -ErrorAction Stop; if(-not $proc.WaitForExit(10000)){throw 'ChoreZap did not stop in time'} } }; Start-Sleep -Seconds 2; Write-Host 'ChoreZap stopped. Installing update.' } catch { Write-Host ('Cannot stop ChoreZap: '+$_.Exception.Message); exit 1 }"
if errorlevel 1 goto failed

if not exist "%czInstallDir%" mkdir "%czInstallDir%"
if not exist "%czInstallDir%" goto failed
copy /y "%~dp0ChoreZap-Desktop.exe" "%czInstallDir%\ChoreZap-Desktop.exe" >nul
if errorlevel 1 goto failed
copy /y "%~dp0server.json" "%czInstallDir%\server.json" >nul
if errorlevel 1 goto failed
copy /y "%~dp0ChoreZap.ico" "%czInstallDir%\ChoreZap.ico" >nul
if errorlevel 1 goto failed
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; $folder=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'; $link=Join-Path $folder 'ChoreZap.lnk'; $shell=New-Object -ComObject WScript.Shell; $shortcut=$shell.CreateShortcut($link); $shortcut.TargetPath=Join-Path $env:czInstallDir 'ChoreZap-Desktop.exe'; $shortcut.WorkingDirectory=$env:czInstallDir; $shortcut.IconLocation=Join-Path $env:czInstallDir 'ChoreZap.ico'; $shortcut.Description='Open ChoreZap desktop dashboard'; $shortcut.Save()"
if errorlevel 1 goto failed
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v ChoreZap /t REG_SZ /d "\"%czInstallDir%\ChoreZap-Desktop.exe\"" /f >nul
if errorlevel 1 goto failed
echo.
echo Startup enabled for this account. ChoreZap is installed at:
echo %czInstallDir%
echo Its dashboard opens at sign-in. Closing the browser keeps tracking running.
echo Keep ChoreZap enabled in Windows Settings - Apps - Startup.
echo Restart Windows and sign into this same account to verify startup.
echo Your saved pairing and usage have not been removed.
start "" "%czInstallDir%\ChoreZap-Desktop.exe"
pause
exit /b 0
:failed
echo.
echo Setup did not finish. See the error above. Your saved pairing is unchanged.
echo If Windows blocked a file, keep its security protections enabled.
echo Existing pairing and usage were not deleted.
pause
exit /b 1

:missingfiles
echo.
echo ChoreZap files are missing beside this installer.
echo Do not run this file from inside the ZIP preview.
echo Right-click the downloaded ZIP, choose Extract All, then open the extracted folder.
echo Run Install and Enable Startup.cmd from that folder.
echo If files are still missing, check Windows Security Protection History.
echo No running apps or settings were changed.
pause
exit /b 1
