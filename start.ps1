# 启动情侣你画我猜服务
$workDir = "e:\艺术家婷婷"
$port = 3000
$url = "http://localhost:3000/?room=sweet520"

# 检查 3000 端口是否已被占用/已启动
$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (-not $conn) {
    Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $workDir -WindowStyle Hidden
    Start-Sleep -Seconds 1
}

# 打开默认浏览器访问游戏
Start-Process $url
