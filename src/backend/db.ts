import { Core } from "./core";
import * as sqlite3 from 'sqlite3';
import { DB_PATH } from "./env";

export async function ensureDbConnect(core: Core): Promise<void> {
    return new Promise((resolve, reject) => {
        core.db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) return reject(err);
            ensureDbTables(core);
            resolve();
        });
    });
}

function ensureDbTables(core: Core) {
    core.db.run(`
        CREATE TABLE IF NOT EXISTS RemoteAlbums (
            id TEXT PRIMARY KEY,
            title TEXT,
            productUrl TEXT,
            coverPhotoBaseUrl TEXT,
            coverPhotoMediaItemId TEXT,
            isWriteable BOOLEAN,
            mediaItemsCount INTEGER
        )
    `);
    core.db.run(`
        CREATE TABLE IF NOT EXISTS RemoteMediaItems (
            id TEXT PRIMARY KEY,
            description TEXT,
            productUrl TEXT,
            baseUrl TEXT,
            mimeType TEXT,
            fileName TEXT
        )
    `);
    core.db.run(`
        CREATE TABLE IF NOT EXISTS LocalMediaItems (
            path TEXT PRIMARY KEY,
            fileName TEXT,
            albumName TEXT,
            lastError TEXT
        )
    `);
}