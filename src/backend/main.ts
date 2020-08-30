import { ensureAuthorize } from './auth';
import { initCore } from './core';
import { ensureDbConnect } from './db';
import { touchGPhotoAlbums, touchGPhotoMediaItems, ensureGPhotoAlbumsCreated, ensureGPhotoMediaItemsCreated, ensureDeletedAlbums, ensureGoogleApiRequest } from './google';
import { touchLocalMediaItems, cleanLocalMediaItems } from './local';

async function start() {
    const core = initCore();
    await ensureDbConnect(core);
    await ensureAuthorize(core);
    await ensureGoogleApiRequest(core);

    await touchGPhotoAlbums(core);
    await ensureDeletedAlbums(core);
    await touchGPhotoMediaItems(core);
    await cleanLocalMediaItems(core);
    await touchLocalMediaItems(core);
    await ensureGPhotoAlbumsCreated(core);
    await ensureGPhotoMediaItemsCreated(core);
    // TODO: ensure that all albums have the correct number of elements and repair the broken one
    // TODO: ensure that no duplicated images are contained in the catalog and repair
    // TODO: ensure that the database reflects deleted albums
    console.log('Exiting with success');
    process.exit(0);
}

start();
