/** Directory that contains all the config including tokens. */
export const CONFIG_PATH = 'config';
export const TOKEN_PATH = `${CONFIG_PATH}/token.json`;
export const CREDENTIALS_PATH = `${CONFIG_PATH}/credentials.json`;
export const DB_PATH = `${CONFIG_PATH}/state.db`;
export const PORT = process.env.PORT || 8080;
