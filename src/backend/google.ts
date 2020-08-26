import { Core } from "./core";
import { AlbumsResponse, MediaItemsResponse } from "./googleJson";

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
        response.data.albums.forEach(album => {
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
