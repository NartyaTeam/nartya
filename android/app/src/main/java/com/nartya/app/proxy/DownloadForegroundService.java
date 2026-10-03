package com.nartya.app.proxy;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.nartya.app.MainActivity;

import org.json.JSONObject;

/** Garde le processus vivant pendant les téléchargements. Ne persiste aucune URL. */
public class DownloadForegroundService extends Service {

    private static final String CHANNEL_ID = "nartya_downloads";
    private static final int NOTIFICATION_ID = 4201;
    private static final String ACTION_UPDATE = "com.nartya.app.download.UPDATE";
    private static final String EXTRA_TITLE = "title";
    private static final String EXTRA_EPISODE = "episode";
    private static final String EXTRA_PROGRESS = "progress";
    private static final String EXTRA_ACTIVE = "active";

    public static void update(Context context, @Nullable JSONObject item, int activeCount) {
        if (activeCount <= 0) {
            context.stopService(new Intent(context, DownloadForegroundService.class));
            return;
        }
        Intent intent = new Intent(context, DownloadForegroundService.class)
                .setAction(ACTION_UPDATE)
                .putExtra(EXTRA_TITLE, item != null ? item.optString("animeTitle", "Nartya") : "Nartya")
                .putExtra(EXTRA_EPISODE, item != null ? item.optString("epTitle", "Téléchargement") : "Téléchargement")
                .putExtra(EXTRA_PROGRESS, item != null ? item.optInt("percent", 0) : 0)
                .putExtra(EXTRA_ACTIVE, activeCount);
        ContextCompat.startForegroundService(context, intent);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Téléchargements",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Progression des téléchargements hors ligne Nartya");
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null ? intent.getStringExtra(EXTRA_TITLE) : null;
        String episode = intent != null ? intent.getStringExtra(EXTRA_EPISODE) : null;
        int progress = intent != null ? intent.getIntExtra(EXTRA_PROGRESS, 0) : 0;
        int active = intent != null ? intent.getIntExtra(EXTRA_ACTIVE, 1) : 1;
        startForeground(NOTIFICATION_ID, buildNotification(title, episode, progress, active));
        return START_NOT_STICKY;
    }

    private Notification buildNotification(String title, String episode, int progress, int active) {
        Intent open = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                this,
                0,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String notificationTitle = active > 1
                ? active + " téléchargements en cours"
                : (title == null || title.isEmpty() ? "Téléchargement Nartya" : title);
        String notificationText = episode == null || episode.isEmpty()
                ? "Préparation du téléchargement…"
                : episode + (progress > 0 ? " · " + progress + "%" : "");

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(notificationTitle)
                .setContentText(notificationText)
                .setContentIntent(contentIntent)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setOnlyAlertOnce(true)
                .setOngoing(true)
                .setProgress(100, Math.max(0, Math.min(100, progress)), progress <= 0)
                .build();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
