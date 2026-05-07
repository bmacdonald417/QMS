#Requires -Version 5.1
<#
.SYNOPSIS
  Builds governance-manifest.json for Trust Codex from the QMS CMMC bundle (qms-ingest-manifest.json + markdown files).

.DESCRIPTION
  DOCUMENT CONTROL / HASHING (this repo)
  --------------------------------------
  - Canonical bundle: docs/cmmc-extracted (override with -BundlePath). Ingest manifest: qms-ingest-manifest.json
    (see server/src/lib/cmmc/manifest.js — same paths the Node server uses; optional env CMMC_BUNDLE_PATH).
  - Per-file metadata: YAML-style headers in each .md (**Document Version:**, **Date:**, etc.) parsed by
    server/src/lib/cmmc/docParser.js.
  - PostgreSQL (Prisma): cmmc_documents, cmmc_revisions, cmmc_signatures
      * cmmc_revisions.content_hash = SHA-256 (hex) of UTF-8 normalized MARKDOWN BODY only — NOT raw file bytes.
        Normalization: CRLF/LF -> \\n, trim trailing spaces per line, strip BOM (server/src/lib/cmmc/canonicalize.js).
      * cmmc_revisions.signing_hash = SHA-256 of canonical JSON signing payload (same codebase).
      * cmmc_signatures.signing_hash, signed_at, userId -> join users.email for "who signed".
  - This manifest's primary "sha256" field is the SHA-256 of the FILE on disk (Trust Codex schema). That
    differs from QMS content_hash unless you implement full markdown normalization in PowerShell. Optional
    -QmsStateJsonPath merges DB/export fields (content_hash, signature) without replacing file sha256.

  OUTPUT: UTF-8 no BOM; pretty JSON; also writes governance-manifest-GOV-*.json archive copy with run_id.

.PARAMETER BundlePath
  Root folder containing qms-ingest-manifest.json (default: ../docs/cmmc-extracted relative to this script).

.PARAMETER OutputPath
  Where to write governance-manifest.json (default: ./governance-manifest.json in current directory).

.PARAMETER GeneratedBy
  Email for generated_by (default: QmsState file or env TRUST_CODEX_USER or $env:USERNAME).

.PARAMETER PreviousManifest
  Path to a prior governance-manifest.json for drift comparison.

.PARAMETER ControlPlaneUrl
  Base URL for Trust Codex (printed in upload instruction).

.PARAMETER QmsStateJsonPath
  Optional JSON from QMS/DB export with keys: documents.{CODE}.status, next_review_date, revision.content_hash,
  revision.signing_hash, signature.{ signed_by, signed_at, signature_hash }.

.PARAMETER ControlMappingPath
  Path to governance-control-mapping.json (default: alongside this script).

.PARAMETER Verbose
  Extra logging.
#>

[CmdletBinding()]
param(
  [string]$BundlePath = "",
  [string]$OutputPath = "",
  [string]$GeneratedBy = "",
  [string]$PreviousManifest = "",
  [string]$ControlPlaneUrl = "",
  [string]$QmsStateJsonPath = "",
  [string]$ControlMappingPath = "",
  [switch]$Verbose
)

$ErrorActionPreference = 'Stop'
$toolVersion = '1.0.0'
$schemaId = 'mactech-governance-manifest.v1'

function Get-ScriptRoot {
  if ($PSScriptRoot) { return $PSScriptRoot }
  return Split-Path -Parent $MyInvocation.MyCommand.Path
}

function Resolve-BundlePath {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) {
    $candidate = Join-Path (Get-ScriptRoot) '..\docs\cmmc-extracted'
    return (Resolve-Path -LiteralPath $candidate).Path
  }
  return (Resolve-Path -LiteralPath $Path).Path
}

function Read-ManifestJson {
  param([string]$BundleRoot)
  $manifestFile = Join-Path $BundleRoot 'qms-ingest-manifest.json'
  if (-not (Test-Path -LiteralPath $manifestFile)) {
    throw "Manifest not found: $manifestFile"
  }
  $raw = Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8
  return (ConvertFrom-Json $raw)
}

function Load-ControlMapping {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) {
    $Path = Join-Path (Get-ScriptRoot) 'governance-control-mapping.json'
  }
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Control mapping file not found: $Path"
  }
  $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $obj = ConvertFrom-Json $raw
  $ht = @{}
  $obj.PSObject.Properties | ForEach-Object { $ht[$_.Name] = @($_.Value) }
  return $ht
}

