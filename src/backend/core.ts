import { OAuth2Client } from 'google-auth-library';
import * as express from 'express';
import * as bodyParser from 'body-parser';

export interface Core {
    oAuth2Client: OAuth2Client;
    app: express.Express;
}

export function initCore(): Core {

    const app = express();
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());

    return {
        oAuth2Client: null,
        app
    }
}
