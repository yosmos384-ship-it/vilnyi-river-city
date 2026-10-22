// VILNYI RIVER CITY — Google Maps Platform settings for the "Location on Google Maps" section (js/maps.js).
// The only place in this repository that holds the key. It is a browser key: every visitor can see it by design, so it
// must be protected in Google Cloud Console (APIs & Services → Credentials → this key):
//   Application restrictions → Websites:
//     https://www.vilnyirivercity.com/*   https://vilnyirivercity.com/*
//     https://www.vilnyi-river-city.com/* https://vilnyi-river-city.com/*
//   API restrictions → Maps JavaScript API, Places API (New)   (the 3D map and Street View run on the Maps JavaScript API)
// Clear the key ('') to switch every Google part off: the section then shows the poster, the site's own list of nearby
// places and the navigation buttons (Google Maps / Waze links need no key). Never log the key.
export const GOOGLE_MAPS_API_KEY = 'AIzaSyCHgOe-pPX_LfL55bMqher0fP77McLCzL4';

// Map ID (Google Cloud Console → Map management). Needed for the branded markers (Advanced Markers) and the dark,
// tilted vector map. 'DEMO_MAP_ID' is Google's public test ID; replace it with your own Map ID (free) for production.
export const GOOGLE_MAP_ID = 'DEMO_MAP_ID';

// Flyover: 'auto' = Photorealistic 3D (Map3DElement) when available, otherwise a tilted satellite map turning slowly;
// '3d' = 3D only (the poster stays if it fails); 'tilt' = always the tilted satellite map; 'off' = poster only.
export const FLYOVER_MODE = 'auto';

// Places API (New) "what's nearby" search at runtime. false = the site's own curated list (js/panorama.js POIS).
export const PLACES_NEARBY = true;

export default { GOOGLE_MAPS_API_KEY, GOOGLE_MAP_ID, FLYOVER_MODE, PLACES_NEARBY };
