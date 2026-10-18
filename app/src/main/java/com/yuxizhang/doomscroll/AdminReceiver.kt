package com.yuxizhang.doomscroll

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

/** Device admin without any powers: it only stops Android from uninstalling the app directly. */
class AdminReceiver : DeviceAdminReceiver() {
    override fun onDisableRequested(context: Context, intent: Intent): CharSequence =
        "Schalte den Schutz zuerst in Doomscroll Blocker mit dem 20-Zeichen-Code aus."
}
