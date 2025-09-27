import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SettingsModal } from "./components/SettingsModal";
import { AppSettings, defaultSettings } from "./types";
import "./App.css";

function App() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    loadInitialSettings();
  }, []);

  const loadInitialSettings = async () => {
    try {
      const loadedSettings = await invoke<AppSettings>('load_settings');
      setSettings(loadedSettings);
      
      // Check if settings are configured (at least R2 credentials)
      const isConfigured = loadedSettings.r2_account_id && 
                          loadedSettings.r2_access_key_id && 
                          loadedSettings.r2_secret_access_key && 
                          loadedSettings.r2_bucket_name;
      
      if (!isConfigured) {
        // Open settings modal if not configured
        setIsSettingsOpen(true);
      }
    } catch (error) {
      console.error('Failed to load initial settings:', error);
      // Open settings modal on error
      setIsSettingsOpen(true);
    } finally {
      setIsInitialized(true);
    }
  };

  const handleSettingsChange = (newSettings: AppSettings) => {
    setSettings(newSettings);
  };

  const isConfigured = settings.r2_account_id && 
                      settings.r2_access_key_id && 
                      settings.r2_secret_access_key && 
                      settings.r2_bucket_name;

  if (!isInitialized) {
    return (
      <main className="container">
        <div className="loading-screen">
          <h2>Loading CinemaFred Upload GUI...</h2>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="app-header">
        <h1>🎬 CinemaFred Upload GUI</h1>
        <button 
          className="settings-button"
          onClick={() => setIsSettingsOpen(true)}
        >
          ⚙️ Settings
        </button>
      </header>

      {!isConfigured && (
        <div className="configuration-warning">
          <h3>⚠️ Configuration Required</h3>
          <p>Please configure your Cloudflare R2 credentials in settings before uploading files.</p>
          <button 
            className="configure-button"
            onClick={() => setIsSettingsOpen(true)}
          >
            Configure Now
          </button>
        </div>
      )}

      {isConfigured && (
        <div className="main-content">
          <div className="status-section">
            <h3>Current Configuration</h3>
            <div className="status-grid">
              <div className="status-item">
                <span className="status-label">R2 Bucket:</span>
                <span className="status-value">{settings.r2_bucket_name}</span>
              </div>
              <div className="status-item">
                <span className="status-label">GPU Enabled:</span>
                <span className="status-value">{settings.gpu_enabled ? '✅ Yes' : '❌ No'}</span>
              </div>
              <div className="status-item">
                <span className="status-label">Parallel Processing:</span>
                <span className="status-value">{settings.parallel_processing_count} files</span>
              </div>
              <div className="status-item">
                <span className="status-label">Keep Original:</span>
                <span className="status-value">{settings.keep_original_mp4 ? '✅ Yes' : '❌ No'}</span>
              </div>
            </div>
          </div>

          <div className="upload-section">
            <h3>Upload Files</h3>
            <div className="upload-area">
              <p>File upload functionality will be implemented next...</p>
              <button className="upload-button" disabled>
                📁 Select Files/Folder
              </button>
            </div>
          </div>

          <div className="download-section">
            <h3>Download from Cloudflare</h3>
            <div className="download-area">
              <p>Download functionality will be implemented next...</p>
              <button className="download-button" disabled>
                📥 Browse & Download
              </button>
            </div>
          </div>
        </div>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsChange={handleSettingsChange}
      />
    </main>
  );
}

export default App;
