import { Core } from "./core";
import { AlbumsResponse, MediaItemsResponse, AlbumResponse, MediaItemsCreateBatchResponse, Album, MediaItem } from "./googleJson";
import { readFileContent } from "./local";
import { GaxiosOptions, GaxiosPromise } from 'gaxios';
import { FIX_DUPLICATE_DESCRIPTION } from "./env";

export function ensureGoogleApiRequest(core: Core) {
    async function waitOnExponentialBackoff() {
        if (!core.rateLimitBackoffMs) {
            core.rateLimitBackoffMs = 30_000;
        } else {
            core.rateLimitBackoffMs = Math.min(core.rateLimitBackoffMs * 1.3, 60 * 60_000);
        }
        console.log(`Waiting ${core.rateLimitBackoffMs}ms`);
        await new Promise((resolve) => setTimeout(() => resolve(), core.rateLimitBackoffMs));
    }

    async function apiRequest<T>(opts: GaxiosOptions): GaxiosPromise<T> {
        let numRateLimitRetry = 0;
        while (numRateLimitRetry <= 20) {
            try {
                const response = await core.oAuth2Client.request<T>({ ...opts, retry: true });
                if (response.status === 200) {
                    core.rateLimitBackoffMs = null;
                    return response
                } else {
                    throw new Error(`Unknown Google API response status ${response.status}. Is this an unhandled edge case?`);
                }
            } catch (error) {
                console.log(error);
                if (error.code === 429) {
                    console.log('Rate limit exceeded');
                    waitOnExponentialBackoff();
                    numRateLimitRetry += 1;
                } else if (error.code === 400) {
                    core.rateLimitBackoffMs = null;
                    return error.response;
                } else {
                    throw error;
                }
            }

        }
        throw new Error(`Rate limit exceeded too many times ${numRateLimitRetry}`);
    }

    core.apiRequest = apiRequest;
}

export async function touchGPhotoAlbums(core: Core) {
    console.log('touch Google Photo albums');

    let finished = false;
    let nextPageToken: string = undefined;

    while (!finished) {
        console.log('Fetch albums page');
        const response = await core.apiRequest<AlbumsResponse>({
            url: 'https://photoslibrary.googleapis.com/v1/albums',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            params: {
                pageSize: 50,
                pageToken: nextPageToken
            },
            retry: true,
        });

        const statement = core.db.prepare("INSERT OR REPLACE INTO RemoteAlbums(id, title, productUrl, coverPhotoBaseUrl, coverPhotoMediaItemId, isWriteable, mediaItemsCount, lastTouchDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        for (const album of response.data.albums ?? []) {
            await new Promise((resolve, reject) => statement.run([
                album.id,
                album.title,
                album.productUrl,
                album.coverPhotoBaseUrl,
                album.coverPhotoMediaItemId,
                album.isWriteable,
                album.mediaItemsCount,
                new Date().toISOString()
            ], err => { if (err) { return reject(err); } resolve(); }));
        }
        await new Promise((resolve, reject) => statement.finalize(err => { if (err) { return reject(err); } resolve(); }));

        if (!response.data.nextPageToken) {
            finished = true;
        }
        nextPageToken = response.data.nextPageToken;
    }

    console.log('Finished fetching album pages');
}

export async function ensureDeletedAlbums(core: Core) {
    let finished = false;
    let exceptions = 0;
    // TODO: choose a reasonable date in the past
    const checkBeforeDate = new Date(); // every albums touched before this date will be checked for deletion
    while (!finished) {
        try {
            const { numErrors, numSuccess } = await ensureDeletedAlbumsBatch(checkBeforeDate, core);
            if (numSuccess + numErrors === 0) {
                finished = true;
            }
        } catch (error) {
            console.error('Unknown error in ensureDeletedAlbums', error);
            exceptions += 1;
        }
        if (exceptions > 10) {
            // Too many exceptions occurred, terminating routine
            return;
        }
    }
}

