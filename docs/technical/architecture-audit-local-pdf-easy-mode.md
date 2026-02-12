# Architecture Audit: Chat Assistant PDF Answering in Local/Easy Mode

Date: 2026-02-12

## Scope
This audit reviews the ingestion/indexing path used when users upload PDF documents while Google Drive integration is disabled ("easy mode").

## Current Flow (post-fix)
1. `DocumentController.upload` accepts a file via multer disk storage.
2. If Drive is configured, file is uploaded to Drive and indexed by Drive file ID.
3. If Drive is not configured, controller passes `localFilePath` to `SyncService.indexFile`.
4. `SyncService.indexFile` reads file bytes from local path, extracts text, chunks, embeds, and writes vectors/metadata.
5. Controller always deletes the temp upload file in `finally`.

## Findings

### ✅ Strengths
- **Single indexing pipeline** for both Drive and local modes avoids duplicated chunk/embed logic.
- **Best-effort indexing behavior** still records metadata/history on extraction failures, preserving operational observability.
- **Saga-based upload orchestration** keeps rollback strategy consistent for Drive-backed uploads.

### ⚠️ Risks / Trade-offs
1. **Mixed source concerns in `SyncService.indexFile`**
   - Method now handles both remote (Drive) and local (disk) sources through options.
   - This is practical, but keeps source-selection logic embedded in indexing logic.

2. **Temp-file lifecycle coupling**
   - Controller owns deletion, while service depends on path validity.
   - Any future async deferral/background queue must copy or persist source before controller cleanup.

3. **Memory scaling for very large files**
   - Local mode currently reads entire file into memory before extraction.
   - Existing upload cap (10MB) limits immediate impact, but scale concerns remain if cap increases.

4. **Observability granularity**
   - History records indexed/pending status, but source mode (`drive` vs `local`) is not explicit in event payload.

## Recommendations

### Near-term (low risk)
1. ✅ Add explicit `source: 'drive' | 'local'` metadata to sync/history events for easier debugging and metrics.
2. ✅ Add unit test at `SyncService` level to assert local path branch behavior independently of controller mocks.
3. ✅ Keep upload size limit aligned with extraction memory model; upload middleware currently enforces 10MB max.

### Mid-term (moderate refactor)
1. Introduce a small `DocumentContentProvider` abstraction:
   - `DriveContentProvider(fileId)`
   - `LocalFileContentProvider(path)`
2. `SyncService.indexFile` should depend on provider interface (`getBuffer()`/`getText()`), not source conditionals.
3. Move source-type selection to controller/ingestion boundary to keep indexing service source-agnostic.

## Audit Conclusion
The functionality is now **correct for local/easy mode** and materially improves answer quality for locally uploaded PDFs. The design is acceptable for current scale and constraints, with the primary architectural debt being source-selection coupling inside `SyncService.indexFile`.

## Follow-up Implementation Notes
- Indexing now avoids embedding placeholder error text when extraction fails. Instead, the sync status is set to `NO_CONTENT` and the document remains metadata-only until reprocessing succeeds.
- `NO_CONTENT` now propagates to the upload controller as an indexing failure signal, so API responses/history correctly report `indexingStatus: pending` for non-extractable files.
