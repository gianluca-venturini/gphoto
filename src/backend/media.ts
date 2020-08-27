export const SUPPORTED_IMAGE_FORMAT = [
    'bmp',
    'gif',
    'heic',
    'ico',
    'jpg',
    'jpeg',
    'png',
    'tiff',
    'webp',
    'raw'
];

export const SUPPORTED_VIDEO_FORMAT = [
    '3gp',
    '3g2',
    'asf',
    'avi',
    'divx',
    'm2t',
    'm2ts',
    'm4v',
    'mkv',
    'mmv',
    'mod',
    'mov',
    'mp4',
    'mpg',
    'mts',
    'tod',
    'wmv'
];

export const SUPPORTED_MEDIA_FORMAT = [
    ...SUPPORTED_IMAGE_FORMAT,
    ...SUPPORTED_VIDEO_FORMAT
]

export function isFileSupported(fileName: string): boolean {
    const fileNameParts = fileName.split('.');
    const ext = fileNameParts[fileNameParts.length - 1];
    return !!SUPPORTED_MEDIA_FORMAT.find(format => ext.toLowerCase() === format.toLowerCase());
}
