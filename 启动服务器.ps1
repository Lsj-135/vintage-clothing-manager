# 启动 LiuShuiJ 服装管理系统 - HTTP服务器版本
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  启动 LiuShuiJ 服装管理系统" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# 尝试启动HTTP服务器
Write-Host "正在启动本地HTTP服务器..." -ForegroundColor Yellow
Write-Host ""

# 查找可用端口
$port = 8080
$listener = $null

try {
    # 尝试创建一个简单的HTTP监听器
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$port/")
    $listener.Prefixes.Add("http://+:$port/")
    $listener.Start()
    
    Write-Host "✅ 服务器启动成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "📱 本地访问地址：" -ForegroundColor Cyan
    Write-Host "   http://localhost:$port" -ForegroundColor White
    Write-Host ""
    Write-Host "🌐 局域网访问地址（手机也能访问）：" -ForegroundColor Cyan
    
    # 获取本机IP地址
    $ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" }
    foreach ($ip in $ips) {
        Write-Host "   http://$($ip.IPAddress):$port" -ForegroundColor White
    }
    
    Write-Host ""
    Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Yellow
    Write-Host ""
    
    # 自动打开浏览器
    Start-Process "http://localhost:$port"
    
    # 简单的文件服务循环
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $url = $request.Url.LocalPath
        if ($url -eq "/") { $url = "/index.html" }
        
        $filePath = Join-Path $ScriptDir $url.TrimStart("/")
        
        if (Test-Path $filePath) {
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $content.Length
            
            # 设置Content-Type
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            switch ($ext) {
                ".html" { $response.ContentType = "text/html; charset=utf-8" }
                ".css"  { $response.ContentType = "text/css; charset=utf-8" }
                ".js"   { $response.ContentType = "application/javascript; charset=utf-8" }
                ".json" { $response.ContentType = "application/json; charset=utf-8" }
                ".png"  { $response.ContentType = "image/png" }
                ".jpg"  { $response.ContentType = "image/jpeg" }
                ".gif"  { $response.ContentType = "image/gif" }
                ".svg"  { $response.ContentType = "image/svg+xml" }
                ".ico"  { $response.ContentType = "image/x-icon" }
                ".webmanifest" { $response.ContentType = "application/manifest+json" }
                default { $response.ContentType = "application/octet-stream" }
            }
            
            $response.OutputStream.Write($content, 0, $content.Length)
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }
        
        $response.Close()
    }
    
} catch {
    Write-Host "❌ 启动HTTP服务器失败：$_" -ForegroundColor Red
    Write-Host ""
    Write-Host "尝试直接在浏览器中打开..." -ForegroundColor Yellow
    Start-Process (Join-Path $ScriptDir "index.html")
} finally {
    if ($listener) { $listener.Stop() }
}

Write-Host ""
Write-Host "服务器已停止" -ForegroundColor Gray
Read-Host "按回车键退出"
