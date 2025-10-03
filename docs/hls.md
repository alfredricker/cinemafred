# HLS Video Streaming Setup

This document explains how to use the HLS (HTTP Live Streaming) system for your CinemaFred application.

## Overview

The HLS system automatically converts your MP4 videos into multiple bitrate segments, enabling:
- **Adaptive streaming** - Quality adjusts based on user's bandwidth
- **Reduced buffering** - Videos start playing faster
- **Better user experience** - Smooth playback across different devices
- **Bandwidth optimization** - Users get the best quality their connection can handle

## File Organization

HLS files are organized in R2 storage as follows:

```
hls/
├── {movie-id}/
│   ├── playlist.m3u8           # Master playlist
│   ├── 240p/
│   │   ├── playlist.m3u8       # 240p bitrate playlist
│   │   ├── segment_000.ts      # Video segments
│   │   ├── segment_001.ts
│   │   └── ...
│   ├── 360p/
│   │   ├── playlist.m3u8
│   │   └── segments...
│   ├── 480p/
│   ├── 720p/
│   └── 1080p/
```

## Available Scripts

### 1. Convert Existing Movies

```bash
# Check conversion statistics
npm run convert-to-hls:stats

# Convert all movies that need HLS (skips already converted)
npm run convert-to-hls

# Force reconvert all movies (including already converted)
npm run convert-to-hls:force

# Convert specific movie by ID
npm run convert-to-hls -- --movie-id "your-movie-id"
```

### 2. Manual Video Segmentation

```bash
# Segment a specific video file
npm run segment-video /path/to/video.mp4 movie-id-here

# With custom segment duration (default is 6 seconds)
npm run segment-video /path/to/video.mp4 movie-id-here 10
```

## Bitrate Configurations

The system automatically creates multiple quality levels:

| Quality | Resolution | Video Bitrate | Audio Bitrate | Use Case |
|---------|------------|---------------|---------------|----------|
| 240p    | 426×240    | 400k          | 64k           | Very slow connections |
| 360p    | 640×360    | 800k          | 96k           | Mobile/slow connections |
| 480p    | 854×480    | 1400k         | 128k          | Standard mobile |
| 720p    | 1280×720   | 2800k         | 128k          | HD streaming |
| 1080p   | 1920×1080  | 5000k         | 192k          | Full HD |

**Note:** Only bitrates with resolutions ≤ source video resolution are created.

## Database Schema

The Movie model now includes HLS support:

```prisma
model Movie {
  // ... existing fields
  r2_hls_path  String?  // Path to HLS master playlist
  hls_ready    Boolean  @default(false) // Whether HLS is ready
}
```

## Conversion Method

HLS conversion is handled through **CLI scripts** rather than API endpoints. Use the npm scripts documented above to convert videos.

## Usage Examples

### 1. Convert All Existing Movies

```bash
# First, check what needs conversion
npm run convert-to-hls:stats

# Output example:
# 📊 Conversion Statistics:
#    Total movies: 15
#    Already converted: 3
#    Need conversion: 12

# Convert all movies that need it
npm run convert-to-hls
```

### 2. Convert a Specific Movie

```bash
npm run convert-to-hls -- --movie-id "123e4567-e89b-12d3-a456-426614174000"
```

### 3. Monitor Conversion Progress

The conversion script shows real-time progress:

```
🎬 Starting conversion of existing movies to HLS format...

📊 Found 12 movies to convert
⚙️  Processing in batches of 5

🔄 Processing batch 1/3
🔄 Converting: The Matrix (123e4567...)
📥 Downloading matrix_video.mp4 from R2...
📁 Downloaded to: /tmp/123e4567.mp4 (1.2 GB)
240p: time=02:16:40.0
360p: time=02:16:40.0
480p: time=02:16:40.0
720p: time=02:16:40.0
✅ Converted: The Matrix -> hls/123e4567/playlist.m3u8

📊 Progress: 5/12 (41.7%) | ✅ 4 | ❌ 1
```

## Error Handling

