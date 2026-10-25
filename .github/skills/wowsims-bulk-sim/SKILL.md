---
name: wowsims-bulk-sim
description: 'Use for any WoWSims Forever bulk sim ("Batch" tab) work, whether it runs natively, on the server or in the browser: candidate generation from BulkSettings and the enchant presets, Builds mode (gear setups × encounter and talent pairs), the low/medium/high and finalist stages, survivor culling, content-derived seeds, paired errors and tie groups in the results, progress, abort, combination counts, and the item database a bulk request carries to the workers. Also use it when a change to the sim request or its SimDatabase could reach a batch run. The gear optimizer (EP, stat caps, HiGHS) is `wowsims-reforge-optimizer`; React and store work outside the bulk feature is `wowsims-ui`.'
argument-hint: 'Describe the bulk sim flow, stage or result behaviour, or validation task.'
---

# WoWSims Forever bulk sim

The bulk sim ranks gear sets built from the worn gear plus the items and enchants the user selects. One Go
implementation (`sim/core/bulk`) generates the candidates and runs the stages; the browser runs a TypeScript
mirror of the stage loop because the WASM sim cannot run `bulkSimAsync`.

## Where things live

- Protos: `proto/api.proto` (`BulkSimRequest`, `BulkSettings`, `BulkGearCandidate`, `BulkSimResult`,
  `BulkGearResult`, `BulkSimStageMetrics`, `BulkCombinationCountRequest`, `BulkCandidatesRequest`). `BulkSimStage`
  runs Low, Medium, High, Finalist, Complete; Error ends a failed run.
- Candidate generator, `sim/core/bulk`: `generator.go` (selected items, grouped slot pairs, combination table),
  `weapons.go` (main-hand/off-hand combos, imbue adjustment), `enchants.go` (enchant variants), `slots.go` (bulk
  slots), `item_keys.go` and `item_rules.go` (dedupe, equip rules), `candidates.go` (the `BulkCombinationCount`,
  `BulkCandidates` and `EnsureBulkSimCandidatesGenerated` entry points).
- Stage runner, `sim/core/bulk`: `bulk_sim.go` (`BulkSimAsync`, constants), `stage.go` (stage configs, adaptive
  passes, finalist stage), `statistics.go` (target iterations, culling, paired errors, `BulkSimZ95`), `batch.go`,
  `carry_over.go`, `merge.go`, `progress.go`, `estimate.go`.
- Server: `sim/web/bulk.go` generates the candidates when the request carries none, then hands over to
  `bulk.BulkSimAsync`; `sim/web/main.go` wires `/bulkSimAsync`, `/bulkCombinationCount` and `/bulkCandidates`.
  `sim/wasm/main.go` exports only `bulkCombinationCount` and `bulkCandidates`.
- Request building: `Sim.runBulkSim`, `getBulkCombinationCount` and `getBulkCandidates` in `ui/sim/sim.ts`;
  `ui/sim/bulk/gear_database.ts` (the request's SimDatabase); `ui/sim/bulk/utils.ts` (`dedupeGearSets`, stage
  helpers).
- Browser stage loop: `ui/sim/wasm/bulk_sim/` (`index`, `stage`, `batch`, `merge`, `statistics`, `progress`,
  `carry_over`, `estimate`, `types`), a line-for-line mirror of `sim/core/bulk`.
- Feature: `ui/features/bulk/model/run.ts` (`runBulkBatch`, cancel, combination refresh), `core_sim.ts`,
  `tie_chains.ts`, `settings.ts`; components under `ui/features/bulk/components/`; the tab is
  `ui/app/tabs/BulkTabBody.tsx`. `ui/sim/settings/bulk_settings.ts` stores the settings, the enchant presets, the
  mode and the Builds picks.
- Builds mode, `ui/features/bulk/model/`: `builds.ts` (`bulkBuildRuns`, the plan), `gear_sets.ts`, `enchant_picks.ts`
  and `gear_setups.ts` (the Gear column), `encounters.ts`, `talents.ts`, `rotations.ts`, `encounter_pairs.ts`,
  `talent_pairs.ts`, `pairs.ts` and `saved_refs.ts` (the pair lists), `results.ts`, `results_csv.ts`, `compare.ts`; the card's count is `ui/features/bulk/hooks/useBulkBuilds.ts`.
