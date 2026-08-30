# Testing and debugging current state

**Checkpoint date:** 30 August 2026 (NZST)  
**Application:** Spray and Wash Operations App  
**Repository:** `Sprayandwash/spray-and-wash-operations-app`

## Current programme position

The agreed regression programmes for Height Equipment, Vehicle Checks, Maintenance and Admin are complete. The full mobile UI audit was also completed through its read-only coverage and follow-up fixes.

The latest verified production source is commit `4e7c652c1dee66193f0cd3f8129cef09bea4ea4f` (**Further centre app shortcut swirl**). GitHub Actions staging build, browser review preflight and protected production release all passed on 30 August 2026; production release run `33306935360` completed successfully.

The latest mobile work delivered:

- the PWA shortcut swirl visually centred; and
- a phone-only Vehicle Checks attention list with asset name and colour-coded due/overdue status, where tapping the asset starts its inspection. The desktop/web table is unchanged.

No Supabase migration, database data change or `config.js` change was included in these releases.

## Testing history status

The permanent `testing-history` branch is current. Its latest Step 9B archive is run `33111671095` from 27 August 2026. No later Step 9B controlled test has been run, so no history archive is missing.

## Next safe action

For any new app change, start at **Step 1 — Define change**, identify the affected journeys, run the relevant automated checks, then complete read-only Staging review where applicable. Step 9B remains a separate, fresh-approval-only controlled write test.

## Safety boundaries

- Production Supabase `twkgfmctuffmkvkmdkct` must not be accessed, queried, changed or tested without explicit user approval.
- Isolated Staging Supabase is `tsnmbvezrweciaitkquf`.
- Never expose passwords, tokens, secret values or raw test-account addresses.
- Do not change `config.js` unless specifically requested.
- Production Pages deployment is manual and protected; a merge to `main` is not authority to publish.

## Related records

- [Run ledger](RUN-LEDGER.md)
- [Recovery guide](RECOVERY-GUIDE.md)
- [Access and recovery handover](ACCESS-AND-RECOVERY-HANDOVER.md)
- [Mobile UI audit plan](MOBILE-UI-AUDIT-PLAN.md)
- [Master regression catalogue](../regression-catalogue.md)
