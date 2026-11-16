package com.nexus.memory

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("event_id") ?: return
        val reminder = ReminderScheduler.get(context, id) ?: return
        ReminderScheduler.removeStored(context, id)
        if (!ReminderScheduler.notificationsEnabled(context)) return
        ReminderScheduler.createChannel(context)
        val open = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            data = Uri.parse("nexus-open://event/${Uri.encode(id)}")
            putExtra("event_id", id)
        }
        val contentIntent = PendingIntent.getActivity(context, id.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(context, ReminderScheduler.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_nexus_notification)
            .setContentTitle("NEXUS · 日程提醒 / Event")
            .setContentText(reminder.title)
            .setStyle(Notification.BigTextStyle().bigText(reminder.title))
            .setCategory(Notification.CATEGORY_EVENT)
            .setWhen(reminder.epochMs)
            .setShowWhen(true)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()
        try { context.getSystemService(NotificationManager::class.java).notify(id, 0, notification) } catch (_: SecurityException) { /* Permission was revoked after scheduling. */ }
    }
}
