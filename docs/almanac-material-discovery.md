# Material discovery data contract

The game owns discovery. The website only reads the existing signed-in player's
PlayFab User Data through `Client/GetUserData`. No new database, endpoint, route,
or progression system is involved.

## Existing record

Add `discoveredMaterials` to the JSON object stored as the string value of the
existing **AlmanacProgress** User Data key. Do not create a separate User Data key
named discoveredMaterials. Preserve all existing fields when the game saves the
record, including regions, project completions and discoveredBridgeTypeIds.

Example fragment to merge into the game's existing AlmanacProgress object:

```json
{
  "discoveredMaterials": ["wood_beam", "wood_road", "wood_support"]
}
```

This is an illustrative contract, not seed data or a grant of materials.
The field is a cumulative array of exact, case-sensitive stable IDs. Write an ID
only after the game actually encounters/unlocks that material for that player.
The website never adds IDs or infers material discovery from region, XP, Coins,
bridge type or completed-project counts.

## Supported IDs

| ID               | Almanac entry              |
| ---------------- | -------------------------- |
| wood_beam        | Wood Beam                  |
| wood_road        | Wood Road                  |
| wood_support     | Wood Support / Pier        |
| rope             | Rope                       |
| concrete_road    | Concrete Road              |
| concrete_member  | Concrete Structural Member |
| concrete_support | Concrete Support / Pier    |
| steel_beam       | Steel Beam                 |
| steel_road       | Steel Road                 |
| steel_support    | Steel Support              |
| steel_cable      | Steel Cable                |

Generic website-only catalog IDs previously used for unfiltered cards (wood,
steel, cable, support, deck) are not discovery aliases. They do not grant entries.
The new IDs distinguish individual materials so discovery of one material never
reveals a whole family. Existing PlayFab currency identifiers are not changed.

## Reader behavior and compatibility

- Missing record, malformed JSON, absent field, null, non-array or empty array:
  no material entries; render the existing Almanac empty state.
- Within an array, non-string values are ignored and duplicate strings collapse.
- Unknown IDs or IDs with different casing/whitespace show no entry. Other known
  IDs in the same array remain visible. Matching is exact.
- Materials can be discovered before the first completed project; the website
  can read the field even when regions are absent or empty.
- Older records remain readable; they simply show no discovered materials.
- Demo journeys have an empty discovery array, not simulated material unlocks.
- Backend read failures retain the existing error/retry behavior.

## Game integration required

Unity/the game's existing player-data save path must serialize this field into
AlmanacProgress after actual discovery and preserve it on subsequent saves.
Unity/game code is outside this website repository and has not been modified.
Until that integration writes real records, players see the empty Materials tab.
Do not backfill players with all materials or use this example as a default.

Bridge discovery still uses existing bridge/completion records. Engineering
discovery still uses engineeringConceptIds from completed projects. No additional
bridge or engineering discovery fields have been introduced.

Website presentation uses Canyon Crossing → Town River → Industrial Zone, with
no fixed public level total. The Almanac shows completed projects and completion
of the regions present in game records. Existing game progression fields and
quest logic are preserved. Visible currency names are Coins and XP; transaction
Gold/EXP labels are formatted only for display, without changing source records.
