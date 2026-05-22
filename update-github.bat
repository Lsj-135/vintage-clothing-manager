@echo off
echo ========================================
echo   LiuShuiJ 项目推送到 GitHub
echo ========================================
echo.

cd /d "%~dp0"

echo [1/5] 检查Git是否安装...
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Git 未找到，请先安装 Git
    echo 下载地址: https://git-scm.com/download/win
    pause
    exit /b 1
)
echo ✅ Git 已找到！
echo.

echo [2/5] 配置 Git 用户信息...
git config user.name "LiuShuiJ"
git config user.email "2117253363@qq.com"
echo ✅ 用户信息配置完成
echo.

echo [3/5] 初始化仓库...
if not exist ".git" (
    git init
    echo ✅ Git 仓库初始化成功
) else (
    echo ℹ️  Git 仓库已存在
)
echo.

echo [4/5] 添加文件并提交...
git add .
git commit -m "修复手机无法使用问题：Service Worker 更新到 v1.9
- Service Worker 版本从 v8 升级到 v9
- 缓存策略改为网络优先
- 新增清除缓存更新功能
- 增加版本更新检测"
echo ✅ 代码提交成功
echo.

echo [5/5] 连接仓库并推送...
set repo_url=https://github.com/LSJ-135/vintage-clothing-manager.git
git remote add origin %repo_url% >nul 2>&1
git remote set-url origin %repo_url% >nul 2>&1
echo ✅ 已连接到仓库: %repo_url%
echo.

echo 正在拉取远程更新...
git pull origin main --allow-unrelated-histories
echo.

echo 正在推送到 main 分支...
git push -u origin main
if %errorlevel% neq 0 (
    echo.
    echo 尝试推送到 master 分支...
    git pull origin master --allow-unrelated-histories
    git push -u origin master
)
echo.
echo ========================================
echo   完成！
echo ========================================
echo 请刷新 GitHub 页面查看更新
echo.
echo 手机端修复：打开应用 → 统计 → 清除缓存更新
pause
