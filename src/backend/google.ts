import { Core } from "./core";

export async function listMediaItems(core: Core) {
    console.log('list media items');
    const response = await core.oAuth2Client.request({
        url: 'https://photoslibrary.googleapis.com/v1/mediaItems',
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });
    console.log(JSON.stringify(response));
}

interface AlbumsResponse {
    albums: {
        id: string,
        title: string,
        productUrl: string,
        coverPhotoBaseUrl: string,
        coverPhotoMediaItemId: string,
        isWriteable: boolean,
        mediaItemsCount: number
    }[]
    nextPageToken: string
}

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
            }
        });

        var statement = core.db.prepare("INSERT INTO RemoteAlbums(id, title, productUrl, coverPhotoBaseUrl, coverPhotoMediaItemId, isWriteable, mediaItemsCount) VALUES (?, ?, ?, ?, ?, ?, ?)");
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

}
