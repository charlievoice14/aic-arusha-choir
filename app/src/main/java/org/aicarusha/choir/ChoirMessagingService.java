package org.aicarusha.choir;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Receives choir notifications from the server (Firebase Cloud Messaging).
 * When the app is closed or in the background, Android shows the notification by itself;
 * this class only handles the cases Android leaves to the app.
 */
public class ChoirMessagingService extends FirebaseMessagingService {

    @Override
    public void onNewToken(String token) {
        MainActivity.savePushToken(this, token);
        MainActivity a = MainActivity.current;
        if (a != null) a.tellWebAppAboutToken();
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        // The app is open on screen: the choir app shows its own pop-up instead.
        if (MainActivity.inForeground) return;

        Map<String, String> data = message.getData();
        String title = data.get("title");
        String body = data.get("body");
        String tag = data.get("tag");
        RemoteMessage.Notification n = message.getNotification();
        if (n != null) {
            if (title == null) title = n.getTitle();
            if (body == null) body = n.getBody();
            if (tag == null) tag = n.getTag();
        }
        if (title == null) return;
        MainActivity.showNotification(this, title, body == null ? "" : body, tag);
    }
}
