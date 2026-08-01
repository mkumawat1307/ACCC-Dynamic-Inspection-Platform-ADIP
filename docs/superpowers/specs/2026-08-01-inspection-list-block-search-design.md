# Design: Block Name in Inspection List + Search by Block

## Purpose

The Inspection List screen (`app/inspection/index.tsx`) currently shows each inspection's Pole ID, Division, District, Status, and Date. The `Block` value is already fetched and typed by the repository but is not displayed, and the search box only matches Pole ID, Division, and District. This feature surfaces the block name in the list and makes the list searchable by it.

## Data Model — No Changes Required

`InspectionListItem.Block: string | null` already exists (`src/database/repositories/InspectionListRepository.ts:10`), and the SQL already selects the block via the `FieldKey = 'block'` subquery (lines 40-44). No schema, repository, or query changes are needed.

## Change: `app/inspection/index.tsx`

1. **Display block name** — add a card line matching the existing `Division :` / `District :` pattern (currently lines 361-367), after the District line:

   ```tsx
   <Text>
     Block : {item.Block || "N/A"}
   </Text>
   ```

2. **Search by block** — extend the existing filter (lines 164-169) so it also matches `Block`:

   ```ts
   const filtered =
     inspections.filter((item) =>
       item.PoleID.toLowerCase().includes(query) ||
       (item.Division ?? "").toLowerCase().includes(query) ||
       (item.District ?? "").toLowerCase().includes(query) ||
       (item.Block ?? "").toLowerCase().includes(query)
     );
   ```

3. **Update the Searchbar placeholder** (line 273) to:

   ```tsx
   placeholder="Search Pole ID, Division, District, Block"
   ```

## Error Handling

None new — the search filter already uses `?? ""` null guards; the card render uses `|| "N/A"`. Empty/whitespace search queries match all rows via `includes("")`, matching current behavior.

## Testing

- The filter logic lives inline in the screen; there is no existing screen test. Add a lightweight unit test for the filter predicate only if extraction is warranted — otherwise verify via the existing full Jest suite (no regressions). Repo-style tests for `InspectionListRepository.getByProject` already cover the Block value selection; extend that suite with an assertion that the `block` FieldKey subquery is present if cheap to do.
- Run: `npx tsc --noEmit`, `npx eslint app/inspection/index.tsx`, full `npx jest`.

## Out of Scope

- Reports-preview count display fix (separate, previously reported issue — queued after this feature).
- Any change to the block data capture or storage.
