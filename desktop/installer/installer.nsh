; Beim Deinstallieren die Einträge der App unter HKCU entfernen: den Autostart (Name ist die AppUserModelID aus main.js,
; die Electron für den Run-Eintrag nutzt) und die Native-Messaging-Einträge der automatischen Kopplung (Host-Name wie
; HOST_NAME in src/core/native-messaging.js; andere Hosts unter denselben Schlüsseln bleiben stehen).
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
  ${endIf}
!macroend
