# File Structure Migration Summary

## Overview
This migration removes the `api/movie/` prefix from the database paths and reorganizes R2 storage into proper namespaces.

## New R2 Structure

### Before (Old)
- Database: `api/movie/poster.jpg`
- R2 Storage: `poster.jpg` (flat structure)

### After (New)
- Database: `images/poster.jpg`
- R2 Storage: `images/poster.jpg` (organized structure)

### Namespace Organization
- **Videos**: `movies/{filename}.mp4`
- **Images**: `images/{filename}.jpg`
- **Subtitles**: `subtitles/{filename}.srt`
- **HLS**: `hls/{movie-id}/` (unchanged)

## Changes Made

### 1. Backend API Routes

#### ✅ `/api/upload/route.ts`
- Already configured to upload files to organized paths
- Creates proper namespaces: `movies/`, `images/`, `subtitles/`

#### ✅ `/api/movies/poster/route.ts`
- **Fixed**: Now uploads posters to `images/` prefix in R2 (was uploading to root)
- Returns organized path: `images/poster_timestamp_random.jpg`

#### ✅ `/api/stream/[movieId]/route.ts`
- **Removed**: `api/movie/` prefix stripping
- Now uses database path directly for R2 lookup

#### ✅ `/api/movies/process-hls/route.ts`
- **Removed**: `api/movie/` prefix stripping in `downloadVideoFromR2` function
- Uses database path directly

### 2. Frontend Components

#### ✅ `CreateMovieForm.tsx`
- **Fixed bug**: Undefined variables `videoData`, `imageData`, `subtitlesData`
- Now uses `videoPath`, `imagePath`, `subtitlesPath` from upload results
- Correctly passes organized paths to database

#### ✅ `EditMovieForm.tsx`
- **Updated placeholders**: 
  - `images/image.jpg` (was `api/movie/image.jpg`)
  - `movies/video.mp4` (was `api/movie/video.mp4`)
  - `subtitles/subtitles.vtt` (was `api/movie/subtitles.vtt`)

#### ✅ `MovieCard.tsx`
- **Updated comments**: Clarified that database stores organized paths
- No code changes needed (already correct)

#### ✅ `MovieDetailsModal.tsx`
- **Updated comments**: Clarified path structure
- No code changes needed (already correct)

#### ✅ `/app/movie/[id]/page.tsx`
- **Fixed**: Removed `.split('/').pop()` from poster and subtitle URLs
- Now uses full path from database

### 3. Services & Scripts

#### ✅ `src/services/video-processing.ts`
- **Removed**: `stripApiPrefix` function (no longer needed)
- **Updated**: `downloadVideoFromR2` to use paths directly
- **Updated**: `deleteOriginalFromR2` to use paths directly

#### ✅ `scripts/hls/convert-existing-movies.ts`
- **Removed**: `api/movie/` prefix stripping in `downloadVideoFromR2`
- Uses database path directly

#### ✅ `scripts/hls/convert-existing-movies-gpu.ts`
- **Removed**: `api/movie/` prefix stripping in `downloadVideoFromR2`
- Uses database path directly

## Migration Process

### Prerequisites
The following scripts are available for migration:
1. `scripts/migrate-file-structure.ts` - Migrates files in R2 storage
2. `scripts/cleanup-api-prefix.ts` - Updates database paths
3. `scripts/full-migration.ts` - Runs complete migration process

### Running the Migration

```bash
# Option 1: Run full automated migration
npm run full-migration

# Option 2: Run steps manually
npm run check-paths          # Check current state
npm run migrate-structure    # Migrate R2 files
npm run cleanup-prefix       # Update database
npm run check-paths          # Verify migration
```

### What the Migration Does

1. **File Migration** (`migrate-structure`):
   - Copies files from flat structure to organized namespaces in R2
   - `poster.jpg` → `images/poster.jpg`
   - `video.mp4` → `movies/video.mp4`
   - `subtitles.srt` → `subtitles/subtitles.srt`

2. **Database Update** (`cleanup-prefix`):
   - Updates all movie records in database
   - `api/movie/poster.jpg` → `images/poster.jpg`
   - `api/movie/video.mp4` → `movies/video.mp4`
   - `api/movie/subtitles.srt` → `subtitles/subtitles.srt`

### Important Notes

⚠️ **Before Migration**:
- Backup your database
- Ensure R2 bucket has sufficient storage (files will be duplicated during migration)
- Test migration on a staging environment first

✅ **After Migration**:
- Old files in R2 (flat structure) can be deleted after verification
- All new uploads will automatically use organized structure
- HLS conversion scripts will work with new path structure

## File Serving

The `/api/movie/[file]/route.ts` endpoint continues to work:
- Accepts full path: `/api/movie/images/poster.jpg`
- Accepts full path: `/api/movie/movies/video.mp4`
- Fetches directly from R2 using the provided path

## Testing

After migration, verify:
1. ✅ Movie posters display correctly
2. ✅ Video streaming works
3. ✅ Subtitles load properly
4. ✅ New movie uploads work
5. ✅ HLS conversion works
6. ✅ Edit movie form displays correct paths

## Rollback

If migration fails:
1. Restore database from backup
2. Old files in R2 are still present (in flat structure)
3. Revert code changes if needed

## Database Schema

No schema changes required - paths are stored as `String` fields:
- `r2_image_path` (String)
- `r2_video_path` (String)
- `r2_subtitles_path` (String?)
- `r2_hls_path` (String?)

## Summary

All code is now ready for the organized file structure. The migration scripts will handle:
- Moving files in R2 from flat to organized structure
- Updating database paths to remove `api/movie/` prefix
- Verifying the migration was successful

After running the migration, the application will:
- ✅ Store new files in organized namespaces
- ✅ Correctly reference files in database
- ✅ Serve files from organized paths
- ✅ Work seamlessly with existing HLS conversion
