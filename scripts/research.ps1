param(
  [Parameter(Mandatory=$true)][string]$Query,
  [string]$File,
  [ValidateRange(1,100)][int]$Quantity,
  [ValidateRange(1024,65535)][int]$Port=4324,
  [switch]$UseCodex,
  [switch]$Verified
)
$ErrorActionPreference='Stop'
if ($Verified -and !$File) { throw 'La verificación se aplica a un archivo con fuentes.' }
$root=Join-Path $env:LOCALAPPDATA 'ReacStudio/SecurityLab'
$account=Get-Content -LiteralPath (Join-Path $root 'operator.json') -Raw | ConvertFrom-Json
$key=([System.Net.NetworkCredential]::new('',(ConvertTo-SecureString $account.protectedKey))).Password
$base='http://127.0.0.1:' + $Port + '/api/v1'
$session=Invoke-RestMethod -Uri ($base+'/operator/research-session') -Method POST -ContentType 'application/json' -MaximumRedirection 0 -Body (@{key=$key} | ConvertTo-Json -Compress)
Remove-Variable key
$headers=@{Authorization='Bearer '+$session.sessionToken}
$body=@{requestId=[Guid]::NewGuid().ToString();prompt=$Query;useCodex=[bool]$UseCodex;verifiedSources=[bool]$Verified;filters=@{}}
if ($Quantity) { $body.filters.quantity=$Quantity }
if ($File) {
  $entry=Get-Item -LiteralPath $File
  if (!$entry.Length -or $entry.Length -gt 500000) { throw 'El JSON debe ocupar hasta 500 KB.' }
  $body.file=Get-Content -LiteralPath $File -Raw | ConvertFrom-Json -AsHashtable
}
$job=Invoke-RestMethod -Uri ($base+'/research/jobs') -Method POST -ContentType 'application/json' -Headers $headers -MaximumRedirection 0 -Body ($body|ConvertTo-Json -Depth 15 -Compress)
for($step=0;$step -lt 120;$step++) {
  $job=Invoke-RestMethod -Uri ($base+'/research/jobs/'+$job.id+'/summary') -Headers $headers -MaximumRedirection 0
  if ($job.state -notin @('PENDIENTE','INVESTIGANDO','VERIFICANDO','IMPORTANDO')) {
    $job | Select-Object id,state,provider,goal,found,verified,imported,duplicates,excluded,pending,errors,reason | ConvertTo-Json -Compress
    if ($job.state -eq 'FALLIDO') { exit 2 }
    exit
  }
  Start-Sleep -Milliseconds 500
}
$job | Select-Object id,state | ConvertTo-Json -Compress
