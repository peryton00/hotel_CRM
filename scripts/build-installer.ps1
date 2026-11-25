param([string]$OutputDir)
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    $compiler = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    $iscc = if ($compiler) { $compiler.Source } else { "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" }
    if (!(Test-Path -LiteralPath $iscc)) { throw 'Install Inno Setup 6 or add ISCC.exe to PATH.' }

    function Get-ReleaseBinary($manifest, $name) {
        $metadata = cargo metadata --locked --no-deps --format-version 1 --manifest-path $manifest
        if ($LASTEXITCODE) { throw "Cannot read Cargo metadata for $manifest" }
        $dir = ($metadata | ConvertFrom-Json).target_directory
        return (Get-Item -LiteralPath (Join-Path $dir "release\$name.exe")).FullName
    }

    $bridge = Join-Path (Get-Location) 'src-tauri/target/installer-bridge'
    New-Item -ItemType Directory -Force -Path $bridge | Out-Null
    foreach ($file in 'index.js', 'package.json', 'package-lock.json') {
        Copy-Item -LiteralPath (Join-Path 'whatsapp-bridge' $file) -Destination $bridge
    }
    $node = (Get-Command node.exe).Source
    if ((& $node -p 'process.arch') -ne 'x64') { throw 'Use x64 Node.js for the Windows installer.' }
    Copy-Item -LiteralPath $node -Destination (Join-Path $bridge 'node.exe')
    $nodeVersion = & $node -p 'process.version'
    Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/nodejs/node/$nodeVersion/LICENSE" -OutFile (Join-Path $bridge 'NODE-LICENSE.txt')
    & npm.cmd ci --prefix $bridge --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE) { throw 'WhatsApp production dependency installation failed.' }
    & npx.cmd --yes @tauri-apps/cli@2 build --no-bundle
    if ($LASTEXITCODE) { throw 'Tauri release build failed.' }
    & cargo build --release --locked --manifest-path backend/api/Cargo.toml --bin migrate
    if ($LASTEXITCODE) { throw 'Database provisioning build failed.' }

    $desktop = Get-ReleaseBinary src-tauri/Cargo.toml hotel_crm_desktop
    $setup = Get-ReleaseBinary backend/api/Cargo.toml migrate
    $options = @("/DDesktopExe=$desktop", "/DSetupExe=$setup", "/DBridgeDir=$bridge")
    if ($OutputDir) { $options += "/O$OutputDir" }
    & $iscc @options installer.iss
    if ($LASTEXITCODE) { throw 'Installer compilation failed.' }
} finally {
    Pop-Location
}
