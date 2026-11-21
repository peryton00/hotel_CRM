; ==============================================================================
; HOTEL CRM - Modern Windows NSIS Installer Hooks
; Adds Desktop Shortcut, Start Menu Shortcut, and Windows Startup Autostart
; ==============================================================================

!macro NSIS_HOOK_PREINSTALL
  ; Pre-install validation or preparation
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; 1. Create Desktop Shortcut for easy 1-click access
  CreateShortCut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
  
  ; 2. Set as Startup: Launch automatically on Windows boot so the restaurant POS terminal is instantly ready
  CreateShortCut "$SMSTARTUP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Pre-uninstall cleanup
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Clean up desktop and startup shortcuts
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$SMSTARTUP\${PRODUCTNAME}.lnk"
!macroend
