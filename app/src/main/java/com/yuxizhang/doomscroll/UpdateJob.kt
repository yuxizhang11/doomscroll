package com.yuxizhang.doomscroll

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/**
 * Looks for a new version a few times a day, also while the app is closed,
 * and shows a notification once per new version.
 */
class UpdateJob : JobService() {

    override fun onStartJob(params: JobParameters): Boolean {
        Updater.check(this) { result ->
            result.getOrNull()?.let { notifyOnce(this, it) }
            jobFinished(params, false)
        }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean = true

    companion object {
        private const val JOB_ID = 42
        private const val CHANNEL = "updates"
        private const val NOTIFICATION_ID = 1
        private const val INTERVAL_MS = 6 * 60 * 60 * 1000L

        /** Safe to call often; an already scheduled job is left alone. */
        fun schedule(context: Context) {
            val scheduler = context.getSystemService(JobScheduler::class.java)
            if (scheduler.getPendingJob(JOB_ID) != null) return
            val job = JobInfo.Builder(JOB_ID, ComponentName(context, UpdateJob::class.java))
                .setPeriodic(INTERVAL_MS)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build()
            // Never let the update check take the blocker down with it.
            runCatching { scheduler.schedule(job) }
        }

        /** Shows the notification unless this version was already announced. */
        fun notifyOnce(context: Context, release: Updater.Release) {
            val store = Store.get(context)
            if (store.notifiedVersion == release.version) return
            val manager = context.getSystemService(NotificationManager::class.java)
            if (!manager.areNotificationsEnabled()) return
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL, "Updates", NotificationManager.IMPORTANCE_DEFAULT)
            )
            val open = PendingIntent.getActivity(
                context, 0,
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE,
            )
            val notification = Notification.Builder(context, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle("Doomscroll Blocker ${release.version} ist da")
                .setContentText("Tippe hier und installiere das Update in der App.")
                .setContentIntent(open)
                .setAutoCancel(true)
                .build()
            manager.notify(NOTIFICATION_ID, notification)
            store.notifiedVersion = release.version
        }
    }
}
