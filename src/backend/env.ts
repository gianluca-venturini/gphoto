/** Directory that contains all the config including tokens. */
export const CONFIG_PATH = 'config';
/** Directory that contains all the media items organized into albums. */
export const DATA_PATH = 'data';
export const TOKEN_PATH = `${CONFIG_PATH}/token.json`;
export const CREDENTIALS_PATH = `${CONFIG_PATH}/credentials.json`;
export const DB_PATH = `${CONFIG_PATH}/state.db`;
export const PORT = process.env.PORT || 8080;
export const NO_DIRECTORY_AGGREGATION = !!process.env.NO_DIRECTORY_AGGREGATION || false;
export const RUN_EVERY_MINS = parseInt(process.env.RUN_EVERY_MINS, 10) || 12 * 60;
export const FIX_DUPLICATE_DESCRIPTION = !!process.env.FIX_DUPLICATE_DESCRIPTION || false;
