<#
.SYNOPSIS
    一键安装 publish 到全局环境

.DESCRIPTION
    安装依赖并全局注册 publish 命令，之后在任意 Vite 项目目录
    直接执行 `publish` 或 `publish` 即可使用。

    安装方式:
        npm install -g .       (全局 npm 安装)
        + 注册 PowerShell alias (可选)

    也可以将 deploy.ps1 所在目录加入 PATH。
#>

param([switch]$NoGlobal, [switch]$Force)

$ErrorActionPreference = "Stop"
$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  publish 安装程序" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 安装依赖
Write-Host "📦 安装 npm 依赖..." -ForegroundColor Yellow
Push-Location $toolsDir
try {
    npm install --silent 2>&1 | Out-Null
    Write-Host "  ✅ 依赖安装完成" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️  npm install 出错，请手动执行" -ForegroundColor Yellow
} finally {
    Pop-Location
}

if (-not $NoGlobal) {
    # 全局安装
    Write-Host "🌍 全局安装 publish..." -ForegroundColor Yellow
    Push-Location $toolsDir
    try {
        npm install -g . 2>&1 | Out-Null
        $globalPath = & npm root -g 2>$null
        if ($globalPath) {
            $binPath = Join-Path (Split-Path $globalPath -Parent) ""
            # npm 会自动创建 .cmd 脚本在 %APPDATA%\npm 下
            Write-Host "  ✅ 全局安装完成" -ForegroundColor Green
        }
    } catch {
        Write-Host "  ⚠️  全局安装失败，可手动执行: npm install -g ." -ForegroundColor Yellow
    } finally {
        Pop-Location
    }
}

# 注册 PowerShell alias（可选）
if ($Force) {
    $profileDir = Split-Path $PROFILE -Parent
    if (-not (Test-Path $profileDir)) {
        New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
    }

    $aliasLine = "Set-Alias -Name publish -Value `"$toolsDir\deploy.ps1`""

    if (Test-Path $PROFILE) {
        $existing = Get-Content $PROFILE -Raw
        if ($existing -notmatch [regex]::Escape($aliasLine)) {
            Add-Content $PROFILE "`n# publish alias`n$aliasLine"
            Write-Host "  ✅ PowerShell alias 'publish' 已注册" -ForegroundColor Green
        } else {
            Write-Host "  ℹ️  alias 'publish' 已存在" -ForegroundColor Gray
        }
    } else {
        "# PowerShell Profile`n$aliasLine" | Out-File $PROFILE -Encoding UTF8
        Write-Host "  ✅ PowerShell Profile 已创建，alias 'publish' 已注册" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  安装完成!" -ForegroundColor Green
Write-Host ""
Write-Host "  用法:" -ForegroundColor White
Write-Host "    publish           交互式部署" -ForegroundColor Gray
Write-Host "    publish --dry-run 试运行" -ForegroundColor Gray
Write-Host ""
if ($Force) {
    Write-Host "    publish                通过 alias 调用" -ForegroundColor Gray
}
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
