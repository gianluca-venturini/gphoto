import { Core } from "./core";
import { DATA_PATH } from "./env";
import { promises as fs } from 'fs';

export async function touchLocalMediaItems(core: Core) {
    console.log('touch local media items');

    const directories = [DATA_PATH];

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
                const albumName = directoryPathToAlbum(directory);
                touchLocalMediaItem(entryPath, albumName, entry, core);
            }
        }
    }

    console.log('finish touch local media items');
}

function directoryPathToAlbum(directory: string) {
    return directory.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
}

function touchLocalMediaItem(entryPath: string, albumName: string, fileName: string, core: Core) {
    var statement = core.db.prepare("INSERT OR REPLACE INTO LocalMediaItems(path, fileName, albumName, remotePresent) VALUES (?, ?, ?, ?)");
    statement.run(
        entryPath,
        fileName,
        albumName,
        false
    );
    statement.finalize();
}