export async function ensureDeletedAlbumsBatch(checkBeforeDate: Date, core: Core): Promise<{ numErrors: number, numSuccess: number }> {
    console.log('ensure albums are not deleted batch');
    let numErrors = 0;
    let numSuccess = 0;

    const toTest: { albumId: string }[] = [];
    await new Promise((resolve, reject) => {
        core.db.each(
            `
            SELECT 
                RemoteAlbums.id AS albumId
            FROM RemoteAlbums
            WHERE lastTouchDate < ?
            ORDER BY albumId
            LIMIT 10
            `,
            [checkBeforeDate.toISOString()],
            (err, row) => {
                toTest.push(row);
            },
            err => {
                if (err) {
                    return reject(err);
                }
                resolve();
            }
        );
    });
    console.log(`need to check ${toTest.length} albums for deletion`);

    for (const album of toTest) {
        const response = await core.apiRequest<Album>({
            url: `https://photoslibrary.googleapis.com/v1/albums/${album.albumId}`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            retry: true,
        });

        if (response.status === 400) {
            console.log(`Found remote deleted album, updating the DB`);
            // The album is deleted on Google side
            await new Promise((resolve, reject) => {
                core.db.run('DELETE FROM RemoteAlbums WHERE id = ?', [album.albumId], err => {
                    if (err) {
                        numErrors += 1;
                    } else {
                        numSuccess += 1;
                    }
                    resolve();
                });
            });
            console.log(`Found deleted album: ${album.albumId}`);
        } else if (response.statusText === 'OK' && response.data.id === album.albumId) {
            // The album is present on Google side
            const now = new Date(); // Updating the lastTouchDate to now prevents the album to be retried in a following batch
            await new Promise((resolve, reject) => {
                core.db.run('UPDATE RemoteAlbums SET lastTouchDate = ? WHERE id = ?', [now.toISOString(), album.albumId], err => {
                    if (err) {
                        numErrors += 1;
                    } else {
                        numSuccess += 1;
                    }
                    resolve();
                });
            });
        } else {
            console.error('Incorrect response from Google. Is this an unhandled edge case?', response);
            numErrors += 1;
        }
        await new Promise((resolve) => setTimeout(() => resolve(), 100)); // be nice with Google
    }
    console.log('end of ensure albums are not deleted batch');

    return { numErrors, numSuccess };
}

export async function touchGPhotoMediaItems(core: Core) {
    console.log('touch Google Photo media items');

    let finished = false;
    let nextPageToken: string = undefined;

    while (!finished) {
        console.log('Fetch media items page');
        const response = await core.apiRequest<MediaItemsResponse>({
            url: 'https://photoslibrary.googleapis.com/v1/mediaItems',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            params: {
                pageSize: 100,
                pageToken: nextPageToken
            },
            retry: true,
        });

        const statement = core.db.prepare("INSERT OR REPLACE INTO RemoteMediaItems(id, description, productUrl, baseUrl, mimeType, fileName) VALUES (?, ?, ?, ?, ?, ?)");
        for (const mediaItem of response.data.mediaItems ?? []) {
            await new Promise((resolve, reject) => statement.run([
                mediaItem.id,
                mediaItem.description,
                mediaItem.productUrl,
                mediaItem.baseUrl,
                mediaItem.mimeType,
                mediaItem.filename
            ], err => { if (err) { return reject(err); } resolve(); }));
        }
        await new Promise((resolve, reject) => statement.finalize(err => { if (err) { return reject(err); } resolve(); }));

        if (!response.data.nextPageToken) {
            finished = true;
        }
        nextPageToken = response.data.nextPageToken;
    }

    console.log('Finished fetching media items');
}