- Enchant presets: `ui/features/enchant-presets/` (model, `EnchantPresets` tiles and dialog).
- Generated, never hand-edited: `ui/sim/bulk/constants_auto_gen.ts` (slot maps) and
  `ui/sim/wasm/bulk_sim/constants_auto_gen.ts` (tuning constants, stage ladder, `BULK_SIM_Z95`), written by
  `make go-to-ts` through `tools/database/gen_bulksim_constants.ts.go` from the exported consts in `sim/core/bulk`.

## Native and browser paths

`Sim.runBulkSim` picks the path by `isWasm()`:

- **Native or server:** the request goes out with no candidates; Go builds them in process and runs every stage.
  Nothing is emitted while the candidates are built, which can take minutes, so `sim/web/bulk.go` registers the
  abort signal before generating.
- **Browser (WASM workers):** the page asks the workers for the candidates (`getBulkCandidates`), dedupes them
  against the baseline (`dedupeGearSets`, keyed by `getGearIdentityKey`) and runs the stage loop in
  `ui/sim/wasm/bulk_sim`, one `raidSimAsync` per candidate segment. The WASM worker cannot run `bulkSimAsync`.
- **Explicit candidates (Builds):** `BulkSimOverrides.candidates` skip generation on both paths
  (`EnsureBulkSimCandidatesGenerated` returns early, the browser skips `getBulkCandidates`). They are deduped against
  the baseline and go out with empty `BulkSettings`: with the Gear-mode settings, a request whose candidates all repeat
  the baseline would have Go generate Gear-mode combinations.

Because both paths run the same algorithm, a change to staging, culling, statistics, carry-over or progress in
`sim/core/bulk` needs the same change in `ui/sim/wasm/bulk_sim`, and a new tuning constant goes through
`make go-to-ts` rather than being copied by hand.

Both paths build each candidate's request from the base request: the candidate's equipment, imbues adjusted to
its weapons, `saveAllValues` on.

## The request database

Only `with_db` builds load every item (`sim/core/database_load.go`). The server binary (`go build ./sim/web`) and
the WASM build do not use the tag, so they know only the items in the request's `SimDatabase`, while
`go test -tags with_db` sees every item. A green Go test therefore does not prove the request carries what it
needs: the generator fails with "selected bulk item … is missing from the database" for an item the request did
not ship, and core code reading an item the player does not wear gets nil.

- In Gear mode the bulk database is built from the baseline gear, `BulkSettings.items` (a selected spec's own
  enchant and suffix included) and the enchant pool (`makeBulkItemDatabaseFromSpecs`), on both paths, never from the
  generated candidates. An id a generated candidate can carry reaches the workers only through `BulkSettings`.
- A Builds request builds it from the baseline and its explicit candidates (`makeBulkGearDatabase`). A settings
  entry adds its swap gear and the items its party buffs read (`applyBulkSettings` in `ui/sim/sim.ts`).
