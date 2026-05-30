param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

$Data = Get-Content $Path -Raw | ConvertFrom-Json

if ($Data -is [array]) {
    Write-Host "Rows: $($Data.Count)"
} else {
    Write-Host "Rows: 1"
    $Data = @($Data)
}

if ($Data.Count -eq 0) {
    Write-Host "No data found."
    exit
}

Write-Host "`nAvailable fields:"
$Data[0].PSObject.Properties.Name | Sort-Object

Write-Host "`nFirst 3 records:"
$Data | Select-Object -First 3 | ForEach-Object {
    Write-Host "----------------------------------------"
    Write-Host "URL:" $_.url
    Write-Host "Timestamp:" $_.timestamp
    Write-Host "Type:" $_.type $_.productType
    Write-Host "Likes:" $_.likesCount
    Write-Host "Comments:" $_.commentsCount
    Write-Host "Views:" $_.videoViewCount $_.videoPlayCount

    $caption = $_.caption
    if ($caption) {
        $shortCaption = $caption.ToString().Replace("`n", " ")
        if ($shortCaption.Length -gt 300) {
            $shortCaption = $shortCaption.Substring(0, 300)
        }
        Write-Host "Caption:" $shortCaption
    }
}