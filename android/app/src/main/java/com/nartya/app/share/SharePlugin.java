package com.nartya.app.share;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.annotation.RequiresApi;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.FileOutputStream;
import java.io.OutputStream;

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

    /**
     * Le lien `download` d'une page ne fait rien dans la WebView : la carte de profil et les
     * visuels de la Galerie passent par ici. Rangés dans Images/Nartya ; avant Android 10,
     * écrire là exige une permission de stockage, on ouvre donc le partage à la place.
     */
    @PluginMethod
    public void saveImage(PluginCall call) {
        String data = call.getString("data");
        String url = call.getString("url");
        String mimeType = call.getString("mimeType", "image/png");
        String filename = call.getString("filename", "nartya.png").replaceAll("[\\\\/:*?\"<>|]", "_");

        byte[] bytes;
        try {
            if (url != null && !url.isEmpty()) {
                // Les visuels de la Galerie pèsent plusieurs Mo : les passer en base64 par le pont
                // de la WebView échoue. Le natif les télécharge lui-même.
                HttpURLConnection connection = openImage(url);
                String type = connection.getContentType();
                if (type != null && type.startsWith("image/")) mimeType = type.split(";")[0].trim();
                bytes = readLimited(connection);
            } else if (data != null && !data.isEmpty()) {
                bytes = Base64.decode(data, Base64.DEFAULT);
            } else {
                call.reject("Image vide");
                return;
            }
        } catch (Exception error) {
            call.reject("Image illisible", error);
            return;
        }

        try {
            JSObject result = new JSObject();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveToGallery(bytes, filename, mimeType);
                result.put("saved", true);
            } else {
                shareImage(bytes, filename, mimeType);
                result.put("saved", false);
            }
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Enregistrement impossible", error);
        }
    }

    private static final int MAX_IMAGE_BYTES = 40 * 1024 * 1024;

    private static HttpURLConnection openImage(String value) throws Exception {
        URL url = new URL(value);
        if (!"https".equals(url.getProtocol())) throw new IllegalArgumentException("https requis");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(30_000);
        if (connection.getResponseCode() != 200) {
            throw new IllegalStateException("HTTP " + connection.getResponseCode());
        }
        return connection;
    }

    private static byte[] readLimited(HttpURLConnection connection) throws Exception {
        try (InputStream in = connection.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                if (out.size() > MAX_IMAGE_BYTES) throw new IllegalStateException("Image trop lourde");
            }
            return out.toByteArray();
        } finally {
            connection.disconnect();
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private void saveToGallery(byte[] bytes, String filename, String mimeType) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
        values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Nartya");
        values.put(MediaStore.Images.Media.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IllegalStateException("MediaStore a refusé l'image");
        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new IllegalStateException("Flux d'écriture indisponible");
            out.write(bytes);
        } catch (Exception error) {
            resolver.delete(uri, null, null);
            throw error;
        }

        values.clear();
        values.put(MediaStore.Images.Media.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
    }

    private void shareImage(byte[] bytes, String filename, String mimeType) throws Exception {
        File dir = new File(getContext().getCacheDir(), "shared");
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Dossier de partage indisponible");
        File file = new File(dir, filename);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);

        getActivity().runOnUiThread(() -> {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mimeType);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(send, filename));
        });
    }
}
