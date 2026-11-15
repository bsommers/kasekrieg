; KAESEKRIEG per-user installer (no admin). Build: makensis /DVERSION=x.y.z /DSRCDIR=... /DOUTFILE=... installer.nsi
Unicode true
!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define APP "Kaesekrieg"
!define UKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}"
Name "KAESEKRIEG"
OutFile "${OUTFILE}"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\${APP}"
InstallDirRegKey HKCU "Software\${APP}" "InstallDir"
SetCompressor /SOLID lzma
SetCompressorDictSize 64
!include MUI2.nsh
!define MUI_FINISHPAGE_RUN "$INSTDIR\Kaesekrieg.exe"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "${SRCDIR}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortcut "$SMPROGRAMS\${APP}\KAESEKRIEG.lnk" "$INSTDIR\Kaesekrieg.exe"
  CreateShortcut "$SMPROGRAMS\${APP}\Uninstall KAESEKRIEG.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\${APP}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UKEY}" "DisplayName" "KAESEKRIEG"
  WriteRegStr HKCU "${UKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UKEY}" "Publisher" "KAESEKRIEG"
  WriteRegStr HKCU "${UKEY}" "DisplayIcon" "$INSTDIR\Kaesekrieg.exe"
  WriteRegStr HKCU "${UKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\${APP}\*.lnk"
  RMDir "$SMPROGRAMS\${APP}"
  DeleteRegKey HKCU "${UKEY}"
  DeleteRegKey HKCU "Software\${APP}"
  ; $INSTDIR is the uninstaller's own dir; remove it (self-delete handled by NSIS)
  RMDir /r "$INSTDIR"
SectionEnd
