import React, { useState } from "react";

// Custom hook for handling video recording
export default function useVideoRecorder({ onVideoRecorded }: { onVideoRecorded: (videoBlob: Blob) => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  
  // Store the video URL for preview
  const [videoURL, setVideoURL] = useState<string | null>(null);

  const videoRef = React.useRef<HTMLVideoElement | null>(null); // Video reference for preview

  // Start recording video
  const start = async () => {
    if (navigator.mediaDevices && !isRecording) {
      try {
        // Request video and audio stream from the user's device
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setVideoStream(stream);

        // Set video stream to video element for live preview
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        const recorder = new MediaRecorder(stream);
        setMediaRecorder(recorder);

        // Array to store video chunks
        const videoChunks: BlobPart[] = [];

        // Collect video data when recording
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            videoChunks.push(event.data);
          }
        };

        // When recording stops, process the video data
        recorder.onstop = () => {
          const videoBlob = new Blob(videoChunks, { type: "video/webm" });
          onVideoRecorded(videoBlob); // Call the callback to handle the recorded video
          
          // Save the video URL for previewing
          const videoURL = URL.createObjectURL(videoBlob);
          setVideoURL(videoURL);
        };

        // Start recording
        recorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Error starting video recording", err);
      }
    }
  };

  // Stop recording video
  const stop = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);

      // Stop the video stream
      if (videoStream) {
        videoStream.getTracks().forEach((track) => track.stop());
      }
    }
  };

  return { start, stop, videoRef, videoURL };
}
