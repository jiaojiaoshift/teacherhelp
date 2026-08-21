@echo off
setlocal
set "TEACHHELPER_ROOT=%~dp0"
node "%TEACHHELPER_ROOT%scripts\teacherhelp-cli.mjs" %*
