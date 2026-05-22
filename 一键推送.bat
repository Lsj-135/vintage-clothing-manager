@echo off
title LiuShuiJ GitHub Push

echo ========================================
echo   LiuShuiJ 项目推送到 GitHub
echo ========================================
echo.

cd /d "%~dp0"

:: 尝试多种方式找到Git
set GIT_CMD=
if exist "D:\Git\bin\git.exe" set GIT_CMD="D:\Git\bin\git.exe"
if exist "D:\Git\cmd\git.exe" set GIT_CMD="D:\Git\cmd\git.exe"
if exist "C:\Program Files\Git\bin\git.exe" set GIT_CMD="C:\Program Files\Git\bin\git.exe"
if exist "C:\Program Files\Git\cmd\git.exe" set GIT_CMD="C:\Program Files\Git\cmd\git.exe"
if exist "C:\Program Files (x86)\Git\bin\git.exe" set GIT_CMD="C:\Program Files (x86)\Git\bin\git.exe"
if exist "%LOCALAPPDATA%\Programs\Git\bin\git.exe" set GIT_CMD="%LOCALAPPDATA%\Programs\Git\bin\git.exe"
if exist "%USERPROFILE%\AppData\Local\Programs\Git\bin\git.exe" set GIT_CMD="%USERPROFILE%\AppData\Local\Programs\Git\bin\git.exe"

:: 如果没找到，尝试PATH里的
if "%GIT_CMD%"=="" (
    where git >nul 2>&1
    if %errorlevel% equ 0 set GIT_CMD=git
)

if "%GIT_CMD%"=="" (
    echo.
    echo ❌ 无法找到 Git！
    echo.
    echo 请确认已安装 Git，或手动指定Git路径
    echo.
    pause
    exit /b 1
)

echo ✅ 找到 Git: %GIT_CMD%
echo.

echo [1/5] 配置 Git 用户信息...
%GIT_CMD% config user.name "LiuShuiJ"
%GIT_CMD% config user.email "2117253363@qq.com"
echo ✅ 用户信息配置完成
echo.

echo [2/5] 初始化仓库...
if not exist ".git" (
    %GIT_CMD% init
    echo ✅ Git 仓库初始化成功
) else (
    echo ℹ️  Git 仓库已存在
)
echo.

echo [3/5] 添加文件...
%GIT_CMD% add .
echo ✅ 文件已添加
echo.

echo [4/5] 提交更改...
%GIT_CMD% commit -m "修复手机无法使用问题：Service Worker 更新到 v1.9" -m "- Service Worker 版本从 v8 升级到 v9" -m "- 缓存策略改为网络优先" -m "- 新增清除缓存更新功能" -m "- 增加版本更新检测" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 代码提交成功
) else (
    echo ℹ️  没有新的文件需要提交，或已提交过
)
echo.

echo [5/5] 连接仓库并推送...
set REPO_URL=https://github.com/LSJ-135/vintage-clothing-manager.git
%GIT_CMD% remote add origin %REPO_URL% >nul 2>&1
%GIT_CMD% remote set-url origin %REPO_URL% >nul 2>&1
echo ✅ 已连接到仓库
echo.

echo 正在拉取远程更新...
%GIT_CMD% pull origin main --allow-unrelated-histories -q
echo.

echo 正在推送到 GitHub...
%GIT_CMD% push -u origin main
if %errorlevel% neq 0 (
    echo.
    echo 尝试推送到 master 分支...
    %GIT_CMD% pull origin master --allow-unrelated-histories -q
    %GIT_CMD% push -u origin master
)

echo.
echo ========================================
echo   完成！
echo ========================================
echo.
echo 请刷新 GitHub 页面查看更新
echo.
echo 手机端修复：打开应用 -^> 统计 -^> 清除缓存更新
echo.
pause
