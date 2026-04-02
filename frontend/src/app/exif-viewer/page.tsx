"use client";

import { useState, useCallback } from "react";
import { extractExif } from "@/lib/api";
import type { ExifData } from "@/types";

export default function ExifViewer() {
  const [exifData, setExifData] = useState<ExifData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleProcessFile = async (file: File) => {
    setLoading(true);
    setError(null);
    setExifData(null);
    
    try {
      const data = await extractExif(file);
      setExifData(data);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to extract EXIF data");
    } finally {
      setLoading(false);
    }
  };

  const onDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleProcessFile(e.target.files[0]);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--color-text)] m-0">EXIF Meta-Analyzer</h1>
        <p className="text-[var(--color-text-secondary)] mt-2 text-sm">
          Drop a photo taken from a smartphone below to securely extract and read hidden metadata (Timestamps, GPS tags, Camera lenses). Database is bypassed.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1 min-h-0">
        {/* Upload Zone */}
        <div 
          className={`h-64 md:h-full border-2 border-dashed rounded-3xl flex flex-col items-center justify-center p-8 transition-all ${
            dragActive 
              ? "border-teal-500 bg-teal-500/10 scale-[1.02]" 
              : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-teal-500/50"
          }`}
          onDragEnter={onDrag}
          onDragLeave={onDrag}
          onDragOver={onDrag}
          onDrop={onDrop}
        >
          <span className="text-6xl mb-4 opacity-80">{loading ? "⏳" : "📸"}</span>
          <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">
            {loading ? "Analyzing..." : "Drop Photo Here"}
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)] text-center mb-6">
            JPG, HEIC, PNG natively parsed using Python Pillow
          </p>

          <label className="cursor-pointer px-6 py-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors text-sm font-medium">
            Browse files
            <input 
              type="file" 
              className="hidden" 
              accept="image/*,video/*"
              onChange={onFileChange}
              disabled={loading}
            />
          </label>
        </div>

        {/* Decoder View */}
        <div className="h-[600px] md:h-full flex flex-col">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-4 flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <p className="m-0 text-sm">{error}</p>
            </div>
          )}

          <div className="flex-1 glass border border-[var(--color-border)] rounded-3xl overflow-hidden flex flex-col">
            <div className="bg-[#0a0e1a] px-4 py-3 border-b border-[#1f2937] flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400/80"></div>
                <div className="w-3 h-3 rounded-full bg-amber-400/80"></div>
                <div className="w-3 h-3 rounded-full bg-teal-400/80"></div>
              </div>
              <span className="ml-2 text-xs font-mono text-[#9ca3af]">exif_buffer.json</span>
            </div>
            
            <div className="flex-1 bg-[#111827] p-5 overflow-y-auto custom-scrollbar font-mono text-sm">
              {!exifData && !loading && (
                <div className="h-full flex items-center justify-center text-[#4b5563]">
                  // Waiting for photo injection...
                </div>
              )}
              {loading && (
                <div className="text-teal-400 animate-pulse">
                  &gt; Parsing binary stream...<br/>
                  &gt; Locating GPS IFD tags...<br/>
                  &gt; Extracting chronometry...
                </div>
              )}
              {exifData && !loading && (
                <pre className="text-amber-300 whitespace-pre-wrap word-break">
                  {JSON.stringify(exifData, null, 2)}
                </pre>
              )}
            </div>
          </div>

          {exifData?.has_gps && (
            <div className="mt-4 p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 text-sm flex gap-3">
              <span className="text-xl">📍</span>
              <p className="m-0">
                <strong>GPS Lock Verified!</strong> Application successfully extracted Latitude: {exifData.latitude?.toFixed(4)}, Longitude: {exifData.longitude?.toFixed(4)}. This pin can be drawn on the global map.
              </p>
            </div>
          )}
          {exifData && !exifData.has_gps && (
            <div className="mt-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm flex gap-3">
              <span className="text-xl">⚠️</span>
              <p className="m-0">
                <strong>No Location Data.</strong> This image was likely saved from an app (like WhatsApp/Discord) or stripped of GPS prior to upload.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
