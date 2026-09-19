"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Play, Pause, Volume2, Mic, MicOff, RotateCcw, ThumbsUp, Flame, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";

export interface AudioStudyPlayerProps {
  card: {
    front: string;
    back: string;
  } | null;
  isFlipped: boolean;
  onFlipTo: (flipped: boolean) => void;
  onRate: (quality: number) => void;
  onCloseHandsFree: () => void;
}

export function AudioStudyPlayer({ card, isFlipped, onFlipTo, onRate, onCloseHandsFree }: AudioStudyPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMicActive, setIsMicActive] = useState(false);
  const [currentStep, setCurrentStep] = useState<"reading_front" | "thinking" | "reading_back" | "listening">("reading_front");
  const [recognizedSpeech, setRecognizedSpeech] = useState<string>("");
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const recognitionRef = useRef<any>(null);

  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(false);

  // Speak helper
  const speakText = useCallback(
    (text: string, onEnd?: () => void) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        onEnd?.();
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = speechRate;

        utterance.onend = () => {
          onEnd?.();
        };
        utterance.onerror = () => {
          onEnd?.();
        };

        window.speechSynthesis.speak(utterance);
      } catch {
        onEnd?.();
      }
    },
    [speechRate]
  );

  // Recognition setup
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        setSpeechRecognitionSupported(true);
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-US";

        rec.onresult = (event: any) => {
          let transcript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          transcript = transcript.trim().toLowerCase();
          setRecognizedSpeech(transcript);

          if (transcript.includes("again") || transcript.includes("wrong")) {
            onRate(1);
            setRecognizedSpeech("Rated: AGAIN");
          } else if (transcript.includes("hard")) {
            onRate(2);
            setRecognizedSpeech("Rated: HARD");
          } else if (transcript.includes("good") || transcript.includes("got it")) {
            onRate(3);
            setRecognizedSpeech("Rated: GOOD");
          } else if (transcript.includes("easy") || transcript.includes("perfect")) {
            onRate(4);
            setRecognizedSpeech("Rated: EASY");
          }
        };

        rec.onerror = () => {
          setIsMicActive(false);
          setRecognizedSpeech("Mic unavailable - use buttons below");
        };

        recognitionRef.current = rec;
      } else {
        setSpeechRecognitionSupported(false);
      }
    } catch {
      setSpeechRecognitionSupported(false);
    }
  }, [onRate]);

  // Voice toggle
  const toggleMic = () => {
    if (!speechRecognitionSupported || !recognitionRef.current) {
      setRecognizedSpeech("Voice input not supported on this browser. Use TTS + rating buttons.");
      return;
    }
    if (isMicActive) {
      try { recognitionRef.current.stop(); } catch {}
      setIsMicActive(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsMicActive(true);
      } catch {
        setIsMicActive(false);
        setRecognizedSpeech("Mic permission denied or busy");
      }
    }
  };

  // Automated study flow effect
  useEffect(() => {
    if (!card || !isPlaying) return;

    if (!isFlipped) {
      setCurrentStep("reading_front");
      speakText(card.front, () => {
        setCurrentStep("thinking");
        const timer = setTimeout(() => {
          onFlipTo(true);
        }, 2500);
        return () => clearTimeout(timer);
      });
    } else {
      setCurrentStep("reading_back");
      speakText(card.back, () => {
        setCurrentStep("listening");
      });
    }
  }, [card, isFlipped, isPlaying, speakText, onFlipTo]);

  if (!card) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-bg-raised/90 p-8 shadow-2xl backdrop-blur">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
          </span>
          <span className="text-xs font-bold uppercase tracking-widest text-primary">
            Hands-Free Audio Study Mode
          </span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={speechRate}
            onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
            className="rounded-full border border-border bg-bg px-3 py-1 text-xs font-bold text-fg focus:outline-none"
          >
            <option value={0.8}>0.8x Speed</option>
            <option value={1.0}>1.0x Speed</option>
            <option value={1.25}>1.25x Speed</option>
            <option value={1.5}>1.5x Speed</option>
          </select>

          <Button variant="secondary" size="sm" onClick={onCloseHandsFree}>
            Exit Hands-Free
          </Button>
        </div>
      </div>

      {/* Waveform animation display */}
      <div className="my-8 flex items-center justify-center gap-1.5 h-16">
        {[40, 75, 55, 90, 60, 100, 45, 80, 50, 85, 65, 95, 35].map((h, i) => (
          <div
            key={i}
            className="w-1.5 rounded-full bg-gradient-to-t from-primary/40 to-primary transition-all duration-300"
            style={{
              height: isPlaying ? `${h}%` : "15%",
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>

      {/* Main card display */}
      <div className="text-center">
        <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary mb-3">
          {isFlipped ? "Back (Answer)" : "Front (Question)"}
        </span>

        <h2 className="text-2xl font-bold tracking-tight text-fg lg:text-3xl max-w-xl mx-auto">
          {isFlipped ? card.back : card.front}
        </h2>

        {/* Step indicator */}
        <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-muted-fg">
          Status: {currentStep.replaceAll("_", " ")}
        </p>

        {recognizedSpeech && (
          <p className="mt-2 text-xs font-mono text-primary animate-pulse">
            Voice Detected: &quot;{recognizedSpeech}&quot;
          </p>
        )}
      </div>

      {/* Controls & Voice commands bar */}
      <div className="mt-8 pt-6 border-t border-border flex flex-wrap items-center justify-between gap-4">
        {/* Play/Pause & Mic buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg transition-transform hover:scale-105"
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} className="ms-0.5" />}
          </button>

          <button
            onClick={toggleMic}
            className={`flex h-12 w-12 items-center justify-center rounded-full border transition-transform hover:scale-105 ${
              isMicActive
                ? "border-red-500 bg-red-500/20 text-red-500 animate-pulse"
                : "border-border bg-bg text-muted-fg"
            }`}
          >
            {isMicActive ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
        </div>

        {/* Voice Command Hints */}
        <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-muted-fg">
          <span>Say:</span>
          <span className="rounded bg-bg px-2 py-0.5 border border-border">&quot;Again&quot;</span>
          <span className="rounded bg-bg px-2 py-0.5 border border-border">&quot;Hard&quot;</span>
          <span className="rounded bg-bg px-2 py-0.5 border border-border">&quot;Good&quot;</span>
          <span className="rounded bg-bg px-2 py-0.5 border border-border">&quot;Easy&quot;</span>
        </div>

        {/* Rating Buttons */}
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => onRate(1)} className="text-red-400">
            Again (1)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onRate(2)} className="text-amber-400">
            Hard (2)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onRate(3)} className="text-emerald-400">
            Good (3)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onRate(4)} className="text-blue-400">
            Easy (4)
          </Button>
        </div>
      </div>
    </div>
  );
}
