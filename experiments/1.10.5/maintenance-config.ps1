function Get-DRMaintenanceEnvironment([string]$File) {
    if (!(Test-Path -LiteralPath $File)) { return @{ MAINTENANCE_MODE = '0' } }
    try { $raw = Get-Content -LiteralPath $File -Raw | ConvertFrom-Json } catch { throw 'Invalid maintenance configuration' }
    $ids = @($raw.allowedAccountIds)
    if ($raw.enabled -ne $true -or $ids.Count -eq 0 -or @($ids | Where-Object { $_ -isnot [string] -or $_ -notmatch '^[A-Za-z0-9_-]{1,64}$' }).Count -ne 0 -or @($ids | Select-Object -Unique).Count -ne $ids.Count) {
        throw 'Invalid maintenance configuration'
    }
    return @{ MAINTENANCE_MODE = '1'; MAINTENANCE_ALLOWED_ACCOUNT_IDS = ($ids -join ',') }
}

function Set-DRMaintenanceWorkerEnvironment([hashtable]$Maintenance, [object]$Hosted) {
    if ($Maintenance.MAINTENANCE_MODE -eq '1') {
        Remove-Item Env:DR_1105_WORKER_URL -ErrorAction SilentlyContinue
    } else {
        $env:DR_1105_WORKER_URL = [string]$Hosted.workerUrl
    }
}
