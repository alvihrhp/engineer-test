# Reflection

> **Required.** Fill in all sections before submitting. A blank or incomplete REFLECTION.md will significantly affect your evaluation.

---

## 1. Architectural Decisions

**Decision 1: Single shared zod schema as the source of truth for validation, split into a client-safe module and a server-only mongoose module.**

_Context:_ The brief required business rules to be enforced on **both** client (zod) and server (API). Duplicating the rules invites drift; sharing them avoids it. But a naive shared file breaks Next.js's client/server boundary because a client component that imports the zod schema would also pull the mongoose model into the browser bundle.

_Options considered:_
- (a) Duplicate the rules — one zod for the form, one validator on the server. Rejected: drift risk.
- (b) Share `RecipeSchema` from a single file that also defines `RecipeModel`. This is what the scaffold suggested. Rejected after I caught the form page hanging on first compile because Next.js was trying to bundle mongoose into the client bundle.
- (c) Split: `src/lib/schemas/recipe-zod.ts` (zod + types + constants + normalization helpers — client-safe) and `src/lib/schemas/recipe.ts` (mongoose model + re-exports the zod module).

_Decision and trade-offs:_ Chose (c). The form imports from `recipe-zod`; everything server-side keeps importing from `recipe` and gets both zod and the model via the re-export. The example route and other scaffold files needed no changes. Trade-off: one extra file in the schemas folder, and a developer needs to know which module to import from in client code.

_With more time I'd:_ Add a lint rule (or doc comment in `recipe.ts`) warning "do not import from this file in client components — use `recipe-zod` instead." I'd also pull the rules out into named refinements (`totalTimeRule`, `uniqueIngredientsRule`) so each can be unit-tested in isolation.

---

**Decision 2: Title uniqueness enforced at the API boundary via a case-insensitive collation index, not inside zod.**

_Context:_ Most rules (total time, ingredient uniqueness, tag/step limits) are pure functions of the input and live in zod's `superRefine`. Title uniqueness is different — it requires a database lookup, so it cannot live in a pure schema.

_Options considered:_
- (a) Application-level: `findOne({ title })` then create. Rejected as a sole defense — vulnerable to a TOCTOU race between the lookup and the insert, and case-insensitivity would require building regex queries.
- (b) Database-level: a unique index with a case-insensitive collation (`{ locale: 'en', strength: 2 }`) on the `title` field. Combined with `normalizeTitle()` (trim) at the API boundary, this enforces "trimmed + case-insensitive uniqueness" deterministically.
- (c) Both — pre-flight `findOne` for a clean 400 response, plus the index as a safety net for races.

_Decision and trade-offs:_ Chose (c). The API does a pre-flight check using the collation so the user gets a clean field error (`fieldErrors.title = ['A recipe with this title already exists']`). If two requests race past the check, the unique index throws `MongoServerError` code 11000, which the route handler catches and converts to the same 400 response. Trade-off: two paths to the same error message, slightly more code. Worth it because the index is the single guarantor of correctness; the pre-flight check is just a UX optimization.

_With more time I'd:_ Add an integration test that fires two simultaneous POSTs with case-variant titles to actually exercise the 11000 code path (the existing tests cover the pre-flight branch).

---

**Decision 3: Three parallel sub-agents working on disjoint file scopes, with the schema layer locked first.**

_Context:_ 90-minute build budget. The work splits naturally into API / read-UI / write-UI, but every layer depends on the schema and the API contract. Naively forking three agents would create merge conflicts on shared types and contradictory API shapes.

_Options considered:_
- (a) Sequential build (schema → API → UI). Safe, but uses ~all 90 minutes serially.
- (b) Three agents from the start. Fast but races on `recipe.ts`, `package.json`, and the API contract.
- (c) Hybrid: do the foundation (zod rules + Mongoose index + dep installs) in the main thread to lock the contract, then fan out three agents over disjoint files (API routes, list/detail pages + delete dialog, RecipeForm + new + edit pages).

_Decision and trade-offs:_ Chose (c). I wrote and pinned the schema first, decided the API contract in the prompts (response envelope, dotted-path field errors, `tags=quick,vegan` query string), then fired the three agents in one message. Trade-off: requires upfront design discipline — if the contract was wrong, I'd waste three agents' work, not one. To mitigate, I kept the contract minimal and decision-shaped.

_With more time I'd:_ Have the agents produce typed contract objects (e.g. an `ApiTypes` file with request/response interfaces) that all three reference, so a contract change is type-safe rather than convention-based. I'd also have each agent emit a short test that asserts its half of the contract.

---

## 2. Bugs Found in the Scaffold

