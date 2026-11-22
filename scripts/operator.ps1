param([switch]$CopyKey)
$ErrorActionPreference = 'Stop'
if (!$env:LOCALAPPDATA) { throw 'LOCALAPPDATA no está disponible.' }
$root = Join-Path $env:LOCALAPPDATA 'ReacStudio/SecurityLab'
[IO.Directory]::CreateDirectory($root) | Out-Null
$path = Join-Path $root 'operator.json'
if ($CopyKey) {
  $data = Get-Content -Raw -LiteralPath $path | ConvertFrom-Json
  $secure = ConvertTo-SecureString $data.protectedKey
  $key = ([System.Net.NetworkCredential]::new('', $secure)).Password
  Set-Clipboard -Value $key
  Write-Output 'Clave copiada. Pegala en Reac Security Lab y luego limpiá el portapapeles.'
  exit
}
if ([IO.File]::Exists($path)) { throw 'Ya existe el operador local. Usá -CopyKey para iniciar sesión.' }
$key = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)).ToLowerInvariant()
$secure = ConvertTo-SecureString -String $key -AsPlainText -Force
$verifier = $key | node -e "const c=require('node:crypto');const key=require('node:fs').readFileSync(0,'utf8').trim();const salt=c.randomBytes(16);process.stdout.write(JSON.stringify({salt:salt.toString('hex'),hash:c.scryptSync(key,salt,64).toString('hex')}));"
if ($LASTEXITCODE) { throw 'No se pudo derivar el verificador.' }
$record = $verifier | ConvertFrom-Json -AsHashtable
$record.protectedKey = ConvertFrom-SecureString $secure
$bytes = [Text.Encoding]::UTF8.GetBytes(($record | ConvertTo-Json -Compress))
$stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew)
try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
Write-Output 'Operador local creado. Para copiar la clave ejecutá scripts/operator.ps1 -CopyKey.'
