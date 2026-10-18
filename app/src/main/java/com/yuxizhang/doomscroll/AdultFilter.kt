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
        // Incognito and Samsung's secret mode run in the same package and are covered too.
        "com.android.chrome" to listOf("com.android.chrome:id/url_bar"),
        "com.chrome.beta" to listOf("com.chrome.beta:id/url_bar"),
        "com.chrome.dev" to listOf("com.chrome.dev:id/url_bar"),
        "com.chrome.canary" to listOf("com.chrome.canary:id/url_bar"),
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
        "com.sec.android.app.sbrowser.beta" to listOf("com.sec.android.app.sbrowser.beta:id/location_bar_edit_text"),
        "com.brave.browser" to listOf("com.brave.browser:id/url_bar"),
        "com.brave.browser_beta" to listOf("com.brave.browser_beta:id/url_bar"),
        "com.ecosia.android" to listOf("com.ecosia.android:id/url_bar"),
        "org.torproject.torbrowser" to listOf("org.torproject.torbrowser:id/mozac_browser_toolbar_url_view"),
        "com.microsoft.emmx" to listOf("com.microsoft.emmx:id/url_bar"),
        "com.opera.browser" to listOf("com.opera.browser:id/url_field"),
        "com.opera.browser.beta" to listOf("com.opera.browser.beta:id/url_field"),
        "com.opera.gx" to listOf("com.opera.gx:id/url_field"),
        "com.opera.mini.native" to listOf("com.opera.mini.native:id/url_field"),
        "com.duckduckgo.mobile.android" to listOf("com.duckduckgo.mobile.android:id/omnibarTextInput"),
        "com.vivaldi.browser" to listOf("com.vivaldi.browser:id/url_bar"),
        "com.kiwibrowser.browser" to listOf("com.kiwibrowser.browser:id/url_bar"),
        "com.mi.globalbrowser" to listOf("com.mi.globalbrowser:id/url"),
    )

    /** Names of porn sites; matched anywhere, so searching for them is caught too. */
    private val SITE_NAMES = listOf(
        "pornhub", "xvideos", "xnxx", "xhamster", "redtube", "youporn", "brazzers",
        "onlyfans", "chaturbate", "stripchat", "camsoda", "bongacams", "livejasmin",
        "spankbang", "eporner", "tnaflix", "motherless", "fapello", "thothub",
    )

    /** Porn words; matched anywhere, so searches for them are caught too. */
    private val KEYWORDS = listOf("porn", "xxx", "hentai", "rule34", "nudes", "milf")

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
     * The address shown in the browser's bar, or what is being typed into it.
     * Newer browser versions (Firefox since its Compose toolbar) have no fixed view ids, so
     * when none is found the browser's own controls are read instead (address bar and search
     * suggestions), leaving out the page itself.
     */
    fun currentAddress(root: AccessibilityNodeInfo): String? {
        val ids = BROWSERS[root.packageName?.toString()] ?: return null
        for (id in ids) {
            for (node in root.findAccessibilityNodeInfosByViewId(id)) {
                val text = node.text?.toString()
                if (!text.isNullOrBlank()) return text
            }
        }
        val texts = StringBuilder()
        collectChromeText(root, texts, 0)
        return texts.toString().ifBlank { null }
    }

    /** The text field you are typing in right now, if any. */
    fun typingField(root: AccessibilityNodeInfo): AccessibilityNodeInfo? =
        root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.takeIf { it.isEditable }

    private fun collectChromeText(node: AccessibilityNodeInfo, out: StringBuilder, depth: Int) {
        val cls = node.className?.toString().orEmpty()
        if ("WebView" in cls || "GeckoView" in cls || depth > MAX_DEPTH) return
        node.text?.let { out.append(it).append('\n') }
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { collectChromeText(it, out, depth + 1) }
        }
    }

    /** A porn site or a search for porn. */
    fun isPorn(address: String): Boolean {
        val text = address.lowercase()
        if (SITE_NAMES.any { it in text } || KEYWORDS.any { it in text }) return true
        return text.lines().any { line ->
            val host = line.trim().substringAfter("://").substringBefore('/').substringBefore('?').removePrefix("www.")
            DOMAINS.any { host == it || host.endsWith(".$it") }
        }
    }
}
