package com.yuxizhang.doomscroll

import android.view.accessibility.AccessibilityNodeInfo

/**
 * The apps the blocker watches and how it recognises their short-video screens.
 *
 * Detection looks for view ids that only exist while the Reels/Shorts player is on screen,
 * or, for apps without stable ids, for the short-video tab being the selected one.
 * Apps rename these now and then; if counting stops working after an app update,
 * this list is the place to fix it.
 */
enum class TargetApp(
    val label: String,
    val packages: Set<String>,
    private val shortFormViewIds: List<String>,
    /** Names of the short-video tab; counts while that tab is the selected one. */
    private val shortFormTabs: List<String> = emptyList(),
    /** Parts of a web address that mean this app's short videos are open in a browser. */
    private val webAddresses: List<String> = emptyList(),
    /** True when the whole app is a short-video feed, so leaving means going home. */
    val wholeAppIsShortForm: Boolean = false,
) {
    INSTAGRAM(
        label = "Instagram Reels",
        packages = setOf("com.instagram.android"),
        shortFormViewIds = listOf(
            "com.instagram.android:id/clips_viewer_view_pager",
            "com.instagram.android:id/clips_viewer_container",
            "com.instagram.android:id/clips_video_container",
            "com.instagram.android:id/root_clips_layout",
        ),
        webAddresses = listOf("instagram.com/reel"),
    ),
    YOUTUBE(
        label = "YouTube Shorts",
        packages = setOf("com.google.android.youtube"),
        shortFormViewIds = listOf(
            "com.google.android.youtube:id/reel_player_page_container",
            "com.google.android.youtube:id/reel_recycler",
            "com.google.android.youtube:id/reel_watch_player",
            "com.google.android.youtube:id/reel_watch_fragment_root",
        ),
        webAddresses = listOf("youtube.com/shorts"),
    ),
    TIKTOK(
        label = "TikTok",
        packages = setOf("com.zhiliaoapp.musically", "com.ss.android.ugc.trill"),
        shortFormViewIds = emptyList(),
        webAddresses = listOf("tiktok.com"),
        wholeAppIsShortForm = true,
    ),
    SNAPCHAT(
        label = "Snapchat Spotlight",
        packages = setOf("com.snapchat.android"),
        shortFormViewIds = emptyList(),
        shortFormTabs = listOf("Spotlight"),
    ),
    FACEBOOK(
        label = "Facebook Reels",
        packages = setOf("com.facebook.katana"),
        shortFormViewIds = emptyList(),
        shortFormTabs = listOf("Reels"),
        webAddresses = listOf("facebook.com/reel"),
    );

    fun isShortFormOnScreen(root: AccessibilityNodeInfo): Boolean {
        if (wholeAppIsShortForm) return true
        val player = shortFormViewIds.any { id ->
            root.findAccessibilityNodeInfosByViewId(id).any { it.isVisibleToUser }
        }
        return player || shortFormTabs.any { tab ->
            root.findAccessibilityNodeInfosByText(tab).any {
                it.isVisibleToUser && (it.isSelected || it.parent?.isSelected == true)
            }
        }
    }

    companion object {
        fun fromPackage(pkg: CharSequence?): TargetApp? {
            if (pkg == null) return null
            val name = pkg.toString()
            return entries.firstOrNull { name in it.packages }
        }

        /** The app whose short videos the browser address shows, e.g. youtube.com/shorts. */
        fun fromAddress(address: String): TargetApp? {
            val text = address.lowercase()
            return entries.firstOrNull { app -> app.webAddresses.any { it in text } }
        }
    }
}
