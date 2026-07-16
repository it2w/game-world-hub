; Game World Hub Desktop — NSIS Installer Script
; Build with:
;   NSIS_DIR="/path/to/nsis-3.0.4.1"
;   NSISDIR="$NSIS_DIR" $NSIS_DIR/linux/makensis installer.nsi

!define APP_NAME       "Game World Hub"
!define APP_VERSION    "1.0.0"
!define APP_EXE        "Game World Hub.exe"
!define APP_PUBLISHER  "Game World Hub"
!define APP_URL        "https://gmes.app"
!define OUTFILE        "dist-electron/GameWorldHubSetup.exe"
!define SRC_DIR        "dist-electron/win-unpacked"
!define ICON_FILE      "build/icon.ico"

Unicode true
SetCompressor /SOLID lzma
SetCompressorDictSize 32

Name "${APP_NAME}"
OutFile "${OUTFILE}"

; Install to user AppData (no admin needed — like Discord)
InstallDir "$LOCALAPPDATA\${APP_NAME}"
RequestExecutionLevel user
ShowInstDetails nevershow
ShowUnInstDetails nevershow

;--------------------------------
; Modern UI 2

!include "MUI2.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON    "${ICON_FILE}"
!define MUI_UNICON  "${ICON_FILE}"

; Splash / welcome graphic (header only)
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_UNBITMAP_NOSTRETCH

; One-click style: just instfiles + finish
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${APP_NAME}"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

;--------------------------------
; Installer

Section "Main" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  File /r "${SRC_DIR}\*.*"

  ; Registry — uninstaller entry
  WriteRegStr HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "URLInfoAbout" "${APP_URL}"
  WriteRegStr HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegDWORD HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "NoModify" 1
  WriteRegDWORD HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "NoRepair" 1

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Shortcuts
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"   "$INSTDIR\Uninstall.exe"
SectionEnd

;--------------------------------
; Uninstaller

Section "Uninstall"
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APP_NAME}"
  DeleteRegKey HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
SectionEnd