function Get-MarkdownHeader {
  param([string]$Markdown)
  $meta = @{
    title        = $null
    version      = $null
    date         = $null
    classification = $null
    framework    = $null
    reference    = $null
    appliesTo    = $null
  }
  $lines = $Markdown -split "`r?`n", 0, 'RegexMatch'
  $max = [Math]::Min(80, $lines.Count)
  for ($i = 0; $i -lt $max; $i++) {
    $line = $lines[$i].Trim()
    if ($line -match '^#\s+(.+)$' -and -not $meta.title) {
      $meta.title = $Matches[1].Trim()
    }
    if ($line -eq '---' -or $line -eq '***' -or $line -eq '___') { break }
    if ($line -match '^\*\*([^*]+):\*\*\s*(.+)$') {
      $field = $Matches[1].Trim().ToLowerInvariant()
      $value = $Matches[2].Trim()
      if ($field -match 'version' -and -not $meta.version) { $meta.version = $value }
      elseif ($field -match 'date' -and -not $meta.date) { $meta.date = $value }
      elseif ($field -match 'classification' -and -not $meta.classification) { $meta.classification = $value }
      elseif ($field -match 'framework|compliance' -and -not $meta.framework) { $meta.framework = $value }
      elseif ($field -match 'reference' -and -not $meta.reference) { $meta.reference = $value }
      elseif ($field -match 'applies' -and -not $meta.appliesTo) { $meta.appliesTo = $value }
    }
  }
  return $meta
}

function Get-DocumentType {
  param([string]$Code, [string]$Kind)
  if ($Code -match '^MAC-POL-') { return 'policy' }
  if ($Code -match '^MAC-SOP-') { return 'procedure' }
  if ($Code -match '^MAC-SEC-') { return 'security_guide' }
  if ($Code -match '^MAC-CMP-') { return 'plan' }
  if ($Code -match '^MAC-IT-') { return 'ssp' }
  switch -Regex ($Kind) {
    '^policy$' { return 'policy' }
    '^procedure$' { return 'procedure' }
    '^plan$' { return 'plan' }
    '^guide$' { return 'security_guide' }
    '^scope$' { return 'reference' }
    default { return $Kind }
  }
}

function Map-QmsStatus {
  param([string]$Raw)
  if ([string]::IsNullOrWhiteSpace($Raw)) { return 'effective' }
  switch ($Raw.ToUpperInvariant()) {
    'DRAFT' { return 'draft' }
    'IN_REVIEW' { return 'in_review' }
    'EFFECTIVE' { return 'effective' }
    'RETIRED' { return 'retired' }
    default { return $Raw.ToLowerInvariant() -replace '-', '_' }
  }
}

function Add-ReviewCadence {
  param([datetime]$Base, [string]$Cadence)
  if ([string]::IsNullOrWhiteSpace($Cadence)) { return $Base.AddYears(1) }
  switch -Regex ($Cadence.ToLowerInvariant()) {
    'month' { return $Base.AddMonths(1) }
    'quarter' { return $Base.AddMonths(3) }
    'annual' { return $Base.AddYears(1) }
    default { return $Base.AddYears(1) }
  }
}

function Parse-IsoDate {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
  $t = $Text.Trim()
  if ($t -match '^(\d{4}-\d{2}-\d{2})') {
    $d = [datetime]::ParseExact($Matches[1], 'yyyy-MM-dd', [System.Globalization.CultureInfo]::InvariantCulture)
    return $d
  }
  try {
    return [datetime]::Parse($t, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal -bor [System.Globalization.DateTimeStyles]::AdjustToUniversal)
  } catch {}
  return $null
}

function New-RunId {
  $ts = (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')
  $chars = '0123456789abcdef'
  $rand = -join ((1..6) | ForEach-Object { $chars[(Get-Random -Maximum 16)] })
  return "GOV-$ts-$rand"
}

# --- main ---
$bundleRoot = Resolve-BundlePath $BundlePath
Write-Verbose "Bundle path: $bundleRoot"

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path (Get-Location) 'governance-manifest.json'
}
$outputFull = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)

$manifest = Read-ManifestJson $bundleRoot
$controlMap = Load-ControlMapping $ControlMappingPath

$manifestCodes = @{}
foreach ($e in $manifest.documents) {
  $manifestCodes[[string]$e.code] = $true
}
foreach ($mapCode in $controlMap.Keys) {
  if (-not $manifestCodes.ContainsKey($mapCode)) {
    Write-Warning "Control mapping references $mapCode but it is not listed in qms-ingest-manifest.json."
  }
}

$qmsState = $null
$qmsDocByCode = @{}
if (-not [string]::IsNullOrWhiteSpace($QmsStateJsonPath)) {
  $qmsState = Get-Content -LiteralPath $QmsStateJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($qmsState.documents) {
    foreach ($p in $qmsState.documents.PSObject.Properties) {
      $qmsDocByCode[$p.Name] = $p.Value
    }
  }
}

