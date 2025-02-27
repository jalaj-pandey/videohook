export class VideoRecorder {
    onDataAvailable: (videoFrame: ImageData) => void;
    private mediaStream: MediaStream | null = null;
    private videoElement: HTMLVideoElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private canvasContext: CanvasRenderingContext2D | null = null;

    public constructor(onDataAvailable: (videoFrame: ImageData) => void) {
        this.onDataAvailable = onDataAvailable;
    }

    async start(stream: MediaStream) {
        try {
            this.mediaStream = stream;

            // Set up video capture if video tracks exist
            const videoTracks = this.mediaStream.getVideoTracks();
            if (videoTracks.length > 0) {
                this.setupVideoCapture();
            }
        } catch (error) {
            this.stop();
        }
    }

    private setupVideoCapture() {
        this.videoElement = document.createElement("video");
        this.videoElement.srcObject = this.mediaStream;

        this.canvas = document.createElement("canvas");
        this.canvasContext = this.canvas.getContext("2d");

        this.videoElement.play();
        
        // Call capture function periodically to get video frames
        this.captureVideoFrame();
    }

    private captureVideoFrame() {
        if (this.canvas && this.canvasContext && this.videoElement) {
            // Update canvas size to match the video frame
            this.canvas.width = this.videoElement.videoWidth;
            this.canvas.height = this.videoElement.videoHeight;
            this.canvasContext.drawImage(this.videoElement, 0, 0);

            // Capture the video frame as ImageData
            const videoFrame = this.canvasContext.getImageData(0, 0, this.canvas.width, this.canvas.height);
            
            // Pass the frame data to the callback
            this.onDataAvailable(videoFrame);

            // Recursively call to capture next frame
            requestAnimationFrame(() => this.captureVideoFrame());
        }
    }

    async stop() {
        // Stop video stream
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        // Stop video playback
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.srcObject = null;
            this.videoElement = null;
        }

        // Clean up canvas and context
        if (this.canvas) {
            this.canvasContext = null;
            this.canvas = null;
        }
    }
}
