#Requires -Version 5
<#
    Publishes LEBUSER WinWash as a self-contained Windows x64 app.
    The output folder runs on a station PC that does NOT have .NET installed.
#>
[CmdletBinding()]
param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Definition
$project = Join-Path $here "Lebuser.TunnelGateway.csproj"
$output = Join-Path $here "bin\$Configuration\net10.0-windows\$Runtime\publish"

Write-Host "Publishing LEBUSER WinWash ($Configuration / $Runtime)..." -ForegroundColor Cyan
dotnet publish $project -c $Configuration -r $Runtime --self-contained -p:DebugType=none -p:DebugSymbols=false --nologo
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed (exit $LASTEXITCODE)." }

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "Output: $output"
Write-Host "Run:    $(Join-Path $output 'Lebuser.TunnelGateway.exe')"
