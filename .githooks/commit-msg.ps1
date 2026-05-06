param(
    [Parameter(Mandatory = $true)]
    [string]$MessageFile
)

$ErrorActionPreference = "Stop"

function New-Text {
    param(
        [int[]]$Codes
    )

    return -join ($Codes | ForEach-Object { [char]$_ })
}

function Test-AllowedChar {
    param(
        [char]$Char
    )

    $code = [int]$Char
    if (($code -ge 0x4E00) -and ($code -le 0x9FFF)) {
        return $true
    }

    if (($code -ge 0x30) -and ($code -le 0x39)) {
        return $true
    }

    return $code -eq 0x20
}

function Test-ChineseSegment {
    param(
        [string]$Text
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $false
    }

    foreach ($char in $Text.Trim().ToCharArray()) {
        if (-not (Test-AllowedChar -Char $char)) {
            return $false
        }
    }

    return $true
}

$notFoundMessage = New-Text -Codes @(26410,25214,21040,25552,20132,20449,24687,25991,20214)
$emptyTitleMessage = New-Text -Codes @(25552,20132,26631,39064,19981,33021,20026,31354)
$invalidTitlePrefix = New-Text -Codes @(25552,20132,26631,39064,24517,39035,20026,65306,20013,25991,20998,31867,58,32,20013,25991,35828,26126)
$fullWidthColon = [char]0xFF1A

if (-not (Test-Path -LiteralPath $MessageFile)) {
    Write-Error $notFoundMessage
    exit 1
}

$firstLine = Get-Content -LiteralPath $MessageFile -Encoding UTF8 | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($firstLine)) {
    $firstLine = ""
} else {
    $firstLine = $firstLine.Trim()
}

if ($firstLine -eq "") {
    Write-Error $emptyTitleMessage
    exit 1
}

$separatorIndex = $firstLine.IndexOf(':')
$fullWidthSeparatorIndex = $firstLine.IndexOf($fullWidthColon)

if ($separatorIndex -lt 0 -or ($fullWidthSeparatorIndex -ge 0 -and $fullWidthSeparatorIndex -lt $separatorIndex)) {
    $separatorIndex = $fullWidthSeparatorIndex
}

if ($separatorIndex -lt 1 -or $separatorIndex -ge ($firstLine.Length - 1)) {
    Write-Error ($invalidTitlePrefix + " -> " + $firstLine)
    exit 1
}

$category = $firstLine.Substring(0, $separatorIndex).Trim()
$summary = $firstLine.Substring($separatorIndex + 1).Trim()

if ((-not (Test-ChineseSegment -Text $category)) -or (-not (Test-ChineseSegment -Text $summary))) {
    Write-Error ($invalidTitlePrefix + " -> " + $firstLine)
    exit 1
}

exit 0
