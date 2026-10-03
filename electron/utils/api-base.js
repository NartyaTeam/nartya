import { app } from "electron";
import { API_URL } from "../../src/config/instance.js";

// Fixée côté main : le jeton de session accompagne ces appels, le renderer ne choisit pas leur
// destination.
export const IS_DEV = process.env.NODE_ENV === "development" || !app.isPackaged;
export const API_BASE_URL = IS_DEV ? process.env.NARTYA_DEV_API || "http://localhost:3000" : API_URL;
