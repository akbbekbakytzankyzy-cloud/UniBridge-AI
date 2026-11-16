import { pool } from "./db.js";
import { createApp } from "./app.js";
const app = await createApp(pool, {
  origin: process.env.APP_ORIGIN,
  production: process.env.NODE_ENV === "production",
  allowRegistration: process.env.UB_ALLOW_REGISTRATION === "1",
});
const server = app.listen(Number(process.env.PORT || 3001), "127.0.0.1", () =>
  console.log(
    "UniBridgeAI API listening on http://127.0.0.1:" +
      (process.env.PORT || 3001),
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      await pool.end();
      process.exit(0);
    }),
  );
