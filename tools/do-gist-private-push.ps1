param(
  [string]$InputFile = "E:\\Downloads\\projectcalm-export-2025-09-30.json",
  [string]$GistId = "",
  [string]$Token = ""
)

Write-Host "Project Calm → Private Gist Push" -ForegroundColor Cyan
Write-Host "Input file:" $InputFile
if (-not (Test-Path -Path $InputFile)) { Write-Error "Input file not found: $InputFile"; exit 1 }

if (-not $Token) {
  if ($env:GIST_TOKEN) {
    $Token = $env:GIST_TOKEN
  } else {
    $sec = Read-Host -AsSecureString -Prompt 'Enter GitHub token (with gist scope)'
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    $Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  }
}

if (-not $Token) { Write-Error "A GitHub token is required."; exit 1 }

$env:GIST_TOKEN = $Token

& "$PSScriptRoot\gist-sync.ps1" -Mode Push -InputFile $InputFile -GistId $GistId -Public:$false
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done. Use the printed Gist ID on other devices to Pull." -ForegroundColor Green

