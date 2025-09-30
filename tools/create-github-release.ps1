param(
  [Parameter(Mandatory=$true)][string]$Tag,
  [string]$Title = $null,
  [string]$Body = $null,
  [string]$Repo = "dquillman/projectcalm",
  [string]$Token = ""
)

function Fail($msg){ Write-Error $msg; exit 1 }

if (-not $Title) { $Title = $Tag }
if (-not $Body) { $Body = "" }

if (-not $Token) {
  if ($env:GITHUB_TOKEN) { $Token = $env:GITHUB_TOKEN }
  else {
    try {
      $sec = Read-Host -AsSecureString -Prompt 'Enter GitHub token (repo scope)'
      $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
      $Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } catch {}
  }
}
if (-not $Token) { Fail "GitHub token is required (set GITHUB_TOKEN or pass -Token)" }

$headers = @{ 'Authorization' = "Bearer $Token"; 'Accept'='application/vnd.github+json'; 'User-Agent'='projectcalm-release-script' }
$bodyObj = [ordered]@{ tag_name = $Tag; name = $Title; body = $Body; draft = $false; prerelease = $false }
$json = $bodyObj | ConvertTo-Json -Depth 6

try {
  $url = "https://api.github.com/repos/$Repo/releases"
  $res = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $json -ContentType 'application/json'
  Write-Host "Created release:" $res.html_url
} catch {
  $msg = $_.Exception.Message
  $errTxt = ''
  try {
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $errTxt = $_.ErrorDetails.Message }
    elseif ($_.Exception.Response) {
      $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $errTxt = $sr.ReadToEnd()
    }
  } catch {}
  Fail ("GitHub API error: " + $msg + (if ($errTxt) { "`n" + $errTxt } else { '' }))
}

