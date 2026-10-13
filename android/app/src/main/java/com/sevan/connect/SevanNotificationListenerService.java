package com.sevan.connect;

import android.content.ComponentName;
import android.content.Context;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.text.TextUtils;
import android.app.Notification;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

public class SevanNotificationListenerService extends NotificationListenerService {
    private static volatile SevanNotificationListenerService activeService;

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        activeService = this;
    }

    @Override
    public void onListenerDisconnected() {
        if (activeService == this) activeService = null;
        super.onListenerDisconnected();
    }

    @Override
    public void onDestroy() {
        if (activeService == this) activeService = null;
        super.onDestroy();
    }

    public static boolean isEnabled(Context context) {
        String listeners = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        if (TextUtils.isEmpty(listeners)) return false;
        ComponentName component = new ComponentName(context, SevanNotificationListenerService.class);
        for (String entry : listeners.split(":")) {
            ComponentName enabled = ComponentName.unflattenFromString(entry);
            if (component.equals(enabled)) return true;
        }
        return false;
    }

    public static JSArray readActiveNotifications() {
        JSArray rows = new JSArray();
        SevanNotificationListenerService service = activeService;
        if (service == null) return rows;
        try {
            StatusBarNotification[] notifications = service.getActiveNotifications();
            if (notifications == null) return rows;
            for (int i = Math.max(0, notifications.length - 100); i < notifications.length; i++) {
                StatusBarNotification status = notifications[i];
                Notification notification = status.getNotification();
                CharSequence title = notification.extras.getCharSequence(Notification.EXTRA_TITLE);
                CharSequence text = notification.extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
                if (TextUtils.isEmpty(text)) text = notification.extras.getCharSequence(Notification.EXTRA_TEXT);
                JSObject row = new JSObject();
                row.put("app", status.getPackageName());
                row.put("title", title == null ? "" : title.toString());
                row.put("text", text == null ? "" : text.toString());
                row.put("postedAt", status.getPostTime());
                rows.put(row);
            }
        } catch (Exception ignored) {}
        return rows;
    }
}
