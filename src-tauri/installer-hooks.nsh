; Remplace une installation Electron au même endroit que celle-ci : %LOCALAPPDATA%\Programs\Nartya
; (là où electron-builder installait, et où le Hub cherche l'application).

!macro NSIS_HOOK_PREINSTALL
  ; Tauri propose %LOCALAPPDATA%\Nartya par défaut ; un dossier choisi à la main est respecté.
  ${If} $INSTDIR == "$LOCALAPPDATA\${PRODUCTNAME}"
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCTNAME}"
    SetOutPath $INSTDIR
    RMDir "$LOCALAPPDATA\${PRODUCTNAME}"
  ${EndIf}

  ; Ancienne coque Electron : on la désinstalle avant la copie. `_?=` rend le désinstalleur
  ; synchrone et l'empêche de se recopier ailleurs. Les données de l'utilisateur
  ; (%APPDATA%\nartya : téléchargements, session, réglages) ne sont pas touchées.
  IfFileExists "$INSTDIR\Uninstall ${PRODUCTNAME}.exe" 0 +4
    DetailPrint "Suppression de l'ancienne version (Electron)…"
    ExecWait '"$INSTDIR\Uninstall ${PRODUCTNAME}.exe" /S /currentuser _?=$INSTDIR'
    Delete "$INSTDIR\Uninstall ${PRODUCTNAME}.exe"
!macroend

; « Nartya 1.40.1 », comme le faisait electron-builder dans « Applications installées ».
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "${PRODUCTNAME} ${VERSION}"
!macroend
