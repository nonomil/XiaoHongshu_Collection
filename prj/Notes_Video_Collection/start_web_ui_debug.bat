@echo off
setlocal
chcp 65001 >nul

set "ROOT_DIR=%~dp0"
set "PROJECT_DIR=%ROOT_DIR%prj"
set "PYTHON_EXE=%PROJECT_DIR%\.venv\Scripts\python.exe"
if not defined WEB_HOST set "WEB_HOST=127.0.0.1"
if not defined WEB_PORT set "WEB_PORT=7860"
if not defined FALLBACK_WEB_PORT set "FALLBACK_WEB_PORT=7861"

if not exist "%PYTHON_EXE%" (
  echo [错误] 未找到虚拟环境：%PYTHON_EXE%
  echo [提示] 请先进入 prj 目录执行安装：
  echo   python -m venv .venv
  echo   .venv\Scripts\python -m pip install -e .[dev,asr,media,web]
  pause
  exit /b 1
)

cd /d "%PROJECT_DIR%"
set "PYTHONPATH=%PROJECT_DIR%\src;%PYTHONPATH%"
call :select_web_port
if errorlevel 1 (
  pause
  exit /b 1
)

echo [信息] 调试模式启动本地 Web 工作台...
echo [信息] 当前目录：%PROJECT_DIR%
echo [信息] Python：%PYTHON_EXE%
echo [信息] 启动地址：http://%WEB_HOST%:%WEB_PORT%/
echo [信息] 该窗口会保留日志输出，便于排查问题。
echo.

set "PYTHONUNBUFFERED=1"
"%PYTHON_EXE%" -X dev -m video_summary_cli.cli web --host %WEB_HOST% --port %WEB_PORT%
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo [信息] Web 工作台已退出，退出码：%EXIT_CODE%
pause
exit /b %EXIT_CODE%

:select_web_port
call :check_port_in_use "%WEB_PORT%"
if "%PORT_IN_USE%"=="0" exit /b 0

echo [提示] 端口 %WEB_PORT% 已被占用，尝试切换到 %FALLBACK_WEB_PORT%...
call :check_port_in_use "%FALLBACK_WEB_PORT%"
if "%PORT_IN_USE%"=="0" (
  set "WEB_PORT=%FALLBACK_WEB_PORT%"
  exit /b 0
)

echo [错误] 端口 %WEB_PORT% 和 %FALLBACK_WEB_PORT% 都被占用，请先释放端口或手动指定。
exit /b 1

:check_port_in_use
set "PORT_IN_USE=0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r /c:":%~1 .*LISTENING"') do (
  set "PORT_IN_USE=1"
  goto :eof
)
exit /b 0
