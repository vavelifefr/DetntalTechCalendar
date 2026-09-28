package com.vave.dentaltechcalendar;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class OrderReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        OrderReminderScheduler.deliver(context, intent);
    }
}
