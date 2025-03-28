'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import VideoUploader from '@/components/VideoUploader';
import BoundingBoxSelector from '@/components/BoundingBoxSelector';
import Link from 'next/link';
import { v4 as uuidv4 } from 'uuid';
import { BoundingBox, initializeTennisTracker, trackFrame, generateAnalysisResult } from '@/lib/tennis-tracker';

export default function TennisAnalysisPage() {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [showBoundingBoxSelector, setShowBoundingBoxSelector] = useState(false);
  const [selectedBoxes, setSelectedBoxes] = useState<BoundingBox[] | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{width: number, height: number, duration: number} | null>(null);
  const [showUploader, setShowUploader] = useState(false);

  const handleUploadComplete = (url: string, name: string) => {
    setVideoUrl(url);
    setFileName(name);
  };

  const startPlayerAnalysis = async () => {
    setShowUploader(true);
  };
  
  const handleBoxesSelected = (boxes: BoundingBox[]) => {
    if (!boxes.some(box => box.label === 'player') || !boxes.some(box => box.label === 'ball')) {
      setError('Please draw bounding boxes for both the player and the ball.');
      return;
    }

    setSelectedBoxes(boxes);
    setShowBoundingBoxSelector(false);
    
    // Start the tennis player analysis
    startTennisAnalysis(boxes);
  };
  
  const handleBoxSelectorCancel = () => {
    setShowBoundingBoxSelector(false);
    setShowUploader(false);
  };
  
  const startTennisAnalysis = async (boxes: BoundingBox[]) => {
    if (!videoUrl || !videoMetadata) {
      setError('Video not properly loaded. Please try again.');
      return;
    }
    
    setIsAnalyzing(true);
    setError(null);
    setProgress(0);
    setProcessingMessage("Initializing tennis analysis...");
    
    // Generate a unique ID for this analysis
    const newAnalysisId = `tennis-${uuidv4()}`;
    setAnalysisId(newAnalysisId);
    
    try {
      // Initialize tennis tracker with the selected bounding boxes
      const { initialFrame, pixelsToMeters } = initializeTennisTracker(
        boxes,
        videoMetadata.width,
        videoMetadata.height
      );
      
      // Create a video element to extract frames
      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = 'anonymous';
      
      // Wait for video metadata to load
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video'));
        video.load();
      });
      
      // Set video duration
      const duration = video.duration;
      
      // Calculate total frames to process (2 frames per second)
      const frameRate = 2;
      const totalFrames = Math.floor(duration * frameRate);
      
      // Store all frames
      const frames = [initialFrame];
      
      // Process frames
      for (let frameIndex = 1; frameIndex < totalFrames; frameIndex++) {
        // Calculate timestamp
        const timestamp = frameIndex / frameRate;
        
        // Update progress message
        if (frameIndex < totalFrames * 0.3) {
          setProcessingMessage("Extracting video frames...");
        } else if (frameIndex < totalFrames * 0.6) {
          setProcessingMessage("Tracking player and ball...");
        } else {
          setProcessingMessage("Analyzing player performance...");
        }
        
        try {
          // Seek to timestamp
          video.currentTime = timestamp;
          
          // Wait for seeking to complete
          await new Promise<void>((resolve) => {
            const handleSeeked = () => {
              video.removeEventListener('seeked', handleSeeked);
              resolve();
            };
            video.addEventListener('seeked', handleSeeked);
          });
          
          // Extract frame
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const context = canvas.getContext('2d');
          
          if (!context) {
            throw new Error('Could not get canvas context');
          }
          
          // Draw video frame to canvas
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Convert to base64
          const frameBase64 = canvas.toDataURL('image/jpeg');
          
          // Track objects in this frame
          const frame = await trackFrame(
            frameBase64,
            frameIndex,
            timestamp,
            frames[frames.length - 1],
            pixelsToMeters
          );
          
          // Add frame to collection
          frames.push(frame);
          
          // Update progress
          setProgress((frameIndex / totalFrames) * 100);
        } catch (error) {
          console.error(`Error processing frame at ${timestamp}s:`, error);
          // Continue with next frame
        }
      }
      
      // Generate final analysis result
      const analysisResult = generateAnalysisResult(
        frames,
        {
          duration,
          width: videoMetadata.width,
          height: videoMetadata.height,
          fps: 30
        },
        pixelsToMeters
      );
      
      // Store result in localStorage
      localStorage.setItem(`analysis-${newAnalysisId}`, JSON.stringify(analysisResult));
      
      // Navigate to results page
      router.push(`/tennis/results/${newAnalysisId}?videoUrl=${encodeURIComponent(videoUrl)}`);
    } catch (error: any) {
      console.error('Error analyzing tennis video:', error);
      setError(error.message || 'Error analyzing video');
      setIsAnalyzing(false);
    }
  };
  
  // Get video metadata when video URL changes
  useEffect(() => {
    if (!videoUrl) return;
    
    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';
    
    video.onloadedmetadata = () => {
      setVideoMetadata({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration
      });
    };
    
    video.onerror = () => {
      setError('Error loading video metadata');
    };
    
    video.load();
    
    return () => {
      video.src = '';
    };
  }, [videoUrl]);

  // If we have a video URL and we're not in box selector or analyzing mode, proceed to showing it
  useEffect(() => {
    if (videoUrl && !showBoundingBoxSelector && !isAnalyzing) {
      setShowBoundingBoxSelector(true);
    }
  }, [videoUrl, showBoundingBoxSelector, isAnalyzing]);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Tennis Video Analysis</h1>
      
      {!showUploader && !showBoundingBoxSelector && !isAnalyzing && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-6">Choose Analysis Type</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Player Analysis Card */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center mb-2">
                <span className="text-3xl mr-2">🎾</span>
                <h4 className="text-lg font-semibold">Player Analysis</h4>
              </div>
              <p className="text-gray-600 mb-4">
                Analyze player movement, shots, and performance metrics automatically. Track ball and player positioning.
              </p>
              <button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                onClick={startPlayerAnalysis}
              >
                Start Player Analysis
              </button>
            </div>
            
            {/* Video Analysis Card */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center mb-2">
                <span className="text-3xl mr-2">🎥</span>
                <h4 className="text-lg font-semibold">Video Analysis</h4>
              </div>
              <p className="text-gray-600 mb-4">
                Analyze specific frames of your tennis video. Get detailed feedback on technique, positioning, and tactics.
              </p>
              <Link 
                href="/tennis/video-analysis"
                className="block text-center w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg"
              >
                Go to Video Analysis
              </Link>
            </div>
          </div>
        </div>
      )}

      {showUploader && !showBoundingBoxSelector && !isAnalyzing && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Upload Tennis Video</h2>
            <button 
              onClick={() => setShowUploader(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              ← Back to options
            </button>
          </div>
          <p className="text-gray-600 mb-4">
            Upload a tennis video for player analysis. For best results, use a video that clearly shows the player and the ball.
            <br />
            <strong>Note:</strong> For testing purposes, we recommend using a short video (10-30 seconds) to speed up processing.
          </p>
          <VideoUploader 
            sportType="tennis"
            onUploadComplete={handleUploadComplete}
          />
        </div>
      )}

      {videoUrl && showBoundingBoxSelector && !isAnalyzing && (
        <BoundingBoxSelector
          videoUrl={videoUrl || ''}
          onBoxesSelected={handleBoxesSelected}
          onCancel={handleBoxSelectorCancel}
        />
      )}
      
      {isAnalyzing && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Analyzing Video</h2>
          <div className="mb-4">
            <p className="text-gray-600 mb-2">{processingMessage}</p>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-blue-600 h-2.5 rounded-full" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-500 mt-2">{Math.round(progress)}% complete</p>
          </div>
          <p className="text-gray-600 italic text-sm mt-4">
            This may take a few minutes. Please don&apos;t close this window.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mt-4">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}
    </div>
  );
} 
