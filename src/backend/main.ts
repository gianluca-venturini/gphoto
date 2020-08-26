import { PORT } from './env';
import { ensureAuthorize } from './auth';
import { initCore } from './core';
import { ensureDbConnect } from './db';
import { listMediaItems, touchGPhotoAlbums } from './google';

async function start() {
    const core = initCore();
    core.app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
    await ensureDbConnect(core);
    await ensureAuthorize(core);
    await listMediaItems(core);
    await touchGPhotoAlbums(core);
}

start();
