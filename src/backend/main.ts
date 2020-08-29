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
    await ensureGPhotoMediaItemsCreated(core);
    // TODO: ensure that all albums have the correct number of elements and repair the broken one
    // TODO: ensure that no duplicated images are contained in the catalog and repair
    console.log('Exiting with success');
    process.exit(0);
}

start();
