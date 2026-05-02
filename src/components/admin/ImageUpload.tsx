'use client';

import { useState, useRef } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import Image from 'next/image';
import { resolveImageUrl } from '@/lib/utils/resolveImageUrl';

interface ImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  type: 'hero' | 'team' | 'news';
  label?: string;
  hint?: string;
}

const DIMENSIONS: Record<string, string> = {
  hero: '1920 × 1080 (auto-cropped)',
  team: '480 × 600 portrait (top-crop)',
  news: '1200 × 630 (auto-cropped)',
};

export default function ImageUpload({ value, onChange, type, label, hint }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await apiClient.post(`/upload/image?type=${type}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(res.data.data.url);
    } catch (e: any) {
      alert(e.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // Filename hint: show the disk filename for path-stored images, but
  // for legacy base64 data URIs (`data:image/webp;base64,…`) just show
  // a friendly label — splitting a base64 string on `/` produces the
  // tail of the encoded payload, which is the noise that used to leak
  // into the UI.
  const filenameHint = value && value.startsWith('data:')
    ? 'Legacy base64 image (re-upload to migrate to disk)'
    : value?.split('/').pop();

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}

      {value ? (
        <div className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
          <div className={`relative w-full ${type === 'team' ? 'aspect-[4/5]' : 'aspect-video'} max-h-64`}>
            <Image
              // resolveImageUrl handles every shape the upload pipeline
              // has produced over time: backend disk paths (uploads/...
              // with or without leading slash), full https URLs, and
              // legacy `data:image/...;base64,...` strings stored in
              // the DB before the upload-controller switched to disk.
              src={resolveImageUrl(value)}
              alt="Uploaded"
              fill
              className="object-cover"
              unoptimized
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-3 py-1.5">
            <p className="text-xs text-white/70 truncate">{filenameHint}</p>
          </div>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors min-h-[120px]
            ${dragOver ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}`}
        >
          {uploading ? (
            <>
              <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
              <p className="text-sm text-gray-500">Processing image...</p>
            </>
          ) : (
            <>
              <div className="p-3 bg-gray-100 rounded-xl">
                <Upload className="w-5 h-5 text-gray-500" />
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-700">Click or drag image here</p>
                <p className="text-xs text-gray-500 mt-1">Converted to WebP &bull; {DIMENSIONS[type]}</p>
                {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
              </div>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
    </div>
  );
}
