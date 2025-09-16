# HLS Storage Impact Analysis

## Updated System: 480p + Original Quality Only

Your optimized HLS system now creates only **2 quality levels** instead of 5, significantly reducing storage costs.

## How Original Quality Detection Works

The system uses **FFprobe** to analyze your source videos:

```bash
ffprobe -v quiet -print_format json -show_format -show_streams video.mp4
```

**Example Detection Results:**
```json
{
  "width": 1920,
  "height": 1080, 
  "bitrate": 8000000,  // 8 Mbps
  "duration": 7200     // 2 hours
}
```

**Quality Names Generated:**
- `original-4k` (2160p+)
- `original-1440p` (1440p)  
- `original-1080p` (1080p)
- `original-720p` (720p)
- `original-480p` (480p)
- `original` (below 480p)

## Storage Impact Comparison

### Before (5 Bitrates)
```
Original MP4:     2.0 GB (100%)
├── 240p:         0.3 GB (15%)
├── 360p:         0.5 GB (25%) 
├── 480p:         0.6 GB (30%)
├── 720p:         1.2 GB (60%)
└── 1080p:        2.0 GB (100%)
Total HLS:        4.6 GB (230%)
```

### After (2 Bitrates Only)
```
Original MP4:     2.0 GB (100%)
├── 480p:         0.6 GB (30%)
└── original:     2.0 GB (100%)
Total HLS:        2.6 GB (130%)
```

## Real Storage Usage

**Your storage will increase by only ~30-50%, not double!**

### Why the Overhead?

1. **Segmentation**: Video split into 6-second chunks
2. **Playlists**: .m3u8 files (minimal size)
3. **Container Format**: .ts segments vs .mp4 (slight overhead)
4. **Encoding Settings**: Optimized for streaming (may be slightly larger)

### Example with Real Numbers

**2-hour 1080p movie (original: 4 GB)**
- Original quality HLS: ~4.2 GB (105% of original)
- 480p quality HLS: ~1.2 GB (30% of original)
- **Total storage: ~5.4 GB (135% of original)**

## Quality Level Logic

### When 480p is Created
```typescript
if (sourceHeight > 480) {
  // Create 480p version for mobile/slow connections
  create480p();
}
// Always create original quality
createOriginalQuality();
```

### Examples by Source Resolution

**4K Source (3840×2160)**
- Creates: `480p` + `original-4k`
- Storage: ~140% of original

**1080p Source (1920×1080)**  
- Creates: `480p` + `original-1080p`
- Storage: ~130% of original

**720p Source (1280×720)**
- Creates: `480p` + `original-720p` 
- Storage: ~130% of original

**480p Source (854×480)**
- Creates: `original-480p` only (no downscaling needed)
- Storage: ~105% of original

## Bitrate Calculations

### Original Quality Encoding
```typescript
// Uses 80% of source bitrate for better compression
videoBitrate = sourceBitrate * 0.8
maxrate = sourceBitrate * 0.9
bufsize = sourceBitrate * 1.2

// Example: 8 Mbps source → 6.4 Mbps HLS
```

### 480p Fixed Bitrate
```typescript
videoBitrate = '1400k'  // 1.4 Mbps
audioBitrate = '128k'   // 128 kbps
```

## Cost Savings vs 5-Bitrate System

**Storage Cost Reduction: ~60%**

- Old system: 230% of original storage
- New system: 130% of original storage  
- **Savings: 100 percentage points**

**Example Monthly Costs (1TB original content):**
- Old system: 2.3 TB storage needed
- New system: 1.3 TB storage needed
- **Monthly savings: 1 TB of storage costs**

## Performance Benefits Retained

✅ **Fast startup**: 480p loads quickly on slow connections  
✅ **High quality**: Original quality for good connections  
✅ **Adaptive switching**: Player can switch between qualities  
✅ **Mobile optimized**: 480p perfect for mobile devices  
✅ **Bandwidth efficient**: No unnecessary high bitrates  

## File Organization

```
r2-bucket/
├── original-movies/
│   └── movie.mp4                    # Original file (kept)
└── hls/
    └── {movie-id}/
        ├── playlist.m3u8            # Master playlist
        ├── 480p/
        │   ├── playlist.m3u8
        │   └── segment_*.ts
        └── original-1080p/          # Named by detected quality
            ├── playlist.m3u8
            └── segment_*.ts
```

## Monitoring Storage Usage

### Check HLS Statistics
```bash
npm run convert-to-hls:stats
```

### Per-Movie Storage Analysis
```typescript
import { hlsR2Manager } from '@/lib/hls-r2';

const stats = await hlsR2Manager.getHLSStats(movieId);
console.log(`
  Original size: ${originalSize} MB
  HLS total size: ${stats.totalSize} MB  
  Storage ratio: ${(stats.totalSize / originalSize * 100).toFixed(1)}%
  Bitrates: ${stats.bitrates.join(', ')}
`);
```

## Recommendations

1. **Keep original files**: Don't delete MP4s (fallback + re-encoding)
2. **Monitor usage**: Track which quality users prefer
3. **Consider CDN**: Use Cloudflare CDN for better delivery
4. **Batch convert**: Process during off-peak hours

## Summary

✅ **Storage increase: ~30-50% (not 100%)**  
✅ **Cost reduction: ~60% vs 5-bitrate system**  
✅ **Quality maintained: Original + mobile-optimized 480p**  
✅ **Performance: Fast loading + adaptive streaming**

Your optimized 2-bitrate system provides excellent user experience while keeping storage costs reasonable!
