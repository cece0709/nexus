package com.nexus.memory

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import org.json.JSONObject

data class LocalReminder(val id: String, val title: String, val epochMs: Long)

/** Durable device-local schedules. OEM power restrictions and force-stop can still delay or cancel delivery. */
object ReminderScheduler {
    const val CHANNEL_ID = "nexus-local-events"
    private const val PREFS = "nexus-local-reminders"
    private const val KEY = "events"
    private val idPattern = Regex("[A-Za-z0-9_-]{1,100}")

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private fun stored(context: Context): JSONObject = try { JSONObject(prefs(context).getString(KEY, "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
    private fun write(context: Context, values: JSONObject) = prefs(context).edit().putString(KEY, values.toString()).commit()
    private fun alarm(context: Context) = context.getSystemService(AlarmManager::class.java)

    fun exactAlarmsAllowed(context: Context): Boolean = Build.VERSION.SDK_INT < 31 || alarm(context).canScheduleExactAlarms()
    fun notificationsEnabled(context: Context): Boolean {
        val manager = context.getSystemService(NotificationManager::class.java)
        return (Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
            && manager.areNotificationsEnabled()
            && manager.getNotificationChannel(CHANNEL_ID)?.importance != NotificationManager.IMPORTANCE_NONE
    }

    fun createChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "NEXUS 日程 / Events", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "由你主动添加的本地日程提醒 / Your device-local event reminders"
        })
    }

    private fun intent(context: Context, id: String) = Intent(context, AlarmReceiver::class.java).apply {
        action = "com.nexus.memory.LOCAL_REMINDER"
        data = Uri.parse("nexus-reminder://event/${Uri.encode(id)}")
        putExtra("event_id", id)
    }

    private fun pending(context: Context, id: String) = PendingIntent.getBroadcast(context, id.hashCode(), intent(context, id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    private fun register(context: Context, reminder: LocalReminder): String {
        val manager = alarm(context)
        val operation = pending(context, reminder.id)
        if (exactAlarmsAllowed(context)) {
            try { manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.epochMs, operation); return "exact" } catch (_: SecurityException) { /* Permission may change between checking and scheduling. */ }
        }
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.epochMs, operation)
        return "inexact"
    }

    @Synchronized fun schedule(context: Context, id: String, title: String, epochMs: Double): JSONObject {
        if (!idPattern.matches(id) || title.isBlank() || title.length > 200 || !epochMs.isFinite()
            || epochMs < System.currentTimeMillis() + 500 || epochMs > System.currentTimeMillis() + 5L * 366 * 86_400_000) {
            return JSONObject().put("ok", false).put("error", "INVALID_EVENT")
        }
        val safeTitle = title.trim().replace(Regex("[\\x00-\\x1f\\x7f]"), " ")
        val reminder = LocalReminder(id, safeTitle, epochMs.toLong())
        val values = stored(context)
        val previous = values.optJSONObject(id)
        values.put(id, JSONObject().put("id", id).put("title", safeTitle).put("epochMs", reminder.epochMs))
        if (!write(context, values)) return JSONObject().put("ok", false).put("error", "LOCAL_STORAGE_FAILED")
        return try {
            createChannel(context)
            val mode = register(context, reminder)
            JSONObject().put("ok", true).put("mode", mode).put("notificationsEnabled", notificationsEnabled(context))
        } catch (_: Exception) {
            if (previous == null) values.remove(id) else values.put(id, previous)
            write(context, values)
            JSONObject().put("ok", false).put("error", "SCHEDULING_FAILED")
        }
    }

    @Synchronized fun get(context: Context, id: String): LocalReminder? {
        val item = stored(context).optJSONObject(id) ?: return null
        return LocalReminder(id, item.optString("title"), item.optLong("epochMs"))
    }

    @Synchronized fun removeStored(context: Context, id: String) { val values = stored(context); values.remove(id); write(context, values) }

    @Synchronized fun cancel(context: Context, id: String): JSONObject {
        if (!idPattern.matches(id)) return JSONObject().put("ok", false).put("error", "INVALID_ID")
        return try {
            val operation = pending(context, id)
            alarm(context).cancel(operation); operation.cancel()
            val values = stored(context); values.remove(id)
            if (!write(context, values)) return JSONObject().put("ok", false).put("error", "LOCAL_STORAGE_FAILED")
            context.getSystemService(NotificationManager::class.java).cancel(id, 0)
            JSONObject().put("ok", true)
        } catch (_: Exception) { JSONObject().put("ok", false).put("error", "CANCEL_FAILED") }
    }

    @Synchronized fun cancelAll(context: Context): JSONObject {
        val ids = stored(context).keys().asSequence().toList()
        var ok = true
        for (id in ids) if (!cancel(context, id).optBoolean("ok")) ok = false
        return JSONObject().put("ok", ok)
    }

    @Synchronized fun restoreFuture(context: Context) {
        val values = stored(context)
        val ids = values.keys().asSequence().toList()
        for (id in ids) {
            val value = values.optJSONObject(id)
            val time = value?.optLong("epochMs") ?: 0
            if (!idPattern.matches(id) || time <= System.currentTimeMillis()) { values.remove(id); continue }
            try { register(context, LocalReminder(id, value!!.optString("title"), time)) } catch (_: Exception) { /* A later app launch retries retained future schedules. */ }
        }
        write(context, values)
    }
}