- **File and line**: `src/app/api/recipes/example/route.ts:14, 33`
  **Description**: The example POST returns `500` for any error, including validation failures — and the example zod schema (`src/lib/schemas/recipe.ts`) doesn't enforce business rules, so the example route silently accepts payloads that violate the brief's rules (e.g. `prepMin=0, cookMin=0`). It also never `safeParse`s the body before passing to `RecipeModel.create`, so client mistakes surface as Mongo errors.
  **Fix applied**: I did not modify the example file (it's a deliberate reference for candidates). My own routes at `/api/recipes` and `/api/recipes/[id]` use a standardized 400/404/500 envelope with `fieldErrors: Record<string, string[]>` keyed by dotted zod paths. The scaffold's "shape only" comment in the schema file is a hint that this is intentional, but the deliberate-vs-buggy distinction is worth flagging.

- **File and line**: `src/lib/schemas/recipe.ts` (original) — `prepMin`/`cookMin` typed as `nonnegative()`
  **Description**: The original zod schema accepted `prepMin=0, cookMin=0`, which violates the "total time > 0" business rule.
  **Fix applied**: Added `superRefine` that flags `total <= 0` (path: `prepMin`) and `total > 1440` (path: `cookMin`). The individual `nonnegative()` constraints stay so users can still set one of them to 0 (e.g. a no-cook salad with prep=15, cook=0).

- **File and line**: `src/lib/schemas/recipe.ts` (original) — no unique index on `title`
  **Description**: The brief requires title uniqueness (case-insensitive, trimmed). The Mongoose schema had no index, so duplicates were possible at the DB level.
  **Fix applied**: Added a unique index with a case-insensitive collation: `{ unique: true, collation: { locale: 'en', strength: 2 } }`. Paired with `normalizeTitle()` (trim) at the API boundary, this enforces the rule deterministically and survives concurrent writes (the API catches `MongoServerError` 11000 and converts it to a 400 field error).

- **File and line**: `src/test/setup.ts:9-12` vs `src/lib/db.ts:18-31`
  **Description**: The test setup calls `mongoose.connect(uri)` directly without going through the cached `connectDB()` singleton. If a route handler calls `connectDB()` during a test, it tries to open a *second* connection and throws `Can't call openUri() on an active connection...`. This made the API integration tests fail before I worked around it.
  **Fix applied**: My routes use a small `ensureDB()` helper that no-ops when `mongoose.connection.readyState === 1`, otherwise calls `connectDB()`. Tests use the global setup connection; production uses `connectDB()`. (Documented as a deviation in section 6 because it's effectively a small infrastructure tweak.)

- **File and line**: `package.json` — no ESLint config
  **Description**: `pnpm lint` drops into Next.js's interactive ESLint setup wizard and exits with code 1, breaking any CI that runs it.
  **Fix applied**: None — outside the scope of the build. Noted here.

---

## 3. AI Tool Usage

| Tool                               | Task(s)                                                                                                         | Representative prompt                                                                                                                                       | What you kept                                                                              | What you changed or rejected                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code (Opus 4.7, this session) | Orchestrated the whole build: locked the schema, drafted the API contract, briefed three parallel sub-agents, ran tests, smoke-tested in Playwright, debugged the schema bundling bug, wrote this reflection. | "Build it by running parallel agents. Lock the schema first, then fan out 3 agents over disjoint files (API / read UI / write UI) with a fixed API contract." | Phase split, schema design (Zod superRefine + collation index + normalization helpers), three-agent fan-out, integration test of the title-uniqueness path. | Agent C originally cast `useFieldArray` for steps with `as never`, which broke `defaultValues.steps = ['']` rendering — fixed with a `useEffect` that seeds one step on mount. Caught a critical bundling bug where the form (client) imported `RecipeSchema` from a file that also imported mongoose, hanging Next.js dev compile; split the schema into client-safe and server-only modules. Verified all of Agent A's, B's, C's typecheck claims by running `pnpm typecheck` + the full vitest suite myself. |

_Why this matters: we're evaluating your judgment in working with AI tools, not whether you used them._

---

## 4. What I'd Improve Given More Time

1. **Optimistic UI on delete** — currently the delete mutation invalidates the list and the user waits for the round-trip; with `setQueryData` + rollback on error the UI would feel instant.
2. **Real component test** — the spec asked for "at least one component or integration test." I wrote 21 zod unit tests + 5 API integration tests but no React Testing Library test of the form component itself. The next test I'd write would assert that a server `fieldErrors.title` payload gets mapped onto the title field via `setError`.
3. **Search ergonomics** — the search hits five fields with a regex `$or`. For 100 documents that's fine, but at scale this needs a Mongo text index (`recipeMongooseSchema.index({ title: 'text', description: 'text', tags: 'text', 'ingredients.name': 'text', steps: 'text' })`) and a `$text` query.
4. **Form polish** — the `useFieldArray` cast hack for the string-array `steps` is fragile; I'd replace it with a proper object-shape (`{ value: string }[]`) plus a transformer at the form/schema boundary, which removes the `useEffect` seed and the `as never` casts.
5. **Stricter API error types** — share `ApiError` / `FieldErrors` types between server and client so the form's `setError` call is type-safe instead of using `path as FieldPath<...>`.

---

## 5. Ambiguities I Encountered and How I Resolved Them

- **What was unclear**: The brief says "search should work across recipe content" without specifying which fields.
  **Decision I made**: Search matches `title`, `description`, `tags`, `ingredients.name`, and `steps` (case-insensitive substring via escaped regex `$or`).
  **Reasoning**: Users typically search by what they remember — a step's instruction, an ingredient name, a tag, or a title. Excluding any of these would surprise. The escape pass on regex specials is a safety net so a search for `"a.b"` doesn't unintentionally match `"axb"`.

- **What was unclear**: Tag filter semantics — does `?tags=quick,vegan` mean "any of" or "all of"?
  **Decision I made**: ALL specified tags must be present (`$all`).
  **Reasoning**: The brief calls it "filter by tags (multi-select)." Multi-select filters in product UIs almost always mean "narrow further" (AND), not "broaden" (OR). If the user wants OR, they can clear filters and search instead.

- **What was unclear**: The brief lists `title` uniqueness as case-insensitive after trimming, but doesn't say what to do if the user types a title that *would* dedupe to an existing one when normalized.
  **Decision I made**: Reject with a 400 + `fieldErrors.title = ['A recipe with this title already exists']`. Don't silently rename or merge.
  **Reasoning**: Surprising the user with auto-renaming would feel like data loss. A clear error gives them the choice.

- **What was unclear**: Whether to allow `qty: 0` for ingredients (e.g., "salt to taste").
  **Decision I made**: `qty.positive()` — must be > 0.
  **Reasoning**: If the user means "to taste" they can use `qty: 1, unit: 'pinch'` or similar. Allowing 0 invites a class of bugs (division-by-zero in serving-scaling features) and the brief's `{ name, qty, unit }` shape implies a real measurement.

- **What was unclear**: Pagination shape — cursor or page-based?
  **Decision I made**: Page-based (`?page=&limit=`) returning `{ items, total, page, limit }`. Capped at `limit=100`.
  **Reasoning**: The query-key factory in `src/lib/recipe-keys.ts` already had a `cursor?: string` slot, but page numbers are simpler for the MUI `Pagination` component the spec implicitly endorses (it wants paginated *or* scrollable). I used `cursor: String(page)` to fit existing keys.

---

## 6. Changes I Made to Scaffold Config

- **File changed**: `src/lib/schemas/recipe.ts` (renamed in spirit — split into two)
  **What changed**: Added all 5 business rules via `superRefine`, added a case-insensitive unique index on `title`, added `normalizeTitle()` and `titleMatchKey()` helpers, added `RecipeUpdateSchema` for PATCH. Then split the file: zod content moved to `src/lib/schemas/recipe-zod.ts` (NEW), and `src/lib/schemas/recipe.ts` re-exports from it and adds the Mongoose model.
  **Reason**: Required to enforce the business rules (the original file's comment explicitly noted "Business rules ... are part of the interview challenge"). Splitting the file was forced by Next.js bundling — a `'use client'` component that imports `RecipeSchema` would otherwise pull mongoose into the browser, hanging dev compile. The split isolates server-only code while keeping every existing scaffold import path working via the re-export.

- **File changed**: `package.json` — added two dependencies.
  **What changed**: `react-hook-form` and `@hookform/resolvers` (for `zodResolver`).
  **Reason**: The form's per-field server error mapping (e.g. `fieldErrors['ingredients.0.name']` → set under that exact field) is what react-hook-form's `setError` was built for. Hand-rolling that was not worth the time, and zodResolver gives client-side rule enforcement for free.

- **File changed**: `src/app/api/recipes/route.ts`, `src/app/api/recipes/[id]/route.ts`
  **What changed**: Each route uses a small `ensureDB()` helper that no-ops when `mongoose.connection.readyState === 1` (i.e. inside vitest where the test setup already opened a connection) and otherwise delegates to `connectDB()`.
  **Reason**: `src/test/setup.ts` opens its own connection without using the `connectDB` singleton in `src/lib/db.ts`, so calling `connectDB()` from a route during a test throws `Can't call openUri() on an active connection`. Fixing the scaffold's `setup.ts` was outside my edit scope, so I made the route handlers tolerant to either path. Dev/prod behavior is unchanged.

- **File changed**: `src/app/recipes/_components/RecipeForm.tsx`
  **What changed**: Imports run-time zod values from `@/lib/schemas/recipe-zod` (the client-safe module) instead of `@/lib/schemas/recipe`.
  **Reason**: As above — prevents mongoose from being pulled into the client bundle.
