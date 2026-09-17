# ADIP — GPS Rewrite Final Report

## Status

- Baseline: `d25aafb`
- Implementation: complete
- Automated validation: green
- Physical Android validation: pending
- Commit/push: completed after documentation update

## 27-item verification summary

| # | Verification | Class |
|---:|---|---|
| 1 | No continuous GPS polling loop | PROVEN |
| 2 | Initial GPS begins only on camera-ready | PROVEN |
| 3 | Movement >10 m triggers refresh | PROVEN |
| 4 | Manual tap refresh | PROVEN |
| 5 | Stale trigger at 5 minutes | PROVEN |
| 6 | Shutter-time recovery when no usable fix | PROVEN |
| 7 | Accepted fix resets movement reference | PROVEN |
| 8 | Accepted fix resets fix timestamp | PROVEN |
| 9 | Three independent parallel requests per capture attempt | PROVEN |
| 10 | Best fix is lowest accuracy | PROVEN |
| 11 | Five-second per-attempt deadline | PROVEN |
| 12 | Maximum three attempts | PROVEN |
| 13 | GPS mandatory; no valid fix means no photo | PROVEN |
| 14 | Stale-but-accurate fixes rejected | PROVEN |
| 15 | Accuracy gate <=50 m | PROVEN |
| 16 | Shared one-shot join for auto/manual refresh | PROVEN |
| 17 | Capture GPS uses independent parallel batch | PROVEN |
| 18 | First-started accuracy governs shared request | STRONG EVIDENCE |
| 19 | Fresh acceptable last-known fix seeds cold start | PROVEN |
| 20 | Cold-start retries are bounded | PROVEN |
| 21 | Permission denied means no device query | PROVEN |
| 22 | Unmount removes watcher; remount does not duplicate it | PROVEN |
| 23 | Stale trigger armed once per stale epoch | PROVEN |
| 24 | Movement watcher only detects movement; it does not adopt coordinates | PROVEN |
| 25 | Superseding capture isolates results | PROVEN |
| 26 | Status lifecycle and non-GPS regression preserved | STRONG EVIDENCE |
| 27 | Real Android GPS/hardware/permission/battery behavior | UNKNOWN |

## Tally

- PROVEN: 24
- STRONG EVIDENCE: 2
- POSSIBLE: 0
- NOT A PROBLEM: 0
- UNKNOWN: 1

## Automated validation

- Jest: 188 suites / 2476 tests passing
- TypeScript: 0 errors
- ESLint: 0 errors / 1596 warnings (reported as one fewer warning than the stated 1597 baseline)
- GPS tests in `useGpsTracker.test.tsx`: 48 tests

## Changed files

- `frontend/src/config/captureConfig.ts`
- `frontend/src/components/camera/gpsPolicy.ts`
- `frontend/src/components/camera/useGpsTracker.ts`
- `frontend/app/inspection/capture.tsx`
- `frontend/src/__tests__/components/camera/useGpsTracker.test.tsx`
- `frontend/src/__tests__/components/camera/gpsPolicy.test.ts`

## Remaining validation

Item 27 remains UNKNOWN until the built APK is tested on a physical Android device. Automated tests use the repository's Expo Location mock and therefore cannot prove real GPS hardware behavior, permission dialogs, or battery impact.

No code fix is implied by this report; physical-device verification is the remaining validation gate.