export async function ensureGPhotoAlbumsCreated(core: Core): Promise<void> {
    console.log('ensure G Photo Albums created');
    const albumNames: string[] = [];
    await new Promise((resolve, reject) => {
        core.db.each(
            `
            SELECT DISTINCT albumName
            FROM LocalMediaItems
            WHERE albumName NOT IN (
                SELECT title
                FROM RemoteAlbums
            )
            `,
            (err, row) => {
                albumNames.push(row.albumName);
            },
            err => {
                if (err) {
                    return reject(err);
                }
                resolve();
            }
        );
    });
    console.log(`need to create ${albumNames.length} albums`);

    for (const albumName of albumNames) {
        console.log(`Creating ${albumName} album`);
        const response = await core.apiRequest<AlbumResponse>({
            url: 'https://photoslibrary.googleapis.com/v1/albums',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            data: {
                album: {
                    title: albumName,
                }
            },
            retry: true,
        });
        await new Promise((resolve, reject) => core.db.run("INSERT OR REPLACE INTO RemoteAlbums(id, title, productUrl, coverPhotoBaseUrl, coverPhotoMediaItemId, isWriteable, mediaItemsCount) VALUES (?, ?, ?, ?, ?, ?, ?)", [
            response.data.id,
            response.data.title,
            response.data.productUrl,
            response.data.coverPhotoBaseUrl,
            response.data.coverPhotoMediaItemId,
            response.data.isWriteable,
            response.data.mediaItemsCount
        ], err => { if (err) { return reject(err); } resolve(); }));
        await new Promise((resolve) => setTimeout(() => resolve(), 500)); // be nice to google
    }
    console.log('all G Photo Albums created successfully');
}

export async function ensureGPhotoMediaItemsCreated(core: Core): Promise<void> {
    let finished = false;
    let exceptions = 0;
    while (!finished) {
        try {
            const { numErrors, numSuccess } = await ensureGPhotoMediaItemsCreatedBatch(core);
            if (numSuccess + numErrors === 0) {
                finished = true;
            }
        } catch (error) {
            console.error('Unknown error in ensureGPhotoMediaItemsCreated', error);
            exceptions += 1;
        }
        if (exceptions > 10) {
            console.error('Too many exceptions occurred, terminating routine');
            return;
        }
    }
}

