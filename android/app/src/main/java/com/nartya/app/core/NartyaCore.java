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

    /** Démarre le cœur (une seule fois). JSON : {"success":true,"port":N,"token":"…"}. */
    public static native String nativeStart(String dataDir);

    /** Résout un flux : requête JSON {"token","forceRefresh","mode"} ; jeton d'accès de session ou "". */
    public static native String nativeResolve(String requestJson, String accessToken);
}
