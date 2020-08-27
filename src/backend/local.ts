import { Core } from "./core";
import { DATA_PATH } from "./env";
import { promises as fs } from 'fs';
import { isFileSupported } from "./media";

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
                if (isFileSupported(entry)) {
                    const albumName = directoryPathToAlbum(directory);
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
    return directory.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
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
