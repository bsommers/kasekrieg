@echo off
rem Guest-side: fetch portable NSIS (once), build Kaesekrieg-Setup-win32-x64.exe from dist\Kaesekrieg-win32-x64.
setlocal
set "RD=%USERPROFILE%\kaesekrieg-build"
set "NSIS_VER=3.10"
set "VER=%~1"
if "%VER%"=="" set "VER=1.0.0"
cd /d "%RD%" || exit /b 1
if not exist ".nsis\makensis.exe" (
  echo downloading NSIS %NSIS_VER%
  curl.exe -fsSL -o nsis.zip https://downloads.sourceforge.net/project/nsis/NSIS%%203/%NSIS_VER%/nsis-%NSIS_VER%.zip || exit /b 1
  if exist .nsis-tmp rmdir /s /q .nsis-tmp
  mkdir .nsis-tmp
  tar -xf nsis.zip -C .nsis-tmp || exit /b 1
  move ".nsis-tmp\nsis-%NSIS_VER%" .nsis >nul
  rmdir /s /q .nsis-tmp
  del nsis.zip
)
if exist .nsis-tmp rmdir /s /q .nsis-tmp
if exist nsis.zip del nsis.zip
set "NSISDIR=%RD%\.nsis"
.nsis\makensis.exe /V2 /DVERSION=%VER% "/DSRCDIR=%RD%\dist\Kaesekrieg-win32-x64" "/DOUTFILE=%RD%\dist\Kaesekrieg-Setup-win32-x64.exe" desktop\scripts\win\installer.nsi || exit /b 1
dir dist\Kaesekrieg-Setup-win32-x64.exe
exit /b 0
