# City Drive — street data

**Map data © OpenStreetMap contributors**, available under the Open Database License (ODbL 1.0):
https://www.openstreetmap.org/copyright — https://opendatacommons.org/licenses/odbl/1-0/

Source extract: the OpenStreetMap roadways and tram tracks of Bucharest (Overpass export, bbox 44.20–44.80 N /
25.80–26.45 E) as published in the public repository github.com/Miqell24/bucharest-bus-map (`docs/data/streets.geojson`,
roads used by the public-transport network and the `railway=tram` tracks, with their OSM names).

What is in this folder (a derived database, ODbL — share-alike; this folder is the derived data itself):
- `graph.json` — the junction graph of the corridor Palace of the Parliament ↔ Izvor ↔ Splaiul Independenței ↔
  Grozăvești ↔ Crângași ↔ Giulești ↔ Lacul Morii (≈ 7.5 × 6.1 km), projected to metres around the project pin
  (44.4639 N, 26.0347 E): carriageway geometry, street names, inferred one-way direction of paired carriageways and
  roundabouts (right-hand traffic), road class and width from the name and the carriageway spacing, tram tracks,
  the Dâmbovița traced between its OSM bridges (Podul Ciurel … Podul Națiunile Unite).
- `b<i>_<j>.json` (1 km tiles) and `tiles.json` — building plots laid out along and between those streets. The plots
  and the buildings generated on them are illustrative, not OSM building footprints (the source has none).

Not from OpenStreetMap: buildings, shops, traffic, the Palace of the Parliament and Arcul de Triumf massing models
(from their published dimensions), park outlines (approximate, at the parks' real positions).
