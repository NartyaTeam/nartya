; Par défaut, electron-builder ferme tout processus dont le chemin commence par $INSTDIR, sans
; séparateur final : l'installeur de « Nartya » tuait aussi « Nartya Hub », qui le lance et
; attend sa fin. On ne ferme que l'exécutable exact.

!ifndef nsProcess::FindProcess
  !include "nsProcess.nsh"
!endif

!macro customCheckAppRunning
  DetailPrint "Vérification de ${PRODUCT_NAME}…"
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 == 0
    DetailPrint "Fermeture de ${PRODUCT_NAME}…"
    ${nsProcess::CloseProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    Sleep 500
    ; Encore là ? On force.
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${If} $R0 == 0
      ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      Sleep 1000
    ${EndIf}
  ${EndIf}
  ${nsProcess::Unload}
!macroend
