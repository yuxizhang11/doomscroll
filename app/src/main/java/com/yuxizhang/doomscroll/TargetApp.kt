package com.yuxizhang.doomscroll

import android.view.accessibility.AccessibilityNodeInfo

/**
 * The apps the blocker watches and how it recognises their short-video screens.
 *
 * Detection looks for view ids that only exist while the Reels/Shorts player is on screen.
 * Apps rename these ids now and then; if counting stops working after an app update,
 * this list is the place to fix it.
 */
enum class TargetApp(
    val label: String,
    val packages: Set<String>,
    private val shortFormViewIds: List<String>,
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
    ),
    TIKTOK(
        label = "TikTok",
        packages = setOf("com.zhiliaoapp.musically", "com.ss.android.ugc.trill"),
        shortFormViewIds = emptyList(),
        wholeAppIsShortForm = true,
    );

    fun isShortFormOnScreen(root: AccessibilityNodeInfo): Boolean {
        if (wholeAppIsShortForm) return true
        return shortFormViewIds.any { id ->
            root.findAccessibilityNodeInfosByViewId(id).any { it.isVisibleToUser }
        }
    }

    companion object {
        fun fromPackage(pkg: CharSequence?): TargetApp? {
            if (pkg == null) return null
            val name = pkg.toString()
            return entries.firstOrNull { name in it.packages }
        }
    }
}
