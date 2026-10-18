package com.yuxizhang.doomscroll

import android.view.accessibility.AccessibilityNodeInfo

/**
 * Recognises pornographic sites from the address bar of common browsers.
 *
 * Only porn is blocked: the lists below name adult sites and porn-specific words, nothing
 * broader, so normal browsing (including words like "sex" in news or health pages) stays open.
 */
object AdultFilter {

    /** Browser package → view ids of its address bar. */
    val BROWSERS: Map<String, List<String>> = mapOf(
        "com.android.chrome" to listOf("com.android.chrome:id/url_bar"),
        "com.chrome.beta" to listOf("com.chrome.beta:id/url_bar"),
        "org.mozilla.firefox" to listOf(
            "org.mozilla.firefox:id/mozac_browser_toolbar_url_view",
            "org.mozilla.firefox:id/url_bar_title",
        ),
        "org.mozilla.firefox_beta" to listOf("org.mozilla.firefox_beta:id/mozac_browser_toolbar_url_view"),
        "org.mozilla.fenix" to listOf("org.mozilla.fenix:id/mozac_browser_toolbar_url_view"),
        "org.mozilla.focus" to listOf("org.mozilla.focus:id/mozac_browser_toolbar_url_view", "org.mozilla.focus:id/display_url"),
        "com.sec.android.app.sbrowser" to listOf(
            "com.sec.android.app.sbrowser:id/location_bar_edit_text",
            "com.sec.android.app.sbrowser:id/custom_tab_toolbar_url_bar_text",
        ),
        "com.brave.browser" to listOf("com.brave.browser:id/url_bar"),
        "com.microsoft.emmx" to listOf("com.microsoft.emmx:id/url_bar"),
        "com.opera.browser" to listOf("com.opera.browser:id/url_field"),
        "com.opera.mini.native" to listOf("com.opera.mini.native:id/url_field"),
        "com.duckduckgo.mobile.android" to listOf("com.duckduckgo.mobile.android:id/omnibarTextInput"),
        "com.vivaldi.browser" to listOf("com.vivaldi.browser:id/url_bar"),
        "com.kiwibrowser.browser" to listOf("com.kiwibrowser.browser:id/url_bar"),
        "com.mi.globalbrowser" to listOf("com.mi.globalbrowser:id/url"),
    )

    /** Porn-specific words; matched anywhere in the address, so searches for them are caught too. */
    private val KEYWORDS = listOf(
        "porn", "xxx", "hentai", "xvideos", "xnxx", "xhamster", "redtube", "youporn", "brazzers",
        "onlyfans", "chaturbate", "stripchat", "camsoda", "bongacams", "livejasmin", "rule34",
        "spankbang", "eporner", "tnaflix", "motherless", "fapello", "thothub", "nudes", "milf",
    )

    /** Adult sites whose name contains none of the words above. */
    private val DOMAINS = listOf(
        "beeg.com", "tube8.com", "fansly.com", "manyvids.com", "cam4.com", "myfreecams.com",
        "erome.com", "iwara.tv", "literotica.com", "sxyprn.com", "hqporner.com", "ixxx.com",
        "noodlemagazine.com", "xmoviesforyou.com", "daftsex.com", "fuq.com", "hclips.com",
        "nuvid.com", "drtuber.com", "sunporno.com", "luscious.net", "f95zone.to",
    )

    private const val MAX_DEPTH = 40

    fun isBrowser(pkg: CharSequence?): Boolean = pkg != null && pkg.toString() in BROWSERS

    /**
     * The address shown in the browser's bar, unless you are typing in it right now.
     * Newer browser versions (Firefox since its Compose toolbar) have no fixed view ids, so
     * when none is found the browser's own controls are read instead, leaving out the page itself.
     */
    fun currentAddress(root: AccessibilityNodeInfo): String? {
        val ids = BROWSERS[root.packageName?.toString()] ?: return null
        for (id in ids) {
            for (node in root.findAccessibilityNodeInfosByViewId(id)) {
                if (node.isFocused) return null
                val text = node.text?.toString()
                if (!text.isNullOrBlank()) return text
            }
        }
        val texts = StringBuilder()
        if (!collectChromeText(root, texts, 0)) return null
        return texts.toString().ifBlank { null }
    }

    /** Collects text outside the web page; false when the address bar is being typed in. */
    private fun collectChromeText(node: AccessibilityNodeInfo, out: StringBuilder, depth: Int): Boolean {
        val cls = node.className?.toString().orEmpty()
        if ("WebView" in cls || "GeckoView" in cls || depth > MAX_DEPTH) return true
        if (node.isEditable && node.isFocused) return false
        node.text?.let { out.append(it).append('\n') }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            if (!collectChromeText(child, out, depth + 1)) return false
        }
        return true
    }

    fun isPorn(address: String): Boolean {
        val text = address.lowercase()
        if (KEYWORDS.any { it in text }) return true
        return text.lines().any { line ->
            val host = line.trim().substringAfter("://").substringBefore('/').substringBefore('?').removePrefix("www.")
            DOMAINS.any { host == it || host.endsWith(".$it") }
        }
    }
}
