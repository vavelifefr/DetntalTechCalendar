package com.vave.dentaltechcalendar;

import android.Manifest;
import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "OrderNotifications",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class OrderNotificationsPlugin extends Plugin {
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionResult");
            return;
        }
        requestExactAlarmAccess(call);
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            resolvePermissionState(call);
            return;
        }
        requestExactAlarmAccess(call);
    }

    @PluginMethod
    public void sync(PluginCall call) {
        try {
            JSObject settings = call.getObject("settings");
            JSArray orders = call.getArray("orders");
            if (settings == null || orders == null) throw new IllegalArgumentException("Reminder settings and Orders are required");

            boolean enabled = settings.getBoolean("enabled", false);
            if (!enabled) {
                OrderReminderScheduler.sync(getContext(), false, 0, "11:00", new JSONArray());
                call.resolve();
                return;
            }

            if (!hasNotificationPermission()) {
                OrderReminderScheduler.sync(getContext(), false, 0, "11:00", new JSONArray());
                throw new IllegalStateException("Разрешите приложению показывать уведомления в настройках Android.");
            }
            if (!canScheduleExactAlarms()) {
                OrderReminderScheduler.sync(getContext(), false, 0, "11:00", new JSONArray());
                throw new IllegalStateException("Разрешите приложению точные будильники в настройках Android.");
            }

            int leadDays = settings.getInteger("leadDays", 0);
            String time = settings.getString("time");
            if (leadDays < 0 || leadDays > 3) throw new IllegalArgumentException("leadDays must be between 0 and 3");
            if (time == null || !time.matches("([01]\\d|2[0-3]):[0-5]\\d")) throw new IllegalArgumentException("time must use HH:mm format");
            OrderReminderScheduler.sync(getContext(), true, leadDays, time, new JSONArray(orders.toString()));
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "Не удалось обновить напоминания." : error.getMessage(), error);
        }
    }

    private void requestExactAlarmAccess(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !canScheduleExactAlarms()) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            startActivityForResult(call, intent, "exactAlarmSettingsResult");
            return;
        }
        resolvePermissionState(call);
    }

    @ActivityCallback
    private void exactAlarmSettingsResult(PluginCall call, ActivityResult result) {
        resolvePermissionState(call);
    }

    private boolean hasNotificationPermission() {
        return Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean canScheduleExactAlarms() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager alarmManager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        return alarmManager != null && alarmManager.canScheduleExactAlarms();
    }

    private void resolvePermissionState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("notificationsGranted", hasNotificationPermission());
        result.put("exactAlarmsGranted", canScheduleExactAlarms());
        call.resolve(result);
    }
}
