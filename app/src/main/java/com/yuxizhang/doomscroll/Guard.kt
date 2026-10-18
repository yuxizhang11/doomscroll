package com.yuxizhang.doomscroll

import android.view.accessibility.AccessibilityNodeInfo

/**
 * Recognises system screens that would switch the blocker off: this app's info page
 * (uninstall, force stop), its accessibility page, its device admin page and the uninstall dialog.
 *
 * A screen counts when it mentions this app and one of the words below. Other settings
 * screens, including the list of all accessibility services and app updates, stay usable.
 */
object Guard {

    val PACKAGES = setOf(
        "com.android.settings",
        "com.samsung.accessibility",
        "com.miui.securitycenter",
        "com.google.android.packageinstaller",
        "com.android.packageinstaller",
        "com.samsung.android.packageinstaller",
    )

    private const val APP_NAME = "Doomscroll"

    private val DANGER_WORDS = listOf(
        // App info and uninstall dialog
        "Deinstallieren", "Uninstall", "Beenden erzwingen", "Stopp erzwingen", "Force stop",
        // Device admin page
        "deaktivieren", "Deactivate",
        // The service's own accessibility page ("Doomscroll Blocker verwenden" switch, shortcut)
        "verwenden", "Use Doomscroll", "Verknüpfung", "Shortcut",
    )

    fun isWatched(pkg: CharSequence?): Boolean = pkg != null && pkg.toString() in PACKAGES

    fun isTamperScreen(root: AccessibilityNodeInfo): Boolean {
        if (root.findAccessibilityNodeInfosByText(APP_NAME).isEmpty()) return false
        return DANGER_WORDS.any { root.findAccessibilityNodeInfosByText(it).isNotEmpty() }
    }
}
