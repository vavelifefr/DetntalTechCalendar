package com.vave.dentaltechcalendar;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

final class OrderReminderScheduler {
    static final String ACTION_REMIND = "com.vave.dentaltechcalendar.ORDER_DEADLINE_REMINDER";
    private static final String PREFERENCES = "dental_order_reminders";
    private static final String TRACKED_ORDERS = "tracked_orders";
    private static final String ENABLED = "enabled";
    private static final String LEAD_DAYS = "lead_days";
    private static final String REMINDER_TIME = "reminder_time";
    private static final String CHANNEL_ID = "order_deadline_reminders";
    private static final String DATE_FORMAT = "yyyy-MM-dd";

    private OrderReminderScheduler() {}

    static synchronized void sync(Context context, boolean enabled, int leadDays, String time, JSONArray orders) throws Exception {
        JSONObject previous = loadOrders(context);
        JSONObject next = new JSONObject();
        JSONObject incoming = new JSONObject();

        if (enabled) {
            for (int index = 0; index < orders.length(); index++) {
                JSONObject order = orders.optJSONObject(index);
                if (order == null) continue;
                String id = order.optString("id", "").trim();
                String deadline = order.optString("deadline", "").trim();
                if (id.isEmpty() || !isValidDate(deadline)) continue;
                JSONObject reminder = new JSONObject();
                reminder.put("id", id);
                reminder.put("patientName", order.optString("patientName", "Без имени"));
                reminder.put("doctorName", order.optString("doctorName", "Не указан"));
                reminder.put("deadline", deadline);
                reminder.put("leadDays", leadDays);
                reminder.put("time", time);

                JSONObject old = previous.optJSONObject(id);
                if (old != null && old.optString("deadline").equals(deadline)
                    && old.optInt("leadDays", -1) == leadDays && old.optString("time").equals(time)) {
                    reminder.put("lastNotifiedDate", old.optString("lastNotifiedDate", ""));
                } else {
                    reminder.put("lastNotifiedDate", "");
                }
                incoming.put(id, reminder);
            }
        }

        JSONArray oldIds = previous.names();
        if (oldIds != null) {
            for (int index = 0; index < oldIds.length(); index++) {
                String id = oldIds.optString(index);
                JSONObject old = previous.optJSONObject(id);
                JSONObject replacement = incoming.optJSONObject(id);
                if (replacement == null) {
                    cancelAlarm(context, id);
                    cancelNotification(context, id);
                    continue;
                }
                boolean textChanged = !old.optString("patientName").equals(replacement.optString("patientName"))
                    || !old.optString("doctorName").equals(replacement.optString("doctorName"));
                boolean scheduleChanged = !old.optString("deadline").equals(replacement.optString("deadline"))
                    || old.optInt("leadDays", -1) != replacement.optInt("leadDays", -1)
                    || !old.optString("time").equals(replacement.optString("time"));
                if (textChanged || scheduleChanged) cancelNotification(context, id);
            }
        }

        android.content.SharedPreferences.Editor editor = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit();
        editor.putBoolean(ENABLED, enabled);
        editor.putInt(LEAD_DAYS, leadDays);
        editor.putString(REMINDER_TIME, time);
        editor.putString(TRACKED_ORDERS, next.toString());
        editor.apply();

        if (!enabled) {
            if (oldIds != null) {
                for (int index = 0; index < oldIds.length(); index++) cancelAlarm(context, oldIds.optString(index));
            }
            return;
        }

        for (int index = 0; index < orders.length(); index++) {
            JSONObject incomingOrder = orders.optJSONObject(index);
            if (incomingOrder == null) continue;
            String id = incomingOrder.optString("id", "").trim();
            JSONObject reminder = incoming.optJSONObject(id);
            if (reminder == null) continue;
            cancelAlarm(context, id);
            scheduleNext(context, reminder);
            next.put(id, reminder);
        }
        editor.putString(TRACKED_ORDERS, next.toString()).apply();
    }

