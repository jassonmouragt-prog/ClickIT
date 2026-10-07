$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$modeFile = Join-Path $root '.nima-converter-mode'
$imageName = 'clickit-nima-converter:tf2.0'
$dockerCommand = Get-Command docker -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1

if ($dockerCommand) {
  $docker = $dockerCommand.Source
  $dockerVersion = & $docker --version 2>&1
  if ($LASTEXITCODE -eq 0) {
    $dockerInfo = & $docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Docker CLI: $dockerVersion"
      Write-Host 'Docker Engine: available'
      & $docker build --file (Join-Path $PSScriptRoot 'Dockerfile.nima-converter') --tag $imageName $root
      if ($LASTEXITCODE -ne 0) { throw 'Docker image build failed; converter mode was not changed.' }
      Set-Content -LiteralPath $modeFile -Value 'docker' -NoNewline -Encoding ascii
      Write-Host 'NIMA converter mode: docker'
      Write-Host "Docker image ready: $imageName"
      exit 0
    }
    Write-Host 'Docker CLI is present, but docker info failed; checking the isolated local fallback.'
  }
  else {
    Write-Host 'docker --version failed; checking the isolated local fallback.'
  }
}
else {
  Write-Host 'Docker CLI not found; checking the isolated local fallback.'
}

$basePython = Join-Path $root '.tools\python37\python.exe'
if (-not (Test-Path -LiteralPath $basePython -PathType Leaf)) {
  throw 'Docker is unavailable and project-local Python 3.7 x64 was not found at .tools\python37\python.exe. No global Python installation is used.'
}
$venv = Join-Path $root '.venv-nima-conversion'
& $basePython -m venv $venv
if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated Python 3.7 environment.' }
$python = Join-Path $venv 'Scripts\python.exe'
& $python -m pip install --upgrade 'pip==23.3.2'
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare pip in the isolated Python 3.7 environment.' }
& $python -m pip install --requirement (Join-Path $PSScriptRoot 'requirements-nima-conversion.txt')
if ($LASTEXITCODE -ne 0) { throw 'Could not install NIMA conversion dependencies in the isolated Python 3.7 environment.' }
Set-Content -LiteralPath $modeFile -Value 'local-python37' -NoNewline -Encoding ascii
Write-Host 'NIMA converter mode: local-python37'
Write-Host "NIMA conversion environment ready: $python"
