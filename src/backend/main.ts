import { ensureAuthorize } from './auth';
import { initCore, Core } from './core';
import { ensureDbConnect } from './db';
import { touchGPhotoAlbums, touchGPhotoMediaItems, ensureGPhotoAlbumsCreated, ensureGPhotoMediaItemsCreated, ensureDeletedAlbums, ensureGoogleApiRequest } from './google';
import { touchLocalMediaItems } from './local';
import { RUN_EVERY_MINS } from './env';

async function start() {
    console.log('Initialize the core');
    const core = initCore();
    console.log('Core initialized');
    while (true) {
        const startTime = new Date();
        console.log('Starting loop');
        await loop(core);
        const elapsedTimeMs = new Date().getTime() - startTime.getTime();
        console.log(`Loop completed with success in ${elapsedTimeMs / 1000}s`);
        const waitMs = Math.max(0, RUN_EVERY_MINS * 60 * 1000 - elapsedTimeMs);
        console.log(`Waiting for ${Math.ceil(waitMs / 1000 / 60)}mins`);
        await new Promise((resolve) => setTimeout(() => resolve(), waitMs));
    }
}

async function loop(core: Core) {
    await ensureDbConnect(core);
    await ensureAuthorize(core);
    await ensureGoogleApiRequest(core);

    await touchGPhotoAlbums(core);
    await ensureDeletedAlbums(core);
    await touchGPhotoMediaItems(core);
    await touchLocalMediaItems(core);
    await ensureGPhotoAlbumsCreated(core);
    await ensureGPhotoMediaItemsCreated(core);
    // TODO: ensure that all albums have the correct number of elements and repair the broken one
    // TODO: ensure that no duplicated images are contained in the catalog and repair
    // TODO: ensure that the database reflects deleted albums
}

start();
