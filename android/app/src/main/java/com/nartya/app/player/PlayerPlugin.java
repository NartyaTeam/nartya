package com.nartya.app.player;

import android.content.Context;
import android.media.AudioManager;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Luminosité, volume multimédia et touches volume (capturées dans MainActivity.dispatchKeyEvent,
 * relayées au JS par l'événement `volume`).
 */
@CapacitorPlugin(name = "NartyaPlayer")
public class PlayerPlugin extends Plugin {

    private static PlayerPlugin instance;
    private static boolean captureVolume = false;

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
