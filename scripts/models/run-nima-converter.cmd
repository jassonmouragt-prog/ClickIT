@echo off
setlocal
set "CLICKIT_NIMA_ROOT=%~dp0..\.."
for %%I in ("%CLICKIT_NIMA_ROOT%") do set "CLICKIT_NIMA_ROOT=%%~fI"
set "CLICKIT_NIMA_MODE_FILE=%CLICKIT_NIMA_ROOT%\.nima-converter-mode"
if not exist "%CLICKIT_NIMA_MODE_FILE%" (
  echo NIMA conversion environment missing. Run scripts\models\setup-nima-converter.ps1 first.
  exit /b 1
)
set /p CLICKIT_NIMA_MODE=<"%CLICKIT_NIMA_MODE_FILE%"
if /i "%CLICKIT_NIMA_MODE%"=="docker" goto docker
if /i "%CLICKIT_NIMA_MODE%"=="local-python37" goto local
echo Invalid NIMA converter mode in .nima-converter-mode: %CLICKIT_NIMA_MODE%
exit /b 1

:docker
where docker >nul 2>nul
if errorlevel 1 (
  echo Docker CLI is no longer available. Rerun scripts\models\setup-nima-converter.ps1.
  exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
  echo Docker Engine is unavailable. Start Docker Desktop and rerun scripts\models\setup-nima-converter.ps1.
  exit /b 1
)
echo NIMA converter mode: docker
docker run --rm -v "%CLICKIT_NIMA_ROOT%:/workspace" -w /workspace clickit-nima-converter:tf2.0 --weights resources/models/weights_mobilenet_aesthetic_0.07.hdf5 %*
exit /b %ERRORLEVEL%

:local
set "CLICKIT_NIMA_PY=%CLICKIT_NIMA_ROOT%\.venv-nima-conversion\Scripts\python.exe"
if not exist "%CLICKIT_NIMA_PY%" (
  echo Local Python 3.7 environment missing. Run scripts\models\setup-nima-converter.ps1 first.
  exit /b 1
)
echo NIMA converter mode: local-python37
"%CLICKIT_NIMA_PY%" "%CLICKIT_NIMA_ROOT%\scripts\models\convert-nima-to-onnx.py" --weights "%CLICKIT_NIMA_ROOT%\resources\models\weights_mobilenet_aesthetic_0.07.hdf5" %*
exit /b %ERRORLEVEL%
