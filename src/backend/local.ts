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
        const dirents = await fs.readdir(directory, { withFileTypes: true });
        await new Promise((resolve, reject) => core.db.run("DELETE FROM LocalMediaItems WHERE path LIKE ?", [`${directory}%`], err => { if (err) { return reject(err); } resolve() }));
        var statement = core.db.prepare("INSERT OR REPLACE INTO LocalMediaItems(path, fileName, albumName) VALUES (?, ?, ?)");
        for (const dirent of dirents) {
            const path = `${directory}/${dirent.name}`;
            if (dirent.isDirectory()) {
                directories.push(path);
            } else if (dirent.isFile()) {
                if (isFileSupported(dirent.name)) {
                    let albumName = ancestorAlbum(albums, directory);
                    if (!albumName) {
                        albumName = directoryPathToAlbum(directory);
                        if (!NO_DIRECTORY_AGGREGATION) {
                            // Disable directory aggregation not memoizing the albumName
                            albums.set(directory, albumName);
                        }
                    }
                    statement.run(
                        path,
                        dirent.name,
                        albumName
                    );
                } else {
                    console.log(`unsupported file: ${path}`);
                }
            }
        }
        await new Promise((resolve, reject) => statement.finalize(err => { if (err) { return reject(err); } resolve(); }));

        console.log('finish touch local media items');
    }
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

export async function readFileContent(path: string): Promise<Buffer> {
    return fs.readFile(path);
}
