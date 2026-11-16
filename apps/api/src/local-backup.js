import { mkdir, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// Use PGlite's consistent snapshot API, never copy an actively written directory.
export async function backupLocalDatabase(db, directory) {
  await mkdir(directory, { recursive: true });
  const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.tar.gz`;
  const temporary = new URL(`${name}.partial`, directory);
  const destination = new URL(name, directory);
  const snapshot = await db.dumpDataDir("gzip");
  await writeFile(temporary, Buffer.from(await snapshot.arrayBuffer()), {
    flag: "wx",
    mode: 0o600,
    flush: true,
  });
  await rename(temporary, destination);
  return destination;
}
