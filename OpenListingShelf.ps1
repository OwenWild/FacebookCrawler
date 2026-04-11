# Resolves this repo's unpacked extension in Chrome and opens the Listing Shelf (dashboard).
# Uses raw Preferences text search — ConvertFrom-Json default depth breaks Chrome's huge JSON file.
$ErrorActionPreference = "Stop"

try {

function Show-Message {
    param([string]$Text, [string]$Title = "Listing Shelf")
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    [System.Windows.Forms.MessageBox]::Show($Text, $Title, [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
}

function Get-ChromeExe {
    $candidates = @(
        Join-Path ${env:ProgramFiles} "Google\Chrome\Application\chrome.exe"
        Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"
        Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"
    )
    foreach ($p in $candidates) {
        if (Test-Path -LiteralPath $p) { return $p }
    }
    $cmd = Get-Command "chrome.exe" -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Get-ExtensionIdFromPreferencesRaw {
    param(
        [string]$PrefsPath,
        [string]$ExtensionDirFullPath
    )
    if (-not (Test-Path -LiteralPath $PrefsPath)) { return $null }
    $raw = [System.IO.File]::ReadAllText($PrefsPath)
    if ([string]::IsNullOrEmpty($raw)) { return $null }

    $full = [System.IO.Path]::GetFullPath($ExtensionDirFullPath).TrimEnd('\')
    $jsonEscaped = $full.Replace('\', '\\')
    $forward = $full.Replace('\', '/')

    $needles = @($jsonEscaped, $full, $forward)
    foreach ($needle in $needles) {
        if ([string]::IsNullOrEmpty($needle)) { continue }
        $idx = $raw.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase)
        if ($idx -lt 0) { continue }

        $start = [Math]::Max(0, $idx - 20000)
        $segment = $raw.Substring($start, $idx - $start)
        $matches = [regex]::Matches($segment, '"([a-p]{32})"\s*:\s*\{')
        if ($matches.Count -eq 0) { continue }
        $id = $matches[$matches.Count - 1].Groups[1].Value
        if ($id.Length -eq 32) { return $id }
    }

    # Fallback: manifest title appears in the same extension block
    $titleNeedle = '"name":"Marketplace Listing Shelf"'
    $idx2 = $raw.IndexOf($titleNeedle, [StringComparison]::Ordinal)
    if ($idx2 -ge 0) {
        $start = [Math]::Max(0, $idx2 - 25000)
        $segment = $raw.Substring($start, $idx2 - $start)
        $matches = [regex]::Matches($segment, '"([a-p]{32})"\s*:\s*\{')
        if ($matches.Count -gt 0) {
            $id = $matches[$matches.Count - 1].Groups[1].Value
            if ($id.Length -eq 32) { return $id }
        }
    }

    return $null
}

function Get-ChromeProfileDirsWithPreferences {
    param([string]$UserDataRoot)
    $out = @()
    if (-not (Test-Path -LiteralPath $UserDataRoot)) { return $out }
    Get-ChildItem -LiteralPath $UserDataRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $prefs = Join-Path $_.FullName "Preferences"
        if (Test-Path -LiteralPath $prefs) {
            $out += $_.Name
        }
    }
    return $out
}

function Find-ListingShelfExtensionId {
    param([string]$ExtensionFolderFullPath)
    $userData = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"
    $profiles = Get-ChromeProfileDirsWithPreferences -UserDataRoot $userData
    if ($profiles.Count -eq 0) { return $null }

    foreach ($prof in $profiles) {
        $prefs = Join-Path (Join-Path $userData $prof) "Preferences"
        $id = Get-ExtensionIdFromPreferencesRaw -PrefsPath $prefs -ExtensionDirFullPath $ExtensionFolderFullPath
        if ($id) { return @{ Id = $id; Profile = $prof } }
    }
    return $null
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$extDir = [System.IO.Path]::GetFullPath((Join-Path $root "extension"))

if (-not (Test-Path -LiteralPath (Join-Path $extDir "manifest.json"))) {
    Show-Message "Could not find extension\manifest.json next to this script. Keep OpenListingShelf.ps1 at the project root."
    exit 1
}

$idFile = Join-Path $root "ShelfExtensionId.txt"
$profileFile = Join-Path $root "ShelfChromeProfile.txt"
$manualId = $null
$manualProfile = "Default"
if (Test-Path -LiteralPath $idFile) {
    $line = (Get-Content -LiteralPath $idFile -Raw -Encoding UTF8).Trim()
    if ($line -match '^[a-p]{32}$') {
        $manualId = $line
        if (Test-Path -LiteralPath $profileFile) {
            $p = (Get-Content -LiteralPath $profileFile -Raw -Encoding UTF8).Trim()
            if (-not [string]::IsNullOrWhiteSpace($p)) { $manualProfile = $p }
        }
    }
}

$chrome = Get-ChromeExe
if (-not $chrome) {
    Show-Message "Google Chrome was not found. Install Chrome, or open the shelf from the extension popup in Edge if you use that."
    exit 1
}

if ($manualId) {
    $page = "chrome-extension://$manualId/dashboard.html"
    Start-Process -FilePath $chrome -ArgumentList @(
        "--profile-directory=$manualProfile",
        $page
    )
    exit 0
}

$result = Find-ListingShelfExtensionId -ExtensionFolderFullPath $extDir
if (-not $result) {
    Show-Message @"
Could not find this extension in Chrome's profile data.

Fix one of these:

A) Load unpacked from EXACTLY this folder (then run this again):
$extDir

B) Copy your extension ID from chrome://extensions (Developer mode ON), paste it into a new file in this folder named ShelfExtensionId.txt (one line, 32 letters a–p). Optionally add ShelfChromeProfile.txt with your profile folder name (e.g. Profile 1, or Default).

Then run this launcher again.
"@
    Start-Process -FilePath $chrome -ArgumentList "chrome://extensions/"
    exit 1
}

$page = "chrome-extension://$($result.Id)/dashboard.html"
Start-Process -FilePath $chrome -ArgumentList @(
    "--profile-directory=$($result.Profile)",
    $page
)
exit 0

} catch {
    try {
        Add-Type -AssemblyName System.Windows.Forms | Out-Null
        [System.Windows.Forms.MessageBox]::Show(
            "Something went wrong: $($_.Exception.Message)",
            "Listing Shelf",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    } catch { }
    exit 1
}
