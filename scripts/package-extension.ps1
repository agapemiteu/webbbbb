$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$extensionDirectory = Join-Path $projectRoot '.output\chrome-mv3'
$releaseDirectory = Join-Path $projectRoot 'release'
$archivePath = Join-Path $releaseDirectory 'webb-0.1.0.zip'

if (-not (Test-Path (Join-Path $extensionDirectory 'manifest.json'))) {
  throw 'Build the Chrome extension first with npm run build.'
}

New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
if (Test-Path $archivePath) { Remove-Item -LiteralPath $archivePath }
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  $extensionDirectory,
  $archivePath,
  [System.IO.Compression.CompressionLevel]::Optimal,
  $false
)

$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  if (-not ($archive.Entries | Where-Object FullName -eq 'manifest.json')) {
    throw 'Chrome package does not contain manifest.json at its root.'
  }
  Write-Output "Chrome Web Store package ready: $archivePath ($($archive.Entries.Count) files)"
} finally {
  $archive.Dispose()
}
