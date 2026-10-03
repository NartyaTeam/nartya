package com.nartya.app.proxy;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import com.nartya.app.MainActivity;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Sans AndroidX/JUnit, ré-signable avec le certificat release : couvre dans le vrai processus
 * minifié les régressions R8 invisibles en debug.
 */
public final class NartyaProxyProbeInstrumentation extends Instrumentation {
    private String downloadUrl;

    @Override
    public void onCreate(Bundle arguments) {
        downloadUrl = arguments != null ? arguments.getString("downloadUrl") : null;
        super.onCreate(arguments);
        start();
    }

    @Override
    public void onStart() {
        Bundle result = new Bundle();
        try {
            Intent intent = new Intent(getTargetContext(), MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            Activity activity = startActivitySync(intent);
            if (!(activity instanceof MainActivity)) {
                throw new AssertionError("MainActivity non démarrée");
            }

            // Pas MainActivity#getBridge : R8 peut renommer cette API en release.
            WebView webView = findWebView(activity.getWindow().getDecorView());
            if (webView == null) throw new AssertionError("WebView Capacitor absent");

            String capacitorReady = null;
            for (int attempt = 0; attempt < 20; attempt++) {
                capacitorReady = evaluate(webView,
                        "String(Boolean(window.Capacitor&&window.Capacitor.Plugins&&" +
                        "window.Capacitor.Plugins.NartyaProxy))");
                if (capacitorReady != null && capacitorReady.contains("true")) break;
                Thread.sleep(250);
            }
            if (capacitorReady == null || !capacitorReady.contains("true")) {
                throw new AssertionError("Bridge NartyaProxy indisponible: " + capacitorReady);
            }

            evaluate(webView,
                    "window.__nartyaDownloadPermissionProbe='pending';" +
                    "window.Capacitor.Plugins.NartyaProxy.requestDownloadPermission()" +
                    ".then(r=>window.__nartyaDownloadPermissionProbe=JSON.stringify(r))" +
                    ".catch(e=>window.__nartyaDownloadPermissionProbe='error:'+String(e));");

            String response = null;
            for (int attempt = 0; attempt < 20; attempt++) {
                Thread.sleep(250);
                response = evaluate(webView,
                        "window.__nartyaDownloadPermissionProbe || 'missing'");
                if (response != null && response.contains("granted")) break;
            }
            if (response == null || !response.contains("granted")) {
                throw new AssertionError("Réponse du bridge inattendue: " + response);
            }

            if (downloadUrl != null && !downloadUrl.isEmpty()) {
                probeDownload(webView, downloadUrl);
            }

            result.putString("probe", downloadUrl == null
                    ? "NartyaProxy permission bridge OK"
                    : "NartyaProxy permission + download OK");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("probeError", error.toString());
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    private String evaluate(WebView webView, String javascript) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        runOnMainSync(() -> webView.evaluateJavascript(javascript, value -> {
            result.set(value);
            latch.countDown();
        }));
        if (!latch.await(5, TimeUnit.SECONDS)) {
            throw new AssertionError("Le WebView n'a pas répondu");
        }
        return result.get();
    }

    private void probeDownload(WebView webView, String url) throws Exception {
        String id = "nartya-release-probe";
        String safeUrl = url.replace("\\", "\\\\").replace("'", "\\'");
        evaluate(webView,
                "window.__nartyaDownloadProbe='pending';" +
                "(async()=>{try{" +
                "const p=window.Capacitor.Plugins.NartyaProxy;" +
                "await p.start({configs:{}});" +
                "await p.downloadRemove({id:'" + id + "'});" +
                "const r=await p.downloadStart({id:'" + id + "',directUrl:'" + safeUrl +
                "',animeTitle:'Release probe',epTitle:'Probe'});" +
                "window.__nartyaDownloadProbe=JSON.stringify(r);" +
                "window.__nartyaDownloadItem='pending';" +
                "window.__nartyaDownloadPoll=setInterval(async()=>{" +
                "const l=await p.downloadList();" +
                "const i=(l.items||[]).find(v=>v.id==='" + id + "')||null;" +
                "window.__nartyaDownloadItem=JSON.stringify(i);" +
                "if(i&&(i.status==='done'||i.status==='error'))" +
                "clearInterval(window.__nartyaDownloadPoll);},100);" +
                "}catch(e){window.__nartyaDownloadProbe='error:'+String(e)}})();");

        String item = null;
        for (int attempt = 0; attempt < 60; attempt++) {
            Thread.sleep(250);
            item = evaluate(webView, "window.__nartyaDownloadItem||'missing'");
            if (item != null && (item.contains("\\\"done\\\"") ||
                    item.contains("\\\"error\\\""))) break;
        }

        evaluate(webView,
                "(async()=>{const p=window.Capacitor.Plugins.NartyaProxy;" +
                "await p.downloadRemove({id:'" + id + "'});await p.stop()})()");
        if (item == null || !item.contains("\\\"done\\\"")) {
            throw new AssertionError("Téléchargement natif incomplet: " + item);
        }
    }

    private WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (!(view instanceof ViewGroup)) return null;
        ViewGroup group = (ViewGroup) view;
        for (int index = 0; index < group.getChildCount(); index++) {
            WebView webView = findWebView(group.getChildAt(index));
            if (webView != null) return webView;
        }
        return null;
    }
}
