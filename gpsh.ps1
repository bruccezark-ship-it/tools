<#
.SYNOPSIS
    gpsh - Git SSH Push (bypass GFW, one-shot push)
.DESCRIPTION
    Just type `gpsh` and answer questions. SSH key auto-managed.
    Only shows public key when connection fails.
#>
param([string]$GitHubUser,[string]$RepoName,[string]$Message,[string]$Token,[switch]$Force)
$ErrorActionPreference = "Continue"

function yn { param($p) do{$r=Read-Host "$p (y/n)"}while($r -notin 'y','n','Y','N');return $r -in 'y','Y' }
function __gpsh_remote {
    $r=git remote get-url origin 2>&1
    if(-not $?){return $null}
    $m=[regex]::Match($r,'github\.com[:/](.+?)/(.+?)(?:\.git)?$')
    if($m.Success){return @{U=$m.Groups[1].Value;R=$m.Groups[2].Value}}
    return $null
}
function Test-GitHubSSH {
    $t=ssh -T -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 git@github.com 2>&1
    return ($t -match "successfully authenticated")
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  gpsh - Git SSH Push" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# -- Resolve user/repo --
$repoDir=(Get-Location).Path
$rinfo=__gpsh_remote
$detU=if($rinfo){$rinfo.U}else{""}; $detR=if($rinfo){$rinfo.R}else{Split-Path $repoDir -Leaf}
$hasParams=($PSBoundParameters.Count -gt 0) -or ($args.Count -gt 0)
if(-not $GitHubUser){$GitHubUser=$detU}
if(-not $RepoName){$RepoName=$detR}

if(-not $hasParams){
    Write-Host "  Enter info (Enter to accept default)" -ForegroundColor DarkGray
    $a=Read-Host "  GitHub Username [${GitHubUser}]"; if($a){$GitHubUser=$a}
    $a=Read-Host "  Repository Name  [${RepoName}]";  if($a){$RepoName=$a}
    if(-not $GitHubUser){$GitHubUser=Read-Host "  GitHub Username (required)"}
    if(-not $RepoName){$RepoName=Read-Host "  Repository Name (required)"}
}
if(-not $GitHubUser -or -not $RepoName){Write-Host "[-] User and Repo required." -ForegroundColor Red; exit 1}
Write-Host "[*] $GitHubUser / $RepoName  |  $repoDir" -ForegroundColor Gray

# -- git init --
if(-not (Test-Path "$repoDir\.git")){
    if(-not ($Force -or (yn "Not a git repo. git init?"))){exit 0}
    git -C $repoDir init 2>&1|Out-Null; Write-Host "[+] Initialized" -ForegroundColor Green
}

# -- SSH: generate key, test, only show pubkey on failure --
$sshDir="$env:USERPROFILE\.ssh"; $sshKey="$sshDir\id_ed25519"
$needsKey=(-not (Test-Path $sshKey))
if($needsKey){
    Write-Host "[*] Generating SSH key (ed25519)..." -ForegroundColor Yellow
    if(-not (Test-Path $sshDir)){$null=New-Item -Type Dir -Path $sshDir -Force}
    $null=ssh-keygen -t ed25519 -C "gpsh@${GitHubUser}" -f $sshKey -N '""' 2>&1
    if($LASTEXITCODE -ne 0){$sshKey="$sshDir\id_rsa";$null=ssh-keygen -t rsa -b 4096 -C "gpsh@${GitHubUser}" -f $sshKey -N '""' 2>&1}
    Write-Host "[+] Key: $sshKey" -ForegroundColor Green
}
Start-Service ssh-agent 2>$null; $null=ssh-add $sshKey 2>&1

# known_hosts
if(-not (Test-Path "$sshDir\known_hosts")){$null=New-Item -Type File -Path "$sshDir\known_hosts" -Force}
$kh=Get-Content "$sshDir\known_hosts" -EA SilentlyContinue
if($kh -notmatch "github\.com"){ssh-keyscan -H github.com 2>$null|Add-Content "$sshDir\known_hosts"}

Write-Host "[*] Testing SSH to GitHub..." -ForegroundColor Yellow
$sshOk=Test-GitHubSSH
if(-not $sshOk){
    Write-Host "[!] SSH FAILED" -ForegroundColor Red
    $pub=Get-Content "$sshKey.pub"
    Write-Host "--- ADD TO https://github.com/settings/keys ---" -ForegroundColor Magenta
    Write-Host $pub -ForegroundColor White
    Write-Host "------------------------------------------------" -ForegroundColor Magenta
    Set-Clipboard -Value $pub -ErrorAction SilentlyContinue
    Write-Host "[*] Copied. Paste into GitHub, then press y." -ForegroundColor Green
    $null=yn "Added key?"
    Write-Host "[*] Retrying SSH..." -ForegroundColor Yellow
    Start-Service ssh-agent 2>$null; $null=ssh-add $sshKey 2>&1
    $sshOk=Test-GitHubSSH
    if(-not $sshOk){Write-Host "[-] SSH still fails. Check key on GitHub." -ForegroundColor Red; exit 1}
}
Write-Host "[+] SSH OK!" -ForegroundColor Green


# -- Repo check + auto-create --
$sshUrl="git@github.com:${GitHubUser}/${RepoName}.git"
$httpsUrl="https://github.com/${GitHubUser}/${RepoName}"
$tokenFile="$env:USERPROFILE\.gpsh_token"

Write-Host "[*] Checking repo via SSH..." -ForegroundColor Yellow
$null=git ls-remote $sshUrl 2>&1
$repoExists=($LASTEXITCODE -eq 0)
if($repoExists){Write-Host "[+] Repo exists" -ForegroundColor Green}
else{
    Write-Host "[!] Repo not found" -ForegroundColor Yellow
    # Get token
    $token=$env:GITHUB_TOKEN
    if(-not $token -and (Test-Path $tokenFile)){$token=(Get-Content $tokenFile -Raw).Trim()}
    if(-not $token){
        Write-Host "  Create a Fine-grained token:" -ForegroundColor DarkGray
        Write-Host "  https://github.com/settings/tokens?type=beta" -ForegroundColor DarkGray
        Write-Host "  Repository access: All repositories" -ForegroundColor DarkGray
        Write-Host "  Permissions: Administration (Read & Write)" -ForegroundColor DarkGray
        $token=Read-Host "  Paste token"
        if($token){$token.Trim()|Out-File $tokenFile -NoNewline -Encoding ASCII;Write-Host "[+] Token saved" -ForegroundColor Green}
    }
    if($token){
        Write-Host "[*] Creating repo..." -ForegroundColor Yellow
        $body='{"name":"'+$RepoName+'","private":false,"auto_init":false}'
        $tmpFile=[System.IO.Path]::GetTempFileName()
        $body|Out-File $tmpFile -Encoding ascii -NoNewline
        $result=cmd /c "curl -s -X POST -H `"Authorization: Bearer ${token}`" -H `"Content-Type: application/json`" -d @${tmpFile} https://api.github.com/user/repos 2>&1"
        Remove-Item $tmpFile -Force
        if($result -match '"full_name"'){Write-Host "[+] Created: $httpsUrl" -ForegroundColor Green}
        elseif($result -match '"message"'){Write-Host "[-] API says: $result" -ForegroundColor Red}
        else{Write-Host "[-] Create failed" -ForegroundColor Red}
    }else{
        Write-Host "[-] No token, create manually: https://github.com/new?name=${RepoName}" -ForegroundColor Yellow
        Read-Host "  Press Enter after created"
    }
}

# -- Set remote --
$c=git -C $repoDir remote get-url origin 2>&1
if(-not $?){git -C $repoDir remote add origin $sshUrl;Write-Host "[+] Remote: $sshUrl" -ForegroundColor Green}
elseif($c -ne $sshUrl -and $c -notmatch "$sshUrl`r?`n?"){git -C $repoDir remote set-url origin $sshUrl;Write-Host "[+] Remote updated: $sshUrl" -ForegroundColor Green}
else{Write-Host "[+] Remote is SSH" -ForegroundColor Green}

# -- Commit message --
if(-not $Message){$Message=$args[0]}
if(-not $Message -and -not $hasParams){$def="update $(Get-Date -Format 'yyyy-MM-dd HH:mm')";$a=Read-Host "  Commit message [${def}]";$Message=if($a){$a}else{$def}}
if(-not $Message){$Message="update $(Get-Date -Format 'yyyy-MM-dd HH:mm')"}
Write-Host "[*] Commit: $Message" -ForegroundColor Yellow

# -- Push --
Write-Host "[*] git add / commit / push ..." -ForegroundColor Cyan
$branch=git -C $repoDir branch --show-current 2>&1
if(-not $? -or -not $branch){$branch="main"}
Write-Host "[*] Branch: $branch" -ForegroundColor Gray
git -C $repoDir add .
$st=git -C $repoDir status --porcelain 2>&1
if(-not $st){Write-Host "[!] Nothing to commit" -ForegroundColor Yellow;if(-not $Force){if(-not (yn "Force push?")){Write-Host "[-] Cancelled";exit 0}}}
else{git -C $repoDir commit -m "$Message"}

if(-not $hasParams -and -not $Force){
    Write-Host ""; Write-Host "--------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "  Ready: $GitHubUser/$RepoName [$branch] `"$Message`"" -ForegroundColor White
    Write-Host "  URL:   $httpsUrl" -ForegroundColor White
    Write-Host "--------------------------------------------------" -ForegroundColor DarkGray
    if(-not (yn "Push now?")){Write-Host "[-] Cancelled";exit 0}
}
git -C $repoDir push -u origin $branch 2>&1
if($LASTEXITCODE -eq 0){
    Write-Host ""; Write-Host "============================================" -ForegroundColor Green
    Write-Host "  SUCCESS!  $httpsUrl" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
}else{
    Write-Host ""; Write-Host "============================================" -ForegroundColor Red
    Write-Host "  FAILED" -ForegroundColor Red
    Write-Host "============================================" -ForegroundColor Red; exit 1
}
