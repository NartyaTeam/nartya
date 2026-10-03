package com.nartya.app.share;

import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** `navigator.share` n'existe pas dans la WebView. */
@CapacitorPlugin(name = "NartyaShare")
public class SharePlugin extends Plugin {

    /** Le navigateur système sait prendre en charge le téléchargement d'une APK. */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String value = call.getString("url", "");
        Uri uri;
        try {
            uri = Uri.parse(value);
        } catch (Exception error) {
            call.reject("URL invalide");
            return;
        }

        String scheme = uri.getScheme();
        if (!("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) {
            call.reject("Seuls les liens web sont autorisés");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri));
                call.resolve();
            } catch (Exception error) {
                call.reject("Aucun navigateur disponible", error);
            }
        });
    }

    @PluginMethod
    public void share(PluginCall call) {
        String title = call.getString("title", "");
        String text = call.getString("text", "");
        String url = call.getString("url", "");

        String body = text == null ? "" : text;
        if (url != null && !url.isEmpty()) {
            body = body.isEmpty() ? url : body + "\n" + url;
        }
        final String shareBody = body;

        getActivity().runOnUiThread(() -> {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            send.putExtra(Intent.EXTRA_TEXT, shareBody);
            getActivity().startActivity(Intent.createChooser(send, title));
        });
        call.resolve();
    }
}
