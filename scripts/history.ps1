param(
  [Parameter(Mandatory=$true)][string]$OutputFile,
  [ValidateSet('json','csv','crm','geojson')][string]$Format='json',
  [ValidateRange(1024,65535)][int]$Port=4327,
  [string]$City,
  [string]$Region,
  [string]$Industry,
  [string]$Status,
  [Guid]$CampaignId,
  [ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$From,
  [ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$To
)
$ErrorActionPreference='Stop'
$target=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputFile)
if (Test-Path -LiteralPath $target) { throw 'El archivo de destino ya existe.' }
$root=Join-Path $env:LOCALAPPDATA 'ReacStudio/SecurityLab'
$account=Get-Content -LiteralPath (Join-Path $root 'operator.json') -Raw | ConvertFrom-Json
$key=([System.Net.NetworkCredential]::new('',(ConvertTo-SecureString $account.protectedKey))).Password
$base='http://127.0.0.1:' + $Port + '/api/v1'
$session=Invoke-RestMethod -Uri ($base+'/operator/history-session') -Method POST -ContentType 'application/json' -MaximumRedirection 0 -Body (@{key=$key} | ConvertTo-Json -Compress)
Remove-Variable key
$headers=@{Authorization='Bearer '+$session.sessionToken}
$query=@{format=$Format;city=$City;region=$Region;industry=$Industry;status=$Status;campaign=$CampaignId;from=$From;to=$To}
$pairs=foreach ($entry in $query.GetEnumerator()) { if ($entry.Value) { $entry.Key + '=' + [Uri]::EscapeDataString([string]$entry.Value) } }
$response=Invoke-WebRequest -Uri ($base+'/history/export?'+($pairs -join '&')) -Headers $headers -UseBasicParsing -MaximumRedirection 0
$stream=[IO.File]::Open($target,[IO.FileMode]::CreateNew)
try { $response.RawContentStream.CopyTo($stream) } finally { $stream.Dispose() }
Write-Output $target
