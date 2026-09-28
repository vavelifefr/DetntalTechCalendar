package com.vave.dentaltechcalendar;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(LocalDatabasePlugin.class);
        registerPlugin(OrderNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
