@echo off
chcp 65001 >nul
title LiuShuiJ GitHub Push

echo ========================================
echo   LiuShuiJ 项目推送到 GitHub
echo ========================================
echo.

cd /d "%~dp0"

set GIT_PATH=D:\Git\bin\git.exe

echo [1/5] 检查Git...
if not exist "%GIT_PATH%" (
    echo ❌ Git 未找到！
    echo.
    pause
    exit /b 1
)
echo ✅ 找到 Git
echo.

echo [2/5] 配置用户信息...
"%GIT_PATH%" config user.name "LiuShuiJ"
"%GIT_PATH%" config user.email "2117253363@qq.com"
echo ✅ 用户信息配置完成
echo.

echo [3/5] 初始化仓库...
if not exist ".git" (
    "%GIT_PATH%" init
    echo ✅ Git 仓库初始化成功
) else (
    echo ℹ️  Git 仓库已存在
)
echo.

echo [4/5] 添加文件并提交...
"%GIT_PATH%" add .
"%GIT_PATH%" commit -m "修复手机无法使用问题：Service Worker 更新到 v1.9" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 代码提交成功
) else (
    echo ℹ️  没有新的文件需要提交，或已提交过
)
echo.

echo [5/5] 连接仓库并推送...
set REPO_URL=https://github.com/LSJ-135/vintage-clothing-manager.git
"%GIT_PATH%" remote add origin %REPO_URL% >nul 2>&1
"%GIT_PATH%" remote set-url origin %REPO_URL% >nul 2>&1
echo ✅ 已连接到仓库
echo.

echo 正在拉取远程更新...
"%GIT_PATH%" pull origin main --allow-unrelated-histories -q
echo.

echo 正在推送到 GitHub...
"%GIT_PATH%" push -u origin main
if %errorlevel% neq 0 (
    echo.
    echo 尝试推送到 master 分支...
    "%GIT_PATH%" pull origin master --allow-unrelated-histories -q
    "%GIT_PATH%" push -u origin master
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
