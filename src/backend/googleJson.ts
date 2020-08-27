export interface AlbumsResponse {
    albums: Album[];
    nextPageToken: string
}

export type AlbumResponse = Album;

export interface Album {
    id: string,
    title: string,
    productUrl: string,
    coverPhotoBaseUrl: string,
    coverPhotoMediaItemId: string,
    isWriteable: boolean,
    mediaItemsCount: number
}

export interface MediaItemsResponse {
    mediaItems: {
        id: string,
        description: string,
        productUrl: string,
        baseUrl: string,
        mimeType: string,
        mediaMetadata: {
            creationTime: string,
            width: string,
            height: string,
            photo?: {
                cameraMake: string,
                cameraModel: string,
                focalLength: number,
                apertureFNumber: number,
                isoEquivalent: number,
                exposureTime: string
            },
            video?: {
                cameraMake: string,
                cameraModel: string,
                fps: number,
                status: 'UNSPECIFIED' | 'PROCESSING' | 'READY' | 'FAILED'
            }
        },
        contributorInfo: {
            profilePictureBaseUrl: string,
            displayName: string
        },
        filename: string
    }[],
    nextPageToken: string
}

export interface MediaItemsCreateBatchResponse {
    newMediaItemResults: {
        mediaItem: {
            description: string;
            filename: string;
            id: string;
            mediaMetadata: {
                creationTime: string,
                width: string,
                height: string
            }
            mimeType: string
            productUrl: string
        },
        status: {
            message: string;
        }
    }[]
} 
