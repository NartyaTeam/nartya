package com.nartya.app.player;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.Context;
import android.media.AudioManager;
import android.os.Build;
import android.util.Rational;
import android.view.WindowManager;

import androidx.annotation.RequiresApi;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Luminosité, volume multimédia et touches volume (capturées dans MainActivity.dispatchKeyEvent,
 * relayées au JS par l'événement `volume`). PiP natif : la WebView Android n'a pas le PiP HTML.
 */
@CapacitorPlugin(name = "NartyaPlayer")
public class PlayerPlugin extends Plugin {

    private static PlayerPlugin instance;
    private static boolean captureVolume = false;
    /** Vidéo en lecture : quitter l'app passe en PiP. */
    private static volatile boolean autoPip = false;
    private static volatile Rational pipRatio = new Rational(16, 9);

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    /** 0..1, ou -1 pour rendre la main au système. */
    @PluginMethod
    public void setBrightness(PluginCall call) {
        final float v = call.getFloat("value", -1f);
        getActivity().runOnUiThread(() -> {
            WindowManager.LayoutParams lp = getActivity().getWindow().getAttributes();
            lp.screenBrightness = (v < 0)
                ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                : Math.max(0.01f, Math.min(1f, v));
            getActivity().getWindow().setAttributes(lp);
        });
        call.resolve();
    }

    /** HUD de l'app à la place de l'UI système. */
    @PluginMethod
    public void setVolumeCapture(PluginCall call) {
        captureVolume = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        call.resolve();
    }

    /** Partagé avec les touches physiques. */
    @PluginMethod
    public void getVolume(PluginCall call) {
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        int current = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
        JSObject data = new JSObject();
        data.put("value", current);
        data.put("max", max);
        call.resolve(data);
    }

    /** Ratio 0..1 ; synchronise le HUD WebView. */
    @PluginMethod
    public void setVolume(PluginCall call) {
        float ratio = call.getFloat("value", 0f);
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        int target = Math.round(Math.max(0f, Math.min(1f, ratio)) * max);
        audio.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0);
        emitVolume(target, max);
        call.resolve();
    }

    @PluginMethod
    public void setAutoPip(PluginCall call) {
        autoPip = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        int width = call.getInt("width", 16);
        int height = call.getInt("height", 9);
        if (width > 0 && height > 0) pipRatio = clampRatio(width, height);
        Activity activity = getActivity();
        // Android 12+ entre seul en PiP ; avant, MainActivity.onUserLeaveHint s'en charge.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            activity.runOnUiThread(() -> {
                try {
                    activity.setPictureInPictureParams(pipParams());
                } catch (IllegalStateException ignored) {
                    // PiP désactivé pour l'app dans les réglages.
                }
            });
        }
        call.resolve();
    }

    @PluginMethod
    public void enterPip(PluginCall call) {
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            JSObject data = new JSObject();
            data.put("entered", enterPip(activity));
            call.resolve(data);
        });
    }

    public static boolean enterPip(Activity activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        try {
            return activity.enterPictureInPictureMode(pipParams());
        } catch (IllegalStateException e) {
            return false;
        }
    }

    public static boolean isAutoPip() {
        return autoPip;
    }

    @RequiresApi(Build.VERSION_CODES.O)
    public static PictureInPictureParams pipParams() {
        PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder()
            .setAspectRatio(pipRatio);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(autoPip).setSeamlessResizeEnabled(true);
        }
        return builder.build();
    }

    /** Android refuse un ratio hors de [1/2.39, 2.39]. */
    static Rational clampRatio(int width, int height) {
        double ratio = (double) width / height;
        if (ratio > 2.39) return new Rational(239, 100);
        if (ratio < 1 / 2.39) return new Rational(100, 239);
        return new Rational(width, height);
    }

    /** `dismissed` : fenêtre fermée, pas agrandie. */
    public static void emitPip(boolean active, boolean dismissed) {
        if (instance == null) return;
        JSObject data = new JSObject();
        data.put("active", active);
        data.put("dismissed", dismissed);
        instance.notifyListeners("pip", data);
    }

    public static boolean isCapturingVolume() {
        return captureVolume;
    }

    /** Appelé par MainActivity à chaque appui pendant la capture. */
    public static void emitVolume(int current, int max) {
        if (instance == null) return;
        JSObject data = new JSObject();
        data.put("value", current);
        data.put("max", max);
        instance.notifyListeners("volume", data);
    }
}
