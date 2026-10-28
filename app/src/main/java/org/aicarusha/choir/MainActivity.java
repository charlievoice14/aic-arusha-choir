package org.aicarusha.choir;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.webkit.JavascriptInterface;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * AIC Arusha Choir — full-screen app that shows the choir web app (no address bar).
 * The web app itself lives on GitHub Pages, so every update there reaches the app automatically.
 */
public class MainActivity extends Activity {

    private static final String APP_URL = "https://charlievoice14.github.io/aic-arusha-choir/";
    private static final String APP_HOST = "charlievoice14.github.io";
    private static final String APP_PATH = "/aic-arusha-choir";
    private static final String OFFLINE_URL = "file:///android_asset/offline.html";

    private static final int REQ_CAMERA = 1001;
    private static final int REQ_FILE = 1002;
    private static final int REQ_NOTIFY = 1003;
    private static final String CHANNEL_ID = "choir_updates";

    private static final String PREFS = "choir_prefs";
    private static final String PREF_PUSH_TOKEN = "push_token";

    /** True while the app is on screen (the web app then shows its own pop-ups). */
    static volatile boolean inForeground = false;
    /** The running app, so a new push token can be passed to the web app straight away. */
    static volatile MainActivity current;

    private WebView webView;
    private PermissionRequest pendingPermission;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#0D1830"));
        window.setNavigationBarColor(Color.parseColor("#0D1830"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0D1830"));
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " AICChoirApp/1.0");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        current = this;
        createNotificationChannel(this);
        fetchPushToken();
        webView.addJavascriptInterface(new ChoirBridge(), "AndroidBridge");
        webView.setWebViewClient(new ChoirWebViewClient());
        webView.setWebChromeClient(new ChoirChromeClient());

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(APP_URL);
        }
    }

    /* ---------------- phone notifications (called from the web app) ---------------- */

    static void createNotificationChannel(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Choir updates", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Announcements and rehearsal / service reminders");
            NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    static boolean notificationsAllowed(Context c) {
        if (Build.VERSION.SDK_INT >= 33) {
            return c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED;
        }
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        return nm == null || nm.areNotificationsEnabled();
    }

    private boolean notificationsAllowed() { return notificationsAllowed(this); }

    /** Shows one notification; tapping it opens the choir app. */
    static void showNotification(Context c, String title, String body, String tag) {
        if (!notificationsAllowed(c)) return;
        createNotificationChannel(c);
        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(c, CHANNEL_ID)
                : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_choir)
         .setColor(Color.parseColor("#3D7BFF"))
         .setContentTitle(title)
         .setContentText(body)
         .setStyle(new Notification.BigTextStyle().bigText(body))
         .setAutoCancel(true)
         .setContentIntent(pi);
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(tag, 1, b.build());
    }

    /* ---------------- push token (notifications when the app is closed) ---------------- */

    static void savePushToken(Context c, String token) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PREF_PUSH_TOKEN, token).apply();
    }

    static String pushToken(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return p.getString(PREF_PUSH_TOKEN, "");
    }

    private void fetchPushToken() {
        try {
            if (FirebaseApp.getApps(this).isEmpty()) return;   // built without google-services.json
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> {
                if (token == null || token.isEmpty()) return;
                savePushToken(MainActivity.this, token);
                tellWebAppAboutToken();
            });
        } catch (Exception e) {
            // Firebase not available — the app still works, just without closed-app notifications
        }
    }

    void tellWebAppAboutToken() {
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript("window.onNativePushToken && window.onNativePushToken()", null);
        });
    }

    private class ChoirBridge {
        @JavascriptInterface
        public boolean canNotify() { return notificationsAllowed(); }

        @JavascriptInterface
        public void requestPermission() {
            if (Build.VERSION.SDK_INT >= 33 && !notificationsAllowed()) {
                runOnUiThread(new Runnable() {
                    @Override public void run() { requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIFY); }
                });
            } else {
                final boolean ok = notificationsAllowed();
                runOnUiThread(() -> {
                    if (ok) fetchPushToken();
                    if (webView != null) webView.evaluateJavascript("window.onNativeNotifyPermission && window.onNativeNotifyPermission(" + ok + ")", null);
                });
            }
        }

        @JavascriptInterface
        public void notify(String title, String body, String tag) {
            showNotification(MainActivity.this, title, body == null ? "" : body, tag);
        }

        @JavascriptInterface
        public String getPushToken() { return pushToken(MainActivity.this); }
    }

    /* ---------------- links & loading ---------------- */

    private boolean isAppUrl(Uri uri) {
        if (uri == null) return false;
        String host = uri.getHost();
        String path = uri.getPath() == null ? "" : uri.getPath();
        return "https".equals(uri.getScheme()) && APP_HOST.equalsIgnoreCase(host) && path.startsWith(APP_PATH);
    }

    private void openExternally(Uri uri) {
        try {
            Intent intent;
            String scheme = uri.getScheme() == null ? "" : uri.getScheme();
            if ("intent".equals(scheme)) {
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
            } else if ("tel".equals(scheme)) {
                intent = new Intent(Intent.ACTION_DIAL, uri);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, uri);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            // no app can open it — ignore
        } catch (Exception e) {
            // malformed link — ignore
        }
    }

    private class ChoirWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (!request.isForMainFrame()) return false;   // embedded players (YouTube, Drive…) stay inside the song
            Uri uri = request.getUrl();
            String scheme = uri.getScheme() == null ? "" : uri.getScheme();
            if (isAppUrl(uri)) return false;               // the choir app itself
            if ("about".equals(scheme) || "data".equals(scheme) || "blob".equals(scheme)) return false;
            openExternally(uri);                           // phone, SMS, WhatsApp, email, YouTube, other websites
            return true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame() && isAppUrl(request.getUrl())) {
                view.loadUrl(OFFLINE_URL);
            }
        }
    }

    /* ---------------- camera (QR check-in) & photo picker ---------------- */

    private class ChoirChromeClient extends WebChromeClient {
        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    boolean wantsCamera = false;
                    for (String r : request.getResources()) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCamera = true;
                    }
                    if (!wantsCamera) {
                        request.deny();
                        return;
                    }
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                    } else {
                        pendingPermission = request;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                    }
                }
            });
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            pick.setType("image/*");
            if (params != null && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);   // gallery: pick several photos at once
            }
            try {
                startActivityForResult(Intent.createChooser(pick, "Choose a photo"), REQ_FILE);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                callback.onReceiveValue(null);
                return false;
            }
            return true;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA && pendingPermission != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingPermission.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            } else {
                pendingPermission.deny();
            }
            pendingPermission = null;
        }
        if (requestCode == REQ_NOTIFY) {
            final boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) fetchPushToken();
            if (webView != null) webView.evaluateJavascript("window.onNativeNotifyPermission && window.onNativeNotifyPermission(" + granted + ")", null);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null && clip.getItemCount() > 0) {
                    result = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) result[i] = clip.getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
            }
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        }
    }

    /* ---------------- lifecycle ---------------- */

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        inForeground = true;
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        inForeground = false;
        if (webView != null) webView.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
