@echo off
setlocal EnableExtensions

cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 goto :no_git

set "BRANCH="
for /f "delims=" %%i in ('git branch --show-current 2^>nul') do set "BRANCH=%%i"
if not defined BRANCH goto :no_repo

git remote get-url origin >nul 2>nul
if errorlevel 1 goto :no_origin

echo Current branch: %BRANCH%
echo.
git status --short
echo.

set /p COMMIT_MSG=Enter commit message (blank for default): 
if not defined COMMIT_MSG set "COMMIT_MSG=chore: update project files"

git add -A
if errorlevel 1 goto :add_failed

git diff --cached --quiet
if errorlevel 1 goto :do_commit
goto :do_push

:do_commit
git commit -m "%COMMIT_MSG%"
if errorlevel 1 goto :commit_failed

:do_push
git push origin %BRANCH%
if errorlevel 1 goto :push_failed

echo.
echo [OK] Pushed to origin/%BRANCH%
pause
exit /b 0

:no_git
echo [ERROR] Git was not found in PATH.
pause
exit /b 1

:no_repo
echo [ERROR] Current folder is not a valid Git repository.
pause
exit /b 1

:no_origin
echo [ERROR] Remote "origin" was not found.
pause
exit /b 1

:add_failed
echo [ERROR] git add failed.
pause
exit /b 1

:commit_failed
echo [ERROR] git commit failed.
pause
exit /b 1

:push_failed
echo [ERROR] git push failed.
pause
exit /b 1
