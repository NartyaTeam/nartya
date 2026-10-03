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

import org.json.JSONObject;

import java.io.File;

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
