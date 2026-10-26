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
// tilted vector map. The owner's own Map ID (vector). Its look (dark/gold) is set in Cloud Console → Map Styles for this ID.
export const GOOGLE_MAP_ID = '6d106ba3d67a6540b64ed508';

// Flyover: 'auto' = Photorealistic 3D (Map3DElement) when available, otherwise a tilted satellite map turning slowly;
// '3d' = 3D only (the poster stays if it fails); 'tilt' = always the tilted satellite map; 'off' = poster only.
export const FLYOVER_MODE = 'auto';

// Places API (New) "what's nearby" search at runtime. false = the site's own curated list (js/panorama.js POIS).
export const PLACES_NEARBY = true;

// ---- Google Photorealistic 3D Tiles inside the 3D worlds (js/three/google3d.js) ----------------------------------------
// ON since v3.17: the key of the Cloud project "mintinaj-maps-10252310" (billing account "Mintinaj LLC", billing address
// OUTSIDE the EEA), restricted to this site's referrers and to Map Tiles / Maps JavaScript / Places APIs. The location
// section above keeps its own key and Map ID (Map IDs belong to one Cloud project). Empty '' = the feature is OFF and the 3D worlds are exactly the classic ones
// (OpenStreetMap / procedural city); nothing is downloaded from Google by them. Set it = ON: a "🌍 Google 3D / 🗺 Classic"
// toggle appears in the 3D views and the real city is streamed live from Google.
// The key MUST belong to a Google Cloud project whose billing account has a billing address OUTSIDE the EEA: since 8 July 2025
// Google answers 403 "…not available for your account and region" for EEA billing accounts (Map Tiles API EEA terms). On a
// 403 / 429 / no network / no 3D coverage the worlds fall back to the classic city by themselves, with a short note.
// Restrict the key in Cloud Console → Credentials: Websites = this site's domains; APIs = Map Tiles API (+ Maps JS / Places). Never log it.
export const GOOGLE_3D_KEY = 'AIzaSyApoeydm500jOK_zI5naDIouB5CvCYd6uo';
// No photorealistic coverage (only a coarse globe): if the finest tile on screen stays coarser than this (metres of
// geometric error) once loading has settled, the world goes back to the classic city ("no Google 3D coverage here").
export const GOOGLE_3D_MIN_DETAIL_M = 6;

export default { GOOGLE_MAPS_API_KEY, GOOGLE_MAP_ID, FLYOVER_MODE, PLACES_NEARBY, GOOGLE_3D_KEY, GOOGLE_3D_MIN_DETAIL_M };
