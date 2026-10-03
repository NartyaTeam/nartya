// Les mises à jour passent par le Hub : seule la version installée est exposée.
export function registerUpdaterIpc(ipcMain, app) {
  ipcMain.handle("updater:get-version", () => app.getVersion());
}