- It is merged into the player's database (`Database.mergeSimDatabases`), never assigned over it. The player's
  database already holds the items party buffs read (`addPartyBuffItems` in `ui/sim/proto/buff_items.ts`, e.g. the
  party Darkspear's item); replacing it drops them silently. Any code path that rebuilds `player.database` either
  merges into it or calls `addPartyBuffItems` afterwards, as `runSim` with `options.gear` does.

## Candidates

- The baseline is `base_request.raid.parties[0].players[0].equipment`; `BulkGearCandidate.index` is a candidate's
  stable identity through every stage.
- `rawCombinations` is the mixed-radix index space of the combination table; `combinations` is the runnable count
  the UI shows. There is no set-bonus filter, so the two are equal for `BulkCombinationCount`.
- Slot eligibility goes through `core.EligibleSlotsForItem` (shared with item swap), spec lookup through
  `core.PlayerProtoToSpecSafe`, request validation through `newGeneratorFromRequest`.
- Hand swap (`initSelectedItems`): with no weapon selected, the worn weapons stay in the hands they are worn in.
  Once any weapon is selected, a dual-wielder's worn weapons join the hand-weapon pool and every allowed
  main-hand/off-hand order is a candidate.
- Game rules the generator encodes: no reforging, gems or sockets (an `ItemSpec` is id, random suffix and
  enchant); no Titan's Grip, so a two-hander never shares the hands with an off-hand; the Ranged slot iterates like
  any non-weapon slot.
- A ring enchant needs Enchanting. For a player without it, `slotSpec` strips both ring slots' enchants, the
  baseline's and a selected ring's own, so no two candidates differ only by a ring enchant.
- The combination table resolves each choice's item once per physical slot, and a candidate's item specs share
  one backing array; keep per-candidate allocations out of that loop.

## Enchant presets

The bulk sim crosses enchants through its checked enchant presets. `enchantPresetPool` turns them into
`BulkSettings.enchants` on every Gear-mode request (Finger 1 stands for both rings; Main Hand enchants go to both
hands); the pool is derived, never stored, and sorted so preset order does not change the seed. The presets live in
the bulk slice (`enchantPresets`, storage key `bulk-enchant-presets.v1`); checking a preset, or saving or deleting a
checked one, bumps the slice's `settings` counter so the combination count refreshes. Builds checks the same presets
on its own (`bulk-build-enchant-presets.v1`) and applies them to each gear set in `gear_setups.ts`. That pick holds
preset names, so renaming a preset carries its pick over and deleting one drops it.

The gear optimizer's "Use enchant presets" option reads the same presets. That is the only thing `BulkSettings`
and `ReforgeSettings` share; keep the two apart in request shaping and serialization. The fit rule
(`core.EnchantAppliesToItem`, `core.FittingEnchantRow`) is shared with the optimizer too.

## Stages and statistics

- Every candidate runs the same seed sequence, so comparisons use paired errors over `AllValues`
  (`bulkSimPairedDpsError`), far tighter than per-result stdev.
- Iterations come from the stage configs (minimums raised by the error target), not from `SimOptions.iterations`.
  Below `BulkSimMinCombinations` candidates, or when it would sim fewer iterations, the run goes straight to the
  high stage.
- Low and medium stages cull to survivors. Culling intervals use the run's original candidate count, iteration
  targets the current stage's count. A stage that misses its target error gets up to `BulkSimMaxAdaptivePasses`
  extra segments with offset seeds, merged into the existing metrics, and the carry-over lets the next stage sim
  only the iteration delta for the survivors.
- Finalist stage (`runBulkSimFinalistStage` / `runConcurrentBulkSimFinalistStage`): the top `topResults` and the
  baseline get lockstep extra iterations until every adjacent pair separates at `BulkSimZ95`, or
  `BulkSimFinalistMaxExtraIterationMultiplier` × the iterations so far is spent. Its results are the displayed set.
- Each top result ships `paired_error_to_next_result` and `paired_error_to_baseline`, computed before `AllValues`
  are stripped (0 = could not pair). Strip `AllValues` by detaching the slice before cloning
  (`bulkSimCandidateResultToProto`), never by cloning megabytes and discarding them.
- `BulkSimZ95` in `sim/core/bulk/statistics.go` is the single significance threshold; `Z_95` and `zTest` in
  `ui/sim/utils/math.ts` read the generated `BULK_SIM_Z95`.

## Seed and results display

- `runBulkSim` hashes the baseline gear, `BulkSettings` and, when one is passed, the explicit candidate list (each
  serialized and hashed, the digests combined) into `simOptions.randomSeed`: the same setup reproduces bit-identical
  results, any change draws a fresh sample. The encounter, settings and build overrides stay out of the hash, but a
  settings entry without Enchanting strips the ring enchants from the baseline and the candidates, which are hashed,
  so the seed moves with it. A fixed RNG seed takes precedence, and `lastUsedRngSeed` records the seed actually used.
- `buildTieChains` groups adjacent rows the paired test cannot separate, using the backend rank for "next result"
  and falling back to an unpaired `zTest` where no paired error exists. Each row's ± is `stDevToConf95`, the
  unpaired error of its own mean, a different quantity from the grouping test.
- A slot holding the same item with another enchant renders `GearChangeIcon`; a new item renders plainly;
  unchanged slots stay empty. Starting a run clears the results and returns to the Setup pane; a finished run
  opens Results.
- The batch has two modes. Gear crosses the picked items and the enchant presets under the current encounter,
  settings, talents and rotation. Builds has three columns: Gear, Encounters & settings, and Talents & rotations.
  Picking one is a power tool (`showPowerTools` in the UI slice): with power tools on, the top navigation's
  batch tab reads "Batch · Gear" or "Batch · Builds" and opens a menu of the two modes on mouseover, or on a tap on a
  touch screen (`BulkModeMenu`, the kit `Menu` with `openOnHover` that Import and Export use, around the tab through
  `TabNavTab.renderTab`). Clicking the tab opens the batch tab in the current mode; picking a mode sets it and opens
  the batch tab. With power tools off the tab is a plain "Batch" and the batch runs in Gear mode. The mode is
  `BulkSlice.mode`, stored per spec under `bulk-mode.v1` (default Gear), and outlives power tools being turned off.
- `bulkRunsBuilds` (`ui/features/bulk/model/mode.ts`, power tools on and mode Builds) is the one gate, read by
  `runBulkBatch` and, through `useBulkMode`, by the Setup pane, which in Builds shows `BulkBuildsColumns` in place of
  the item picker. Outside Builds the Builds picks stay stored and count again on the way back. Results already on screen stay as they are whatever the mode, and Compare encounters stays
  tied to power tools and two or more finished encounters.
- The Batch tab waits for the sim (`useSimReady`) before it reads the database, and Simulate stays disabled until then.
- **Gear column:** gear sets × enchant presets (`bulkGearSetups`). The sets are the current gear, then the checked spec
  presets and saved sets of the Gear tab; a preset brings no bonus stats and its `onLoad` never runs. A grouped preset
  shows and runs as "<group> · <name>", and its stored ref carries the group. An enchant preset puts each fitting
  enchant it holds for a slot on that slot, in every combination, and the other slots keep the set's own enchant. An
  enchant preset with no enchants is not listed and there is no own-enchants option, so with no enchant preset checked
  there are no setups and Simulate is disabled with a hint. Setups equal by gear identity and bonus stats run as the
  first.
- **Encounters & settings** pairs a preset or saved encounter with a Settings tab entry (the spec's settings and item
  swap presets, then saved entries); **Talents & rotations** pairs talents with a rotation. Either side can be the
  current one. A list runs the current pair first, then every checked pair in list order. Add is blocked on the
  current pair and on a pair with the same refs (`pairInList`), and a pair whose entry is deleted or renamed is hidden but stays stored.
- `bulkBuildRuns` plans the batch, encounter pair outer and talent pair inner, each pair of pairs one step. A step runs
  the gear setups as explicit candidates with empty `BulkSettings`, one request per bonus stats and resolved rotation
  the setups give (`BulkSimOverrides.build`: talents string, rotation, bonus stats). Resolved rotations compare by what
  the sim reads (`simmedRotationKey`), so an Auto and a Simple pick that generate the same list are one request. A
  setup an earlier talent pair with the same talents resolved alike sims once, under the first, and a talent pair left
  with no setup has no run. Ring enchants are stripped per request by that pair's professions (Enchanting in the
  settings entry, the live professions for the current settings).
