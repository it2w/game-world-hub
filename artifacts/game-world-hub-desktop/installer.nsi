; Game World Hub Desktop — NSIS Installer Script
; Build with: makensis installer.nsi
; Requires: dist-electron/win-unpacked/ to be present
;
; To build on Linux (after installing nsis):
;   cd artifacts/game-world-hub-desktop
;   makensis installer.nsi
;
; To build on Windows:
;   makensis installer.nsi

!define APP_NAME       "Game World Hub"
!define APP_VERSION    "1.0.0"
!define APP_EXE        "Game World Hub.exe"
!define APP_PUBLISHER  "Game World Hub"
!define APP_URL        "https://gameworldhub.com"
!define OUTFILE        "dist-electron\GameWorldHub-Setup-${APP_VERSION}.exe"

Unicode true

;--------------------------------
; Compression
SetCompressor /SOLID lzma
SetCompressorDictSize 32

;--------------------------------
; General

Name "${APP_NAME} ${APP_VERSION}"
OutFile "${OUTFILE}"
InstallDir "$PROGRAMFILES64\${APP_NAME}"
InstallDirRegKey HKLM "Software\${APP_NAME}" "InstallPath"
RequestExecutionLevel admin
ShowInstDetails show
ShowUnInstDetails show

;--------------------------------
; Pages

!include "MUI2.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON    "build\icon.ico"
!define MUI_UNICON  "build\icon.ico"

; Install pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; Uninstall pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

;--------------------------------
; Installer sections

Section "Main Application" SecMain
  SectionIn RO

  SetOutPath "$INSTDIR"

  ; Copy all files from win-unpacked
  File /r "dist-electron\win-unpacked\*.*"

  ; Write registry keys
  WriteRegStr HKLM "Software\${APP_NAME}" "InstallPath" "$INSTDIR"
  WriteRegStr HKLM "Software\${APP_NAME}" "Version"     "${APP_VERSION}"

  ; Register uninstaller
  WriteRegStr HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "URLInfoAbout" "${APP_URL}"
  WriteRegDWORD HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "NoModify" 1
  WriteRegDWORD HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "NoRepair" 1
  WriteRegStr HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayIcon" "$INSTDIR\${APP_EXE}"

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

SectionEnd

Section "Desktop Shortcut" SecDesktop
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
SectionEnd

Section "Start Menu Shortcut" SecStartMenu
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"   "$INSTDIR\Uninstall.exe"
SectionEnd

;--------------------------------
; Uninstaller section

Section "Uninstall"
  ; Remove application files
  RMDir /r "$INSTDIR"

  ; Remove shortcuts
  Delete "$DESKTOP\${APP_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APP_NAME}"

  ; Remove registry keys
  DeleteRegKey HKLM "Software\${APP_NAME}"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
SectionEnd
