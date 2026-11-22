@echo off
setlocal
pushd "%~dp0" || exit /b 1
node "%~dp0server.mjs" --open
set "PRESS_EXIT=%ERRORLEVEL%"
popd
exit /b %PRESS_EXIT%
