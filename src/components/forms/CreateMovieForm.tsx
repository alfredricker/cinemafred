import React, { useState } from 'react';
import { Loader2, Upload, AlertCircle } from 'lucide-react';

interface CreateMovieFormProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MovieFormData {
  title: string;
  year: number;
  director: string;
  genre: string[];
  description: string;
  genreInput?: string;
}

export const CreateMovieForm: React.FC<CreateMovieFormProps> = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState<MovieFormData>({
    title: '',
    year: new Date().getFullYear(),
    director: '',
    genre: [],
    description: '',
    genreInput: '' // Initialize the input value
  });
  
  const [files, setFiles] = useState<{
    video: File | null;
    image: File | null;
    subtitles: File | null;
  }>({
    video: null,
    image: null,
    subtitles: null
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});

  // Function to reset form data
  const resetForm = () => {
    setFormData({
      title: '',
      year: new Date().getFullYear(),
      director: '',
      genre: [],
      description: '',
      genreInput: ''
    });
    setFiles({
      video: null,
      image: null,
      subtitles: null
    });
    setError(null);
    setUploadProgress({});
  };

  // Enhanced close handler that clears form data
  const handleClose = () => {
    resetForm();
    onClose();
  };


  const handleFileChange = (type: 'video' | 'image' | 'subtitles') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setFiles(prev => ({ ...prev, [type]: file }));

    // Only fetch metadata for video files
    if (type === 'video') {
      try {
        setIsSubmitting(true);
        setError(null);

        console.log('Processing video file:', file.name);
        
        // Validate file extension
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (!extension || !['mp4', 'mkv', 'avi'].includes(extension)) {
          throw new Error('Invalid file extension. Expected: mp4, mkv, or avi');
        }

        // The TMDB service will now handle the complex parsing
        // We just need to pass the filename and let it extract title and year
        console.log('Sending filename to TMDB service for parsing:', file.name);
        
        // Create query parameters with the filename for parsing
        const queryParams = new URLSearchParams({
          filename: file.name
        });
        
        console.log('Sending filename to API:', file.name);
        
        // Fetch metadata using filename parsing
        const response = await fetch(`/api/movies/metadata?${queryParams.toString()}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });

        const data = await response.json();
        console.log('Metadata response:', data);

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch movie metadata');
        }

        if (!data.metadata) {
          throw new Error('No metadata found for this movie');
        }

        // Auto-fill the form
        setFormData(prev => ({
          ...prev,
          title: data.metadata.title,
          year: data.metadata.year,
          director: data.metadata.director,
          genre: data.metadata.genre,
          genreInput: data.metadata.genre.join(', '), // Add this line
          description: data.metadata.description,
          duration: data.metadata.duration
        }));

        // Handle poster download if available
        if (data.metadata.posterUrl) {
          try {
            console.log('Downloading poster from:', data.metadata.posterUrl);
            
            // Show loading state for poster
            setUploadProgress(prev => ({
              ...prev,
              poster: 0
            }));

            // Request poster download
            const posterResponse = await fetch('/api/movies/poster', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
              },
              body: JSON.stringify({ 
                imageUrl: data.metadata.posterUrl 
              }),
            });

            if (!posterResponse.ok) {
              const errorData = await posterResponse.json();
              throw new Error(errorData.error || 'Failed to download poster');
            }

            const posterData = await posterResponse.json();
            console.log('Poster download response:', posterData);

            if (!posterData.path) {
              throw new Error('No poster path received from server');
            }

            // Update progress
            setUploadProgress(prev => ({
              ...prev,
              poster: 50
            }));

            // Fetch the downloaded poster
            const posterRequest = await fetch(`/${posterData.path}`);
            if (!posterRequest.ok) {
              throw new Error('Failed to fetch downloaded poster');
            }

            const posterBlob = await posterRequest.blob();
            console.log('Poster blob received:', posterBlob.size, 'bytes');

            // Create a File object from the poster
            const posterFile = new File(
              [posterBlob],
              posterData.path.split('/').pop() || 'poster.jpg',
              { type: 'image/jpeg' }
            );

            // Update form and files state
            setFormData(prev => ({
              ...prev,
              r2_image_path: posterData.path,
            }));

            setFiles(prev => ({
              ...prev,
              image: posterFile
            }));

            // Show completion
            setUploadProgress(prev => ({
              ...prev,
              poster: 100
            }));

            console.log('Poster process completed successfully');
          } catch (posterError) {
            console.error('Error in poster download process:', posterError);
            setError('Failed to download poster. Please upload one manually.');
          }
        } else {
          console.log('No poster URL available in metadata');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to auto-detect movie information';
        setError(errorMessage);
        console.error('Error in handleFileChange:', err);
        
        // Reset states
        setUploadProgress({});
        setFormData({
          title: '',
          year: new Date().getFullYear(),
          director: '',
          genre: [],
          description: '',
          genreInput: ''
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleGenreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const genres = input.split(',').map(g => g.trim()).filter(g => g.length > 0);
    setFormData(prev => ({
      ...prev,
      genre: genres,
      genreInput: input
    }));
  };

  const uploadFile = async (file: File, type: string): Promise<string> => {
    try {
      // Step 1: Get a presigned URL
      const presignedResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          filename: file.name,
          type,
          contentType: file.type || 'application/x-subrip', // Add fallback for SRT files
        }),
      });
  
      const data = await presignedResponse.json();
      if (!presignedResponse.ok) {
        throw new Error(data.error || `Failed to get upload URL for ${type}`);
      }
      
      const { presignedUrl, filename } = data;
  
      // Step 2: Upload the file to R2 using XMLHttpRequest to track progress
      return await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
  
        xhr.open('PUT', presignedUrl, true);
        xhr.setRequestHeader('Content-Type', file.type || 'application/x-subrip'); // Add fallback here too
  
        // Track progress
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadProgress((prev) => ({
              ...prev,
              [type]: progress,
            }));
          }
        };
  
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(filename);
          } else {
            reject(new Error(`Failed to upload ${type}, status code: ${xhr.status}`));
          }
        };
  
        xhr.onerror = () => {
          reject(new Error(`Upload error for ${type}`));
        };
  
        xhr.send(file);
      });
    } catch (error) {
      console.error(`Upload error for ${type}:`, error);
      throw error;
    }
  };
  

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!files.video || !files.image) {
        throw new Error('Video and image files are required');
      }

      // Upload files and get filenames
      const [videoFilename, imageFilename, subtitlesFilename] = await Promise.all([
        uploadFile(files.video, 'video'),
        uploadFile(files.image, 'image'),
        files.subtitles ? uploadFile(files.subtitles, 'subtitles') : Promise.resolve(null)
      ]);

      // Create movie in database with proper path prefixes
      const response = await fetch('/api/movies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ...formData,
          r2_video_path: `api/movie/${videoFilename}`,
          r2_image_path: `api/movie/${imageFilename}`,
          r2_subtitles_path: subtitlesFilename,
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create movie');
      }

      console.log('Movie created successfully:', result.message);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create movie');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={handleClose} />
      <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
        <div className="bg-gray-900 rounded-lg p-6 w-full max-w-2xl" onClick={e => e.stopPropagation()}>
          <h2 className="text-xl font-bold text-white mb-6">Add New Movie</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* File Upload Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Movie File (MP4)
                </label>
                <div className="flex items-center justify-center w-full h-32 px-4 border-2 border-gray-700 border-dashed rounded-lg hover:bg-gray-800/50 transition-colors">
                  <input
                    type="file"
                    accept="video/mp4"
                    onChange={handleFileChange('video')}
                    className="hidden"
                    id="video-upload"
                    required
                  />
                  <label htmlFor="video-upload" className="cursor-pointer text-center">
                    <Upload className="mx-auto h-8 w-8 text-gray-500 mb-2" />
                    <span className="text-sm text-gray-500">
                      {files.video ? files.video.name : 'Upload Video'}
                    </span>
                  </label>
                </div>
                {/* Progress UI */}
                {uploadProgress['video'] !== undefined && (
                  <div className="mt-2">
                    <div className="h-2 bg-gray-800 rounded">
                      <div
                        className="h-full bg-blue-600 rounded"
                        style={{ width: `${uploadProgress['video']}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{uploadProgress['video']}% uploaded</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Poster Image
                </label>
                <div className="flex items-center justify-center w-full h-32 px-4 border-2 border-gray-700 border-dashed rounded-lg hover:bg-gray-800/50 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange('image')}
                    className="hidden"
                    id="image-upload"
                  />
                  <label htmlFor="image-upload" className="cursor-pointer text-center">
                    <Upload className="mx-auto h-8 w-8 text-gray-500 mb-2" />
                    <span className="text-sm text-gray-500">
                      {files.image ? files.image.name : 'Upload Image'}
                    </span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Subtitles (Optional)
                </label>
                <div className="flex items-center justify-center w-full h-32 px-4 border-2 border-gray-700 border-dashed rounded-lg hover:bg-gray-800/50 transition-colors">
                  <input
                    type="file"
                    accept=".srt,.vtt"
                    onChange={handleFileChange('subtitles')}
                    className="hidden"
                    id="subtitles-upload"
                  />
                  <label htmlFor="subtitles-upload" className="cursor-pointer text-center">
                    <Upload className="mx-auto h-8 w-8 text-gray-500 mb-2" />
                    <span className="text-sm text-gray-500">
                      {files.subtitles ? files.subtitles.name : 'Upload Subtitles'}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Metadata Fields */}
            <div className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-300">
                  Title
                </label>
                <input
                  type="text"
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="year" className="block text-sm font-medium text-gray-300">
                    Year
                  </label>
                  <input
                    type="number"
                    id="year"
                    value={formData.year}
                    onChange={(e) => setFormData(prev => ({ ...prev, year: parseInt(e.target.value) }))}
                    className="mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="director" className="block text-sm font-medium text-gray-300">
                    Director
                  </label>
                  <input
                    type="text"
                    id="director"
                    value={formData.director}
                    onChange={(e) => setFormData(prev => ({ ...prev, director: e.target.value }))}
                    className="mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="genre" className="block text-sm font-medium text-gray-300">
                  Genres (comma-separated)
                </label>
                <input
                  type="text"
                  id="genre"
                  value={formData.genreInput}
                  onChange={handleGenreChange}
                  className="mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white"
                  placeholder="Action, Drama, Thriller"
                  required
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-300">
                  Description
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  className="mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white"
                  required
                />
              </div>
            </div>

            {/* Info about HLS conversion */}
            <div className="flex items-start gap-2 text-blue-400 bg-blue-500/10 p-3 rounded-lg">
              <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Automatic HLS Conversion</p>
                <p className="text-blue-300 mt-1">
                  After creating the movie, it will be automatically converted to HLS format for streaming. 
                  This process happens in the background and may take several minutes depending on video length.
                </p>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-500 bg-red-500/10 p-3 rounded-lg">
                <AlertCircle className="h-5 w-5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isSubmitting || 
                  !files.video || 
                  !files.image || 
                  !formData.title || 
                  !formData.director || 
                  formData.genre.length === 0 ||
                  !formData.description
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                          disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </span>
                ) : (
                  'Create Movie'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};