import { Core } from "./core";
import { DATA_PATH, NO_DIRECTORY_AGGREGATION } from "./env";
import { promises as fs } from 'fs';
import { isFileSupported } from "./media";

export async function touchLocalMediaItems(core: Core) {
    console.log('touch local media items');

    const directories = [DATA_PATH];
    const albums = new Map<string, string>(); // path -> albumName

    while (directories.length > 0) {
        const directory = directories.shift();
        console.log(`Inspect directory ${directory}`);
        const directoryList = await fs.readdir(directory);
        for (const entry of directoryList) {
            const entryPath = `${directory}/${entry}`;
            const stat = await fs.lstat(entryPath);
            if (stat.isDirectory()) {
                directories.push(entryPath);
            } else if (stat.isFile()) {
                if (isFileSupported(entry)) {
                    let albumName = ancestorAlbum(albums, directory);
                    if (!albumName) {
                        albumName = directoryPathToAlbum(directory);
                        if (!NO_DIRECTORY_AGGREGATION) {
                            // Disable directory aggregation not memoizing the albumName
                            albums.set(directory, albumName);
                        }
                    }
                    touchLocalMediaItem(entryPath, albumName, entry, core);
                } else {
                    console.log(`unsupported file: ${entry}`);
                }
            }
        }
    }

    console.log('finish touch local media items');
}

function directoryPathToAlbum(directory: string) {
    return directory.replace(`${DATA_PATH}/`, '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
}

function ancestorAlbum(albums: Map<string, string>, directory: string): string | null {
    const path = directory.split('/');
    if (path.length === 0) {
        return null;
    }

    const ancestorPath: string[] = [];
    while (ancestorPath.length < path.length) {
        const ancestorDirectory = ancestorPath.join('/');
        if (albums.has(ancestorDirectory)) {
            return albums.get(ancestorDirectory);
        }
        ancestorPath.push(path[ancestorPath.length]);
    }
    return null;
}

function touchLocalMediaItem(entryPath: string, albumName: string, fileName: string, core: Core) {
    var statement = core.db.prepare("INSERT OR REPLACE INTO LocalMediaItems(path, fileName, albumName) VALUES (?, ?, ?)");
    statement.run(
        entryPath,
        fileName,
        albumName
    );
    statement.finalize();
}

export async function readFileContent(path: string): Promise<Buffer> {
    return fs.readFile(path);
}
