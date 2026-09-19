$root = $PSScriptRoot

# Kill any leftover process on port 3001 from a previous run
$existing = (Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue).OwningProcess |
    Select-Object -Unique
if ($existing) {
    Write-Host "Killing existing process(es) on port 3001: $existing" -ForegroundColor Yellow
    $existing | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
}

$serverJob = Start-Job -Name "server" -ScriptBlock {
    Set-Location "$using:root\server"
    npm run dev 2>&1
}

$clientJob = Start-Job -Name "client" -ScriptBlock {
    Set-Location "$using:root\client"
    npm run dev 2>&1
}

Write-Host "Starting server and client... (Ctrl+C to stop both)" -ForegroundColor Yellow

try {
    while ($true) {
        Receive-Job $serverJob | ForEach-Object { Write-Host "[server] $_" -ForegroundColor Cyan }
        Receive-Job $clientJob | ForEach-Object { Write-Host "[client] $_" -ForegroundColor Green }
        Start-Sleep -Milliseconds 150
    }
} finally {
    Write-Host "`nStopping..." -ForegroundColor Yellow
    Stop-Job $serverJob, $clientJob
    Remove-Job $serverJob, $clientJob -Force

    # Kill any node process still holding port 3001
    $lingering = (Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue).OwningProcess |
        Select-Object -Unique
    if ($lingering) {
        $lingering | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    }
}
