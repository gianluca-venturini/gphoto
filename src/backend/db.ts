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
            id TEXT,
            title TEXT,
            productUrl TEXT,
            coverPhotoBaseUrl TEXT,
            coverPhotoMediaItemId TEXT,
            isWriteable BOOLEAN,
            mediaItemsCount INTEGER
        )
    `);
}