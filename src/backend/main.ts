import { ensureAuthorize } from './auth';
import { initCore } from './core';
import { ensureDbConnect } from './db';
import { touchGPhotoAlbums, touchGPhotoMediaItems, ensureGPhotoAlbumsCreated, ensureGPhotoMediaItemsCreated } from './google';
import { touchLocalMediaItems } from './local';

async function start() {
    const core = initCore();
    await ensureDbConnect(core);
    await ensureAuthorize(core);
    await touchGPhotoAlbums(core);
    await touchGPhotoMediaItems(core);
    await touchLocalMediaItems(core);
    await ensureGPhotoAlbumsCreated(core);
    // TODO(gianluca): load multiple batches
    await ensureGPhotoMediaItemsCreated(core);
}

start();
