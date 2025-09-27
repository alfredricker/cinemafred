# CinemaFred Upload GUI Setup

## Installation

1. Install dependencies:
```bash
cd /home/fred/Projects/cinemafred/upload-gui
npm install
```

2. Install Rust dependencies:
```bash
cd src-tauri
cargo build
```

## Running the Application

To run in development mode:
```bash
npm run tauri dev
```

To build for production:
```bash
npm run tauri build
```

## Features Implemented

### ✅ Settings Popup
- **R2 Configuration**: Account ID, Access Key, Secret Key, Bucket Name
- **GPU Settings**: Enable/disable GPU acceleration with detection
- **Processing Settings**: Parallel processing count (1-4 files)
- **Deletion Settings**: Configure what files to keep/delete
- **Quality Settings**: Option to include 480p quality
- **Connection Testing**: Test R2 credentials
- **Persistent Storage**: Settings are saved locally

### Settings Details

#### R2 Configuration
- All fields are required for the app to function
- Password field has show/hide toggle
- Test connection button validates credentials
- Settings are stored securely using Tauri's store plugin

#### GPU Settings
- Automatically detects available GPU hardware
- Shows NVIDIA, AMD, and Intel GPU status
- Displays recommended encoder
- Refresh button to re-detect GPU capabilities

#### Processing Settings
- Parallel processing: 1-4 files (default: 2)
- Maximum parallel processing: up to 4 files
- Slider controls with live value display

#### File Management
- Delete original after conversion (default: false)
- Clean up temporary HLS files (default: true)
- Keep original MP4 files (default: true)

#### Quality Settings
- Include 480p quality option (default: false)
- Original quality is always included

## Next Steps

The following features are ready to be implemented:
1. File/folder selection and upload
2. HLS conversion with progress tracking
3. Download functionality from Cloudflare
4. Integration with existing GPU detection scripts

## Configuration

On first run, the settings popup will automatically open if R2 credentials are not configured. The app will show a warning until all required R2 settings are provided.

## Architecture

- **Frontend**: React with TypeScript
- **Backend**: Rust with Tauri
- **Storage**: Tauri Store plugin for persistent settings
- **UI**: Custom CSS with responsive design and dark mode support
