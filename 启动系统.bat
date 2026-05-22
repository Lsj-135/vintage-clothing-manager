@echo off
echo ========================================
echo   启动 LiuShuiJ 服装管理系统
echo ========================================
echo.

cd /d "%~dp0"

echo 正在打开系统...
start index.html

echo.
echo ========================================
echo   系统已在浏览器中打开！
echo ========================================
echo.
echo 如果需要通过网络访问（手机也能用），
echo 建议使用 VS Code 的 Live Server 或其他HTTP服务器
echo.
pause