- Each encounter pair's first request is the reference request: the current talent pair, the live bonus stats and
  the rotation the current gear resolves to, with no candidates when no setup shares them. Its baseline, the current
  gear as equipped, is the reference row the encounter pair ranks against, under that pair's encounter and settings.
- Simple and Auto rotations resolve through `Player.getResolvedAplRotationForBuild` once per rotation pick, talents and
  items without enchants (`generatorGearKey` in `builds.ts`), at run start and for the card. That holds because no
  spec's rotation generator reads an enchant: the generators read the talents and the main hand's hand type. A
  generator that reads an enchant needs the enchants in `generatorGearKey`. Encounters do not enter the resolve, and a
  custom APL goes out as it is.
- `BulkSimOverrides.encounter` replaces the whole encounter on the request copy only. `BulkSimOverrides.settings` is
  the Settings tab entry a request runs under; the current settings send none. `applyBulkSettings` writes the fields
  `applySavedSettings` loads, with its defaults: raid, party and player buffs, debuffs, consumables, race,
  professions, item swap, reaction time, channel clip delay, facing, distance and healing model. A field
  `applySavedSettings` gains is added there too.
- The run card (`CombinationsCount` with `useBulkBuilds`) shows the gear setups, "N encounter setups × M talent setups
  = K runs" and the total iterations. K counts the requests after splits and collapses. The iterations limit applies
  per request, and Simulate needs at least one setup and no request over the combinations limit (`canRunBuildsBatch`).
