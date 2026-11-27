; Beim Deinstallieren den Autostart-Eintrag der App entfernen (Name ist die AppUserModelID aus main.js, die Electron für den Run-Eintrag nutzt).
; Bei einem Update (alte Fassung wird vor der neuen entfernt) bleibt er stehen.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.yuxizhang.doomscroll.desktop"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.yuxizhang.doomscroll.desktop"
  ${endIf}
!macroend
