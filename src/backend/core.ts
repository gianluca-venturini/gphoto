import { OAuth2Client } from 'google-auth-library';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as sqlite3 from 'sqlite3';
import { PORT } from './env';
import { GaxiosOptions, GaxiosPromise } from 'gaxios';

export interface Core {
    oAuth2Client: OAuth2Client;
    apiRequest: <T>(opts: GaxiosOptions) => GaxiosPromise<T>;
    app: express.Express;
    db: sqlite3.Database;
    rateLimitBackoffMs: number;
}

export function initCore(): Core {

    const app = express();
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());

    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });

    return {
        oAuth2Client: null,
        apiRequest: null,
        db: null,
        app,
        rateLimitBackoffMs: null
    }
}
