package com.yuxizhang.doomscroll

import android.graphics.Rect
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
    /**
     * Parts of view ids that belong to a full-screen player, for players whose exact id
     * changes depending on where they were opened from.
     */
    private val shortFormIdParts: List<String> = emptyList(),
    /** True when the whole app is a short-video feed, so leaving means going home. */
    val wholeAppIsShortForm: Boolean = false,
) {
    INSTAGRAM(
        label = "Instagram Reels",
        packages = setOf("com.instagram.android"),
        shortFormViewIds = listOf(
            // Only the full-screen Reels viewer; reels in the home feed don't count.
            "com.instagram.android:id/clips_viewer_view_pager",
            "com.instagram.android:id/clips_viewer_container",
        ),
        // A reel tapped in the home feed opens full screen in a viewer whose ids vary.
        shortFormIdParts = listOf("clips_viewer", "clips_video", "reel_viewer"),
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
            root.findAccessibilityNodeInfosByViewId(id).any { it.isVisibleToUser && fillsScreen(it, root) }
        }
        if (player || hasPlayerById(root)) return true
        return shortFormTabs.any { tab ->
            root.findAccessibilityNodeInfosByText(tab).any {
                it.isVisibleToUser && (it.isSelected || it.parent?.isSelected == true)
            }
        }
    }

    /** Looks for a full-screen node whose id contains one of [shortFormIdParts]. */
    private fun hasPlayerById(root: AccessibilityNodeInfo): Boolean {
        if (shortFormIdParts.isEmpty()) return false
        val queue = ArrayDeque<AccessibilityNodeInfo>().apply { add(root) }
        var seen = 0
        while (queue.isNotEmpty() && seen++ < MAX_NODES) {
            val node = queue.removeFirst()
            val id = node.viewIdResourceName
            if (id != null && shortFormIdParts.any { it in id } && node.isVisibleToUser && fillsScreen(node, root)) {
                return true
            }
            // A child can only fill the screen if its parent does, so skip small branches.
            if (node !== root && !fillsScreen(node, root)) continue
            for (i in 0 until node.childCount) node.getChild(i)?.let(queue::add)
        }
        return false
    }

    /** The player has to cover most of the screen; a small preview in a feed doesn't count. */
    private fun fillsScreen(node: AccessibilityNodeInfo, root: AccessibilityNodeInfo): Boolean {
        val player = Rect().also(node::getBoundsInScreen)
        val screen = Rect().also(root::getBoundsInScreen)
        return screen.height() > 0 && player.height() >= screen.height() * FULL_SCREEN_SHARE
    }

    companion object {
        private const val FULL_SCREEN_SHARE = 0.7f
        private const val MAX_NODES = 300

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
