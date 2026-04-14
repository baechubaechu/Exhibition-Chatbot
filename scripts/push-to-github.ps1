# GitHub: https://github.com/baechubaechu/Exhibition-Chatbot.git
# 사용: exhibition-chatbot 폴더에서 PowerShell 실행
#   .\scripts\push-to-github.ps1

Set-Location $PSScriptRoot\..

if (-not (Test-Path "package.json")) {
  Write-Error "package.json 이 있는 exhibition-chatbot 루트에서 실행하세요."
  exit 1
}

$remoteUrl = "https://github.com/baechubaechu/Exhibition-Chatbot.git"

if (-not (Test-Path ".git")) {
  git init
}

git add -A
$porcelain = git status --porcelain
if ($porcelain) {
  git commit -m "chore: sync exhibition chatbot"
} else {
  Write-Host "커밋할 변경 없음. 그대로 push 시도."
}

git branch -M main

# origin 없을 때 remove 하면 git이 stderr 내고 PowerShell이 실패 처리할 수 있음 → set-url / add 만 사용
$remotes = @(git remote 2>$null)
if ($remotes -contains "origin") {
  git remote set-url origin $remoteUrl
} else {
  git remote add origin $remoteUrl
}

Write-Host ">>> git push -u origin main (GitHub 로그인/토큰 필요할 수 있음)"
git push -u origin main
