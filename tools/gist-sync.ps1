param(
  [ValidateSet('Push','Pull')]
  [string]$Mode,
  [string]$Token,
  [string]$GistId,
  [string]$InputFile,    # for Push: path to exported JSON
  [string]$OutputFile,   # for Pull: path to save JSON
  [bool]$Public = $true
)

function Fail($msg){ Write-Error $msg; exit 1 }

if (-not $Mode) { Fail "-Mode Push|Pull is required" }

$CommonHeaders = @{ 'Accept'='application/vnd.github+json' }
if ($Token) { $CommonHeaders['Authorization'] = "Bearer $Token" }

if ($Mode -eq 'Push') {
  if (-not $Token) {
    if ($env:GIST_TOKEN) {
      $Token = $env:GIST_TOKEN
      $CommonHeaders['Authorization'] = "Bearer $Token"
    } else {
      try {
        $sec = Read-Host -AsSecureString -Prompt 'Enter GitHub token (gist scope)'
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
        $Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
        if (-not $Token) { Fail "Token is required for Push" }
        $CommonHeaders['Authorization'] = "Bearer $Token"
      } catch {
        Fail "-Token (GitHub token with 'gist' scope) is required for Push"
      }
    }
  }
  if (-not $InputFile) { Fail "-InputFile path to exported JSON is required for Push" }
  if (-not (Test-Path -Path $InputFile)) { Fail "Input file not found: $InputFile" }

  $content = Get-Content -Raw -Path $InputFile
  if (-not $content) { Fail "Input file is empty: $InputFile" }

  $bodyObj = [ordered]@{
    description = 'Project Calm data export'
    public = [bool]$Public
    files = @{ 'projectcalm-export.json' = @{ content = $content } }
  }
  $body = $bodyObj | ConvertTo-Json -Depth 6

  if ($GistId) {
    $url = "https://api.github.com/gists/$GistId"
    try {
      $res = Invoke-RestMethod -Uri $url -Method Patch -Headers $CommonHeaders -Body $body -ContentType 'application/json'
    } catch {
      Fail ("Gist update failed: " + $_.Exception.Message)
    }
  } else {
    $url = 'https://api.github.com/gists'
    try {
      $res = Invoke-RestMethod -Uri $url -Method Post -Headers $CommonHeaders -Body $body -ContentType 'application/json'
    } catch {
      Fail ("Gist create failed: " + $_.Exception.Message)
    }
  }

  $outId = $res.id
  $outUrl = $res.html_url
  Write-Host "OK: Gist ID = $outId"
  Write-Host "URL: $outUrl"
  exit 0
}

if ($Mode -eq 'Pull') {
  if (-not $GistId) { Fail "-GistId is required for Pull" }
  if (-not $OutputFile) { Fail "-OutputFile is required for Pull" }
  $metaUrl = "https://api.github.com/gists/$GistId"
  try {
    $meta = Invoke-RestMethod -Uri $metaUrl -Method Get -Headers $CommonHeaders
  } catch {
    Fail ("Gist fetch failed: " + $_.Exception.Message)
  }
  if (-not $meta.files -or -not $meta.files.'projectcalm-export.json') {
    Fail "File 'projectcalm-export.json' not found in gist"
  }
  $rawUrl = $meta.files.'projectcalm-export.json'.raw_url
  if (-not $rawUrl) { Fail "raw_url missing for projectcalm-export.json" }
  try {
    $raw = Invoke-WebRequest -Uri $rawUrl -Method Get -Headers @{ 'Accept'='application/json' }
  } catch {
    Fail ("Raw fetch failed: " + $_.Exception.Message)
  }
  $dir = Split-Path -Parent $OutputFile
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $raw.Content | Set-Content -Path $OutputFile -Encoding UTF8
  Write-Host "Saved: $OutputFile"
  exit 0
}

Fail "Unknown mode: $Mode"
