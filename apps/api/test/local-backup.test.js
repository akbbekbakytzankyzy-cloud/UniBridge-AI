import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { backupLocalDatabase } from '../src/local-backup.js';

test('local snapshot restores committed records independently of later writes', async () => {
 const directory=await mkdtemp(join(tmpdir(),'unibridge-backup-'));
 const source=new PGlite();
 let restored;
 try {
  await source.exec("CREATE TABLE records(id int PRIMARY KEY, content text); INSERT INTO records VALUES (1,'Сохранённая запись');");
  const snapshot=await backupLocalDatabase(source,pathToFileURL(directory+'/'));
  await source.exec("UPDATE records SET content='Later change'");
  restored=new PGlite({loadDataDir:new Blob([await readFile(snapshot)])});
  assert.deepEqual((await restored.query('SELECT * FROM records')).rows,[{id:1,content:'Сохранённая запись'}]);
  assert.equal((await readdir(directory)).length,1);
  assert.ok(snapshot.pathname.endsWith('.tar.gz'));
 } finally {
  if(restored) await restored.close();
  await source.close();
  // Only the unique test-owned directory created above is removed.
  await rm(directory,{recursive:true,force:true});
 }
});
