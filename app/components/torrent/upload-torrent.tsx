'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  File,
  X,
  AlertCircle,
  CheckCircle,
  Loader2,
  Wallet,
  Settings
} from 'lucide-react';

interface UploadTorrentProps {
  onUpload: (file: File, metadata: TorrentMetadata) => Promise<void>;
  connected: boolean;
  className?: string;
}

interface TorrentMetadata {
  name: string;
  description?: string;
  tags: string[];
  price: number; // sats per chunk (16KB)
  isPublic: boolean;
}

interface UploadProgress {
  stage: 'preparing' | 'hashing' | 'uploading' | 'seeding';
  progress: number;
  message: string;
}

export function UploadTorrent({ onUpload, connected, className }: UploadTorrentProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<TorrentMetadata>({
    name: '',
    description: '',
    tags: [],
    price: 17, // Default 17 sats per 16KB chunk
    isPublic: true
  });
  const [tagInput, setTagInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setMetadata(prev => ({
        ...prev,
        name: prev.name || file.name
      }));
      setError(null);
      setSuccess(false);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
      setMetadata(prev => ({
        ...prev,
        name: prev.name || file.name
      }));
      setError(null);
      setSuccess(false);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !metadata.tags.includes(tagInput.trim())) {
      setMetadata(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setMetadata(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleTagInputKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addTag();
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const calculateEstimatedEarnings = (): number => {
    if (!selectedFile) return 0;
    const chunks = Math.ceil(selectedFile.size / (16 * 1024)); // 16KB chunks
    return chunks * metadata.price;
  };

  const handleUpload = async () => {
    if (!selectedFile || !connected) return;

    if (!metadata.name.trim()) {
      setError('Please provide a name for the torrent');
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccess(false);

    try {
      // Simulate upload progress
      setUploadProgress({ stage: 'preparing', progress: 10, message: 'Preparing file...' });
      await new Promise(resolve => setTimeout(resolve, 500));

      setUploadProgress({ stage: 'hashing', progress: 30, message: 'Generating torrent hash...' });
      await new Promise(resolve => setTimeout(resolve, 1000));

      setUploadProgress({ stage: 'uploading', progress: 70, message: 'Creating torrent...' });
      await new Promise(resolve => setTimeout(resolve, 800));

      setUploadProgress({ stage: 'seeding', progress: 100, message: 'Starting to seed...' });

      await onUpload(selectedFile, metadata);

      setSuccess(true);
      setUploadProgress(null);

      // Reset form
      setSelectedFile(null);
      setMetadata({
        name: '',
        description: '',
        tags: [],
        price: 17,
        isPublic: true
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploadProgress(null);
    } finally {
      setIsUploading(false);
    }
  };

  if (!connected) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-40">
          <div className="text-center text-muted-foreground">
            <Wallet className="mx-auto h-8 w-8 mb-2 opacity-50" />
            <p>Connect your BSV wallet to upload torrents</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload & Seed Torrent
        </CardTitle>
        <CardDescription>
          Share files and earn BSV payments from downloaders
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* File Upload Area */}
        <div
          className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-muted-foreground/50 transition-colors cursor-pointer"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
          />

          {selectedFile ? (
            <div className="space-y-2">
              <File className="mx-auto h-8 w-8 text-green-600" />
              <p className="font-medium">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Remove
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="text-sm">Drop a file here or click to browse</p>
            </div>
          )}
        </div>

        {/* Metadata Form */}
        {selectedFile && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="torrent-name">Name</Label>
              <Input
                id="torrent-name"
                value={metadata.name}
                onChange={(e) => setMetadata(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter torrent name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="torrent-description">Description (Optional)</Label>
              <Textarea
                id="torrent-description"
                value={metadata.description}
                onChange={(e) => setMetadata(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the content..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="torrent-tags">Tags</Label>
              <div className="flex gap-2">
                <Input
                  id="torrent-tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={handleTagInputKeyPress}
                  placeholder="Add tags..."
                />
                <Button type="button" onClick={addTag} variant="outline">
                  Add
                </Button>
              </div>
              {metadata.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {metadata.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTag(tag)}
                        className="ml-1 h-4 w-4 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="torrent-price">Price per Chunk (sats)</Label>
                <Input
                  id="torrent-price"
                  type="number"
                  min="1"
                  value={metadata.price}
                  onChange={(e) => setMetadata(prev => ({ ...prev, price: parseInt(e.target.value) || 17 }))}
                />
                <p className="text-xs text-muted-foreground">
                  Per 16KB chunk. Est. earnings: {calculateEstimatedEarnings().toLocaleString()} sats
                </p>
              </div>

              <div className="space-y-2">
                <Label>Visibility</Label>
                <div className="flex items-center gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={metadata.isPublic}
                      onChange={() => setMetadata(prev => ({ ...prev, isPublic: true }))}
                      className="radio"
                    />
                    <span className="text-sm">Public</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!metadata.isPublic}
                      onChange={() => setMetadata(prev => ({ ...prev, isPublic: false }))}
                      className="radio"
                    />
                    <span className="text-sm">Private</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Upload Progress */}
            {uploadProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{uploadProgress.message}</span>
                  <span>{uploadProgress.progress}%</span>
                </div>
                <Progress value={uploadProgress.progress} />
              </div>
            )}

            {/* Error/Success Messages */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">Torrent created successfully! Now seeding...</span>
              </div>
            )}

            {/* Upload Button */}
            <Button
              onClick={handleUpload}
              disabled={isUploading || !selectedFile || !metadata.name.trim()}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Create & Seed Torrent
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}