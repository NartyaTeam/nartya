package com.nartya.app.proxy;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import android.Manifest;

import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.junit.Test;

public class NartyaProxyPluginTest {

    @Test
    public void downloadNotificationPermissionMetadataIsDeclared() {
        CapacitorPlugin plugin = NartyaProxyPlugin.class.getAnnotation(CapacitorPlugin.class);
        assertNotNull(plugin);
        assertEquals("NartyaProxy", plugin.name());

        Permission[] permissions = plugin.permissions();
        assertEquals(1, permissions.length);
        assertEquals("notifications", permissions[0].alias());
        assertEquals(Manifest.permission.POST_NOTIFICATIONS, permissions[0].strings()[0]);
    }
}
