# Installs the AGASTHY CLI (agasthy.exe: read-only CLI and MCP server) on Windows.
#
#   irm https://raw.githubusercontent.com/HMAKT99/Agasthy/main/install.ps1 | iex
#
# Downloads the latest release, checks its SHA-256, unpacks it to
# %LOCALAPPDATA%\Programs\agasthy-cli and adds that folder to your user PATH.
# No admin rights needed. To uninstall, delete that folder and remove it from PATH.

& {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is very slow with the progress bar on
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $asset = 'agasthy-cli-windows-x86_64.zip'
    $url   = "https://github.com/HMAKT99/Agasthy/releases/latest/download/$asset"
    $dir   = Join-Path $env:LOCALAPPDATA 'Programs\agasthy-cli'

    if (-not [Environment]::Is64BitOperatingSystem) {
        Write-Host 'AGASTHY CLI needs 64-bit Windows.' -ForegroundColor Red
        return
    }
    # Windows 11 on ARM runs x64 programs through its built-in emulation.
    $arm = ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') -or ($env:PROCESSOR_ARCHITEW6432 -eq 'ARM64')
    if ($arm) { Write-Host 'Windows on ARM: installing the x64 build, which runs under Windows'' x64 emulation.' }

    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("agasthy-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
        Write-Host "Downloading $asset ..."
        $zip = Join-Path $tmp $asset
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip
        $sum = (Invoke-WebRequest -UseBasicParsing -Uri "$url.sha256").Content
        if ($sum -is [byte[]]) { $sum = [Text.Encoding]::ASCII.GetString($sum) }   # Windows PowerShell 5.1 returns bytes
        $expected = ($sum.Trim() -split '\s+')[0]
        $actual = (Get-FileHash -Algorithm SHA256 $zip).Hash
        if ($actual -ne $expected) {
            throw "Checksum mismatch: expected $expected, got $actual. Nothing was installed."
        }
        Write-Host 'Checksum OK.'

        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        try {
            Expand-Archive -Path $zip -DestinationPath $dir -Force
        } catch {
            throw "Could not write $dir\agasthy.exe. If an MCP client (Claude Desktop, Cursor, ...) is running it, quit that app and run this again."
        }
    } finally {
        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    }

    # Add to the user PATH, keeping existing entries exactly as stored (including %VARIABLES%).
    $key  = Get-Item 'HKCU:\Environment'
    $path = $key.GetValue('Path', '', 'DoNotExpandEnvironmentNames')
    $entries = @($path -split ';' | Where-Object { $_ })
    if ($entries -notcontains $dir) {
        $new = (@($entries) + $dir) -join ';'
        Set-ItemProperty -Path 'HKCU:\Environment' -Name Path -Value $new -Type ExpandString
        # Tell Windows the environment changed, so apps started from now on see the new PATH.
        [Environment]::SetEnvironmentVariable('AGASTHY_PATH_REFRESH', '1', 'User')
        [Environment]::SetEnvironmentVariable('AGASTHY_PATH_REFRESH', $null, 'User')
        Write-Host "Added $dir to your PATH."
    }
    if (($env:Path -split ';') -notcontains $dir) { $env:Path = "$env:Path;$dir" }

    $version = & (Join-Path $dir 'agasthy.exe') --version
    Write-Host ''
    Write-Host "Installed $version" -ForegroundColor Green
    Write-Host ''
    Write-Host 'Try:   agasthy status     (what the AGASTHY app has scanned)'
    Write-Host '       agasthy agents     (coding-agent sessions running now)'
    Write-Host '       agasthy usage      (token usage, last 30 days)'
    Write-Host ''
    Write-Host 'Connect Claude Code:  claude mcp add agasthy -- agasthy mcp'
    Write-Host "Other MCP clients:    command `"$dir\agasthy.exe`", args [`"mcp`"]"
    Write-Host 'Other terminals that were already open need to be restarted to see agasthy.'
}
