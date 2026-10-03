package com.nartya.app.screen;

import android.content.pm.ActivityInfo;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.nartya.app.MainActivity;

/** `screen.orientation.lock()` ne fonctionne pas dans la WebView Android. */
@CapacitorPlugin(name = "NartyaScreen")
public class ScreenPlugin extends Plugin {

    @PluginMethod
    public void setOrientation(PluginCall call) {
        String orientation = call.getString("orientation", "auto");
        final int mode;
        switch (orientation) {
            case "landscape":
                // Les deux sens paysage.
                mode = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
                break;
            case "portrait":
                mode = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
                break;
            default:
                // Rend la main au système.
                mode = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
                break;
        }
        // Garde le masquage des barres de MainActivity synchrone avec l'orientation.
        MainActivity.immersiveRequested = "landscape".equals(orientation);
        getActivity().runOnUiThread(() -> getActivity().setRequestedOrientation(mode));
        call.resolve();
    }
}