async function ensureGPhotoMediaItemsCreatedBatch(core: Core): Promise<{ numSuccess: number, numErrors: number }> {
    console.log('ensure G Photo Media items batch created');
    let numSuccess = 0;
    let numErrors = 0;

    const toUpload: { path: string, fileName: string, albumId: string }[] = [];
    await new Promise((resolve, reject) => {
        core.db.each(
            `
            SELECT 
                path, 
                fileName,
                RemoteAlbums.id AS albumId
            FROM LocalMediaItems
                JOIN RemoteAlbums
                    ON LocalMediaItems.albumName = RemoteAlbums.title
            WHERE path NOT IN (
                SELECT DISTINCT description
                FROM RemoteMediaItems
                WHERE description IS NOT NULL
            )
                AND lastError IS NULL
            ORDER BY path
            LIMIT 10
            `,
            (err, row) => {
                toUpload.push(row);
            },
            err => {
                if (err) {
                    return reject(err);
                }
                resolve();
            }
        );
    });
    console.log(`need to create ${toUpload.length} media items`);

    const uploadedItems: { path: string; uploadToken: string; fileName: string; albumId: string; }[] = [];

    const successStatement = core.db.prepare("INSERT OR REPLACE INTO RemoteMediaItems(id, description, productUrl, baseUrl, mimeType, fileName) VALUES (?, ?, ?, ?, ?, ?)");
    const errorStatement = core.db.prepare("UPDATE LocalMediaItems SET lastError = ? WHERE path = ?");

    for (const { fileName, path, albumId } of toUpload) {
        const body = await readFileContent(path);
        try {
            const uploadResponse = await core.apiRequest<string>({
                url: 'https://photoslibrary.googleapis.com/v1/uploads',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-Goog-Upload-Content-Type': 'image/jpeg',
                    // 'X-Goog-Upload-File-Name': fileName,
                    'X-Goog-Upload-Protocol': 'raw'
                },
                body,
                retry: true,
            });
            const uploadToken = uploadResponse.data;
            uploadedItems.push({
                path,
                uploadToken,
                fileName,
                albumId
            });
            console.log(`Uploaded ${path}`);
        } catch (error) {
            if (error.code === '413') {
                console.log(`Photo ${path} too big to upload. Skipping`);
                await new Promise((resolve, reject) => errorStatement.run([error.response.statusText, path], err => { if (err) { return reject(err); } resolve(); }));
            } else {
                throw error;
            }
        }
    }
    console.log(`All items in the batch uploaded, creating media items now`);

    // Group items per album. Since are sorted by path in the DB query the number of albums should be minimized
    const albums = new Map<string, { path: string; uploadToken: string; fileName: string; }[]>();

    // Used to lookup the path having the uploadToken
    const uploadTokenToPath = new Map<string, string>();

    uploadedItems.forEach(({ path, uploadToken, fileName, albumId }) => {
        if (!albums.has(albumId)) {
            albums.set(albumId, []);
        }
        albums.get(albumId).push({ path, uploadToken, fileName });
        uploadTokenToPath.set(uploadToken, path);
    });

    for (let [albumId, items] of albums) {
        const response = await core.apiRequest<MediaItemsCreateBatchResponse>({
            url: 'https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            data: {
                albumId,
                newMediaItems: items.map(({ path, uploadToken, fileName }) => ({
                    description: path,
                    simpleMediaItem: {
                        fileName,
                        uploadToken
                    }
                }))
            },
            retry: true,
        });

        for (const itemResult of response.data.newMediaItemResults) {
            if (itemResult.status.message === 'Success' || itemResult.status.message === 'OK') {
                const path = uploadTokenToPath.get(itemResult.uploadToken);
                let mediaItem = itemResult.mediaItem;
                if (path !== itemResult.mediaItem.description) {
                    // This can happen when the image is a duplicate, Google is keeping the old metadata instead of updating them
                    if (FIX_DUPLICATE_DESCRIPTION) {
                        // Update the image path (in the description) remotely, disable this feature if you have duplicated pictures in multiple albums
                        const patchedMediaItem = await patchMediaItem(itemResult.mediaItem.id, { description: path }, core);
                        if (!patchedMediaItem) {
                            numErrors += 1;
                            continue;
                        }
                        mediaItem = patchedMediaItem;
                    } else {
                        // Remove the local item from the DB since we cannot insert it in multiple albums
                        console.log(`Duplicated file ${path} delete manually`);
                        await new Promise((resolve, reject) => core.db.run("DELETE FROM LocalMediaItems WHERE path = ?", [path], err => { if (err) { return reject(err); } resolve() }));
                    }
                }

                await new Promise((resolve, reject) => successStatement.run([
                    mediaItem.id,
                    mediaItem.description,
                    mediaItem.productUrl,
                    '', // TODO: add the baseUrl or remove it from the DB schema
                    mediaItem.mimeType,
                    mediaItem.filename
                ], err => { if (err) { return reject(err); } resolve(); }));
                numSuccess += 1;
            } else {
                numErrors += 1;
                await new Promise((resolve, reject) => errorStatement.run([
                    itemResult.status.message,
                    uploadTokenToPath.get(itemResult.uploadToken),
                ], err => { if (err) { return reject(err); } resolve(); }));
            }
        }

        await new Promise((resolve) => setTimeout(() => resolve(), 200)); // be nice to google
    }
    await new Promise((resolve, reject) => errorStatement.finalize(err => { if (err) { return reject(err); } resolve(); }));
    await new Promise((resolve, reject) => successStatement.finalize(err => { if (err) { return reject(err); } resolve(); }));
    console.log('All media items in batch created');

    return { numSuccess, numErrors };
}

async function patchMediaItem(mediaItemId: string, patch: Partial<MediaItem>, core: Core): Promise<MediaItem> {
    console.log(`Patch media item ${mediaItemId} with ${JSON.stringify(patch)}`);
    const response = await core.apiRequest<MediaItem>({
        url: `https://photoslibrary.googleapis.com/v1/mediaItems/${mediaItemId}`,
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        params: {
            updateMask: Object.keys(patch).join(',')
        },
        data: patch,
        retry: true,
    });

    await new Promise((resolve) => setTimeout(() => resolve(), 200)); // be nice to google
    return response.statusText === 'OK' ? response.data : null;
}
