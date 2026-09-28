# Active Task — Repair Android JSON import feedback and file reading

Status: Ready for handset retest, 2026-09-26.

## Goal

Make JSON imports reliable in the Android WebView and make import results visible where the file is selected.

## Change

- Read selected files with `FileReader` and strip an optional UTF-8 byte-order mark before JSON parsing.
- Show import/export errors and success messages inside the Import and Export section.
- Preserve the same replace/restore operations and confirmation flow.

## Verification

- `npm run build` passed TypeScript checking and the web production build.
- `npx cap sync android` completed.
- `gradlew assembleDebug` succeeded and produced `android/app/build/outputs/apk/debug/DentForLelikovsky.apk`.
- Importing a JSON file on the physical phone still needs confirmation.
