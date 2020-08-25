// import * as express from 'express';
import * as fs from 'fs';
import * as readline from 'readline';
import { google } from 'googleapis';
import fetch from 'node-fetch';

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/photoslibrary'];

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const CONFIG_PATH = 'config';
const TOKEN_PATH = `${CONFIG_PATH}/token.json`;
const CREDENTIALS_PATH = `${CONFIG_PATH}/credentials.json`;

// Load client secrets from a local file.
fs.readFile(CREDENTIALS_PATH, (err: NodeJS.ErrnoException, content: Buffer) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Tasks API.
    authorize(JSON.parse(content.toString()), listMediaItems);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials: any, callback: any) {
    const { client_secret, client_id, redirect_uris } = credentials.web;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err: any, token: any) => {
        if (err) return getNewToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client: any, callback: any) {
    const authUrl = oAuth2Client.generateAuthUrl({
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err: any, token: any) => {
            if (err) return console.error('Error retrieving access token', err);
            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
    });
}

/**
 * Print the display name if available for 10 connections.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listMediaItems(auth: any) {
    console.log('list media items');
    console.log(auth);
    fetch('https://photoslibrary.googleapis.com/v1/mediaItems', {
        method: 'get',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth.credentials.access_token}`
        },
    }).then(res => res.json()).then(console.log).catch(console.error);
}

// var app = express();

// // Simple endpoint that returns the current time
// app.get('/api/time', function (req, res) {
//     res.send(new Date().toISOString());
// });

// const PORT = process.env.CONFIG_DIR || 8080;

// app.listen(PORT, () => {
//     console.log(`Server listening on port ${PORT}`);
// });