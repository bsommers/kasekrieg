@echo off
rem Guest-side: silent install -> smoke the installed exe -> silent uninstall -> verify removal. Result lines in %RD%\install-test.log
setlocal
set "RD=%USERPROFILE%\kaesekrieg-build"
set "D=%LOCALAPPDATA%\Programs\Kaesekrieg"
set "L=%RD%\install-test.log"
if exist "%D%" rmdir /s /q "%D%"
echo start > "%L%"
start /wait "" "%RD%\dist\Kaesekrieg-Setup-win32-x64.exe" /S
if exist "%D%\Kaesekrieg.exe" (echo INSTALL_EXE=ok>>"%L%") else (echo INSTALL_EXE=missing>>"%L%")
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Kaesekrieg\KAESEKRIEG.lnk" (echo SHORTCUT=ok>>"%L%") else (echo SHORTCUT=missing>>"%L%")
reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Kaesekrieg /v DisplayName >nul 2>&1 && (echo UNINSTALL_ENTRY=ok>>"%L%") || (echo UNINSTALL_ENTRY=missing>>"%L%")
if exist "%RD%\smoke-inst" rmdir /s /q "%RD%\smoke-inst"
mkdir "%RD%\smoke-inst"
"%D%\Kaesekrieg.exe" --smoke="%RD%\smoke-inst" > "%RD%\smoke-inst\stdout.txt" 2>&1
if exist "%RD%\smoke-inst\smoke.json" (echo SMOKE_JSON=present>>"%L%") else (echo SMOKE_JSON=missing>>"%L%")
rem NSIS uninstaller copies itself to temp and re-launches, so wait by polling
start /wait "" "%D%\Uninstall.exe" /S
for /l %%i in (1,1,30) do if exist "%D%" (ping -n 2 127.0.0.1 >nul)
if exist "%D%" (echo UNINSTALL_DIR=still-present>>"%L%") else (echo UNINSTALL_DIR=removed>>"%L%")
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Kaesekrieg" (echo UNINSTALL_SHORTCUT=still-present>>"%L%") else (echo UNINSTALL_SHORTCUT=removed>>"%L%")
reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Kaesekrieg >nul 2>&1 && (echo UNINSTALL_REG=still-present>>"%L%") || (echo UNINSTALL_REG=removed>>"%L%")
echo done>>"%L%"
exit /b 0
