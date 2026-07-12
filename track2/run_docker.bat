@echo off
setlocal EnableExtensions

cd /d "%~dp0"

echo ========================================
echo Forge Vision Docker run
echo ========================================
echo Repo: %CD%
echo.

if not exist ".env" (
  echo ERROR: .env was not found.
  echo Docker needs .env so FIREWORKS_API_KEY is available inside the container.
  goto :fail
)

if not exist "test\input" (
  echo ERROR: test\input was not found.
  goto :fail
)

if not exist "test\output" mkdir "test\output"
if not exist "token\credits usage" mkdir "token\credits usage"

where docker >nul 2>nul
if errorlevel 1 (
  echo ERROR: docker was not found on PATH.
  echo Install Docker Desktop, then try again.
  goto :fail
)

docker info >nul 2>nul
if errorlevel 1 (
  echo ERROR: Docker is installed, but the Docker daemon is not running.
  echo Start Docker Desktop, wait for it to finish starting, then try again.
  goto :fail
)

if not defined IMAGE_NAME set "IMAGE_NAME=forge-vision"
if not defined IMAGE_TAG set "IMAGE_TAG=local"
if not defined CONTAINER_PLATFORM set "CONTAINER_PLATFORM=linux/amd64"

echo Image   : %IMAGE_NAME%:%IMAGE_TAG%
echo Platform: %CONTAINER_PLATFORM%
echo Env     : %CD%\.env
echo Input   : %CD%\test\input
echo Output  : %CD%\test\output
echo Usage   : %CD%\token\credits usage
echo.

docker run --rm ^
  --platform "%CONTAINER_PLATFORM%" ^
  --env-file "%CD%\.env" ^
  -e USAGE_LOG_DIR="/usage" ^
  -v "%CD%\test\input:/input:ro" ^
  -v "%CD%\test\output:/output" ^
  -v "%CD%\token\credits usage:/usage" ^
  "%IMAGE_NAME%:%IMAGE_TAG%"
set "RUN_EXIT=%ERRORLEVEL%"

echo.
echo ========================================
echo Docker run finished with exit code %RUN_EXIT%
echo Results: %CD%\test\output\results.json
echo Usage logs: %CD%\token\credits usage
echo ========================================
echo.

if not "%RUN_EXIT%"=="0" goto :fail
goto :done

:fail
echo.
echo Docker run failed. Read the message above for the exact reason.
echo.
pause
exit /b 1

:done
pause
exit /b 0
