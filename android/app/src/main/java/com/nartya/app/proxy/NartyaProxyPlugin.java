package com.nartya.app.proxy;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.nartya.app.core.NartyaCore;

import org.json.JSONObject;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Proxy de streaming local et téléchargements hors ligne. Progression poussée par l'événement
 * « downloadProgress ».
 */
@CapacitorPlugin(
    name = "NartyaProxy",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class NartyaProxyPlugin extends Plugin {

    private static ProxyServer server;
    private static Downloads downloads;
    private static JSObject currentConfigs = new JSObject();
    private static volatile NartyaProxyPlugin activePlugin;
    private static volatile Context appContext;
    // Les appels au cœur Rust bloquent le temps de l'opération : fil à part, hors du fil des plugins.
    private static final ExecutorService CORE_EXECUTOR = Executors.newCachedThreadPool();
    private static final Object CORE_LOCK = new Object();
    private static JSObject coreInfo;
    // Téléchargements en cours côté cœur, d'après ses événements (pour le service de premier plan).
    private static final java.util.Set<String> legacyActive = java.util.concurrent.ConcurrentHashMap.newKeySet();
    private static final java.util.Set<String> coreActive = java.util.concurrent.ConcurrentHashMap.newKeySet();

    @Override
    public void load() {
        activePlugin = this;
        appContext = getContext().getApplicationContext();
    }

    @PluginMethod
    public synchronized void start(PluginCall call) {
        try {
            JSObject configs = call.getObject("configs", currentConfigs);
            currentConfigs = configs;
            if (server == null) {
                server = new ProxyServer(0, configs);
                server.start(); // thread démon, timeout par défaut
            } else {
                server.updateConfigs(configs);
            }
            ensureDownloads();
            downloads.setProxy(server.getListeningPort(), server.getToken());
            JSObject ret = new JSObject();
            ret.put("port", server.getListeningPort());
            ret.put("token", server.getToken());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Échec démarrage proxy: " + e.getMessage(), e);
        }
    }

    /** Chargée après authentification. */
    @PluginMethod
    public synchronized void configure(PluginCall call) {
        currentConfigs = call.getObject("configs", new JSObject());
        if (server != null) server.updateConfigs(currentConfigs);
        call.resolve(new JSObject().put("success", true));
    }

    // Cœur Rust (libnartya_android.so) : lecture seulement pour l'instant. Si la bibliothèque est
    // absente de l'APK, la page reçoit success=false et reste sur le proxy Java.

    @PluginMethod
    public void coreStart(PluginCall call) {
        Context context = getContext().getApplicationContext();
        CORE_EXECUTOR.execute(() -> {
            try {
                synchronized (CORE_LOCK) {
                    if (coreInfo == null) {
                        JSObject started = new JSObject(NartyaCore.nativeStart(context.getFilesDir().getAbsolutePath(), NartyaProxyPlugin::handleCoreEvent));
                        if (!started.optBoolean("success", false)) {
                            call.resolve(started);
                            return;
                        }
                        coreInfo = started;
                    }
                }
                call.resolve(coreInfo);
            } catch (Throwable e) {
                // UnsatisfiedLinkError compris : pas de bibliothèque pour cette ABI.
                call.resolve(new JSObject().put("success", false).put("error", String.valueOf(e.getMessage())));
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
                call.resolve(new JSObject().put("success", false).put("error", String.valueOf(e.getMessage())));
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
                call.resolve(new JSObject().put("success", false).put("error", String.valueOf(e.getMessage())));
            }
        });
    }

    /** Événements du cœur, sur un de ses fils : la page et la notification de premier plan. */
    private static void handleCoreEvent(String event, String payloadJson) {
        if (!"downloads:progress".equals(event)) return;
        try {
            JSONObject item = new JSONObject(payloadJson);
            String id = item.optString("id");
            String status = item.optString("status");
            boolean wasActive;
            if ("downloading".equals(status) || "queued".equals(status)) {
                coreActive.add(id);
                wasActive = false;
            } else {
                wasActive = coreActive.remove(id);
            }
            NartyaProxyPlugin plugin = activePlugin;
            if (plugin != null) plugin.notifyListeners("downloadProgress", JSObject.fromJSONObject(item));
            Context context = appContext;
            if (context != null) {
                try {
                    DownloadForegroundService.update(context, item, coreActive.size());
                } catch (Exception ignored) {}
                if (wasActive && "done".equals(status)) DownloadForegroundService.notifyFinished(context, item);
            }
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public synchronized void stop(PluginCall call) {
        if (downloads != null && downloads.activeCount() > 0) {
            call.resolve(new JSObject().put("success", false).put(
                    "error", "Le proxy reste actif pendant les téléchargements"));
            return;
        }
        if (server != null) {
            server.stop();
            server = null;
        }
        call.resolve(new JSObject().put("success", true));
    }

    // Téléchargements hors ligne

    private synchronized void ensureDownloads() {
        if (downloads != null) return;
        Context context = appContext != null ? appContext : getContext().getApplicationContext();
        appContext = context;
        File root = new File(context.getFilesDir(), "downloads");
        ProxyServer.setDownloadsRoot(root);
        downloads = new Downloads(root, NartyaProxyPlugin::handleDownloadProgress);
    }

    private static synchronized void handleDownloadProgress(JSONObject item) {
        try {
            NartyaProxyPlugin plugin = activePlugin;
            if (plugin != null) {
                plugin.notifyListeners("downloadProgress", JSObject.fromJSONObject(item));
            }
            int activeCount = downloads != null ? downloads.activeCount() : 0;
            if (appContext != null) {
                DownloadForegroundService.update(appContext, item, activeCount);
                String id = item.optString("id");
                String status = item.optString("status");
                if ("downloading".equals(status) || "queued".equals(status)) legacyActive.add(id);
                else if (legacyActive.remove(id) && "done".equals(status)) {
                    DownloadForegroundService.notifyFinished(appContext, item);
                }
            }
            if (activeCount == 0 && plugin == null && server != null) {
                server.stop();
                server = null;
            }
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void downloadStart(PluginCall call) {
        ensureDownloads();
        boolean started = downloads.start(call.getData());
        if (!started) {
            call.resolve(new JSObject().put("success", false).put("error", "Téléchargement invalide ou déjà actif"));
            return;
        }
        call.resolve(new JSObject().put("success", true));
    }

    @PluginMethod
    public void downloadCancel(PluginCall call) {
        ensureDownloads();
        downloads.cancel(call.getString("id"));
        // Android 12+ : démarrer un foreground service depuis l'arrière-plan peut lever
        // ForegroundServiceStartNotAllowedException.
        try {
            DownloadForegroundService.update(appContext, null, downloads.activeCount());
        } catch (Exception ignored) {}
        call.resolve(new JSObject().put("success", true));
    }

    @PluginMethod
    public void downloadRemove(PluginCall call) {
        ensureDownloads();
        downloads.remove(call.getString("id"));
        try {
            DownloadForegroundService.update(appContext, null, downloads.activeCount());
        } catch (Exception ignored) {}
        call.resolve(new JSObject().put("success", true));
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
        call.resolve(new JSObject().put(
                "granted",
                hasDownloadNotificationPermission()));
    }

    private boolean hasDownloadNotificationPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                ContextCompat.checkSelfPermission(
                        getContext(),
                        Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void downloadList(PluginCall call) {
        ensureDownloads();
        JSArray arr = new JSArray();
        for (JSONObject it : downloads.list()) arr.put(it);
        JSObject ret = new JSObject();
        ret.put("items", arr);
        call.resolve(ret);
    }

    @Override
    protected synchronized void handleOnDestroy() {
        if (activePlugin == this) activePlugin = null;
        if (server != null && (downloads == null || downloads.activeCount() == 0)) {
            server.stop();
            server = null;
        }
    }
}
