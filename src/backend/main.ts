import { PORT } from './env';
import { ensureAuthorize } from './auth';
import { initCore } from './core';
import { ensureDbConnect } from './db';
import { touchGPhotoAlbums, touchGPhotoMediaItems } from './google';
import { touchLocalMediaItems } from './local';

async function start() {
    const core = initCore();
    await ensureDbConnect(core);
    await ensureAuthorize(core);
    await touchGPhotoAlbums(core);
    await touchGPhotoMediaItems(core);
    await touchLocalMediaItems(core);
}

start();
