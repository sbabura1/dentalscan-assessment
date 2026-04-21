"use client";

import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  CircleDashed,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import MouthGuideOverlay, {
  type FramingState,
  type MouthGuideOverlayHandle,
  type StabilityState,
} from "@/components/MouthGuideOverlay";
import QuickMessageSidebar from "@/components/QuickMessageSidebar";

/**
 * CHALLENGE: SCAN ENHANCEMENT
 * 
 * Your goal is to improve the User Experience of the Scanning Flow.
 * 1. Implement a Visual Guidance Overlay (e.g., a circle or mouth outline) on the video feed.
 * 2. Add real-time feedback to the user (e.g., "Face not centered", "Move closer").
 * 3. Ensure the UI feels premium and responsive.
 */

export default function ScanningFlow() {
  const VIEWS = [
    {
      label: "Front View",
      instruction: "Look straight ahead and show teeth.",
      support: "Keep your face centered inside the guide.",
      readyMessage: "Framing looks good. Capture when ready.",
    },
    {
      label: "Left View",
      instruction: "Turn slightly left and show teeth.",
      support: "Keep both cheek and teeth visible in frame.",
      readyMessage: "Left angle is lined up. Hold steady.",
    },
    {
      label: "Right View",
      instruction: "Turn slightly right and show teeth.",
      support: "Keep teeth visible while staying inside the frame.",
      readyMessage: "Right angle looks good. Hold steady.",
    },
    {
      label: "Upper Teeth",
      instruction: "Tilt up and open mouth wider.",
      support: "Show the full upper arch inside the guide.",
      readyMessage: "Upper teeth are visible. Capture when ready.",
    },
    {
      label: "Lower Teeth",
      instruction: "Tilt down and show lower teeth.",
      support: "Keep the lower arch clearly visible.",
      readyMessage: "Lower teeth are visible. Hold steady.",
    },
  ];
  type CaptureStatus = "pending" | "accepted" | "retake";
  type CaptureSlot = {
    image: string | null;
    status: CaptureStatus;
    feedback: string;
    attempts: number;
  };
  const videoRef = useRef<HTMLVideoElement>(null);
  const mouthGuideRef = useRef<MouthGuideOverlayHandle>(null);
  const uploadStartedRef = useRef(false);
  const [camReady, setCamReady] = useState(false);
  const [captures, setCaptures] = useState<CaptureSlot[]>(() =>
    VIEWS.map(() => ({
      image: null,
      status: "pending",
      feedback: "Capture needed",
      attempts: 0,
    }))
  );
  const [activeViewIndex, setActiveViewIndex] = useState(0);
  const [stabilityState, setStabilityState] = useState<StabilityState>("unstable");
  const [framingState, setFramingState] = useState<FramingState>("unknown");
  const [latestCaptureResult, setLatestCaptureResult] = useState<{
    status: Exclude<CaptureStatus, "pending">;
    message: string;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [uploadedScan, setUploadedScan] = useState<{
    id: string;
    status: string;
    images: string;
    clinicId: string;
    patientLabel: string;
    createdAt: string;
    updatedAt: string;
  } | null>(null);
  const currentUserId = "demo-patient";
  const currentUserName = "Patient Preview";
  const currentView = VIEWS[activeViewIndex];
  const acceptedCaptureCount = useMemo(
    () => captures.filter((capture) => capture.status === "accepted").length,
    [captures]
  );
  const allCapturesAccepted = acceptedCaptureCount === VIEWS.length;
  const submissionContext = camReady
    ? `${acceptedCaptureCount} of ${VIEWS.length} valid photos captured`
    : "Enable camera access to begin capturing";

  const getLiveFeedback = useCallback(
    (viewIndex: number, stability: StabilityState, framing: FramingState) => {
      const view = VIEWS[viewIndex];

      if (framing === "outside") {
        return {
          tone: stability === "stable" ? "warning" : stability === "steadying" ? "warning" : "critical",
          message: "Center your face inside the guide",
          detail: "Move fully inside the oval before taking the photo.",
        };
      }

      if (framing === "partial") {
        return {
          tone: stability === "stable" ? "warning" : stability === "steadying" ? "warning" : "critical",
          message: "Move fully inside the guide",
          detail: "Your face is partly outside the oval. Recenter before you capture.",
        };
      }

      if (stability === "unstable") {
        return {
          tone: "critical",
          message: "Camera is too shaky",
          detail: "Hold your phone still and keep your teeth inside the guide.",
        };
      }

      if (stability === "steadying") {
        if (view.label.includes("Teeth")) {
          return {
            tone: "warning",
            message: "Almost steady",
            detail: "Keep your mouth open and hold still for a moment longer.",
          };
        }

        if (view.label.includes("Left") || view.label.includes("Right")) {
          return {
            tone: "warning",
            message: "Almost steady",
            detail: "Keep this angle and steady the phone before capturing.",
          };
        }

        return {
          tone: "warning",
          message: "Almost steady",
          detail: "Hold still for a moment and capture when the guide turns green.",
        };
      }

      return {
        tone: "ready",
        message: view.readyMessage,
        detail: "Stay steady and keep teeth inside the face-shaped guide.",
      };
    },
    [VIEWS]
  );

  const assessCapture = useCallback(
    (viewIndex: number, stability: StabilityState, framing: FramingState) => {
      const view = VIEWS[viewIndex];

      if (framing === "outside") {
        return {
          status: "retake" as const,
          message: "Face is outside the guide",
        };
      }

      if (framing === "partial") {
        return {
          status: "retake" as const,
          message: "Move fully inside the guide",
        };
      }

      if (stability === "stable") {
        return {
          status: "accepted" as const,
          message: `${view.label} accepted`,
        };
      }

      if (stability === "unstable") {
        return {
          status: "retake" as const,
          message: "Camera was too shaky",
        };
      }

      return {
        status: "retake" as const,
        message: "Almost steady - retake when the guide turns green",
      };
    },
    [VIEWS]
  );

  const findNextNeededIndex = useCallback((slots: CaptureSlot[]) => {
    const nextPendingIndex = slots.findIndex(
      (slot) => slot.status !== "accepted"
    );

    return nextPendingIndex === -1 ? slots.length - 1 : nextPendingIndex;
  }, []);

  // Initialize Camera
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCamReady(true);
        }
      } catch (err) {
        console.error("Camera access denied", err);
      }
    }
    startCamera();
  }, []);

  const handleCapture = useCallback(() => {
    // Boilerplate logic for capturing a frame from the video feed
    const video = videoRef.current;
    if (!video || !currentView) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg");
      const review = assessCapture(activeViewIndex, stabilityState, framingState);
      const updatedCaptures = captures.map((capture, index) =>
        index === activeViewIndex
          ? {
              image: dataUrl,
              status: review.status,
              feedback: review.message,
              attempts: capture.attempts + 1,
            }
          : capture
      );
      const nextIndex =
        review.status === "accepted"
          ? findNextNeededIndex(updatedCaptures)
          : activeViewIndex;

      setCaptures(updatedCaptures);

      setLatestCaptureResult({
        status: review.status,
        message:
          review.status === "accepted"
            ? `${currentView.label} accepted.`
            : `${currentView.label} needs retake: ${review.message}.`,
      });
      setActiveViewIndex(nextIndex);
      setUploadError(null);
      mouthGuideRef.current?.resetStability();
    }
  }, [
    activeViewIndex,
    assessCapture,
    captures,
    currentView,
    findNextNeededIndex,
    framingState,
    stabilityState,
  ]);

  const handleSelectView = useCallback(
    (viewIndex: number) => {
      setActiveViewIndex(viewIndex);
      setLatestCaptureResult((previous) =>
        captures[viewIndex].image
          ? {
              status:
                captures[viewIndex].status === "accepted"
                  ? "accepted"
                  : "retake",
              message:
                captures[viewIndex].status === "accepted"
                  ? `${VIEWS[viewIndex].label} ready to review or replace.`
                  : `${VIEWS[viewIndex].label} still needs retake.`,
            }
          : previous
      );
      setUploadError(null);
      window.requestAnimationFrame(() => {
        mouthGuideRef.current?.resetStability();
      });
    },
    [VIEWS, captures]
  );

  const handleSubmitScan = useCallback(async () => {
    if (!allCapturesAccepted || uploadStartedRef.current) {
      return;
    }

    uploadStartedRef.current = true;
    setIsUploading(true);
    setUploadError(null);

    try {
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          images: captures
            .map((capture) => capture.image)
            .filter((image): image is string => Boolean(image)),
          clinicId: "demo-clinic",
          patientLabel: "Patient Preview",
        }),
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const scan = await response.json();
      setUploadedScan(scan);
    } catch (error) {
      console.error("Failed to upload scan", error);
      uploadStartedRef.current = false;
      setUploadError("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }, [allCapturesAccepted, captures]);

  const handleRestartScan = useCallback(() => {
    uploadStartedRef.current = false;
    setCaptures(
      VIEWS.map(() => ({
        image: null,
        status: "pending",
        feedback: "Capture needed",
        attempts: 0,
      }))
    );
    setActiveViewIndex(0);
    setLatestCaptureResult(null);
    setIsUploading(false);
    setUploadError(null);
    setIsSidebarOpen(false);
    setUploadedScan(null);
    setFramingState("unknown");

    window.requestAnimationFrame(() => {
      mouthGuideRef.current?.resetStability();
    });
  }, [VIEWS]);

  const liveFeedback = getLiveFeedback(activeViewIndex, stabilityState, framingState);

  return (
    <div className="flex flex-col items-center bg-black min-h-screen text-white">
      <div className="p-4 w-full bg-zinc-900 border-b border-zinc-800 flex justify-between">
        <h1 className="font-bold text-blue-400">DentalScan AI</h1>
        <span className="text-xs text-zinc-500">
          {uploadedScan
            ? "Results Ready"
            : allCapturesAccepted
              ? "Ready to Submit"
              : `Step ${activeViewIndex + 1}/${VIEWS.length}`}
        </span>
      </div>

      {!uploadedScan ? (
        <>
          <div className="w-full max-w-md px-6 pt-6 text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-blue-400/80">
              Active capture
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              {currentView.instruction}
            </h2>
            <p className="mt-2 text-sm text-zinc-400">{currentView.support}</p>
          </div>

          <div className="relative mt-5 w-full max-w-md aspect-[3/4] bg-zinc-950 overflow-hidden flex items-center justify-center">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-cover" 
            />

            <MouthGuideOverlay
              ref={mouthGuideRef}
              onStabilityChange={setStabilityState}
              onFramingChange={setFramingState}
              videoRef={videoRef}
            />

            <div className="absolute left-4 right-4 top-4">
              <div
                className={`rounded-2xl border px-4 py-3 backdrop-blur ${
                  liveFeedback.tone === "ready"
                    ? "border-green-500/40 bg-green-500/10"
                    : liveFeedback.tone === "critical"
                      ? "border-red-500/45 bg-red-950/40"
                      : "border-amber-500/40 bg-black/55"
                }`}
              >
                <div className="flex items-start gap-3">
                  {liveFeedback.tone === "ready" ? (
                    <CheckCircle2 className="mt-0.5 text-green-400" size={18} />
                  ) : liveFeedback.tone === "critical" ? (
                    <AlertTriangle className="mt-0.5 text-red-400" size={18} />
                  ) : (
                    <AlertTriangle className="mt-0.5 text-amber-400" size={18} />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {liveFeedback.message}
                    </p>
                    <p className="mt-1 text-xs text-zinc-300">
                      {liveFeedback.detail}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-4 left-4 right-4">
              <div className="rounded-2xl border border-zinc-800 bg-black/55 px-4 py-3 backdrop-blur">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                      Quality status
                    </p>
                    <p className="mt-1 text-sm font-medium text-white">
                      {latestCaptureResult?.message ?? "Keep your teeth inside the guide and capture when it turns green."}
                    </p>
                  </div>
                  <div className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300">
                    Tap a thumbnail to replace
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full max-w-md px-6 pt-6">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Submission status
                  </p>
                  <p className="mt-2 text-sm font-medium text-white">
                    {submissionContext}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {allCapturesAccepted
                      ? "All views passed quality checks. Submit when ready."
                      : "Submission unlocks after all 5 views show Accepted."}
                  </p>
                </div>

                <button
                  onClick={handleCapture}
                  disabled={!camReady || isUploading}
                  className="h-20 w-20 rounded-full border-4 border-white flex items-center justify-center transition-transform disabled:cursor-not-allowed disabled:opacity-40 active:scale-90"
                  type="button"
                >
                  <div className="flex h-16 w-16 rounded-full bg-white items-center justify-center">
                    <Camera className="text-black" />
                  </div>
                </button>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  className="inline-flex items-center gap-2 rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-blue-500/40"
                  disabled={!allCapturesAccepted || isUploading}
                  onClick={() => void handleSubmitScan()}
                  type="button"
                >
                  {isUploading ? (
                    <RefreshCw className="animate-spin" size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  Submit Scan
                </button>

                <button
                  onClick={handleRestartScan}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white"
                  type="button"
                >
                  <RefreshCw size={16} />
                  Start Over
                </button>
              </div>

              {uploadError && (
                <p className="mt-3 text-sm text-red-400">{uploadError}</p>
              )}
            </div>
          </div>

          <div className="flex w-full gap-3 overflow-x-auto px-4 py-6">
            {VIEWS.map((view, index) => {
              const capture = captures[index];
              const isActive = index === activeViewIndex;
              const statusStyles =
                capture.status === "accepted"
                  ? "border-green-500/60 bg-green-500/10"
                  : capture.status === "retake"
                    ? "border-amber-500/60 bg-amber-500/10"
                    : "border-zinc-800 bg-transparent";

              return (
                <button
                  key={view.label}
                  className={`w-24 shrink-0 overflow-hidden rounded-2xl border-2 text-left transition-colors ${statusStyles} ${
                    isActive ? "ring-2 ring-blue-500/70" : ""
                  }`}
                  onClick={() => handleSelectView(index)}
                  type="button"
                >
                  {capture.image ? (
                    <img
                      alt={view.label}
                      className="h-20 w-full object-cover"
                      src={capture.image}
                    />
                  ) : (
                    <div className="flex h-20 w-full items-center justify-center bg-zinc-950 text-zinc-700">
                      <CircleDashed size={18} />
                    </div>
                  )}

                  <div className="space-y-1 border-t border-zinc-800 px-2 py-2">
                    <p className="text-[11px] font-medium text-zinc-100">
                      {view.label}
                    </p>
                    <p
                      className={`text-[10px] font-medium ${
                        capture.status === "accepted"
                          ? "text-green-400"
                          : capture.status === "retake"
                            ? "text-amber-300"
                            : "text-zinc-500"
                      }`}
                    >
                      {capture.status === "accepted"
                        ? "Accepted"
                        : capture.status === "retake"
                          ? "Retake needed"
                          : "Capture needed"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="relative w-full max-w-md aspect-[3/4] bg-zinc-950 overflow-hidden flex items-center justify-center">
          <div className="flex h-full w-full flex-col bg-zinc-950 p-6 text-left">
            <div className="space-y-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-green-400">
                  <CheckCircle2 size={14} />
                  {uploadedScan ? "Results Ready" : "Processing"}
                </div>
                <h2 className="mt-4 text-2xl font-bold text-white">
                  {uploadedScan ? "Scan Summary" : "Scan Complete"}
                </h2>
                <p className="mt-2 text-sm text-zinc-400">
                  {isUploading && "Uploading results..."}
                  {!isUploading && uploadedScan && "Your scan is ready."}
                  {!isUploading && uploadError && uploadError}
                </p>
              </div>

              {uploadedScan && (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white"
                    onClick={handleRestartScan}
                    type="button"
                  >
                    <RefreshCw size={16} />
                    Exit
                  </button>

                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-400"
                    onClick={() => setIsSidebarOpen(true)}
                    type="button"
                  >
                    <MessageSquare size={16} />
                    Messages
                  </button>
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              {captures.map((capture, index) => (
                <div
                  key={`${VIEWS[index].label}-${index}`}
                  className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"
                >
                  <img
                    alt={VIEWS[index].label}
                    className="h-24 w-full object-cover"
                    src={capture.image ?? ""}
                  />
                  <div className="border-t border-zinc-800 px-3 py-2">
                    <p className="text-xs font-medium text-zinc-200">{VIEWS[index].label}</p>
                    <p className="mt-1 text-[11px] text-green-400">Accepted</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Patient</p>
                <p className="mt-1 text-sm font-medium text-white">
                  {uploadedScan?.patientLabel ?? "Patient Preview"}
                </p>
              </div>

              <button
                onClick={handleRestartScan}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white"
                type="button"
              >
                <RefreshCw size={16} />
                Start New Scan
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadedScan && (
        <QuickMessageSidebar
          scanId={uploadedScan.id}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}
