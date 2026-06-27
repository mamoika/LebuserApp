; Inno Setup script for LEBUSER WinWash (tunnel station desktop app).
;
; Build with Inno Setup 6  ->  https://jrsoftware.org/isdl.php
;   1) run  ..\publish.ps1   (creates the self-contained publish folder)
;   2) compile this script:
;        "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" Lebuser.WinWash.iss
;   3) installer lands in  .\dist\LebuserWinWash-Setup-<version>.exe

#define AppName "LEBUSER WinWash"
#define AppVersion "1.0.0"
#define AppPublisher "Lebuser"
#define AppExeName "Lebuser.TunnelGateway.exe"
#define PublishDir "..\bin\Release\net10.0-windows\win-x64\publish"

[Setup]
AppId={{8F3C2A1E-9D44-4B7A-B0E2-1C6F5A9D2E10}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\Lebuser\WinWash
DisableProgramGroupPage=yes
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExeName}
OutputDir=dist
OutputBaseFilename=LebuserWinWash-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin

[Languages]
; Polish.isl ships with Inno Setup 6. If your install lacks it, use "compiler:Default.isl".
Name: "pl"; MessagesFile: "compiler:Languages\Polish.isl"

[Tasks]
Name: "desktopicon"; Description: "Utwórz skrót na pulpicie"; GroupDescription: "Skróty:"
Name: "startupicon"; Description: "Uruchamiaj automatycznie po starcie Windows"; GroupDescription: "Autostart:"; Flags: unchecked

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon
Name: "{commonstartup}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: startupicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Uruchom {#AppName} teraz"; Flags: nowait postinstall skipifsilent
