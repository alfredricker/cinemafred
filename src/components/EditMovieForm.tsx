// src/components/EditMovieForm.tsx
import React, { useState, useEffect } from 'react';
import { Loader2, Upload, AlertCircle, Trash2, ChevronRight, AlertTriangle } from 'lucide-react';
import { Movie } from '@/types/movie';

interface MovieFormData {
  title: string;
  year: number;
  director: string;
  genre: string[];
  description: string;
  r2_video_path: string;
  r2_image_path: string;
  r2_subtitles_path?: string | null;
  streaming_url?: string | null;
  cloudflare_video_id?: string | null;
}

interface EditMovieFormProps {
  isOpen: boolean;
  onClose: () => void;
  movie: Movie;
}

const defaultFormData: MovieFormData = {
  title: '',
  year: new Date().getFullYear(),
  director: '',
  genre: [],
  description: '',
  r2_video_path: '',
  r2_image_path: '',
  r2_subtitles_path: null
};

export const EditMovieForm: React.FC<EditMovieFormProps> = ({ isOpen, onClose, movie }) => {
  const [formData, setFormData] = useState<MovieFormData>(() => ({
    ...defaultFormData,
    title: movie.title ?? defaultFormData.title,
    year: movie.year ?? defaultFormData.year,
    director: movie.director ?? defaultFormData.director,
    genre: Array.isArray(movie.genre) ? [...movie.genre] : defaultFormData.genre,
    description: movie.description ?? defaultFormData.description,
    r2_video_path: movie.r2_video_path ?? defaultFormData.r2_video_path,
    r2_image_path: movie.r2_image_path ?? defaultFormData.r2_image_path,
    r2_subtitles_path: movie.r2_subtitles_path ?? defaultFormData.r2_subtitles_path
  }));
  
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    setFormData({
      ...defaultFormData,
      title: movie.title ?? defaultFormData.title,
      year: movie.year ?? defaultFormData.year,
      director: movie.director ?? defaultFormData.director,
      genre: Array.isArray(movie.genre) ? [...movie.genre] : defaultFormData.genre,
      description: movie.description ?? defaultFormData.description,
      r2_video_path: movie.r2_video_path ?? defaultFormData.r2_video_path,
      r2_image_path: movie.r2_image_path ?? defaultFormData.r2_image_path,
      r2_subtitles_path: movie.r2_subtitles_path ?? defaultFormData.r2_subtitles_path
    });
  }, [movie]);

  const handleFileChange = (type: 'video' | 'image' | 'subtitles') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFiles(prev => ({ ...prev, [type]: file }));
    }
  };

  const handleGenreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const genres = e.target.value.split(',')
      .map(g => g.trim())
      .filter(g => g.length > 0);
    setFormData(prev => ({ ...prev, genre: genres }));
  };

  const uploadToR2 = async (file: File, type: string) => {
    try {
      const presignedResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          filename: file.name,
          type,
          contentType: file.type || 'application/x-subrip'
        })
      });
  
      if (!presignedResponse.ok) {
        const data = await presignedResponse.json();
        throw new Error(data.error || `Failed to get upload URL for ${type}`);
      }
  
      const { presignedUrl, filename } = await presignedResponse.json();
  
      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/x-subrip'
        }
      });
  
      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload ${type}`);
      }
  
      return type === 'subtitles' ? filename : `api/movie/${filename}`;
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
      const updates: Partial<MovieFormData> = { ...formData };

      if (files.video) {
        updates.r2_video_path = await uploadToR2(files.video, 'video');
      }
      if (files.image) {
        updates.r2_image_path = await uploadToR2(files.image, 'image');
      }
      if (files.subtitles) {
        updates.r2_subtitles_path = await uploadToR2(files.subtitles, 'subtitles');
      }

      const response = await fetch(`/api/movies/${movie.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error('Failed to update movie');
      }

      onClose();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update movie');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this movie? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/movies/${movie.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete movie');
      }

      onClose();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete movie');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
        <div className="bg-gray-900 rounded-lg p-6 w-full max-w-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white">Edit Movie</h2>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-3 py-1.5 text-red-500 hover:text-red-400 transition-colors"
              disabled={isDeleting}
            >
              <Trash2 className="w-4 h-4" />
              <span>{isDeleting ? 'Deleting...' : 'Delete Movie'}</span>
            </button>
          </div>

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
                  />
                  <label htmlFor="video-upload" className="cursor-pointer text-center">
                    <Upload className="mx-auto h-8 w-8 text-gray-500 mb-2" />
                    <span className="text-sm text-gray-500">
                      {files.video ? files.video.name : 'Update Video'}
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
                  />
                  <label htmlFor="image-upload" className="cursor-pointer text-center">
                    <Upload className="mx-auto h-8 w-8 text-gray-500 mb-2" />
                    <span className="text-sm text-gray-500">
                      {files.image ? files.image.name : 'Update Image'}
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
                      {files.subtitles ? files.subtitles.name : 'Update Subtitles'}
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
                  value={formData.genre.join(', ')}
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

            {/* Advanced Options Section */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <ChevronRight className={`w-4 h-4 transform transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                Advanced Options
              </button>

              {showAdvanced && (
                <div className="space-y-4 p-4 bg-gray-800/50 rounded-lg">
                  {/* R2 Paths */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300">
                      R2 Image Path
                    </label>
                    <input
                      type="text"
                      value={formData.r2_image_path}
                      onChange={(e) => setFormData(prev => ({ ...prev, r2_image_path: e.target.value }))}
                      className="mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white"
                      placeholder="api/movie/image.jpg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300">
                      R2 Video Path
                    </label>
                    <input
                      type="text"
                      value={formData.r2_video_path}
                      onChange={(e) => setFormData(prev => ({ ...prev, r2_video_path: e.target.value }))}
                      className="mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white"
                      placeholder="api/movie/video.mp4"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300">
                      R2 Subtitles Path (Optional)
                    </label>
                    <input
                      type="text"
                      value={formData.r2_subtitles_path || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, r2_subtitles_path: e.target.value || null }))}
                      className="mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white"
                      placeholder="api/movie/subtitles.vtt"
                    />
                  </div>

                  {/* Streaming Options */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300">
                      Streaming URL (Optional)
                    </label>
                    <input
                      type="text"
                      value={formData.streaming_url || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, streaming_url: e.target.value || null }))}
                      className="mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white"
                      placeholder="https://example.com/stream"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300">
                      Cloudflare Video ID (Optional)
                    </label>
                    <input
                      type="text"
                      value={formData.cloudflare_video_id || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, cloudflare_video_id: e.target.value || null }))}
                      className="mt-1 block w-full rounded-md bg-gray-800 border-gray-700 text-white"
                      placeholder="cloudflare-video-id"
                    />
                  </div>

                  {/* Warning Message */}
                  <div className="flex items-center gap-2 text-yellow-500 bg-yellow-500/10 p-3 rounded-lg text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    <span>
                      Editing these values directly can affect movie playback. Make sure you know what you're doing.
                    </span>
                  </div>
                </div>
              )}
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
                    Updating...
                  </span>
                ) : (
                  'Update Movie'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};