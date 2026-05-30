param(
    [string]$InputPath = ".\data\raw\treehouse_posts_full.json",
    [string]$OutputPath = ".\data\processed\top_post_urls.txt",
    [int]$Limit = 25
)

$Data = Get-Content $InputPath -Raw | ConvertFrom-Json

if ($Data -isnot [array]) {
    $Data = @($Data)
}

$Ranked = $Data | Sort-Object -Descending -Property @{
    Expression = {
        $likes = if ($_.likesCount) { [double]$_.likesCount } else { 0 }
        $comments = if ($_.commentsCount) { [double]$_.commentsCount } else { 0 }
        $views = if ($_.videoViewCount) { [double]$_.videoViewCount } elseif ($_.videoPlayCount) { [double]$_.videoPlayCount } else { 0 }

        ($comments * 5) + $likes + ($views * 0.01)
    }
}

$Urls = @()

foreach ($Post in $Ranked) {
    $Url = $Post.url

    if (-not $Url -and $Post.shortCode) {
        $Url = "https://www.instagram.com/p/$($Post.shortCode)/"
    }

    if ($Url) {
        $Urls += $Url
    }

    if ($Urls.Count -ge $Limit) {
        break
    }
}

$OutputDir = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$Urls | Set-Content $OutputPath

Write-Host "Saved $($Urls.Count) URLs to $OutputPath"
$Urls