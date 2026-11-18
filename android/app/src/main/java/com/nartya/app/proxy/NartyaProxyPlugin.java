package com.nartya.app.proxy;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.nartya.app.core.NartyaCore;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Pont vers le cœur Rust (libnartya_android.so) : proxy local, résolution des flux et
 * téléchargements hors ligne. Progression poussée par l'événement « downloadProgress ».
 */
@CapacitorPlugin(
    name = "NartyaProxy",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class NartyaProxyPlugin extends Plugin {

    private static volatile NartyaProxyPlugin activePlugin;
    private static volatile Context appContext;
    // Les appels au cœur bloquent le temps de l'opération : fil à part, hors du fil des plugins.
    private static final ExecutorService CORE_EXECUTOR = Executors.newCachedThreadPool();
    private static final Object CORE_LOCK = new Object();
    private static JSObject coreInfo;
    // Téléchargements en cours, d'après les événements du cœur (service de premier plan).
    private static final Set<String> activeDownloads = ConcurrentHashMap.newKeySet();
    // Fusion « playlist + segments » → video.mp4, une à la fois : elle écrit autant que l'épisode pèse.
    private static final ExecutorService REMUX_EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Set<String> remuxing = ConcurrentHashMap.newKeySet();

    @Override
    public void load() {
        activePlugin = this;
        appContext = getContext().getApplicationContext();
    }

    @Override
    protected void handleOnDestroy() {
        if (activePlugin == this) activePlugin = null;
    }

    /** Démarre le cœur (une fois par processus) : { success, port, token }. */
    @PluginMethod
    public void coreStart(PluginCall call) {
        Context context = getContext().getApplicationContext();
        CORE_EXECUTOR.execute(() -> {
            try {
                synchronized (CORE_LOCK) {
                    if (coreInfo == null) {
                        JSObject started = new JSObject(NartyaCore.nativeStart(
                                context.getFilesDir().getAbsolutePath(), NartyaProxyPlugin::handleCoreEvent));
                        if (!started.optBoolean("success", false)) {
                            call.resolve(started);
                            return;
                        }
                        coreInfo = started;
                        remuxPendingDownloads();
                    }
                }
                call.resolve(coreInfo);
            } catch (Throwable e) {
                // UnsatisfiedLinkError compris : pas de bibliothèque pour cette ABI.
                call.resolve(failure(e));
            }
        });
    }

    /** Requête : { request: { token, forceRefresh, mode }, accessToken }. */
    @PluginMethod
    public void coreResolve(PluginCall call) {
        JSObject request = call.getObject("request", new JSObject());
        String accessToken = call.getString("accessToken", "");
        CORE_EXECUTOR.execute(() -> {
            try {
                call.resolve(new JSObject(NartyaCore.nativeResolve(request.toString(), accessToken)));
            } catch (Throwable e) {
                call.resolve(failure(e));
            }
        });
    }

    /** Commandes de téléchargement du cœur : { command, args }. */
    @PluginMethod
    public void coreCall(PluginCall call) {
        String command = call.getString("command", "");
        JSObject args = call.getObject("args", new JSObject());
        CORE_EXECUTOR.execute(() -> {
            try {
                call.resolve(new JSObject(NartyaCore.nativeCall(command, args.toString())));
            } catch (Throwable e) {
                call.resolve(failure(e));
            }
        });
    }

    /** Épisodes déjà terminés en playlist + segments (avant la fusion native) : rattrapés au démarrage. */
    private static void remuxPendingDownloads() {
        REMUX_EXECUTOR.execute(() -> {
            try {
                JSONArray items = new JSONObject(NartyaCore.nativeCall("downloads_list", "{}")).optJSONArray("items");
                if (items == null) return;
                for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.optJSONObject(i);
                    if (item != null) scheduleRemux(item);
                }
            } catch (Throwable ignored) {}
        });
    }

    private static void scheduleRemux(JSONObject item) {
        if (!"done".equals(item.optString("status"))
                || "scan".equals(item.optString("type"))
                || !"playlist.m3u8".equals(item.optString("file"))) return;
        String id = item.optString("id");
        if (id.isEmpty() || !remuxing.add(id)) return;
        REMUX_EXECUTOR.execute(() -> {
            try {
                String args = new JSONObject().put("id", id).toString();
                JSONObject target = new JSONObject(NartyaCore.nativeCall("downloads_remux_target", args));
                if (!target.optBoolean("success", false)) return;
                if (HlsRemuxer.remux(new java.io.File(target.getString("dir")))) {
                    NartyaCore.nativeCall("downloads_remux_done", args);
                }
            } catch (Throwable ignored) {
                // Best-effort : l'épisode reste lisible en playlist + segments.
            } finally {
                remuxing.remove(id);
            }
        });
    }

    private static JSObject failure(Throwable e) {
        return new JSObject().put("success", false).put("error", String.valueOf(e.getMessage()));
    }

    /** Événements du cœur, sur un de ses fils : la page, la notification de premier plan, la fin. */
    private static void handleCoreEvent(String event, String payloadJson) {
        if ("party:state".equals(event) || "party:effect".equals(event)) {
            // Watch party : relayée telle quelle, la page lit le JSON.
            NartyaProxyPlugin plugin = activePlugin;
            if (plugin != null) {
                plugin.notifyListeners("party:state".equals(event) ? "partyState" : "partyEffect",
                        new JSObject().put("json", payloadJson));
            }
            return;
        }
        if (!"downloads:progress".equals(event)) return;
        try {
            JSONObject item = new JSONObject(payloadJson);
            String id = item.optString("id");
            String status = item.optString("status");
            boolean wasActive = false;
            if ("downloading".equals(status) || "queued".equals(status)) {
                activeDownloads.add(id);
            } else {
                wasActive = activeDownloads.remove(id);
            }
            NartyaProxyPlugin plugin = activePlugin;
            if (plugin != null) plugin.notifyListeners("downloadProgress", JSObject.fromJSONObject(item));
            Context context = appContext;
            if (context == null) return;
            // Android 12+ : démarrer un service de premier plan depuis l'arrière-plan peut être refusé.
            try {
                DownloadForegroundService.update(context, item, activeDownloads.size());
            } catch (Exception ignored) {}
            if (wasActive && "done".equals(status)) DownloadForegroundService.notifyFinished(context, item);
            scheduleRemux(item);
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void requestDownloadPermission(PluginCall call) {
        if (hasDownloadNotificationPermission()) {
            call.resolve(new JSObject().put("granted", true));
            return;
        }

        // R8 peut supprimer l'annotation du plugin en release : la notification étant facultative, on
        // continue sans dialogue système.
        if (getPluginHandle() == null || getPluginHandle().getPluginAnnotation() == null) {
            call.resolve(new JSObject().put("granted", false));
            return;
        }

        requestPermissionForAlias("notifications", call, "notificationPermissionResult");
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        call.resolve(new JSObject().put("granted", hasDownloadNotificationPermission()));
    }

    private boolean hasDownloadNotificationPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                ContextCompat.checkSelfPermission(
                        getContext(),
                        Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }
}
