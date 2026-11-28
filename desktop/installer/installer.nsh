; Firefox dauerhaft: Liegt die von Mozilla signierte Erweiterung bei (resources\firefox\doomscroll-blocker.xpi, siehe README),
; trägt der Installer sie in die Firefox-Richtlinie "Extensions\Install" ein (Werte 1, 2, ...; bestehende Einträge bleiben,
; der erste freie Name wird genommen). Installation für alle Benutzer schreibt nach HKLM, sonst nach HKCU. Schlüssel und Dateiname
; müssen zu POLICY_KEY und XPI_NAME in src/core/firefox-policy.js passen (Test). Beim Deinstallieren (nicht bei einem Update)
; verschwindet genau dieser Eintrag wieder.
!macro doomscrollPolicyAdd ROOT XPI
  Push $R0
  Push $R1
  StrCpy $R0 1
  ${DoWhile} $R0 < 50
    ClearErrors
    ReadRegStr $R1 ${ROOT} "SOFTWARE\Policies\Mozilla\Firefox\Extensions\Install" "$R0"
    ${If} $R1 == "${XPI}"
      ${Break}
    ${ElseIf} ${Errors}
      WriteRegStr ${ROOT} "SOFTWARE\Policies\Mozilla\Firefox\Extensions\Install" "$R0" "${XPI}"
      ${Break}
    ${EndIf}
    IntOp $R0 $R0 + 1
  ${Loop}
  Pop $R1
  Pop $R0
!macroend

!macro doomscrollPolicyRemove ROOT XPI
  Push $R0
  Push $R1
  StrCpy $R0 1
  ${DoWhile} $R0 < 50
    ClearErrors
    ReadRegStr $R1 ${ROOT} "SOFTWARE\Policies\Mozilla\Firefox\Extensions\Install" "$R0"
    ${If} $R1 == "${XPI}"
      DeleteRegValue ${ROOT} "SOFTWARE\Policies\Mozilla\Firefox\Extensions\Install" "$R0"
    ${EndIf}
    IntOp $R0 $R0 + 1
  ${Loop}
  Pop $R1
  Pop $R0
!macroend

!macro customInstall
  ${If} ${FileExists} "$INSTDIR\resources\firefox\doomscroll-blocker.xpi"
    SetRegView 64
    ${If} $installMode == "all"
      !insertmacro doomscrollPolicyAdd HKLM "$INSTDIR\resources\firefox\doomscroll-blocker.xpi"
    ${Else}
      !insertmacro doomscrollPolicyAdd HKCU "$INSTDIR\resources\firefox\doomscroll-blocker.xpi"
    ${EndIf}
  ${EndIf}
!macroend

; Beim Deinstallieren die Einträge der App unter HKCU entfernen: den Autostart (Name ist die AppUserModelID aus main.js,
; die Electron für den Run-Eintrag nutzt) und die Native-Messaging-Einträge der automatischen Kopplung (Host-Name wie
; HOST_NAME in src/core/native-messaging.js; andere Hosts unter denselben Schlüsseln bleiben stehen), dazu den Firefox-Richtlinien-Eintrag.
; Bei einem Update (alte Fassung wird vor der neuen entfernt) bleiben alle stehen.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.yuxizhang.doomscroll.desktop"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.yuxizhang.doomscroll.desktop"
    DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\de.doomscroll.desktop"
    DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\de.doomscroll.desktop"
    DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\de.doomscroll.desktop"
    DeleteRegKey HKCU "Software\Chromium\NativeMessagingHosts\de.doomscroll.desktop"
    DeleteRegKey HKCU "Software\Mozilla\NativeMessagingHosts\de.doomscroll.desktop"
    SetRegView 64
    !insertmacro doomscrollPolicyRemove HKLM "$INSTDIR\resources\firefox\doomscroll-blocker.xpi"
    !insertmacro doomscrollPolicyRemove HKCU "$INSTDIR\resources\firefox\doomscroll-blocker.xpi"
  ${endIf}
!macroend
