# LiuShuiJ 项目推送到 GitHub - PowerShell版本
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LiuShuiJ 项目推送到 GitHub" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 设置项目目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# [1/5] 检查Git
Write-Host "[1/5] 检查Git是否安装..." -ForegroundColor Yellow
try {
    $gitVersion = git --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Git 未找到，请先安装 Git" -ForegroundColor Red
        Write-Host "下载地址: https://git-scm.com/download/win" -ForegroundColor Gray
        Read-Host "按回车键退出"
        exit 1
    }
    Write-Host "✅ Git 已找到: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Git 未找到，请先安装 Git" -ForegroundColor Red
    Write-Host "下载地址: https://git-scm.com/download/win" -ForegroundColor Gray
    Read-Host "按回车键退出"
    exit 1
}
Write-Host ""

# [2/5] 配置 Git 用户
Write-Host "[2/5] 配置 Git 用户信息..." -ForegroundColor Yellow
git config user.name "LiuShuiJ"
git config user.email "2117253363@qq.com"
Write-Host "✅ 用户信息配置完成" -ForegroundColor Green
Write-Host ""

# [3/5] 初始化仓库
Write-Host "[3/5] 初始化仓库..." -ForegroundColor Yellow
if (-not (Test-Path ".git")) {
    git init
    Write-Host "✅ Git 仓库初始化成功" -ForegroundColor Green
} else {
    Write-Host "ℹ️  Git 仓库已存在" -ForegroundColor Blue
}
Write-Host ""

# [4/5] 添加文件并提交
Write-Host "[4/5] 添加文件并提交..." -ForegroundColor Yellow
git add .
$commitResult = git commit -m "修复手机无法使用问题：Service Worker 更新到 v1.9
- Service Worker 版本从 v8 升级到 v9
- 缓存策略改为网络优先
- 新增清除缓存更新功能
- 增加版本更新检测" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 代码提交成功" -ForegroundColor Green
} else {
    Write-Host "ℹ️  $commitResult" -ForegroundColor Gray
}
Write-Host ""

# [5/5] 连接仓库并推送
Write-Host "[5/5] 连接仓库并推送..." -ForegroundColor Yellow
$repoUrl = "https://github.com/LSJ-135/vintage-clothing-manager.git"
git remote add origin $repoUrl 2>&1 | Out-Null
git remote set-url origin $repoUrl 2>&1 | Out-Null
Write-Host "✅ 已连接到仓库: $repoUrl" -ForegroundColor Green
Write-Host ""

Write-Host "正在拉取远程更新..." -ForegroundColor Cyan
git pull origin main --allow-unrelated-histories
Write-Host ""

Write-Host "正在推送到 GitHub..." -ForegroundColor Cyan
git push -u origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "尝试推送到 master 分支..." -ForegroundColor Cyan
    git pull origin master --allow-unrelated-histories
    git push -u origin master
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "请刷新 GitHub 页面查看更新" -ForegroundColor Gray
Write-Host ""
Write-Host "手机端修复：打开应用 → 统计 → 清除缓存更新" -ForegroundColor Yellow
Write-Host ""
Read-Host "按回车键退出"
