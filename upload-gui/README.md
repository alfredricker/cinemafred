# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)


## App features
Compatible with windows and linux

### Configuring
In order for the app to work, you have to configure the .env file in the app directory or input the cloudflare vars in a settings popup

### Uploading
* Select a folder or file(s) to upload to CloudFlare
* Default is to upload with gpu (if gpu is compatible)
* Only uploads at most 4 files at a time
* Converts your files locally, automatically cleans up hls files by default, but keeps original mp4 by default
* The name of the movie, image, director, etc. are automatically populated by tmdb (see lib/tmdb.ts).
* The uploads for each movie file can be expanded to show UI similar to CreateMovieForm.tsx

### Downloading
Can download files from cloudflare