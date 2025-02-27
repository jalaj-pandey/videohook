import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Menu, SendHorizonal, Loader, Video, VideoOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import StatusMessage from "@/components/ui/status-message";
import TranscriptPanel from "@/components/ui/transcript-panel";
import EvaluationPanel from "./components/ui/evaluation-panel";
import Settings from "@/components/ui/settings";
import useRealTime from "@/hooks/useRealtime";
import useAudioRecorder from "@/hooks/useAudioRecorder";
import useAudioPlayer from "@/hooks/useAudioPlayer";
import useVideoRecorder from "@/hooks/useVideoRecorder"; // Assuming a custom hook for video recording
import { ThemeProvider, useTheme } from "./context/theme-context";
import { DummyDataProvider, useDummyDataContext } from "@/context/dummy-data-context";
import { AzureSpeechProvider } from "@/context/azure-speech-context";
import dummyTranscriptsData from "@/data/dummyTranscripts.json";
import PersonaPanel from "./components/ui/persona-panel";
// import { saveAs } from "file-saver";

function App() {
    const [isRecording, setIsRecording] = useState(false);
    const [isVideoRecording, setIsVideoRecording] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const { useDummyData } = useDummyDataContext();
    const { theme } = useTheme();

    const [transcripts, setTranscripts] = useState<Array<{ text: string; isUser: boolean; timestamp: Date }>>([]);
    const [dummyTranscripts] = useState<Array<{ text: string; isUser: boolean; timestamp: Date }>>(() => {
        return dummyTranscriptsData.map(transcript => ({
            ...transcript,
            timestamp: new Date(transcript.timestamp)
        }));
    });

    const [evaluation, setEvaluation] = useState<{
        classification: string | null;
        overall_score: 0;
        criteria: Array<any>;
        rationale: string;
        improvement_suggestion: string;
    }>({
        classification: null,
        overall_score: 0,
        criteria: [],
        rationale: "",
        improvement_suggestion: ""
    });

    const [isLoading, setIsLoading] = useState<boolean>(false);

    const videoRef = useRef<HTMLVideoElement | null>(null); // Reference to the video element for preview
    const [videoStream, setVideoStream] = useState<MediaStream | null>(null); // Added state for video stream
    const [videoBlob, setVideoBlob] = useState<Blob | null>(null); // State to hold the recorded video Blob
    const [videoURLs, setVideoURLs] = useState<string[]>([]); // Store video URLs for playback

    const realtime = useRealTime({
        enableInputAudioTranscription: true,
        onWebSocketOpen: () => console.log("WebSocket connection opened"),
        onWebSocketClose: () => console.log("WebSocket connection closed"),
        onWebSocketError: event => console.error("WebSocket error:", event),
        onReceivedError: message => console.error("error", message),
        onReceivedResponseAudioDelta: message => {
            isRecording && playAudio(message.delta);
        },
        onReceivedInputAudioBufferSpeechStarted: () => {
            stopAudioPlayer();
        },
        onReceivedInputAudioTranscriptionCompleted: message => {
            const newTranscriptItem = {
                text: message.transcript,
                isUser: true,
                timestamp: new Date()
            };
            setTranscripts(prev => [...prev, newTranscriptItem]);
        },
        onReceivedResponseDone: message => {
            const transcript = message.response.output.map(output => output.content?.map(content => content.transcript).join(" ")).join(" ");
            if (!transcript) return;

            const newTranscriptItem = {
                text: transcript,
                isUser: false,
                timestamp: new Date()
            };
            setTranscripts(prev => [...prev, newTranscriptItem]);
        }
    });

    const { reset: resetAudioPlayer, play: playAudio, stop: stopAudioPlayer } = useAudioPlayer();
    const { start: startAudioRecording, stop: stopAudioRecording } = useAudioRecorder({
        onAudioRecorded: realtime.addUserAudio
    });

    const { start: startVideoRecording, stop: stopVideoRecording } = useVideoRecorder({
        // onVideoRecorded: (blob) => {
        //     // Save the video Blob after recording stops
        //     setVideoBlob(blob);
        //     const videoUrl = URL.createObjectURL(blob); // Create a URL for the recorded video
        //     setVideoURLs(prev => [...prev, videoUrl]); // Add the new video URL to the list for playback
        // }
        onVideoRecorded: realtime.addUserVideo
    });

    const onToggleListening = async () => {
        if (!isRecording) {
            realtime.startSession();
            await startAudioRecording();
            resetAudioPlayer();
            setIsRecording(true);
        } else {
            await stopAudioRecording();
            stopAudioPlayer();
            realtime.inputAudioBufferClear();
            setIsRecording(false);
        }
    };

    const onToggleVideoRecording = async () => {
        if (!isVideoRecording) {
            // Start video recording
            setIsVideoRecording(true);
            await startVideoRecording(); // Start video recording here
        } else {
            // Stop video recording
            setIsVideoRecording(false);
            await stopVideoRecording(); // Stop video recording here

            // If there's an active stream, stop the video tracks
            if (videoStream) {
                videoStream.getTracks().forEach(track => track.stop());
                setVideoStream(null); // Clean up video stream state
            }
        }
    };

    const handleEvaluate = async () => {
        setIsLoading(true);
        const adaptedTranscript = transcripts.map(message => ({
            speaker: message.isUser ? "Advisor" : "Client",
            text: message.text.trim() // Remove any leading or trailing whitespace
        }));
        const payload = { transcript: adaptedTranscript };
        const result = await fetch("/evaluation/transcript-evaluate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        const evalReceived = await result.json();
        console.log(evalReceived);
        setEvaluation(previous => ({
            ...previous,
            classification: evalReceived.rule_based_eval.evaluation.classification,
            overall_score: evalReceived.rule_based_eval.evaluation.overall_score,
            criteria: [...evalReceived.rule_based_eval.evaluation.criteria],
            rationale: evalReceived.rule_based_eval.evaluation.rationale,
            improvement_suggestion: evalReceived.rule_based_eval.evaluation.improvement_suggestion
        }));
        setIsLoading(false);
    };

    const { t } = useTranslation();

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);


    useEffect(() => {
        if (isVideoRecording) {
            const getVideoStream = async () => {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                    setVideoStream(stream); // Set the stream to the state
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream; 
                    }
                } catch (error) {
                    console.error("Error accessing media devices.", error);
                }
            };
            getVideoStream();
        } else {
            // Stop the video stream when not recording
            if (videoStream) {
                videoStream.getTracks().forEach(track => track.stop());
                setVideoStream(null); 
            }
        }
    }, [isVideoRecording]);

    return (
        <div className={`min-h-screen bg-background p-4 text-foreground ${theme}`}>
            <div className="mx-auto max-w-7xl">
                <div className="relative mb-6 flex flex-col items-center md:mb-4">
                    <h1 className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-center text-4xl font-bold text-transparent md:text-6xl">
                        WISE
                    </h1>
                    <h2 className="margin-l purple m-4 text-2xl font-bold">
                        AI simulation based solution for enablement in the Financial Services Industry on Azure
                    </h2>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 transform">
                        <Settings isMobile={isMobile} />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4 md:gap-8">

                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="outline" className="mb-4 flex w-full items-center justify-center md:hidden">
                                <Menu className="mr-2 h-4 w-4" />
                                View Persona
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-[300px] sm:w-[400px]">
                            <SheetHeader>
                                <SheetTitle>Current Persona</SheetTitle>
                            </SheetHeader>
                            <div className="h-[calc(100vh-4rem)] overflow-auto pr-4">
                                <PersonaPanel />
                            </div>
                        </SheetContent>
                    </Sheet>

                    <Card className="hidden p-6 md:block">
                        <h2 className="mb-4 text-center font-semibold">Current Persona</h2>
                        <div className="h-[calc(100vh-24rem)] overflow-auto pr-4">
                            <PersonaPanel />
                        </div>
                    </Card>


                    <Card className="p-6 md:overflow-auto">
                        <h2 className="mb-4 text-center font-semibold">Controls</h2>
                        <div className="space-y-8">
                            <div className="mb-4 flex flex-col items-center justify-center gap-16">

                                <div>
                                    <Button
                                        onClick={onToggleListening}
                                        className={`h-12 w-60 ${isRecording ? "bg-red-600 hover:bg-red-700" : "bg-purple-500 hover:bg-purple-600"}`}
                                        aria-label={isRecording ? t("app.stopRecording") : t("app.startRecording")}
                                    >
                                        {isRecording ? (
                                            <>
                                                <MicOff className="mr-2 h-4 w-4" />
                                                {t("app.stopConversation")}
                                            </>
                                        ) : (
                                            <>
                                                <Mic className="mr-2 h-6 w-6" />
                                                {t("app.startRecording")}
                                            </>
                                        )}
                                    </Button>
                                    <StatusMessage isRecording={isRecording} />
                                </div>

                                {/* Video Recording Button */}
                                <div>
                                    <Button
                                        onClick={onToggleVideoRecording}
                                        className={`h-12 w-60 ${isVideoRecording ? "bg-red-600 hover:bg-red-700" : "bg-purple-500 hover:bg-purple-600"}`}
                                        aria-label={isVideoRecording ? t("app.stopVideoRecording") : t("app.startVideoRecording")}
                                    >
                                        {isVideoRecording ? (
                                            <>
                                                <VideoOff className="mr-2 h-4 w-4" />
                                                {t("app.stopVideoRecording")}
                                            </>
                                        ) : (
                                            <>
                                                <Video className="mr-2 h-6 w-6" />
                                                {t("app.startVideoRecording")}
                                            </>
                                        )}
                                    </Button>
                                </div>
                                {isVideoRecording && (
                                    <div className="p-6">
                                        <h2 className="mb-4 text-center font-semibold">Video Preview</h2>
                                        <div className="flex justify-center">
                                            <video ref={videoRef} width="300" height="200" autoPlay muted />
                                        </div>
                                    </div>
                                )}

                                {/* Recorded Videos */}
                                <div className="p-6">
                                    <h2 className="mb-4 text-center font-semibold">Recorded Videos</h2>
                                    {videoURLs.length > 0 && (
                                        <div className="space-y-4">
                                            {videoURLs.map((url, index) => (
                                                <div key={index} className="flex flex-col items-center">
                                                    <video controls width="300" height="200" src={url} />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Send for Evaluation */}
                                {!isRecording && !isLoading && transcripts.length > 0 && (
                                    <div className="mb-4 flex flex-col items-center justify-center gap-4">
                                        <Button
                                            onClick={handleEvaluate}
                                            className={`h-12 w-60 ${isRecording ? "bg-red-600 hover:bg-red-700" : "bg-purple-500 hover:bg-purple-600"}`}
                                            aria-label={t("app.sendForEvaluation")}
                                        >
                                            <SendHorizonal className="mr-2 h-6 w-6" />
                                        </Button>
                                        <span>{t("app.sendForEvaluationText")}</span>
                                    </div>
                                )}

                                {/* Loading State */}
                                {isLoading && (
                                    <div className="mb-4 flex flex-col items-center justify-center gap-4">
                                        <Button
                                            onClick={handleEvaluate}
                                            className={`h-12 w-60 ${isRecording ? "bg-red-600 hover:bg-red-700" : "bg-purple-500 hover:bg-purple-600"}`}
                                            aria-label={isRecording ? t("app.stopRecording") : t("app.startRecording")}
                                        >
                                            <Loader className="animate-spin" />
                                        </Button>
                                        <span>Sending For Evaluation..</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>

                    {/* Transcript Panel and Evaluation */}
                    <Card className="hidden p-6 md:block">
                        <h2 className="mb-4 text-center font-semibold">Transcript History</h2>
                        <div className="h-[calc(100vh-24rem)] overflow-auto pr-4">
                            <TranscriptPanel transcripts={useDummyData ? dummyTranscripts : transcripts} />
                        </div>
                    </Card>

                    <Card className="hidden p-6 md:block">
                        <h2 className="mb-4 text-center font-semibold">Evaluation</h2>
                        <div className="h-[calc(100vh-24rem)] overflow-auto pr-4">
                            <EvaluationPanel evaluation={evaluation} />
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default function RootApp() {
    return (
        <ThemeProvider>
            <DummyDataProvider>
                <AzureSpeechProvider>
                    <App />
                </AzureSpeechProvider>
            </DummyDataProvider>
        </ThemeProvider>
    );
}
