# SDD Progress Ledger — Phase 2 (Job Postings & Candidates CRUD)

Plan: docs/superpowers/plans/2026-08-01-phase2.md
Branch: dev
Base: c71bd21

- [x] Task 1: Backend repositories (58053d5, review clean)

Minor findings to carry to final review:
- job-posting.repository.ts setRequiredSkills is delete-then-insert not wrapped in a transaction (plan-prescribed shape) — acceptable v1.
- skill.repository.ts ILIKE %query% treats %/_ as wildcards — keyword/taxonomy v1 acceptable.
- getRequiredSkillIds has no orderBy (nondeterministic order) — cosmetic.
- job-postings.service.ts assertSkillsExist compares counts → duplicate skillIds in DTO would falsely 404 (dedupe later).
- job-postings.service.ts update() does not resync job_listings_index when an open posting's title/description is edited (stale public index) — flag for next milestone.
- No unit test covers update() or idempotent close short-circuit.
- list(@Query('status')) passes unvalidated status to repo — worth a query-param schema later.
- [x] Task 2: Job postings module (7fc074a, review clean; spec assertion relaxed by implementer — legitimate fix)
- [x] Task 3: Candidates + Skills + seed (d1dbe47, review clean; "44" wording wrong — list is 42, matches source of truth)
- [x] Task 4: Frontend api + hooks (e10d80a, review clean)
- Minor from Task 4 review to carry: useJobPosting(id) detail key `['org','job-postings',id]` is never invalidated after update/publish/close/delete (v5 partialMatchKey: empty object {} doesn't match string segment) → stale detail view. Fix in Task 5 or fold into hooks.
- [x] Task 5: Frontend components + routes (b56fe60, review clean; routeTree.gen.ts gitignored — commit is 7 source files; build=vite build only, typecheck=tsc -b)
- Minor from Task 5 review to carry: JobPostingForm resets form before async submit settles (input lost on failure); Publish/Close/Delete buttons not disabled while pending (double-click dupes); stale form values after close-without-submit. All brief-verbatim polish.
- [x] Task 6: Full verification — backend gate 45/45, seed ok (42 skills; fixed 42P08 untyped params `$1::uuid`), smoke test PASS (signin→create→list→publish→close→candidate→list→skills), job_listings_index synced, frontend gate (tsc+build+lint) PASS. **Critical fix: RolesGuard authenticated via JWT before role check (6f705c5).** Seed cast fix + prettier (62b8f2d).
- [x] Task 7: Final whole-branch review — Phase 2 complete; 2 Important fixes (update() index resync + role-guard tests) applied in 2760aa0; 51/51 tests, typecheck + lint green.
