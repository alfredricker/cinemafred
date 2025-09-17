/**
 * Client for Google Cloud Run FFmpeg Converter Service
 */

const CONVERTER_SERVICE_URL = process.env.CONVERTER_SERVICE_URL || 'http://localhost:8080';
const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

export interface ConversionResponse {
  message: string;
  movieId: string;
  uploadedFile?: string;
}

export class CloudConverter {
  
  /**
   * Convert uploaded video file to HLS
   */
  static async convertUpload(
    videoFile: File, 
    movieId: string
  ): Promise<ConversionResponse> {
    const formData = new FormData();
    formData.append('video', videoFile);
    formData.append('movieId', movieId);
    formData.append('webhookUrl', `${WEBHOOK_BASE_URL}/api/webhooks/conversion`);

    const response = await fetch(`${CONVERTER_SERVICE_URL}/convert/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Conversion failed');
    }

    return response.json();
  }

  /**
   * Convert existing MP4 from R2 to HLS
   */
  static async convertExisting(
    movieId: string, 
    deleteOriginal: boolean = false
  ): Promise<ConversionResponse> {
    const response = await fetch(`${CONVERTER_SERVICE_URL}/convert/existing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        movieId,
        deleteOriginal,
        webhookUrl: `${WEBHOOK_BASE_URL}/api/webhooks/conversion`
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Conversion failed');
    }

    return response.json();
  }

  /**
   * Check if converter service is healthy
   */
  static async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${CONVERTER_SERVICE_URL}/health`, {
        method: 'GET',
        timeout: 5000,
      });
      return response.ok;
    } catch (error) {
      console.error('Converter service health check failed:', error);
      return false;
    }
  }
}

export default CloudConverter;