$prevObj = $null
if (-not [string]::IsNullOrWhiteSpace($PreviousManifest)) {
  $prevPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($PreviousManifest)
  if (Test-Path -LiteralPath $prevPath) {
    $prevObj = Get-Content -LiteralPath $prevPath -Raw -Encoding UTF8 | ConvertFrom-Json
  }
}

$genBy = $GeneratedBy
if ([string]::IsNullOrWhiteSpace($genBy)) {
  if ($qmsState -and $qmsState.generated_by) { $genBy = [string]$qmsState.generated_by }
  elseif ($env:TRUST_CODEX_USER) { $genBy = $env:TRUST_CODEX_USER }
  else { $genBy = $env:USERNAME }
}

$runId = New-RunId
$generatedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

$documents = New-Object System.Collections.Generic.List[object]
$noMapping = New-Object System.Collections.Generic.List[string]
$missingFiles = New-Object System.Collections.Generic.List[string]
$allControlIds = New-Object System.Collections.Generic.List[string]
$controlsMappedTotal = 0

foreach ($entry in $manifest.documents) {
  $code = [string]$entry.code
  $relPath = [string]$entry.path
  $fullPath = Join-Path $bundleRoot $relPath

  $controls = @()
  if ($controlMap.ContainsKey($code)) {
    $controls = @($controlMap[$code])
  } else {
    if ($code -match '^MAC-(POL|SOP|SEC|CMP|IT)-') {
      Write-Warning "No control mapping for document_number $code (Trust Codex mapping table)."
      [void]$noMapping.Add($code)
    }
  }

  foreach ($c in $controls) { [void]$allControlIds.Add($c) }
  $controlsMappedTotal += $controls.Count

  $docType = Get-DocumentType -Code $code -Kind ([string]$entry.kind)

  $status = 'effective'
  $nextReview = $null
  $effDateStr = $null
  $versionStr = '1.0'
  $signatureBlock = $null

  if ($qmsDocByCode.ContainsKey($code)) {
    $st = $qmsDocByCode[$code]
    if ($st.status) { $status = Map-QmsStatus ([string]$st.status) }
    if ($st.next_review_date) { $nextReview = [string]$st.next_review_date }
    if ($st.signature -or $st.revision) {
      $sig = $st.signature
      $rev = $st.revision
      $signatureBlock = @{}
      if ($sig) {
        if ($sig.signed_by) { $signatureBlock['signed_by'] = [string]$sig.signed_by }
        if ($sig.signed_at) { $signatureBlock['signed_at'] = [string]$sig.signed_at }
        if ($sig.signature_hash) { $signatureBlock['signature_hash'] = [string]$sig.signature_hash }
      }
      if ($rev) {
        if ($rev.content_hash) { $signatureBlock['qms_content_hash'] = [string]$rev.content_hash }
        if ($rev.signing_hash) { $signatureBlock['qms_signing_hash'] = [string]$rev.signing_hash }
      }
      if ($signatureBlock.Count -eq 0) { $signatureBlock = $null }
    }
  }

  $sha256 = $null
  $sizeBytes = 0

  if (-not (Test-Path -LiteralPath $fullPath)) {
    Write-Warning "File missing on disk: $relPath (code $code)"
    [void]$missingFiles.Add($code)
    continue
  }

  $hashResult = Get-FileHash -LiteralPath $fullPath -Algorithm SHA256
  $sha256 = $hashResult.Hash.ToLowerInvariant()
  $sizeBytes = (Get-Item -LiteralPath $fullPath).Length

  $mdRaw = Get-Content -LiteralPath $fullPath -Raw -Encoding UTF8
  $headerMeta = Get-MarkdownHeader $mdRaw
  if ($headerMeta.version) { $versionStr = $headerMeta.version }
  $d = Parse-IsoDate $headerMeta.date
  if ($d) {
    $effDateStr = $d.ToString('yyyy-MM-dd')
    if (-not $nextReview) {
      $nr = Add-ReviewCadence -Base $d -Cadence ([string]$entry.review_cadence)
      $nextReview = $nr.ToString('yyyy-MM-dd')
    }
  }

  $title = [string]$entry.title
  if ($headerMeta.title) { $title = $headerMeta.title }

  $docObj = [ordered]@{
    document_number   = $code
    document_name     = $title
    document_type     = $docType
    file_path         = $relPath -replace '\\', '/'
    version           = $versionStr
    effective_date    = $effDateStr
    next_review_date  = $nextReview
    status            = $status
    sha256            = $sha256
    file_size_bytes   = [int]$sizeBytes
    controls_mapped   = @($controls)
  }

  if ($null -ne $signatureBlock -and ($signatureBlock -is [hashtable] -and $signatureBlock.Count -gt 0)) {
    $docObj['signature'] = [pscustomobject]$signatureBlock
  }

  $documents.Add([pscustomobject]$docObj)
}

