import { useRef } from "react";

type Parameters = {
    onVideoRecorded: (videoBlob: Blob) => void; // Callback for video blobs
};

export default function useVideoRecorder({ onVideoRecorded }: Parameters) {
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);

    const start = async () => {
        // Start video recording
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        mediaStreamRef.current = stream;

        // Set up the MediaRecorder for the video stream
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        const chunks: Blob[] = [];
        
        // Collect video chunks as the video is recorded
        mediaRecorder.ondataavailable = (event) => {
            chunks.push(event.data);
        };

        // Once recording stops, create a Blob and send it to the callback
        mediaRecorder.onstop = () => {
            const videoBlob = new Blob(chunks, { type: "video/webm" });
            onVideoRecorded(videoBlob); // Call the callback with the video Blob
        };

        // Start recording
        mediaRecorder.start();
    };

    const stop = async () => {
        // Stop the video recording
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
        }

        // Stop the video stream
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
        }
    };

    return { start, stop };
}
