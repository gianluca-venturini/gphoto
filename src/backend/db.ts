import { Core } from "./core";
import * as sqlite3 from 'sqlite3';
import { DB_PATH } from "./env";

export async function ensureDbConnect(core: Core): Promise<void> {
    return new Promise((resolve, reject) => {
        core.db = new sqlite3.Database(DB_PATH, async (err) => {
            if (err) return reject(err);
            try {
                await ensureDbTables(core);
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    });
}

async function ensureDbTables(core: Core) {
    await new Promise((resolve, reject) => core.db.run(`
        CREATE TABLE IF NOT EXISTS RemoteAlbums (
            id TEXT PRIMARY KEY,
            title TEXT,
            productUrl TEXT,
            coverPhotoBaseUrl TEXT,
            coverPhotoMediaItemId TEXT,
            isWriteable BOOLEAN,
            mediaItemsCount INTEGER,
            lastTouchDate TEXT -- last time we confirmed that is not deleted
        )
    `, err => { if (err) { return reject(err); } resolve(); }));
    await new Promise((resolve, reject) => core.db.run(`
        CREATE TABLE IF NOT EXISTS RemoteMediaItems (
            id TEXT PRIMARY KEY,
            description TEXT, -- contains the local path of the file
            productUrl TEXT,
            baseUrl TEXT,
            mimeType TEXT,
            fileName TEXT
        )
    `, err => { if (err) { return reject(err); } resolve(); }));
    await new Promise((resolve, reject) => core.db.run(`
        CREATE TABLE IF NOT EXISTS LocalMediaItems (
            path TEXT PRIMARY KEY,
            fileName TEXT,
            albumName TEXT,
            lastError TEXT
        )
    `, err => { if (err) { return reject(err); } resolve(); }));
}