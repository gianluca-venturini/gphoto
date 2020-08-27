import { Core } from "./core";
import { AlbumsResponse, MediaItemsResponse, AlbumResponse, MediaItemsCreateBatchResponse } from "./googleJson";
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

        var statement = core.db.prepare("INSERT OR REPLACE INTO RemoteAlbums(id, title, productUrl, coverPhotoBaseUrl, coverPhotoMediaItemId, isWriteable, mediaItemsCount) VALUES (?, ?, ?, ?, ?, ?, ?)");
        response.data.albums?.forEach(album => {
            statement.run(
                album.id,
                album.title,
                album.productUrl,
                album.coverPhotoBaseUrl,
                album.coverPhotoMediaItemId,
                album.isWriteable,
                album.mediaItemsCount
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

        var statement = core.db.prepare("INSERT OR REPLACE INTO RemoteMediaItems(id, description, productUrl, baseUrl, mimeType, fileName) VALUES (?, ?, ?, ?, ?, ?)");
        response.data.mediaItems.forEach(mediaItem => {
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

    var statement = core.db.prepare("INSERT OR REPLACE INTO RemoteAlbums(id, title, productUrl, coverPhotoBaseUrl, coverPhotoMediaItemId, isWriteable, mediaItemsCount) VALUES (?, ?, ?, ?, ?, ?, ?)");

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

export async function ensureGPhotoMediaItemsCreated(core: Core): Promise<{ numSuccess: number, numErrors: number }> {
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
            ORDER BY path
            LIMIT 1
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
    uploadedItems.forEach(({ path, uploadToken, fileName, albumId }) => {
        if (!albums.has(albumId)) {
            albums.set(albumId, []);
        }
        albums.get(albumId).push({ path, uploadToken, fileName });
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
        response.data.newMediaItemResults.forEach(itemResult => {
            if (itemResult.status.message === 'Success') {
                numSuccess += 1;
            } else {
                numErrors += 1;
            }
        })
        console.log(response);
    }
    console.log('All media items in batch created');

    return { numSuccess, numErrors };

}
