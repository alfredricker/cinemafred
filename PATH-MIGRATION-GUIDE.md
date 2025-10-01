# R2 Path Migration Guide

## Overview

This guide explains how to migrate your database from the old path format (`api/movie/filename.ext`) to the new organized R2 structure (`images/`, `subtitles/`, `movies/`).

## Current State

### Database Paths (OLD - Need to be updated)
```json
{
  "r2_image_path": "api/movie/5centimeters.jpg",
  "r2_video_path": "api/movie/5centimeters.mp4",
  "r2_subtitles_path": "5centimeters.srt"
}
```

### R2 Storage (NEW - Already reorganized)
- ✅ Images are in `images/` folder
- ✅ Subtitles are in `subtitles/` folder
- ✅ Videos are in `movies/` folder
- ✅ HLS segments are in `hls/{movieId}/` folders

## Migration Steps

### Step 1: Move Subtitles from `images/` to `subtitles/`

If you've already run the reorganization script and subtitles ended up in `images/`, run:

```bash
npm run reorganize-r2-storage
```

This will move all `.srt` files from `images/` to `subtitles/`.

### Step 2: Update Database Paths

Run the database migration script to update all movie entries:

```bash
npm run migrate-db-paths
```

This script will:
- ✅ Convert `api/movie/poster.jpg` → `images/poster.jpg`
- ✅ Convert `api/movie/video.mp4` → `movies/video.mp4`
- ✅ Convert `api/movie/subtitles.srt` → `subtitles/subtitles.srt`
- ✅ Convert root-level files to organized paths
- ✅ Skip files that are already correctly formatted

### Step 3: Verify

After migration, your database should have:

```json
{
  "r2_image_path": "images/5centimeters.jpg",
  "r2_video_path": "movies/5centimeters.mp4",
  "r2_subtitles_path": "subtitles/5centimeters.srt"
}
```

## How the System Works

### Frontend
Constructs URLs using the database path:
```tsx
// Images
`/api/movie/${movie.r2_image_path}` → `/api/movie/images/filename.jpg`

// Subtitles
`/api/movie/${movie.r2_subtitles_path}` → `/api/movie/subtitles/filename.srt`
```

### Backend API Routes

#### `/api/movie/[file]/route.ts`
- Receives the full path from the URL (e.g., `images/filename.jpg`)
- Uses it directly as the R2 key
- Handles file type detection and streaming
- Converts SRT to WebVTT for subtitles

#### `/api/stream/[movieId]/route.ts`
- Fetches video path from database
- Uses the path directly as R2 key (e.g., `movies/filename.mp4`)
- Handles range requests for video streaming

#### `/api/upload/route.ts`
- New uploads automatically go to organized paths:
  - Videos → `movies/`
  - Images → `images/`
  - Subtitles → `subtitles/`

## Backend Routes Status

All backend routes are **already compatible** with the new path structure:

- ✅ `/api/upload/route.ts` - Creates organized paths
- ✅ `/api/movies/poster/route.ts` - Uploads to `images/`
- ✅ `/api/movie/[file]/route.ts` - Uses paths directly
- ✅ `/api/stream/[movieId]/route.ts` - Uses paths directly
- ✅ `/api/movies/process-hls/route.ts` - Uses paths directly
- ✅ Frontend components - Already construct correct URLs

## No Code Changes Required!

The backend and frontend are **already set up correctly**. You just need to:

1. Run the R2 reorganization script (if not already done)
2. Run the database migration script
3. Everything will work automatically

## Rollback Plan

If you need to rollback, the database migration script is non-destructive and only updates paths. However, if you've already moved files in R2, you would need to:

1. Move files back in R2 to their original locations
2. Manually update database paths back to old format

**Recommendation:** Test on a backup first or verify your R2 storage structure matches the new format before running the migration.

