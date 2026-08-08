# Deferred Work

## Deferred from: code review of 1-1-set-up-the-initial-project-from-the-official-starter (2026-08-08)

- Home's `"ok"` kind with non-empty hits is never rendered by `app/routes/home.tsx` — unreachable today since the catalog is provably always empty in this story, but must be addressed before Story 1.4 populates real hits.
- `MoneyCentavosSchema` (`src/contracts/search-page.ts:32`) requires `.positive()`, which would reject a legitimate zero/free-price listing. Not reachable until real prices are populated (Story 1.4+); revisit money-schema nullability/zero handling then.
