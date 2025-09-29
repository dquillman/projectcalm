param(
  [string]$Version = "0.85.0"
)

$ErrorActionPreference = 'Stop'

function Log($msg) { Write-Host "[pack-nw] $msg" }

$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$outDir = Join-Path $root 'release'
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

$nwZip = Join-Path $outDir ("nwjs-v$Version-win-x64.zip")
$nwDir = Join-Path $outDir ("nwjs-v$Version-win-x64")

if (!(Test-Path $nwDir)) {
  $url = "https://dl.nwjs.io/v$Version/nwjs-v$Version-win-x64.zip"
  Log "Downloading NW.js $Version ..."
  Invoke-WebRequest -Uri $url -OutFile $nwZip
  Log "Extracting NW.js ..."
  Expand-Archive -Path $nwZip -DestinationPath $outDir -Force
}

Log "Preparing app.nw payload ..."
$stage = Join-Path $outDir 'nw-stage'
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Copy-Item -Recurse -Force (Join-Path $root 'index.html') $stage
Copy-Item -Recurse -Force (Join-Path $root 'dist') $stage
Copy-Item -Recurse -Force (Join-Path $root 'vendor') $stage
Copy-Item -Recurse -Force (Join-Path $root 'version.txt') $stage -ErrorAction SilentlyContinue

$nwPkg = @{
  name = "projectcalm"
  main = "index.html"
  window = @{ width = 1100; height = 800 }
} | ConvertTo-Json -Depth 4
Set-Content -Path (Join-Path $stage 'package.json') -Value $nwPkg -Encoding UTF8

$appNw = Join-Path $outDir 'app.nw'
if (Test-Path $appNw) { Remove-Item -Force $appNw }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $appNw)

$nwExe = Join-Path $nwDir 'nw.exe'
$outExe = Join-Path $outDir 'ProjectCalm-NW.exe'
if (Test-Path $outExe) { Remove-Item -Force $outExe }

Log "Creating portable EXE ..."
cmd /c "copy /b `"$nwExe`"+`"$appNw`" `"$outExe`"" | Out-Null

Log "Done: $outExe"
