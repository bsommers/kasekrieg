@echo off
rem Runs the packaged app in smoke mode; output goes to %USERPROFILE%\kaesekrieg-build\smoke
set "RD=%USERPROFILE%\kaesekrieg-build"
if exist "%RD%\smoke" rmdir /s /q "%RD%\smoke"
mkdir "%RD%\smoke"
"%RD%\dist\Kaesekrieg-win32-x64\Kaesekrieg.exe" --smoke="%RD%\smoke" > "%RD%\smoke\stdout.txt" 2>&1
exit /b 0
