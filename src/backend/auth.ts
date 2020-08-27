import { google } from 'googleapis';
import { promises as fs } from 'fs';
import { Core } from './core';
import { TOKEN_PATH, PORT, CREDENTIALS_PATH } from './env';

/** If modifying these scopes, delete token.json. */
const SCOPES = [
    'https://www.googleapis.com/auth/photoslibrary'
];

interface Credentials {
    web: {
        client_secret: string;
        client_id: string;
        redirect_uris: string;
    }
}

export async function ensureAuthorize(core: Core): Promise<void> {
    if (core.oAuth2Client) {
        // Auth client already initialized
        return;
    }

    let credentials: Credentials;
    try {
        // Load client secrets from a local file.
        const content: Buffer = await fs.readFile(CREDENTIALS_PATH);
        credentials = JSON.parse(content.toString());
    } catch (err) {
        console.log('Error loading client secret file:', err);
        throw err;
    }

    const { client_secret, client_id, redirect_uris } = credentials.web;
    core.oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    try {
        const tokenData = await fs.readFile(TOKEN_PATH);
        const token = JSON.parse(tokenData.toString());
        core.oAuth2Client.setCredentials(token);
    } catch (err) {
        // Necessary to fetch a new token
        await ensureToken(core);
    }
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 */
async function ensureToken(core: Core): Promise<void> {

    const authUrl = core.oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    console.log(`Requesting authorization token. Visit http://localhost:${PORT}`);

    core.app.get('/', function (req, res) {
        res.redirect(authUrl);
    });

    const code: string = await new Promise(resolve => {
        core.app.get('/auth', function (req, res) {
            resolve(req.query.code as string);
            res.send('authorized successfully');
        });
    })

    const response = await core.oAuth2Client.getToken(code);
    core.oAuth2Client.setCredentials(response.tokens);

    // Store the token to disk for later program executions
    await fs.writeFile(TOKEN_PATH, JSON.stringify(response.tokens));
    console.log('Token stored to', TOKEN_PATH);
}
