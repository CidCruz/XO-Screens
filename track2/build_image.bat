@echo off
setlocal EnableExtensions

cd /d "%~dp0"

echo ========================================
echo Forge Vision Docker build
echo ========================================
echo Repo: %CD%
echo.

if not exist "Dockerfile" (
  echo ERROR: Dockerfile was not found.
  goto :fail
)

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
if not defined DOCKER_PLATFORM set "DOCKER_PLATFORM=linux/amd64"

echo Image   : %IMAGE_NAME%:%IMAGE_TAG%
echo Platform: %DOCKER_PLATFORM%
echo.

docker buildx build --platform "%DOCKER_PLATFORM%" -t "%IMAGE_NAME%:%IMAGE_TAG%" --load .
set "BUILD_EXIT=%ERRORLEVEL%"

echo.
echo ========================================
echo Docker build finished with exit code %BUILD_EXIT%
echo Image: %IMAGE_NAME%:%IMAGE_TAG%
echo ========================================
echo.

if not "%BUILD_EXIT%"=="0" goto :fail
goto :done

:fail
echo.
echo Docker build failed. Read the message above for the exact reason.
echo.
pause
exit /b 1

:done
echo To run the image with your local .env, use:
echo run_docker.bat
echo.
pause
exit /b 0
