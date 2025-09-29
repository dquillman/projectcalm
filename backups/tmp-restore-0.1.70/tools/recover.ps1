param(
  [Parameter(Mandatory=$true)] [string]$In,
  [Parameter(Mandatory=$true)] [string]$Out
)

# Recover a file where each character is prefixed with a '?'
# by taking every second character from the text.

$bytes = Get-Content -Raw -Encoding Byte $In
$text  = [Text.Encoding]::UTF8.GetString($bytes)

$list = New-Object System.Collections.Generic.List[char]
for ($i = 1; $i -lt $text.Length; $i += 2) {
  $list.Add($text[$i])
}
$recovered = -join $list

# Strip lines that are composed solely of '?' characters (artifacts)
$lines = $recovered -split "`r?`n"
$cleaned = foreach ($ln in $lines) {
  $stripped = ($ln -replace "[\uFFFD\?]", '')
  if ([string]::IsNullOrWhiteSpace($stripped)) { '' }
  else { $ln -replace "[\uFFFD]+", '' }
}
$final = ($cleaned -join "`r`n")

Set-Content -NoNewline -Encoding UTF8 -Path $Out -Value $final
