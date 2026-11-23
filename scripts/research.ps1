param(
  [Parameter(Mandatory=$true,ParameterSetName='Search')][string]$Query,
  [Parameter(Mandatory=$true,ParameterSetName='Resume')][Guid]$ResumeJob,
  [Parameter(Mandatory=$true,ParameterSetName='Cancel')][Guid]$CancelJob,
  [string]$File,
  [ValidateRange(1,100)][int]$Quantity,
  [ValidateRange(1024,65535)][int]$Port=4327,
  [Guid]$RequestId=[Guid]::NewGuid(),
  [ValidateSet('discover','update')][string]$Mode='discover',
  [ValidateRange(1,3650)][int]$RecentDays,
  [Guid]$OrganizationId,
  [Guid]$CampaignId,
  [string[]]$Regions,
  [string[]]$Cities,
  [string[]]$Industries,
  [string[]]$ApplicationTypes,
  [switch]$UseCodex,
  [switch]$Verified,
  [switch]$Simulate
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
$body=@{prompt=$Query;mode=$Mode;useCodex=[bool]$UseCodex;verifiedSources=[bool]$Verified;filters=@{}}
if ($Quantity) { $body.filters.quantity=$Quantity }
if ($Regions) { $body.filters.regions=$Regions }
if ($Cities) { $body.filters.cities=$Cities }
if ($Industries) { $body.filters.industries=$Industries }
if ($ApplicationTypes) { $body.filters.applicationTypes=$ApplicationTypes }
if ($RecentDays) { $body.recentDays=$RecentDays }
if ($OrganizationId) { $body.organizationId=$OrganizationId.ToString() }
if ($CampaignId) { $body.campaignId=$CampaignId.ToString() }
if ($File) {
  $entry=Get-Item -LiteralPath $File
  if (!$entry.Length -or $entry.Length -gt 500000) { throw 'El JSON debe ocupar hasta 500 KB.' }
  $body.file=Get-Content -LiteralPath $File -Raw -Encoding UTF8 | ConvertFrom-Json
}
if ($CancelJob) {
  Invoke-RestMethod -Uri ($base+'/research/jobs/'+$CancelJob+'/cancel') -Method POST -ContentType 'application/json' -Headers $headers -MaximumRedirection 0 -Body '{}' | ConvertTo-Json -Compress
  exit
}
if ($Simulate) {
  Invoke-RestMethod -Uri ($base+'/research/simulate') -Method POST -ContentType 'application/json' -Headers $headers -MaximumRedirection 0 -Body ($body|ConvertTo-Json -Depth 15 -Compress) | ConvertTo-Json -Depth 8 -Compress
  exit
}
if ($ResumeJob) {
  $job=Invoke-RestMethod -Uri ($base+'/research/jobs/'+$ResumeJob+'/resume') -Method POST -ContentType 'application/json' -Headers $headers -MaximumRedirection 0 -Body '{}'
} else {
  $body.requestId=$RequestId.ToString()
  $job=Invoke-RestMethod -Uri ($base+'/research/jobs') -Method POST -ContentType 'application/json' -Headers $headers -MaximumRedirection 0 -Body ($body|ConvertTo-Json -Depth 15 -Compress)
}
for($step=0;$step -lt 120;$step++) {
  $job=Invoke-RestMethod -Uri ($base+'/research/jobs/'+$job.id+'/summary') -Headers $headers -MaximumRedirection 0
  if ($job.state -notin @('PENDIENTE','INVESTIGANDO','VERIFICANDO','IMPORTANDO')) {
    $job | Select-Object id,state,mode,provider,goal,found,verified,imported,duplicates,excluded,pending,skipped,errors,reason | ConvertTo-Json -Compress
    if ($job.state -eq 'FALLIDO') { exit 2 }
    exit
  }
  Start-Sleep -Milliseconds 500
}
$job | Select-Object id,state | ConvertTo-Json -Compress
