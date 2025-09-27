export interface AppSettings {
  // R2 Configuration
  r2_account_id: string;
  r2_access_key_id: string;
  r2_secret_access_key: string;
  r2_bucket_name: string;
  
  // Processing Settings
  gpu_enabled: boolean;
  parallel_processing_count: number;
  max_parallel_processing: number;
  
  // Deletion Settings
  delete_original_after_conversion: boolean;
  cleanup_hls_temp_files: boolean;
  keep_original_mp4: boolean;
  
  // Quality Settings
  include_480p: boolean;
}

export interface GPUCapabilities {
  has_nvidia: boolean;
  has_amd: boolean;
  has_intel: boolean;
  recommended_encoder: string;
  gpu_available: boolean;
}

export const defaultSettings: AppSettings = {
  r2_account_id: '',
  r2_access_key_id: '',
  r2_secret_access_key: '',
  r2_bucket_name: '',
  gpu_enabled: true,
  parallel_processing_count: 2,
  max_parallel_processing: 4,
  delete_original_after_conversion: false,
  cleanup_hls_temp_files: true,
  keep_original_mp4: true,
  include_480p: false,
};
