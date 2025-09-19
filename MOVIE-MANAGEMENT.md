# CinemaFred Movie Management Guide

This guide covers common movie management tasks including deletion, conversion, and querying operations.

## Table of Contents
- [Movie Deletion](#movie-deletion)
- [Movie Conversion](#movie-conversion)
- [Movie Querying](#movie-querying)
- [Important Flags Reference](#important-flags-reference)

---

## Movie Deletion

### 1. Delete MP4 Movie from R2 Only

**⚠️ Warning**: This only deletes the original MP4 file, leaving database entry and HLS files intact.

```bash
# Using the cleanup script (recommended)
npm run cleanup-blobs

# Manual deletion (not recommended - use delete-movie script instead)
# This would require direct R2 API calls
```

### 2. Delete HLS Movie from R2 Only

**⚠️ Warning**: This only deletes HLS files, leaving database entry and original MP4 intact.

```bash
# There's no direct script for this - use the complete deletion method below
# Manual HLS deletion would require R2 API calls to delete hls/{movie-id}/* files
```

### 3. Complete Movie Deletion (Recommended)

**✅ Best Practice**: Delete everything associated with a movie (database entry + all R2 files).

```bash
# Delete a specific movie by ID
npm run delete-movie -- <movie-id>

# Interactive deletion (shows movie details first)
npm run delete-movie

# Examples:
npm run delete-movie -- abc123-def456-ghi789
npm run delete-movie  # Will prompt for movie selection
```

**What gets deleted:**
- Database entry (movie record, ratings, reviews)
- Original MP4 file from R2
- All HLS files from R2 (all quality levels)
- Poster image from R2
- Subtitles from R2 (if any)

---

## Movie Conversion

### 4. Convert Existing Movie Locally

Convert movies using your local machine (faster for powerful hardware):

```bash
# Convert specific movie (deletes original MP4 by default)
npm run convert-to-hls -- --movie-id <movie-id>

# Convert specific movie and keep original MP4
npm run convert-to-hls -- --movie-id <movie-id> --keep-original

# Convert with 480p quality included
npm run convert-to-hls -- --movie-id <movie-id> --include-480p

# Force reconvert existing HLS
npm run convert-to-hls -- --movie-id <movie-id> --force

# Convert all movies that need conversion
npm run convert-to-hls -- --all

# Show conversion statistics
npm run convert-to-hls -- --stats

# Examples:
npm run convert-to-hls -- --movie-id abc123-def456-ghi789
npm run convert-to-hls -- --movie-id abc123-def456-ghi789 --include-480p --keep-original
npm run convert-to-hls -- --all --force
```

### 5. Convert Existing Movie with Cloud Job

Convert movies using Google Cloud Run (better for long-running jobs, runs asynchronously):

```bash
# Convert specific movie (deletes original MP4 by default)
npm run convert-job -- <movie-id>

# Convert specific movie and keep original MP4
npm run convert-job -- <movie-id> --keep-original

# Force reconvert existing HLS
npm run convert-job -- <movie-id> --force

# Convert all movies that need conversion (up to 200 at once)
npm run convert-job -- --all

# Examples:
npm run convert-job -- abc123-def456-ghi789
npm run convert-job -- abc123-def456-ghi789 --keep-original
npm run convert-job -- abc123-def456-ghi789 --force
```

**⚠️ Note**: Cloud jobs run asynchronously in the background. Use monitoring commands to track progress.

**Cloud Job Management:**
```bash
# Check job status
npm run job:status

# View job logs (shows recent activity)
npm run job:logs

# Check conversion progress
npm run conversion-status

# Deploy updated job
npm run job:deploy
```

---

## Movie Querying

### 6. Query Movie IDs and Information

Find movies and get their IDs for other operations:

```bash
# Interactive movie search
npm run query-movie -- --interactive

# Search by title
npm run query-movie -- "Movie Title"

# Search with partial title
npm run query-movie -- "partial"

# List all movies
npm run view-movies

# Check database connection
npm run check-db

# Examples:
npm run query-movie -- "The Matrix"
npm run query-movie -- "matrix"
npm run query-movie -- --interactive  # Browse and select movies
```

**Query Output Includes:**
- Movie ID (for use in other commands)
- Title, Year, Director
- File paths (MP4, HLS, poster)
- Conversion status
- File sizes and storage info

---

## Important Flags Reference

### Conversion Flags

| Flag | Purpose | Default | Scripts |
|------|---------|---------|---------|
| `--force` | Overwrite existing HLS conversion | `false` | All conversion scripts |
| `--delete-original` | Delete original MP4 after conversion | `true` (UI), `false` (scripts) | Local conversion |
| `--keep-original` | Keep original MP4 after conversion | - | Cloud job conversion |
| `--include-480p` | Add 480p quality to HLS | `false` | Local conversion |
| `--all` | Convert all movies needing conversion | - | All conversion scripts |
| `--stats` | Show conversion statistics only | - | Local conversion |

### Behavior Differences

**UI Upload (Automatic):**
- ✅ Deletes original MP4 by default
- ✅ Original quality only
- ✅ Automatic HLS conversion

**Local Conversion (`convert-to-hls`):**
- ❌ Keeps original MP4 by default
- ✅ Original quality only (use `--include-480p` for more)
- ✅ Requires `--force` to overwrite existing HLS

**Cloud Job Conversion (`convert-job`):**
- ✅ Deletes original MP4 by default
- ✅ Original quality only
- ✅ Requires `--force` to overwrite existing HLS

### Protection Mechanisms

**All conversion processes will FAIL unless `--force` is used when:**
- Movie already has HLS conversion in database
- HLS files already exist in R2 storage

**Examples of Protected Operations:**
```bash
# These will FAIL if HLS already exists:
npm run convert-to-hls -- --movie-id abc123
npm run convert-job -- abc123

# These will SUCCEED and overwrite:
npm run convert-to-hls -- --movie-id abc123 --force
npm run convert-job -- abc123 --force
```

---

## Common Workflows

### New Movie Upload
1. Upload via UI → Automatic HLS conversion → Original MP4 deleted

### Existing Movie Conversion
1. Query movie: `npm run query-movie -- "title"`
2. Convert: `npm run convert-to-hls -- --movie-id <id>`
3. Check result: `npm run query-movie -- <id>`

### Bulk Conversion
1. Check stats: `npm run convert-to-hls -- --stats`
2. Convert all: `npm run convert-to-hls -- --all`
3. Monitor progress in logs

### Movie Cleanup
1. Find movie: `npm run query-movie -- "title"`
2. Delete completely: `npm run delete-movie -- <id>`
3. Verify deletion: `npm run query-movie -- <id>` (should not find)

### Force Reconversion
1. Find movie: `npm run query-movie -- "title"`
2. Force convert: `npm run convert-to-hls -- --movie-id <id> --force`
3. Check new HLS: `npm run check-storage -- <id>`

---

## Troubleshooting

### Common Issues

**"Movie already has HLS conversion"**
- Solution: Add `--force` flag to overwrite

**"Movie not found"**
- Solution: Use `npm run query-movie` to find correct ID

**"Original video file missing from R2"**
- Solution: Check if MP4 was accidentally deleted, may need to re-upload

**Cloud job timeout**
- Solution: Job is configured for 5 hours, check logs with `npm run job:logs`

### Getting Help

```bash
# Show help for any script
npm run convert-to-hls -- --help
npm run convert-job -- --help
npm run delete-movie -- --help
npm run query-movie -- --help
```

---

## Safety Tips

1. **Always query first** to confirm movie ID and status
2. **Use `--stats` flag** to see what needs conversion before bulk operations
3. **Test with single movie** before using `--all` flag
4. **Keep backups** of important movies before deletion
5. **Use `--force` carefully** - it will overwrite existing conversions
6. **Monitor storage costs** - HLS files can be large, especially with 480p enabled

