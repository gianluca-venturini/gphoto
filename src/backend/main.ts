import { OAuth2Client } from 'google-auth-library';
import { PORT } from './env';
import { ensureAuthorize } from './auth';
import { initCore } from './core';

async function start() {
    const core = initCore();
    core.app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
    await ensureAuthorize(core);
    listMediaItems(core.oAuth2Client);
}

start();

/**
 * Print the display name if available for 10 connections.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listMediaItems(oAuth2Client: OAuth2Client) {
    console.log('list media items');
    const response = await oAuth2Client.request({
        url: 'https://photoslibrary.googleapis.com/v1/mediaItems',
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });
    console.log(JSON.stringify(response));
}
