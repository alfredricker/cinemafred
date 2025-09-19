/**
 * Client for Google Cloud Run Jobs Video Converter
 */

import { spawn } from 'child_process';

export interface ConversionResponse {
  success: boolean;
  message: string;
  movieId: string;
  executionName?: string;
}

export class JobConverter {
  
  /**
   * Convert existing MP4 from R2 to HLS using Cloud Run Job
   */
  static async convertExisting(
    movieId: string, 
    deleteOriginal: boolean = false
  ): Promise<ConversionResponse> {
    const webhookUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/webhooks/conversion`;
    
    return new Promise((resolve, reject) => {
      console.log(`🚀 Triggering Cloud Run Job for movie: ${movieId}`);
      
      const args = [
        'run', 'jobs', 'execute', 'hls-converter-job',
        '--region', 'us-central1',
        '--update-env-vars', `MOVIE_ID=${movieId}`,
        '--update-env-vars', `JOB_TYPE=existing`,
        '--update-env-vars', `WEBHOOK_URL=${webhookUrl}`,
        '--update-env-vars', `DELETE_ORIGINAL=${deleteOriginal}`,
        '--async' // Don't wait for completion
      ];
      
      console.log(`📋 Executing: gcloud ${args.join(' ')}`);
      
      const gcloud = spawn('gcloud', args, {
        stdio: ['inherit', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      gcloud.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      gcloud.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      gcloud.on('close', (code) => {
        if (code === 0) {
          // Extract execution name from stdout if available
          const executionMatch = stdout.match(/Execution \[([^\]]+)\]/);
          const executionName = executionMatch ? executionMatch[1] : undefined;
          
          console.log(`✅ Job triggered successfully for movie: ${movieId}`);
          if (executionName) {
            console.log(`📋 Execution: ${executionName}`);
          }
          
          resolve({
            success: true,
            message: 'Conversion job started successfully',
            movieId,
            executionName
          });
        } else {
          console.error(`❌ Job trigger failed for movie: ${movieId} (exit code: ${code})`);
          console.error(`stderr: ${stderr}`);
          
          resolve({
            success: false,
            message: `Job trigger failed: ${stderr || 'Unknown error'}`,
            movieId
          });
        }
      });
      
      gcloud.on('error', (error) => {
        console.error(`💥 Failed to execute gcloud command:`, error);
        reject(error);
      });
    });
  }

  /**
   * Check if job converter is available (gcloud is installed and authenticated)
   */
  static async healthCheck(): Promise<boolean> {
    return new Promise((resolve) => {
      const gcloud = spawn('gcloud', ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'], {
        stdio: ['inherit', 'pipe', 'pipe']
      });
      
      let hasActiveAccount = false;
      
      gcloud.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output.length > 0) {
          hasActiveAccount = true;
        }
      });
      
      gcloud.on('close', (code) => {
        resolve(code === 0 && hasActiveAccount);
      });
      
      gcloud.on('error', () => {
        resolve(false);
      });
    });
  }
}

export default JobConverter;
