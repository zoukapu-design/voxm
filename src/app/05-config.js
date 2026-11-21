/* VOXM calls — Firebase web config (public values from the Firebase console; null = calls not set up yet).
   Firestore rules: see docs/firestore.rules */
const FIREBASE_CONFIG = null;
// Optional: URL that returns TURN ICE servers as JSON (e.g. Metered: https://<app>.metered.live/api/v1/turn/credentials?apiKey=...).
// Without it calls use STUN only, which works on most Wi-Fi but can fail on some mobile networks.
const TURN_CREDENTIALS_URL = '';
