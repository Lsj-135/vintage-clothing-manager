@echo off
cd /d "%~dp0"
echo 正在启动服务器...
echo 请访问 http://localhost:8080
echo.

:: 尝试使用 Python
python -m http.server 8080 >nul 2>&1
if %errorlevel% equ 0 goto running

:: 尝试使用 Python3
python3 -m http.server 8080 >nul 2>&1
if %errorlevel% equ 0 goto running

:: 尝试使用 Node.js
node -e "require('http').createServer((req,res)=>{const fs=require('fs'),path=require('path');let file='.'+req.url;if(file==='./')file='./index.html';fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end('Not Found');}else{const ext=path.extname(file);const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};res.writeHead(200,{'Content-Type':types[ext]||'text/plain'});res.end(data);}});}).listen(8080,()=>console.log('Server running at http://localhost:8080/'));" >nul 2>&1
if %errorlevel% equ 0 goto running

echo 错误：未找到 Python 或 Node.js
echo 请安装 Python 或 Node.js 后重试
pause
exit /b 1

:running
echo 服务器已启动！
echo 请访问 http://localhost:8080
echo 按任意键停止服务器...
pause >nul