- `rankEncounterResults` (`results.ts`) merges an encounter pair's requests into one list: the top `BULK_RANKED_SETS`
  rows across all of them, plus the reference row. Only rows from the reference request keep the backend's paired
  errors; the others fall back to the unpaired test, and the tie test uses the fewest iterations of any request. A row
  no setup stands for is dropped. The current gear under another request is a row only when a setup wears it, labelled
  "No gear changes". A row a setup stands for carries the setup's own gear (`BulkGearSetup.ownGear` when the request
  sent it without ring enchants), so one setup keys alike under every encounter pair and Compare gives it one row. A
  row's key (`bulkResultKey`) is its gear identity, bonus stats, talents string and rotation as picked. `results` holds
  one entry per finished encounter pair, the current one first, kept only when all its requests finished.
- A Builds row names its gear setup ("<gear set> · <enchant preset>"), a talent pill when more than one talent pair
  ran ("Talent preset: <name>", or "Current talents"), and a rotation pill only when the encounter pair's rows differ
  in rotation. Hovering or focusing the talent pill opens a tooltip (`BulkTalentsGrid`) with every talent that holds a
  point, as its icon and rank under its tree's name and points, the talent's name as screen reader text. Equip
  (`equipBulkResult`) applies the gear, bonus stats, talents, rotation and the pair's settings in one `batch`; a
  current-settings row leaves the live settings alone. In Gear mode Equip applies the gear only and leaves the talents
  alone. The CSV (`results_csv.ts`) has the columns `encounter`,
  `settings`, `duration`, `variation`, `rank`, `current_gear`, `dps`, `dps_margin_95`, `diff`, `diff_pct`, `talents`,
  `talents_string`, `gear_set`, `enchant_preset` and `rotation`, then four per slot.
- Stored per spec: `bulk-gear-sets.v1` (checked gear set refs), `bulk-build-enchant-presets.v1` (the enchant presets
  checked in Builds, apart from Gear mode's pick in `bulk-enchant-presets.v1`), `bulk-encounter-pairs.v1` and
  `bulk-talent-pairs.v1`. None of them bumps the slice's `settings` counter.
- With two or more finished encounters and power tools on, the encounter list offers Compare encounters: a table
  (`compareMatrix` in `ui/features/bulk/model/compare.ts`) with the current gear's row, then every set's, and a column
  per encounter by fight length, health-based ones last. Each cell is the set's gain over the current gear (in % of the
  current gear's DPS), tinted on a diverging scale (`gainTint`, five steps either way, each a fifth of the table's
  largest gain or loss), with the encounter's best outlined and a dashed gap where the encounter did not rank the set;
  its tooltip gives the rank, DPS, fight-to-fight spread and gain. A set keeps one "S<N>" number across all
  encounters, by `bulkResultKey`. Under its number a set names its gear setup, or in Gear mode lists the items it
  changes (`changedItemLabels`); rings, trinkets or a dual wielder's weapons that only change places count as
  unchanged, as in the result rows (`ui/features/bulk/model/swappable_slots.ts`).
- The Setup/Results tab strip spans the batch tab, and each pane has its own columns. Setup holds the settings
  sidebar, which in Builds is the run card alone. Results holds the ranking and, for a run with more than one
  finished encounter, an encounter list (`BulkEncounterResults`, a vertical, neutral-tone `ToggleGroup`); picking a
  row shows that encounter's ranking.
  With one result there is no list and the ranking takes the full width.
- Progress is throttled (`BulkSimProgressThrottle` in Go, 100 ms in the browser emitter). Every stage, the
  finalist included, reports through the shared stage-metrics builder. A batch of more than one step lists its steps
  in the progress dialog as a table (`BulkProgressSteps`: Encounter, Settings, Talents, Rotation, status); Gear mode
  is one step and shows none.

## Validation

```bash
make proto      # after a proto change
make go-to-ts   # after changing an exported constant or slot map in sim/core/bulk
go test -tags with_db -count=1 ./sim/core/bulk ./sim/web
npx vitest run ui/features/bulk ui/sim/bulk ui/sim/wasm/bulk_sim/estimate.test.ts ui/sim/proto/buff_items.test.ts ui/features/enchant-presets
npm run type-check
```

Reproducibility: run the same `BulkSimRequest` twice through `BulkSimAsync` with the same seed; the results must
be bit-identical. For a request-database change, run a batch against the dev server, which has no `with_db`, not
only the Go tests.

A ruling, trap or workflow fact learned while using this skill is written down in the same change that uses it, where
`AGENTS.md` says: a comment at the code when one file owns the rule, this skill otherwise. A memory file is a pointer
to this skill, not a second copy.
