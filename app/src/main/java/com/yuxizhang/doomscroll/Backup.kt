package com.yuxizhang.doomscroll

import org.json.JSONObject
import java.time.LocalDateTime

/**
 * Backup file: settings, hints and the usage history as JSON. Files carry the data
 * [Store.SCHEMA] they were written with; newer files than this app knows are refused,
 * older ones are read as far as their keys go.
 */
object Backup {

    private const val APP = "com.yuxizhang.doomscroll"

    fun write(store: Store, appVersion: String): String = JSONObject()
        .put("app", APP)
        .put("schema", Store.SCHEMA)
        .put("appVersion", appVersion)
        .put("exported", LocalDateTime.now().withNano(0).toString())
        .put("values", JSONObject(store.backupValues()))
        .toString(2)

    /** The saved values, or an error with a message for the screen. */
    fun read(text: String): Result<JSONObject> = runCatching {
        val root = runCatching { JSONObject(text) }.getOrElse { error("Das ist keine Sicherungsdatei.") }
        require(root.optString("app") == APP) { "Das ist keine Sicherung von Doomscroll Blocker." }
        val schema = root.optInt("schema", 0)
        require(schema <= Store.SCHEMA) { "Die Sicherung stammt aus einer neueren Version. Bitte erst die App aktualisieren." }
        root.optJSONObject("values") ?: JSONObject()
    }
}
