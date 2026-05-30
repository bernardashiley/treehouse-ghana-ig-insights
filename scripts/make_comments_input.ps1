param(
    [string]$UrlsPath = ".\data\processed\top_post_urls.txt",
    [string]$OutputPath = ".\inputs\comments_top_posts.json"
)

$Urls = Get-Content $UrlsPath | Where-Object { $_.Trim().Length -gt 0 }

$Payload = @{
    resultsType = "comments"
    directUrls = $Urls
    resultsLimit = 50
}

$Payload | ConvertTo-Json -Depth 10 | Set-Content $OutputPath -Encoding UTF8

Write-Host "Saved comments input to $OutputPath"
Write-Host "Post URLs included: $($Urls.Count)"