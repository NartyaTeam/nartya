package com.nartya.app.core;

/**
 * Pont vers le cœur Rust (libnartya_android.so). Les appels bloquent le temps de l'opération :
 * à faire depuis un fil de travail, jamais depuis le fil principal.
 */
public final class NartyaCore {
    static {
        System.loadLibrary("nartya_android");
    }

    private NartyaCore() {}

    /** Reçoit les événements du cœur (« downloads:progress »), depuis un fil du cœur. */
    public interface Listener {
        void onEvent(String event, String payloadJson);
    }

    /** Démarre le cœur (une seule fois). JSON : {"success":true,"port":N,"token":"…"}. */
    public static native String nativeStart(String dataDir, Listener listener);

    /** Résout un flux : requête JSON {"token","forceRefresh","mode"} ; jeton d'accès de session ou "". */
    public static native String nativeResolve(String requestJson, String accessToken);

    /** Commandes de téléchargement (« downloads_list », « downloads_start », …), arguments en JSON. */
    public static native String nativeCall(String command, String argsJson);
}
