<#
.SYNOPSIS
    publish — Vite React/Vue TypeScript 前端项目自动构建并增量部署到腾讯云 COS

.DESCRIPTION
    在 Vite 前端项目根目录执行此脚本，交互式问答收集 COS 配置、目标目录、域名，
    自动构建并增量同步到腾讯云 COS。

.PARAMETER DryRun
    试运行模式：仅显示 diff，不执行实际上传/删除。

.PARAMETER Help
    显示帮助信息。

.EXAMPLE
    .\deploy.ps1
    交互式执行

.EXAMPLE
    .\deploy.ps1 -DryRun
    仅显示将要上传/删除的文件

.NOTES
    需要 Node.js >= 18
    COS 配置文件格式 (JSON):
    {
        "SecretId":  "AKIDxxxxxxxxxxxxxxxxxxxxxxxx",
        "SecretKey": "xxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "Region":    "ap-guangzhou",
        "Bucket":    "my-bucket-1234567890"
    }
#>

param([switch]$DryRun, [switch]$Help)

if ($Help) {
    Get-Help $PSCommandPath -Detailed
    exit 0
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cliPath = Join-Path $scriptDir "bin\cli.mjs"

if (-not (Test-Path $cliPath)) {
    # 如果通过 npm 全局安装，尝试从 npm root 找到
    $npmRoot = & npm root -g 2>$null
    if ($npmRoot) {
        $cliPath = Join-Path $npmRoot "publish\bin\cli.mjs"
    }
}

if (-not (Test-Path $cliPath)) {
    Write-Host "❌ 找不到 publish CLI 入口" -ForegroundColor Red
    Write-Host "   请先安装: npm install -g publish" -ForegroundColor Yellow
    Write-Host "   或确保 deploy.ps1 与 cli.mjs 在同一层级" -ForegroundColor Yellow
    exit 1
}

# 检查 Node.js
$nodeVersion = & node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "❌ 未检测到 Node.js，请先安装 Node.js >= 18" -ForegroundColor Red
    exit 1
}

$majorVersion = [int]($nodeVersion -replace 'v', '').Split('.')[0]
if ($majorVersion -lt 18) {
    Write-Host "⚠️  Node.js 版本过低 ($nodeVersion)，需要 >= 18" -ForegroundColor Yellow
}

# 确保工作目录是项目根目录
Write-Host "📂 当前目录: $(Get-Location)" -ForegroundColor Gray

# 检查是否存在 package.json
if (-not (Test-Path "package.json")) {
    Write-Host "⚠️  当前目录未找到 package.json，可能不是项目根目录" -ForegroundColor Yellow
    $continue = Read-Host "继续执行? (y/n)"
    if ($continue -ne 'y' -and $continue -ne 'Y') {
        exit 0
    }
}

# 构建参数
$nodeArgs = @($cliPath)
if ($DryRun) {
    $nodeArgs += '--dry-run'
}

# 执行
Write-Host "🚀 启动 publish..." -ForegroundColor Cyan
Write-Host ""
& node $nodeArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ 部署失败 (exit code: $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}
