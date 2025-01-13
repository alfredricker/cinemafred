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
}

export const CreateMovieForm: React.FC<CreateMovieFormProps> = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState<MovieFormData>({
    title: '',
    year: new Date().getFullYear(),
    director: '',
    genre: [],
    description: ''
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

  const handleFileChange = (type: 'video' | 'image' | 'subtitles') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFiles(prev => ({ ...prev, [type]: file }));
    }
  };

  const handleGenreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const genres = e.target.value.split(',').map(g => g.trim());
    setFormData(prev => ({ ...prev, genre: genres }));
  };

  const uploadFile = async (file: File, type: string): Promise<string> => {
    try {
      // First, get a presigned URL
      const presignedResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          filename: file.name,
          type,
          contentType: file.type
        })
      });

      if (!presignedResponse.ok) {
        const data = await presignedResponse.json();
        throw new Error(data.error || `Failed to get upload URL for ${type}`);
      }

      const { presignedUrl, filename } = await presignedResponse.json();

      // Then upload the file directly to R2 using the presigned URL
      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload ${type}`);
      }

      return filename;
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

      if (!response.ok) {
        throw new Error('Failed to create movie');
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create movie');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
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
                    required
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

            {error && (
              <div className="flex items-center gap-2 text-red-500 bg-red-500/10 p-3 rounded-lg">
                <AlertCircle className="h-5 w-5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
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