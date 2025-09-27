import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AppSettings, GPUCapabilities, defaultSettings } from '../types';
import './SettingsModal.css';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange: (settings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsChange,
}) => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [gpuCapabilities, setGpuCapabilities] = useState<GPUCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingR2, setIsTestingR2] = useState(false);
  const [isTestingGPU, setIsTestingGPU] = useState(false);
  const [r2TestResult, setR2TestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      testGPUCapabilities();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const loadedSettings = await invoke<AppSettings>('load_settings');
      setSettings(loadedSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      setSettings(defaultSettings);
    } finally {
      setIsLoading(false);
    }
  };

  const testGPUCapabilities = async () => {
    setIsTestingGPU(true);
    try {
      const capabilities = await invoke<GPUCapabilities>('test_gpu_capabilities');
      setGpuCapabilities(capabilities);
    } catch (error) {
      console.error('Failed to test GPU capabilities:', error);
    } finally {
      setIsTestingGPU(false);
    }
  };

  const testR2Connection = async () => {
    setIsTestingR2(true);
    setR2TestResult(null);
    try {
      await invoke<boolean>('validate_r2_connection', { settings });
      setR2TestResult({ success: true, message: 'R2 connection successful!' });
    } catch (error) {
      setR2TestResult({ 
        success: false, 
        message: error as string || 'Failed to connect to R2' 
      });
    } finally {
      setIsTestingR2(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await invoke('save_settings', { settings });
      onSettingsChange(settings);
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings: ' + error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setR2TestResult(null); // Clear test result when settings change
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        {isLoading ? (
          <div className="loading">Loading settings...</div>
        ) : (
          <div className="modal-body">
            {/* R2 Configuration Section */}
            <section className="settings-section">
              <h3>Cloudflare R2 Configuration</h3>
              <div className="form-group">
                <label htmlFor="r2_account_id">Account ID:</label>
                <input
                  id="r2_account_id"
                  type="text"
                  value={settings.r2_account_id}
                  onChange={e => updateSetting('r2_account_id', e.target.value)}
                  placeholder="Your R2 Account ID"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="r2_access_key_id">Access Key ID:</label>
                <input
                  id="r2_access_key_id"
                  type="text"
                  value={settings.r2_access_key_id}
                  onChange={e => updateSetting('r2_access_key_id', e.target.value)}
                  placeholder="Your R2 Access Key ID"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="r2_secret_access_key">Secret Access Key:</label>
                <div className="password-input-group">
                  <input
                    id="r2_secret_access_key"
                    type={showPassword ? "text" : "password"}
                    value={settings.r2_secret_access_key}
                    onChange={e => updateSetting('r2_secret_access_key', e.target.value)}
                    placeholder="Your R2 Secret Access Key"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="r2_bucket_name">Bucket Name:</label>
                <input
                  id="r2_bucket_name"
                  type="text"
                  value={settings.r2_bucket_name}
                  onChange={e => updateSetting('r2_bucket_name', e.target.value)}
                  placeholder="Your R2 Bucket Name"
                />
              </div>

              <div className="test-connection-group">
                <button
                  className="test-button"
                  onClick={testR2Connection}
                  disabled={isTestingR2}
                >
                  {isTestingR2 ? 'Testing...' : 'Test R2 Connection'}
                </button>
                {r2TestResult && (
                  <div className={`test-result ${r2TestResult.success ? 'success' : 'error'}`}>
                    {r2TestResult.message}
                  </div>
                )}
              </div>
            </section>

            {/* GPU Settings Section */}
            <section className="settings-section">
              <h3>GPU Settings</h3>
              <div className="gpu-status">
                {isTestingGPU ? (
                  <div>Testing GPU capabilities...</div>
                ) : gpuCapabilities ? (
                  <div className="gpu-info">
                    <div className="gpu-detection">
                      <strong>GPU Detection:</strong>
                      <ul>
                        <li>NVIDIA: {gpuCapabilities.has_nvidia ? '✅' : '❌'}</li>
                        <li>AMD: {gpuCapabilities.has_amd ? '✅' : '❌'}</li>
                        <li>Intel: {gpuCapabilities.has_intel ? '✅' : '❌'}</li>
                      </ul>
                      <div>
                        <strong>Recommended Encoder:</strong> {gpuCapabilities.recommended_encoder}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>Failed to detect GPU capabilities</div>
                )}
              </div>
              
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.gpu_enabled}
                    onChange={e => updateSetting('gpu_enabled', e.target.checked)}
                  />
                  Enable GPU acceleration (if available)
                </label>
              </div>
              
              <button
                className="test-button"
                onClick={testGPUCapabilities}
                disabled={isTestingGPU}
              >
                {isTestingGPU ? 'Testing...' : 'Refresh GPU Detection'}
              </button>
            </section>

            {/* Processing Settings Section */}
            <section className="settings-section">
              <h3>Processing Settings</h3>
              <div className="form-group">
                <label htmlFor="parallel_processing_count">
                  Parallel Processing Count (default: 2):
                </label>
                <div className="range-input-group">
                  <input
                    id="parallel_processing_count"
                    type="range"
                    min="1"
                    max={settings.max_parallel_processing}
                    value={settings.parallel_processing_count}
                    onChange={e => updateSetting('parallel_processing_count', parseInt(e.target.value))}
                  />
                  <span className="range-value">{settings.parallel_processing_count}</span>
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="max_parallel_processing">
                  Maximum Parallel Processing (max: 4):
                </label>
                <div className="range-input-group">
                  <input
                    id="max_parallel_processing"
                    type="range"
                    min="1"
                    max="4"
                    value={settings.max_parallel_processing}
                    onChange={e => {
                      const maxValue = parseInt(e.target.value);
                      updateSetting('max_parallel_processing', maxValue);
                      // Ensure parallel_processing_count doesn't exceed max
                      if (settings.parallel_processing_count > maxValue) {
                        updateSetting('parallel_processing_count', maxValue);
                      }
                    }}
                  />
                  <span className="range-value">{settings.max_parallel_processing}</span>
                </div>
              </div>
            </section>

            {/* Deletion Settings Section */}
            <section className="settings-section">
              <h3>File Management</h3>
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.delete_original_after_conversion}
                    onChange={e => updateSetting('delete_original_after_conversion', e.target.checked)}
                  />
                  Delete original file after conversion
                </label>
              </div>
              
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.cleanup_hls_temp_files}
                    onChange={e => updateSetting('cleanup_hls_temp_files', e.target.checked)}
                  />
                  Clean up temporary HLS files
                </label>
              </div>
              
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.keep_original_mp4}
                    onChange={e => updateSetting('keep_original_mp4', e.target.checked)}
                  />
                  Keep original MP4 files
                </label>
              </div>
            </section>

            {/* Quality Settings Section */}
            <section className="settings-section">
              <h3>Quality Settings</h3>
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.include_480p}
                    onChange={e => updateSetting('include_480p', e.target.checked)}
                  />
                  Include 480p quality (in addition to original quality)
                </label>
              </div>
            </section>
          </div>
        )}

        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="save-button" 
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};