$uniqueControls = ($allControlIds | Sort-Object -Unique)
$byType = @{}
foreach ($d in $documents) {
  $t = [string]$d.document_type
  if (-not $byType.ContainsKey($t)) { $byType[$t] = 0 }
  $byType[$t] = $byType[$t] + 1
}

$summary = [ordered]@{
  total_documents          = $documents.Count
  hash_algorithm           = 'SHA-256'
  controls_mapped_total    = $controlsMappedTotal
  unique_controls_covered  = $uniqueControls.Count
  by_type                  = $byType
}

$outRoot = [ordered]@{
  schema         = $schemaId
  generated_at   = $generatedAt
  generated_by   = $genBy
  tool_version   = $toolVersion
  run_id         = $runId
  base_path      = $bundleRoot
  documents      = @($documents.ToArray())
  summary        = [pscustomobject]$summary
}

$driftDetected = $false
$driftChanged = 0
$driftNew = 0
$driftMissing = 0

if ($prevObj -and $prevObj.documents) {
  $prevMap = @{}
  foreach ($p in $prevObj.documents) {
    $prevMap[[string]$p.document_number] = $p
  }
  $currMap = @{}
  foreach ($d in $documents) {
    $currMap[[string]$d.document_number] = $d
  }

  $changed = New-Object System.Collections.Generic.List[object]
  $newDocNumbers = @($currMap.Keys | Where-Object { -not $prevMap.ContainsKey($_) })
  $driftNew = $newDocNumbers.Count

  foreach ($k in @($currMap.Keys)) {
    $cur = $currMap[$k]
    if (-not $prevMap.ContainsKey($k)) { continue }
    $pr = $prevMap[$k]
    $ps = [string]$pr.sha256
    $cs = [string]$cur.sha256
    if ($ps -ne $cs) {
      $driftDetected = $true
      $driftChanged++
      $changed.Add([ordered]@{
        document_number    = $k
        previous_sha256    = $ps
        current_sha256     = $cs
        change_detected_at = $generatedAt
      })
      Write-Warning "DRIFT: document $k SHA-256 changed."
    }
  }
  $missing = New-Object System.Collections.Generic.List[string]
  foreach ($k in @($prevMap.Keys)) {
    if (-not $currMap.ContainsKey($k)) {
      $missing.Add($k)
      $driftMissing++
    }
  }

  $outRoot['drift_report'] = [ordered]@{
    checked_against         = $prevPath
    previous_generated_at   = [string]$prevObj.generated_at
    changed_documents       = @($changed.ToArray())
    new_documents           = @($newDocNumbers)
    missing_documents       = @($missing.ToArray())
  }
}

$json = ($outRoot | ConvertTo-Json -Depth 20)

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($outputFull, $json, $utf8NoBom)

$archiveName = "governance-manifest-$runId.json"
$archivePath = Join-Path (Split-Path -Parent $outputFull) $archiveName
[System.IO.File]::WriteAllText($archivePath, $json, $utf8NoBom)

$uploadLine = "Upload governance-manifest.json to Trust Codex at: /dashboard/governance/upload-manifest"
if (-not [string]::IsNullOrWhiteSpace($ControlPlaneUrl)) {
  $uploadLine = "Upload governance-manifest.json to Trust Codex at: $($ControlPlaneUrl.TrimEnd('/'))/dashboard/governance/upload-manifest"
}

Write-Host ""
Write-Host "=== Governance manifest ===" -ForegroundColor Cyan
Write-Host "Documents processed: $($documents.Count)"
Write-Host "Controls mapped (total control references): $controlsMappedTotal"
Write-Host "Unique controls covered: $($uniqueControls.Count)"
Write-Host "Documents with no control mapping (MAC-*): $($noMapping.Count)"
if ($noMapping.Count -gt 0) {
  Write-Host "  $($noMapping -join ', ')"
}
Write-Host "Files missing on disk (skipped): $($missingFiles.Count)"
if ($missingFiles.Count -gt 0) {
  Write-Host "  $($missingFiles -join ', ')"
}
if ($prevObj) {
  Write-Host "Drift detected: $(if ($driftDetected) { 'Yes' } else { 'No' }) ($driftChanged changed, $driftNew new, $driftMissing missing)"
} else {
  Write-Host "Drift detected: N/A (no -PreviousManifest)"
}
Write-Host "Output written to: $outputFull"
Write-Host "Archive copy:      $archivePath"
Write-Host "run_id: $runId"
Write-Host ""
Write-Host $uploadLine
Write-Host ""
