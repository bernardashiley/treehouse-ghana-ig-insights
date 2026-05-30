param(
    [Parameter(Mandatory = $true)]
    [string]$InputFile,

    [Parameter(Mandatory = $true)]
    [string]$OutputName,

    [int]$MaxItems = 100
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ConfigPath = Join-Path $ProjectRoot "config.ps1"

if (-not (Test-Path $ConfigPath)) {
    throw "Missing config.ps1 in project root."
}

. $ConfigPath

if (-not $env:APIFY_TOKEN) {
    throw "Missing APIFY_TOKEN. Check config.ps1."
}

if (-not $env:ACTOR_ID) {
    $env:ACTOR_ID = "apify~instagram-scraper"
}

if (-not $env:APIFY_BASE_URL) {
    $env:APIFY_BASE_URL = "https://api.apify.com/v2"
}

$InputPath = Join-Path $ProjectRoot $InputFile
$RawDataPath = Join-Path $ProjectRoot "data\raw"

New-Item -ItemType Directory -Force -Path $RawDataPath | Out-Null

if (-not (Test-Path $InputPath)) {
    throw "Input file not found: $InputPath"
}

$ActorInput = Get-Content $InputPath -Raw | ConvertFrom-Json

$Headers = @{
    "Authorization" = "Bearer $env:APIFY_TOKEN"
    "Content-Type"  = "application/json"
}

$RunUrl = "$env:APIFY_BASE_URL/actors/$env:ACTOR_ID/runs?memory=1024&timeout=3600&maxItems=$MaxItems"

Write-Host "Starting Apify actor: $env:ACTOR_ID"
Write-Host "Input file: $InputFile"
Write-Host "Max items: $MaxItems"

$RunResponse = Invoke-RestMethod `
    -Uri $RunUrl `
    -Method Post `
    -Headers $Headers `
    -Body ($ActorInput | ConvertTo-Json -Depth 100)

$RunResponse | ConvertTo-Json -Depth 100 | Set-Content "$RawDataPath\$OutputName`_run_response.json"

$RunId = $RunResponse.data.id
$Status = $RunResponse.data.status

Write-Host "Run ID: $RunId"
Write-Host "Initial status: $Status"

while ($Status -notin @("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT")) {
    Write-Host "Waiting for run to finish..."
    Start-Sleep -Seconds 15

    $StatusResponse = Invoke-RestMethod `
        -Uri "$env:APIFY_BASE_URL/actor-runs/$RunId" `
        -Method Get `
        -Headers $Headers

    $StatusResponse | ConvertTo-Json -Depth 100 | Set-Content "$RawDataPath\$OutputName`_status_response.json"

    $Status = $StatusResponse.data.status
    Write-Host "Status: $Status"
}

if ($Status -ne "SUCCEEDED") {
    throw "Run did not succeed. Final status: $Status"
}

$DatasetId = $StatusResponse.data.defaultDatasetId

if (-not $DatasetId) {
    $DatasetId = $RunResponse.data.defaultDatasetId
}

Write-Host "Dataset ID: $DatasetId"

$JsonUrl = "$env:APIFY_BASE_URL/datasets/$DatasetId/items?format=json&clean=true"
$CsvUrl = "$env:APIFY_BASE_URL/datasets/$DatasetId/items?format=csv&clean=true"

$JsonOutput = Invoke-RestMethod `
    -Uri $JsonUrl `
    -Method Get `
    -Headers @{ "Authorization" = "Bearer $env:APIFY_TOKEN" }

$JsonOutput | ConvertTo-Json -Depth 100 | Set-Content "$RawDataPath\$OutputName.json" -Encoding UTF8

$CsvOutput = Invoke-WebRequest `
    -Uri $CsvUrl `
    -Method Get `
    -UseBasicParsing `
    -Headers @{ "Authorization" = "Bearer $env:APIFY_TOKEN" }

$CsvOutput.Content | Set-Content "$RawDataPath\$OutputName.csv" -Encoding UTF8

if ($JsonOutput -is [array]) {
    Write-Host "Rows downloaded: $($JsonOutput.Count)"
} else {
    Write-Host "Rows downloaded: 1"
}

Write-Host "Saved JSON: data\raw\$OutputName.json"
Write-Host "Saved CSV: data\raw\$OutputName.csv"
