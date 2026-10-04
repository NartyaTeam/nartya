package com.nartya.app;

import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;

import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.lifecycle.Lifecycle;

import com.getcapacitor.BridgeActivity;
import com.nartya.app.player.PlayerPlugin;
import com.nartya.app.proxy.NartyaProxyPlugin;
import com.nartya.app.screen.ScreenPlugin;
import com.nartya.app.share.SharePlugin;
import com.nartya.app.update.NartyaUpdaterPlugin;

public class MainActivity extends BridgeActivity {
    // Posé par ScreenPlugin : sert à recacher les barres système après une rotation.
    public static volatile boolean immersiveRequested = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(NartyaProxyPlugin.class);
        registerPlugin(ScreenPlugin.class);
        registerPlugin(SharePlugin.class);
        registerPlugin(NartyaUpdaterPlugin.class);
        registerPlugin(PlayerPlugin.class);
        super.onCreate(savedInstanceState);

        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        WindowInsetsControllerCompat insets =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insets.setAppearanceLightStatusBars(false);
        insets.setAppearanceLightNavigationBars(false);
        // Une barre ramenée par un balayage se recache seule.
        insets.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
    }

    // La rotation peut réafficher les barres, et Capacitor ne réapplique que leur style.
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (immersiveRequested) {
            getWindow().getDecorView().post(this::hideSystemBars);
        }
    }

    // Les barres masquées peuvent revenir après un changement de focus.
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && immersiveRequested) {
            hideSystemBars();
        }
    }

    // Android 12+ entre seul en PiP (setAutoEnterEnabled) : le faire ici l'y ferait deux fois.
    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S && PlayerPlugin.isAutoPip()) {
            PlayerPlugin.enterPip(this);
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        // Fermée : l'activité est déjà arrêtée ; agrandie, elle reprend.
        boolean dismissed = !isInPictureInPictureMode
            && getLifecycle().getCurrentState() == Lifecycle.State.CREATED;
        PlayerPlugin.emitPip(isInPictureInPictureMode, dismissed);
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat insets =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insets.hide(WindowInsetsCompat.Type.systemBars());
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        boolean volumeKey =
            code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN;
        if (volumeKey && PlayerPlugin.isCapturingVolume()) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                AudioManager audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                int direction = code == KeyEvent.KEYCODE_VOLUME_UP
                    ? AudioManager.ADJUST_RAISE
                    : AudioManager.ADJUST_LOWER;
                audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, direction, 0);
                PlayerPlugin.emitVolume(
                    audio.getStreamVolume(AudioManager.STREAM_MUSIC),
                    audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                );
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
}
