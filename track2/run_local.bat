@echo off
setlocal EnableExtensions

cd /d "%~dp0"

echo ========================================
echo Forge Vision local run
echo ========================================
echo Repo: %CD%
echo.

if not exist ".env" (
  echo ERROR: .env was not found.
  echo Expected .env in this folder with FIREWORKS_API_KEY set.
  goto :fail
)

if not exist "model_config.json" (
  echo ERROR: model_config.json was not found.
  goto :fail
)

set "PYTHON_EXE=%CD%\.venv\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
  where python >nul 2>nul
  if errorlevel 1 (
    echo ERROR: python was not found on PATH.
    goto :fail
  )

  echo Creating local Python environment in .venv...
  python -m venv "%CD%\.venv"
  if errorlevel 1 (
    echo ERROR: Failed to create .venv.
    goto :fail
  )
)

"%PYTHON_EXE%" -c "import requests, dotenv, truststore" >nul 2>nul
if errorlevel 1 (
  echo Installing local Python dependencies...
  "%PYTHON_EXE%" -m pip install --disable-pip-version-check requests==2.32.3 python-dotenv==1.0.1 truststore==0.10.1
  if errorlevel 1 (
    echo ERROR: Failed to install local Python dependencies.
    goto :fail
  )
)

set "FFMPEG_BIN="
for /d %%D in ("%CD%\tools\ffmpeg\ffmpeg-*") do (
  if exist "%%~fD\bin\ffmpeg.exe" if exist "%%~fD\bin\ffprobe.exe" set "FFMPEG_BIN=%%~fD\bin"
)

if not defined FFMPEG_BIN (
  where ffmpeg >nul 2>nul
  if not errorlevel 1 (
    where ffprobe >nul 2>nul
    if not errorlevel 1 set "FFMPEG_BIN=PATH"
  )
)

if not defined FFMPEG_BIN (
  echo ERROR: ffmpeg and ffprobe were not found.
  echo Expected portable ffmpeg under tools\ffmpeg, or ffmpeg/ffprobe on PATH.
  goto :fail
)

if not "%FFMPEG_BIN%"=="PATH" set "PATH=%FFMPEG_BIN%;%PATH%"

if not defined INPUT_PATH_OVERRIDE set "INPUT_PATH_OVERRIDE=%CD%\test\input\tasks_quick.json"
if not defined OUTPUT_PATH_OVERRIDE set "OUTPUT_PATH_OVERRIDE=%CD%\test\output\results.json"

if not exist "%INPUT_PATH_OVERRIDE%" (
  echo ERROR: Input file was not found:
  echo %INPUT_PATH_OVERRIDE%
  goto :fail
)

if not exist "%CD%\test\output" mkdir "%CD%\test\output"

echo Python:
"%PYTHON_EXE%" --version
echo.
echo ffmpeg:
ffmpeg -version | findstr /B /C:"ffmpeg version"
echo.
echo Input : %INPUT_PATH_OVERRIDE%
echo Output: %OUTPUT_PATH_OVERRIDE%
echo.

"%PYTHON_EXE%" agent.py
set "RUN_EXIT=%ERRORLEVEL%"

echo.
echo ========================================
echo Agent finished with exit code %RUN_EXIT%
echo Results: %OUTPUT_PATH_OVERRIDE%
echo Usage logs: %CD%\token\credits usage
echo ========================================
echo.

if not "%RUN_EXIT%"=="0" goto :fail
goto :done

:fail
echo.
echo Local run failed. Read the message above for the exact reason.
echo.
pause
exit /b 1

:done
pause
exit /b 0