    static synchronized void deliver(Context context, Intent intent) {
        android.content.SharedPreferences preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        if (!preferences.getBoolean(ENABLED, false)) return;
        String id = intent.getStringExtra("orderId");
        String alarmDate = intent.getStringExtra("reminderDate");
        if (id == null || alarmDate == null) return;

        JSONObject orders = loadOrders(context);
        JSONObject reminder = orders.optJSONObject(id);
        if (reminder == null || !alarmDate.equals(reminder.optString("scheduledDate"))) return;

        try {
            ensureNotificationChannel(context);
            String patientName = reminder.optString("patientName", "Без имени");
            String doctorName = reminder.optString("doctorName", "Не указан");
            String deadline = reminder.optString("deadline", "");
            String displayDate = displayDate(deadline);
            String notificationText = "Врач: " + doctorName + " · Срок сдачи: " + displayDate;
            Intent openApp = new Intent(context, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                id.hashCode(),
                openApp,
                PendingIntent.FLAG_UPDATE_CURRENT | immutableFlag()
            );
            Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL_ID)
                : new Notification.Builder(context);
            Notification notification = builder
                .setSmallIcon(R.drawable.ic_stat_order_reminder)
                .setContentTitle(patientName)
                .setContentText(notificationText)
                .setStyle(new Notification.BigTextStyle().bigText(notificationText))
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .build();
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.notify(id, 0, notification);

            reminder.put("lastNotifiedDate", alarmDate);
            reminder.put("scheduledDate", "");
            orders.put(id, reminder);
            saveOrders(context, orders);
            scheduleNext(context, reminder);
            orders.put(id, reminder);
            saveOrders(context, orders);
        } catch (Exception ignored) {
            // A system notification may be blocked after the user changes Android settings.
        }
    }

    private static void scheduleNext(Context context, JSONObject reminder) throws Exception {
        String id = reminder.optString("id", "");
        Calendar next = nextReminderDate(reminder, System.currentTimeMillis());
        if (id.isEmpty() || next == null) {
            reminder.put("scheduledDate", "");
            return;
        }
        String date = formatDate(next.getTime());
        reminder.put("scheduledDate", date);
        Intent intent = reminderIntent(context, id, date);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | immutableFlag()
        );
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) throw new IllegalStateException("Android AlarmManager is unavailable");
        manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), pendingIntent);
    }

    private static Calendar nextReminderDate(JSONObject reminder, long now) throws ParseException {
        Calendar deadline = dateCalendar(reminder.optString("deadline", ""));
        Calendar today = Calendar.getInstance();
        clearTime(today);
        if (deadline.before(today)) return null;

        Calendar candidate = (Calendar) deadline.clone();
        candidate.add(Calendar.DAY_OF_YEAR, -reminder.optInt("leadDays", 0));
        if (candidate.before(today)) candidate = today;
        Calendar lastPossibleTime = (Calendar) deadline.clone();
        lastPossibleTime.set(Calendar.HOUR_OF_DAY, 23);
        lastPossibleTime.set(Calendar.MINUTE, 59);
        lastPossibleTime.set(Calendar.SECOND, 59);
        lastPossibleTime.set(Calendar.MILLISECOND, 999);

        String lastNotifiedDate = reminder.optString("lastNotifiedDate", "");
        if (!lastNotifiedDate.isEmpty()) {
            Calendar afterLastNotification = dateCalendar(lastNotifiedDate);
            afterLastNotification.add(Calendar.DAY_OF_YEAR, 1);
            if (candidate.before(afterLastNotification)) candidate = afterLastNotification;
        }

        String[] timeParts = reminder.optString("time", "11:00").split(":");
        int hour = Integer.parseInt(timeParts[0]);
        int minute = Integer.parseInt(timeParts[1]);
        while (!candidate.after(lastPossibleTime)) {
            candidate.set(Calendar.HOUR_OF_DAY, hour);
            candidate.set(Calendar.MINUTE, minute);
            candidate.set(Calendar.SECOND, 0);
            candidate.set(Calendar.MILLISECOND, 0);
            if (candidate.getTimeInMillis() > now) return candidate;
            candidate.add(Calendar.DAY_OF_YEAR, 1);
        }
        return null;
    }

    private static Calendar dateCalendar(String date) throws ParseException {
        SimpleDateFormat format = new SimpleDateFormat(DATE_FORMAT, Locale.US);
        format.setLenient(false);
        Date parsed = format.parse(date);
        if (parsed == null) throw new ParseException("Invalid date", 0);
        Calendar calendar = Calendar.getInstance();
        calendar.setTime(parsed);
        clearTime(calendar);
        return calendar;
    }

    private static void clearTime(Calendar calendar) {
        calendar.set(Calendar.HOUR_OF_DAY, 0);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
    }

    private static boolean isValidDate(String date) {
        try {
            dateCalendar(date);
            return true;
        } catch (ParseException error) {
            return false;
        }
    }

    private static Intent reminderIntent(Context context, String id, String date) {
        Uri identity = Uri.parse("dentaltech://order-reminder/" + Uri.encode(id));
        return new Intent(context, OrderReminderReceiver.class)
            .setAction(ACTION_REMIND)
            .setData(identity)
            .putExtra("orderId", id)
            .putExtra("reminderDate", date);
    }

    private static void cancelAlarm(Context context, String id) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            0,
            reminderIntent(context, id, ""),
            PendingIntent.FLAG_NO_CREATE | immutableFlag()
        );
        if (pendingIntent != null) {
            manager.cancel(pendingIntent);
            pendingIntent.cancel();
        }
    }

    private static int immutableFlag() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
    }

    private static JSONObject loadOrders(Context context) {
        String saved = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString(TRACKED_ORDERS, "{}");
        try {
            return new JSONObject(saved == null ? "{}" : saved);
        } catch (JSONException error) {
            return new JSONObject();
        }
    }

    private static void saveOrders(Context context, JSONObject orders) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putString(TRACKED_ORDERS, orders.toString())
            .apply();
    }

    private static void cancelNotification(Context context, String id) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(id, 0);
    }

    private static void ensureNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Сроки сдачи заказов", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Напоминания о сроках сдачи активных заказов");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private static String displayDate(String date) {
        try {
            Date parsed = dateCalendar(date).getTime();
            return new SimpleDateFormat("dd.MM.yyyy", new Locale("ru", "RU")).format(parsed);
        } catch (ParseException error) {
            return date;
        }
    }

    private static String formatDate(Date date) {
        return new SimpleDateFormat(DATE_FORMAT, Locale.US).format(date);
    }
}
