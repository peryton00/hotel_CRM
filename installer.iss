; ==============================================================================
; Inno Setup 6 Script for HOTEL CRM
; Modern, high-performance installer with desktop icon, custom folder, and auto-start
; ==============================================================================

#define MyAppName "GuruKripa Dhaba CRM"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Peryton"
#define MyAppURL "https://gurukripadhaba-menu.vercel.app"
#define MyAppExeName "HOTEL_CRM.exe"

[Setup]
; Unique application identifier
AppId={{C6D2B173-9F40-4C94-82D5-5F390B880A54}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; Automatically close running instances before installing
CloseApplications=yes
RestartApplications=no
; Modern Inno Setup 6 Wizard styling
WizardStyle=modern
SetupIconFile=src-tauri\icons\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=dist-installer
OutputBaseFilename=HOTEL-CRM-Setup-{#MyAppVersion}
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=commandline dialog

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce
Name: "startup"; Description: "Launch HOTEL CRM automatically when Windows boots up"; GroupDescription: "System Startup:"; Flags: checkedonce

[Files]
Source: "src-tauri\target\release\hotel_crm_desktop.exe"; DestDir: "{app}"; DestName: "{#MyAppExeName}"; Flags: ignoreversion
Source: "backend\api\.env"; DestDir: "{app}"; Flags: ignoreversion
Source: "src-tauri\icons\icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon
Name: "{autostartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"; Tasks: startup

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent runasoriginaluser
