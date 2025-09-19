# CinemaFred Cloud Run Jobs Setup

This project now uses **Cloud Run Jobs** instead of Cloud Run Services for video conversion. This provides better reliability, no HTTP timeouts, and cost-effective batch processing.

## 🎯 Core Functionality Maintained

✅ **Download**: Movies from R2 storage  
✅ **Convert**: Video to HLS format with FFmpeg (original quality + 480p if source ≥720p)  
✅ **Upload**: Segmented HLS files to R2 in `hls/[movieId]/` structure  
✅ **Database**: Update movie records with HLS paths  
✅ **Webhooks**: Notify completion status  

## 🚀 Quick Start

### 1. Setup (one-time)
```bash
npm run job:setup
```

### 2. Build & Deploy
```bash
npm run job:build
npm run job:deploy
```

### 3. Convert Videos

**Single movie:**
```bash
npm run convert-job -- <movie-id>
```

**All movies:**
```bash
npm run convert-job -- --all
```

**Using job manager directly:**
```bash
npm run job:run <movie-id> <webhook-url>
```

## 📋 Available Commands

| Command | Description |
|---------|-------------|
| `npm run job:build` | Build and push container image |
| `npm run job:deploy` | Deploy job to Cloud Run Jobs |
| `npm run job:run <movie-id> <webhook-url>` | Execute conversion job |
| `npm run job:logs` | Show recent job execution logs |
| `npm run job:status` | Check job status and recent executions |
| `npm run job:cleanup` | Clean up old container images |
| `npm run convert-job` | List movies available for conversion |
| `npm run convert-job -- <movie-id>` | Convert specific movie |
| `npm run convert-job -- --all` | Convert all movies needing conversion |

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Next.js App   │───▶│  Cloud Run Job   │───▶│   R2 Storage    │
│  (Job Trigger)  │    │ (Video Convert)  │    │ (HLS Output)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         │                        ▼                        │
         │              ┌──────────────────┐               │
         │              │    Database      │               │
         └──────────────│  (Update HLS)    │◀──────────────┘
                        └──────────────────┘
```

## 🔄 Conversion Flow

1. **Job Trigger**: `JobConverter.convertExisting()` starts Cloud Run Job
2. **Download**: Job downloads video from R2 storage  
3. **Convert**: FFmpeg processes video into HLS segments
4. **Upload**: Segments uploaded to R2 in organized structure:
   ```
   hls/[movieId]/
   ├── playlist.m3u8 (master)
   ├── original-1080p/
   │   ├── playlist.m3u8
   │   └── segment*.ts
   └── 480p/
       ├── playlist.m3u8
       └── segment*.ts
   ```
5. **Update**: Database updated with HLS path
6. **Webhook**: Completion notification sent
7. **Cleanup**: Temporary files removed, job exits

## 🛠️ Benefits of Cloud Run Jobs

- **No HTTP timeouts** - Jobs can run for hours
- **Better resource management** - Designed for batch processing  
- **Cost effective** - Only pay for actual processing time
- **Automatic scaling** - Parallel execution for multiple videos
- **Better monitoring** - Job-specific logs and status tracking
- **Reliability** - Built-in retry mechanisms

## 🔍 Monitoring

**Check job status:**
```bash
npm run job:status
```

**View logs:**
```bash
npm run job:logs
```

**Monitor in Google Cloud Console:**
- Navigate to Cloud Run → Jobs → hls-converter-job
- View executions, logs, and metrics

## 🧹 Maintenance

**Clean up old images:**
```bash
npm run job:cleanup
```

**Update job configuration:**
```bash
npm run job:deploy  # Redeploy with new settings
```

## 🚨 Troubleshooting

**Job fails to start:**
- Check authentication: `gcloud auth list`
- Verify project: `gcloud config get-value project`
- Check job exists: `npm run job:status`

**Conversion fails:**
- Check logs: `npm run job:logs`
- Verify video file exists in R2
- Check database connectivity

**Webhook not received:**
- Verify webhook URL is accessible
- Check Next.js app logs
- Ensure `/api/webhooks/conversion` endpoint is working
