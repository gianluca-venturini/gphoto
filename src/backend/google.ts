import { Core } from "./core";
import { AlbumsResponse, MediaItemsResponse, AlbumResponse, MediaItemsCreateBatchResponse, Album, MediaItem } from "./googleJson";
import { readFileContent } from "./local";

export async function touchGPhotoAlbums(core: Core) {
    console.log('touch Google Photo albums');

    let finished = false;
    let nextPageToken: string = undefined;

    while (!finished) {
        console.log('Fetch albums page');
        const response = await core.oAuth2Client.request<AlbumsResponse>({
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
        response.data.albums?.forEach(album => {
            statement.run(
                album.id,
                album.title,
                album.productUrl,
                album.coverPhotoBaseUrl,
                album.coverPhotoMediaItemId,
                album.isWriteable,
                album.mediaItemsCount,
                new Date().toISOString()
            );
        });
        statement.finalize();

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
        const response = await core.oAuth2Client.request<Album>({
            url: `https://photoslibrary.googleapis.com/v1/albums/${album.albumId}`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            retry: true,
        });

        if (response.statusText === 'OK' && !response.data) {
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
        const response = await core.oAuth2Client.request<MediaItemsResponse>({
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
        response.data.mediaItems?.forEach(mediaItem => {
            statement.run(
                mediaItem.id,
                mediaItem.description,
                mediaItem.productUrl,
                mediaItem.baseUrl,
                mediaItem.mimeType,
                mediaItem.filename
            );
        });
        statement.finalize();

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

    const statement = core.db.prepare("INSERT OR REPLACE INTO RemoteAlbums(id, title, productUrl, coverPhotoBaseUrl, coverPhotoMediaItemId, isWriteable, mediaItemsCount) VALUES (?, ?, ?, ?, ?, ?, ?)");

    for (const albumName of albumNames) {
        const response = await core.oAuth2Client.request<AlbumResponse>({
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

        statement.run(
            response.data.id,
            response.data.title,
            response.data.productUrl,
            response.data.coverPhotoBaseUrl,
            response.data.coverPhotoMediaItemId,
            response.data.isWriteable,
            response.data.mediaItemsCount
        );
    }
    statement.finalize();
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
            // Too many exceptions occurred, terminating routine
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

    for (const { fileName, path, albumId } of toUpload) {
        const body = await readFileContent(path);
        const uploadResponse = await core.oAuth2Client.request<string>({
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
        const response = await core.oAuth2Client.request<MediaItemsCreateBatchResponse>({
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
        const successStatement = core.db.prepare("INSERT OR REPLACE INTO RemoteMediaItems(id, description, productUrl, baseUrl, mimeType, fileName) VALUES (?, ?, ?, ?, ?, ?)");
        const errorStatement = core.db.prepare("UPDATE LocalMediaItems SET lastError = ? WHERE path = ?");

        for (const itemResult of response.data.newMediaItemResults) {
            if (itemResult.status.message === 'Success' || itemResult.status.message === 'OK') {
                const path = uploadTokenToPath.get(itemResult.uploadToken);
                let mediaItem = itemResult.mediaItem;
                if (path !== itemResult.mediaItem.description) {
                    // This can happen when the image is a duplicate, Google is keeping the old metadata instead of updating them
                    const patchedMediaItem = await patchMediaItem(itemResult.mediaItem.id, { description: path }, core)
                    if (!patchedMediaItem) {
                        numErrors += 1;
                        continue;
                    }
                    mediaItem = patchedMediaItem;
                }

                successStatement.run(
                    mediaItem.id,
                    mediaItem.description,
                    mediaItem.productUrl,
                    '', // TODO: add the baseUrl or remove it from the DB schema
                    mediaItem.mimeType,
                    mediaItem.filename
                );
                numSuccess += 1;
            } else {
                numErrors += 1;
                errorStatement.run(
                    itemResult.status.message,
                    uploadTokenToPath.get(itemResult.uploadToken),
                );
            }
        }
        errorStatement.finalize();
        successStatement.finalize();
    }
    console.log('All media items in batch created');

    return { numSuccess, numErrors };
}

async function patchMediaItem(mediaItemId: string, patch: Partial<MediaItem>, core: Core): Promise<MediaItem> {
    console.log(`Patch media item ${mediaItemId} with ${JSON.stringify(patch)}`);
    const response = await core.oAuth2Client.request<MediaItem>({
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

    return response.statusText === 'OK' ? response.data : null;
}
