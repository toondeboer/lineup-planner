/**
 * The app's names. app.config.ts repeats them (it cannot import app code); a unit test fails when
 * the two differ.
 *
 * - APP_NAME: the full name, used in the stores, the browser tab and in-app copy.
 * - APP_LABEL: the short name under the home-screen icon (iOS shows about 12 characters).
 *
 * The URL scheme, the storage key, the AWS resources and the package names stay `lineup-planner`
 * on purpose: changing them would break invite links already sent, lose the squads saved on users'
 * phones, or replace the live database.
 */
export const APP_NAME = 'Bench Logistics';
export const APP_LABEL = 'Bench Log';
