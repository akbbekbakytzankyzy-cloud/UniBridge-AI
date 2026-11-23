import { pool } from "./db.js";
import { createApp } from "./app.js";
import { syncAll } from "./onedrive.js";
const app = await createApp(pool, {
  origin: process.env.APP_ORIGIN,
  production: process.env.NODE_ENV === "production",
  allowRegistration: process.env.UB_ALLOW_REGISTRATION === "1",
});
// Automatic OneDrive sync for connected teachers (needs MS_CLIENT_ID and UB_SECRET_KEY).
const syncMinutes = Number(process.env.UB_ONEDRIVE_SYNC_MINUTES || 15);
if (app.locals.onedrive.clientId && app.locals.onedrive.secretKey && syncMinutes > 0)
  setInterval(() => syncAll(pool, app.locals.onedrive).catch(() => {}), syncMinutes * 60000).unref();
const server = app.listen(Number(process.env.PORT || 3001), "127.0.0.1", () =>
  console.log(
    "UniBridgeAI API listening on http://127.0.0.1:" +
      (process.env.PORT || 3001),
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    // Close long-lived SSE connections so systemd restarts do not stall.
    server.closeAllConnections?.();
  });
