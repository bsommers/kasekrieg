@echo off
rem Guest-side build. Runs inside %USERPROFILE%\kaesekrieg-build only.
setlocal
set "RD=%USERPROFILE%\kaesekrieg-build"
set "NODE_VER=%~1"
if "%NODE_VER%"=="" set "NODE_VER=22.12.0"
cd /d "%RD%" || exit /b 1
if not exist ".node\node.exe" (
  echo downloading node %NODE_VER%
  curl.exe -fsSL -o node.zip https://nodejs.org/dist/v%NODE_VER%/node-v%NODE_VER%-win-x64.zip || exit /b 1
  if exist .node-tmp rmdir /s /q .node-tmp
  mkdir .node-tmp
  tar -xf node.zip -C .node-tmp || exit /b 1
  for /d %%D in (.node-tmp\node-*) do move "%%D" .node >nul
  rmdir /s /q .node-tmp
  del node.zip
)
set "PATH=%RD%\.node;%SystemRoot%\System32;%SystemRoot%"
set "npm_config_cache=%RD%\.npm-cache"
node -v || exit /b 1
cd desktop || exit /b 1
call npm ci --no-audit --no-fund || exit /b 1
if exist ..\dist rmdir /s /q ..\dist
node build.mjs --platform win32 --arch x64 || exit /b 1
cd ..\dist
if exist Kaesekrieg-win32-x64.zip del Kaesekrieg-win32-x64.zip
tar -a -c -f Kaesekrieg-win32-x64.zip Kaesekrieg-win32-x64 || exit /b 1
dir Kaesekrieg-win32-x64.zip
exit /b 0
