# VILNYI River City — versions

## Restore points

The last published version is always saved, numbered, **before** anything new is uploaded.

- Named restore points (branches in this repository, never published): `backup/v2.8`, `backup/v3.0`, `backup/v3.3`,
  `backup/v3.4`, `backup/v3.5`, `backup/v3.5.1`, `backup/v3.6`, `backup/v3.7` — a new `backup/<version>` is added before every release.
- Every other version: by its commit id in the table below.
- To go back: ask Claude "restore version vX.Y". It is done as a new commit on `main` that puts back the files of that
  version — history is never rewritten, so going back can itself be undone:

```
git checkout main && git pull --ff-only
git rm -rq . && git checkout origin/backup/vX.Y -- .      # or the commit id from the table
git checkout HEAD -- VERSIONS.md CNAME .nojekyll
git commit -m "restore vX.Y" && git push origin main
```

- The site's footer shows the version that is running (since v3.5.1).

## All versions

Every published version has a commit id (below).

| Version | Commit | What changed |
|---|---|---|
| v1.0 | 105ae0c | First full site: 3D complex, floor plans, 538 units, walkthrough, booking, CRM, 8 languages |
| v1.1 | 7b90ad2 | Email reservations (Web3Forms), 34 AI photoreal renders in the gallery |
| v1.2 | 4396396 | Realistic surroundings, lake, facades; hero switched to AI photo + 3D toggle; language menu |
| v1.3 | 8c0c55e | Hero restored to the original live 3D opening (as in v1.1); everything else from v1.2 kept |
| v1.4 | c59e308 | Clean hero (text below the moving 3D image), exterior gallery images matching the real layout (8 new renders), 360° neighbourhood map with 36 real places and Google Maps routes |
| v1.5 | ef94161 | Photoreal 360° tour (Blender renders) for 2-room apartments in 3 designs + lobby/corridor, with Live 3D ↔ Photo-real switch; 3D lift buttons; open any apartment from the corridor; richer interior lighting/materials |
| v1.6 | 05487df | Opening image = the real night render with twinkling lights, auto slideshow of real renders + live 3D, "Main image" button; drivable luxury cars (parking + streets); every cabinet, wardrobe, drawer and appliance opens with contents |
| v1.7 | d83d2ec | Hero: only the real render + live 3D (removed AI slides with wrong building shapes); caption shortened to the project name |
| v1.8 | 2ffb613 | Real building shapes & arrangement (C3/C4 mirrored U with wings, Faza I/III, spiral ramp) matched to the developer render and CAD plans; correct unit orientation and lake views; instant photo while the 3D loads (textures cached, faster start); car colliders updated |
| v1.9 | 1e61e07 | Lit lifts, all 12 lifts reach parking −1 with lit lobbies; every balcony/loggia/terrace door opens; photoreal 360 tour for all apartment types + per-building lobby/corridor |
| v2.0 | 56f75f6 | Tap a floor on the 3D building picker (C3/C4, all facades), no page jump when choosing; motorised curtains with wall switches that open on entry; dishwasher + washer/dryer open; live TVs; full kitchen drawers; lobby concierge with multilingual help dialog; Faza III reshaped as a comb |
| v2.1 | 367e0c3 | Neighbouring Faza III rebuilt as in the developer render: dark comb right beside Faza II (no more pale separate towers); street and landscaping adjusted |
| v2.2 | 9189850 | Two new luxury apartment designs (Monaco Art-Deco, Kyoto Japandi) for all types; two new building finishes for lobbies/corridors/lifts (Grand Marble, Stone & Oak) with a toggle; plans checked — no spa in the permit |
| v2.3 | 0f659a8 | Contact email sales@vilnyirivercity.com shown on site and in reservation confirmations |
| v2.4 | 0072824 | Lift buttons: numbers always visible on every phone (unlit engraved faces, glowing when pressed); small gold VILNYI emblem on the lift panel |
| v2.5 | e1336d5 | Six luxury car designs with interiors; enter and drive from the −1 parking up the ramp, around the site, streets and lake road and back; headlights and sound toggles |
| v2.6 | 2665e56 | Balcony/loggia/terrace doors open on tap or on approach (both sides) and close behind you; new sixth luxury interior design "Paris" for all apartments |
| v2.7 | ba46e8a | Lift: view from the back of the car, large keypad by the doors, real mirror; redrawn lobby concierge; kitchen islands with running tap and salad chopping; playable snooker table in large duplexes; 360° neighbourhood map re-captured with the real building layout and moved up right after the apartment picker; flicker fix |
| v2.8 | 6b14871 | Toilets open and flush, running water at every tap, bath and shower, shampoo pumps; live Romanian news channel on the TVs; doorbell at every apartment door with hall monitor; video intercom at every building entrance |
| v2.9 | eb4e7c5 | Photoreal 360°: the balcony and every window now show the view from your own apartment — its real floor, side and building (no more floor-9 view on a ground-floor flat); loggia flats open on their loggia; photoreal images shown at their true brightness |
| v3.0 | a388b2c | Parking −1 always full of luxury cars (fixed empty hall), get into any car, START/STOP, live mirrors, drive out via the ramp; the photoreal 360° button now shows the same place you are standing in, same direction (rooms, corridors on every floor, lift, lobbies, parking, forecourt, courtyard) |
| v3.1 | 609a9ba | Concierge greets aloud in the visitor's language; redrawn concierge and lift-mirror figures; bathroom taps fully visible, one-tap flush; new entrance forecourts with glazed lobby fronts; chauffeured limousine from the entrance to the lake; walkable VILNYI concept superyacht (cabins, bridge with piloting and autopilot, pool, bar, spa, disco) labelled as a concept experience |
| v3.2 | 7cd86e3 | Concept yacht: lively party crowd at the pool, whirlpool, bar and disco — many guests in varied bikinis and swimwear, dancing to the beat |
| v3.3 | 628c953 | Concept yacht: casino with real game engines on play money (European blackjack 6 decks with splits and doubles, roulette, baccarat, slots, video poker, Casino Hold'em, craps; €1,000 play chips, no real money); helicopter tour from the helipad over the project and the area; autopilot cruise passes in front of the project; disco restyled with club lighting |
| v3.4 | 249304b | Every apartment priced individually: base €2,250/m², floor premium (ground −5% … floor 10 +18%), lake view +5%/+10%, courtyard +2%; breakdown shown in the unit panel; filters, calculator and CRM follow |
| v3.5 | c5d342e | Site opens in the language of the visitor's country (manual choice and ?lang= still win); prices per m² by room count: 1 room €3,000, 2 rooms €2,700, 3+ rooms €2,500 — floor/view premiums switched off |
| v3.5.1 | 0b1dccf | Every release now loads as one consistent version (no mix of old and new files after an update); site auto-refreshes to the newest version; version number shown in the footer |
| v3.6 | 50331f7 | Realistic baked lighting in every apartment (toggle); graphics quality Auto/Low/Medium/High with soft shadows, glow and free CC0 materials; studio sofa beds that open into a double bed; electric parking gate; opt-in "City Drive" game mode in a fictional Bucharest district (16+) |
| v3.7 | ef0fafd | City Drive: the windscreen is clear — controls moved to the screen edges and the dashboard band (fold away while driving), portrait-aware cockpit camera, look-around through the side windows, hold-to-look-back, live interior/door mirrors plus a digital rear view in the cluster, reversing camera in R; real streets from OpenStreetMap (© OpenStreetMap contributors, ODbL — main roads, one-way carriageways, tram tracks and bridges of the Palace of the Parliament ↔ Splaiul Independenței ↔ Grozăvești ↔ Crângași ↔ Giulești corridor; buildings on the plots are illustrative); "Start from…" with the Palace of the Parliament (modelled massing), the garage, Piața Unirii, Arcul de Triumf, Grozăvești; sculpted cockpits per car design (trim finishes, ambient light, multi-function wheel with paddles, hands on the wheel) |
| v3.8 | a276954 | Every apartment: 5.1 surround with wall-built speakers as subtle grilles; Romanian radio scanner (random station on each entry, mute always visible); fixed generic Romanian news-style TV channel in every flat; lift music through the corridors until the visitor enters a flat, leaves the building or enters a car; building picker (C3 or C4) after the 3D tour; GT VILNYI button starts City Drive in a car outside the Marriott hotel (Calea 13 Septembrie); blood captions, text and effects removed |
| v3.9 | 493eb5c | Lift and lobby music after the first tap, stopping on entering a flat, leaving the building or entering a car; lift camera pulled back to show the whole cabin; radio scanner in a top-corner box (tap list, arrows, swipe) clear of the windscreen; Marriott start on the nearest Calea 13 Septembrie segment; stylised 360 neighbourhood section removed (realistic photo 360 tours kept). Not changed: TV source, car look-around drag direction, car park exit route |
| v3.10 | 523d5c0 | City Drive: car park exit driveway to the nearest real street, Start from my location (snap to road, outside-area message), full GT VILNYI controls in portrait, radio in the top corner, touch look direction fixed, no self-reload during game/drive (idle home only), VRC FM at ignition |
| v3.11 | 67f9501 | 3D walkthrough loads reliably on phones: a syntax error from v3.10 (a comment inside the touch-look code) stopped the walkthrough module from loading, so the overlay showed "final preparation" on every try; fixed. The overlay now lifts once a frame is drawn and a late optional step cannot bring back the failure text; the retry re-runs the module import; the texture wait is bounded and falls back to inline generation |