### Conversion Errors

Failed conversions are logged to `conversion-errors.log`:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "movieId": "123e4567-e89b-12d3-a456-426614174000",
  "movieTitle": "Example Movie",
  "videoPath": "api/movie/example.mp4",
  "error": "FFmpeg failed with code 1",
  "stack": "Error: FFmpeg failed..."
}
```

### Common Issues

1. **FFmpeg not installed**
   ```bash
   # Install FFmpeg
   sudo apt update && sudo apt install ffmpeg  # Ubuntu/Debian
   brew install ffmpeg                         # macOS
   ```

2. **Insufficient disk space**
   - HLS processing requires temporary storage (2-3x original file size)
   - Ensure adequate space in `/tmp` or set custom temp directory

3. **R2 connection issues**
   - Check environment variables: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, etc.
   - Verify R2 bucket permissions

## Performance Considerations

### Processing Time

- **240p**: ~0.5x real-time (2-hour movie = 1 hour processing)
- **360p**: ~0.7x real-time
- **480p**: ~1.0x real-time
- **720p**: ~1.5x real-time
- **1080p**: ~2.0x real-time

**Total time**: ~5-6x real-time for all bitrates combined

### Storage Requirements

HLS segments typically use **1.5-2x** the storage of the original file:

- Original MP4: 2 GB
- HLS segments (all bitrates): ~3-4 GB

### Batch Processing

- Default batch size: 5 movies simultaneously
- Adjust based on available CPU/memory
- Use `--batch-size N` to customize

## Monitoring and Validation

### Check HLS Status

```typescript
import { hlsR2Manager } from '@/lib/hls-r2';

// Check if HLS exists for a movie
const hlsInfo = await hlsR2Manager.checkHLSExists(movieId);
console.log(hlsInfo);
// {
//   masterPlaylist: true,
//   bitrates: ['240p', '360p', '480p', '720p'],
//   segmentCount: { '240p': 120, '360p': 120, ... }
// }

// Get detailed statistics
const stats = await hlsR2Manager.getHLSStats(movieId);
console.log(stats);
// {
//   exists: true,
//   bitrates: ['240p', '360p', '480p', '720p'],
//   totalSegments: 480,
//   totalSize: 2147483648,
//   estimatedDuration: 720
// }

// Validate HLS structure
const validation = await hlsR2Manager.validateHLSStructure(movieId);
console.log(validation);
// {
//   valid: true,
//   issues: [],
//   recommendations: ['Consider adding more bitrate variants']
// }
```

## Integration with Video Player

The video player will automatically detect and use HLS when available:

1. Check if `movie.hls_ready` is `true`
2. Use `movie.r2_hls_path` for HLS streaming
3. Fallback to `movie.r2_video_path` for direct MP4 streaming

## Maintenance

### Cleanup HLS Files

```typescript
import { hlsR2Manager } from '@/lib/hls-r2';

// Delete all HLS files for a movie
await hlsR2Manager.deleteHLSFiles(movieId);
```

### Regenerate HLS

```bash
# Force regenerate HLS for a specific movie
npm run convert-to-hls -- --movie-id "movie-id" --force

# Or via API
curl -X POST /api/movies/process-hls \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"movieId": "movie-id", "forceReprocess": true}'
```

## Troubleshooting

### Check FFmpeg Installation

```bash
ffmpeg -version
ffprobe -version
```

### Test Video Processing

```bash
# Test with a small video file first
npm run segment-video /path/to/small-test.mp4 test-movie-id
```

### Check R2 Connectivity

```bash
npm run check-db  # This also tests R2 connection
```

### View Conversion Logs

```bash
# Real-time logs during conversion
tail -f conversion-errors.log

# Check specific movie in database
npm run view-movies
```

## Next Steps

1. **Convert existing movies**: `npm run convert-to-hls`
2. **Update video player** to use HLS when available
3. **Monitor performance** and adjust bitrate configurations as needed
4. **Set up automated processing** for new uploads

For questions or issues, check the conversion error logs or contact the development team.
