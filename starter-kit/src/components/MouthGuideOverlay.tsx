"use client";

import React, {
  type RefObject,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type MouthGuideOverlayHandle = {
  resetStability: () => void;
};

export type StabilityState = "unstable" | "steadying" | "stable";
export type FramingState = "unknown" | "outside" | "partial" | "inside";

type MouthGuideOverlayProps = {
  onStabilityChange?: (stability: StabilityState) => void;
  onFramingChange?: (framing: FramingState) => void;
  videoRef?: RefObject<HTMLVideoElement | null>;
};

const STROKE_BY_STATE: Record<StabilityState, string> = {
  unstable: "#EF4444",
  steadying: "#F59E0B",
  stable: "#22C55E",
};

type DetectedFace = {
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type FaceDetectorInstance = {
  detect: (input: HTMLVideoElement) => Promise<DetectedFace[]>;
};

type FaceDetectorConstructor = new (options?: {
  fastMode?: boolean;
  maxDetectedFaces?: number;
}) => FaceDetectorInstance;

declare global {
  interface Window {
    FaceDetector?: FaceDetectorConstructor;
  }
}

const MouthGuideOverlay = memo(
  forwardRef<MouthGuideOverlayHandle, MouthGuideOverlayProps>(function MouthGuideOverlay(
    { onStabilityChange, onFramingChange, videoRef },
    ref
  ) {
    const [stability, setStability] = useState<StabilityState>("unstable");
    const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const sampleIntervalRef = useRef<number>();
    const framingIntervalRef = useRef<number>();
    const previousSampleRef = useRef<Uint8ClampedArray | null>(null);
    const stableSamplesRef = useRef(0);
    const stabilityRef = useRef<StabilityState>("unstable");
    const framingRef = useRef<FramingState>("unknown");
    const detectorRef = useRef<FaceDetectorInstance | null>(null);
    const detectionInFlightRef = useRef(false);

    const clearSampling = useCallback(() => {
      if (sampleIntervalRef.current) {
        window.clearInterval(sampleIntervalRef.current);
      }
    }, []);

    const updateStability = useCallback(
      (nextStability: StabilityState) => {
        if (stabilityRef.current === nextStability) {
          return;
        }

        stabilityRef.current = nextStability;
        setStability(nextStability);
      },
      []
    );

    const clearFramingDetection = useCallback(() => {
      if (framingIntervalRef.current) {
        window.clearInterval(framingIntervalRef.current);
      }
    }, []);

    const updateFraming = useCallback((nextFraming: FramingState) => {
      if (framingRef.current === nextFraming) {
        return;
      }

      framingRef.current = nextFraming;
      onFramingChange?.(nextFraming);
    }, [onFramingChange]);

    const createBorderSample = useCallback((video: HTMLVideoElement) => {
      if (!sampleCanvasRef.current) {
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 64;
        sampleCanvasRef.current = canvas;
      }

      const canvas = sampleCanvasRef.current;
      const context = canvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!context) {
        return null;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const borderPixels: number[] = [];

      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const isBorderPixel =
            x < 8 ||
            x >= canvas.width - 8 ||
            y < 10 ||
            y >= canvas.height - 10;

          if (!isBorderPixel) {
            continue;
          }

          const offset = (y * canvas.width + x) * 4;
          const grayscale =
            frame[offset] * 0.299 +
            frame[offset + 1] * 0.587 +
            frame[offset + 2] * 0.114;

          borderPixels.push(grayscale);
        }
      }

      return new Uint8ClampedArray(borderPixels);
    }, []);

    const resetStability = useCallback(() => {
      previousSampleRef.current = null;
      stableSamplesRef.current = 0;
      updateStability("unstable");
    }, [updateStability]);

    useImperativeHandle(
      ref,
      () => ({
        resetStability,
      }),
      [resetStability]
    );

    useEffect(() => {
      resetStability();
      updateFraming("unknown");

      return () => {
        clearSampling();
        clearFramingDetection();
      };
    }, [clearFramingDetection, clearSampling, resetStability, updateFraming]);

    useEffect(() => {
      onStabilityChange?.(stability);
    }, [onStabilityChange, stability]);

    useEffect(() => {
      const video = videoRef?.current;

      if (!video) {
        resetStability();
        return;
      }

      const evaluateStability = () => {
        if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
          return;
        }

        const currentSample = createBorderSample(video);

        if (!currentSample) {
          return;
        }

        if (!previousSampleRef.current) {
          previousSampleRef.current = currentSample;
          return;
        }

        let totalDifference = 0;

        for (let index = 0; index < currentSample.length; index += 1) {
          totalDifference += Math.abs(currentSample[index] - previousSampleRef.current[index]);
        }

        previousSampleRef.current = currentSample;
        const averageDifference = totalDifference / currentSample.length;

        if (averageDifference <= 3.25) {
          stableSamplesRef.current += 1;
          updateStability(stableSamplesRef.current >= 2 ? "stable" : "steadying");
          return;
        }

        if (averageDifference <= 6.5) {
          stableSamplesRef.current = 0;
          updateStability("steadying");
          return;
        }

        stableSamplesRef.current = 0;
        updateStability("unstable");
      };

      resetStability();
      sampleIntervalRef.current = window.setInterval(evaluateStability, 350);

      return () => {
        clearSampling();
      };
    }, [clearSampling, createBorderSample, resetStability, updateStability, videoRef]);

    useEffect(() => {
      const video = videoRef?.current;
      const FaceDetectorApi = window.FaceDetector;

      if (!video || !FaceDetectorApi) {
        updateFraming("unknown");
        return;
      }

      detectorRef.current = new FaceDetectorApi({
        fastMode: true,
        maxDetectedFaces: 1,
      });

      const evaluateFraming = (face: DetectedFace): FramingState => {
        const frameWidth = video.videoWidth || 1;
        const frameHeight = video.videoHeight || 1;
        const faceLeft = face.boundingBox.x / frameWidth;
        const faceTop = face.boundingBox.y / frameHeight;
        const faceRight = (face.boundingBox.x + face.boundingBox.width) / frameWidth;
        const faceBottom = (face.boundingBox.y + face.boundingBox.height) / frameHeight;
        const centerX = (face.boundingBox.x + face.boundingBox.width / 2) / frameWidth;
        const centerY = (face.boundingBox.y + face.boundingBox.height / 2) / frameHeight;
        const guideBounds = {
          left: 0.28,
          right: 0.72,
          top: 0.2,
          bottom: 0.7925,
        };
        const overlapWidth = Math.max(
          0,
          Math.min(faceRight, guideBounds.right) - Math.max(faceLeft, guideBounds.left)
        );
        const overlapHeight = Math.max(
          0,
          Math.min(faceBottom, guideBounds.bottom) - Math.max(faceTop, guideBounds.top)
        );
        const overlapArea = overlapWidth * overlapHeight;
        const faceArea = Math.max((faceRight - faceLeft) * (faceBottom - faceTop), 0.0001);
        const overlapRatio = overlapArea / faceArea;
        const fullyInsideGuide =
          faceLeft >= guideBounds.left &&
          faceRight <= guideBounds.right &&
          faceTop >= guideBounds.top &&
          faceBottom <= guideBounds.bottom;
        const centered =
          Math.abs(centerX - 0.5) <= 0.12 && Math.abs(centerY - 0.5) <= 0.16;

        if (fullyInsideGuide && centered && overlapRatio >= 0.92) {
          return "inside";
        }

        if (overlapRatio >= 0.45) {
          return "partial";
        }

        return "outside";
      };

      const detectFraming = async () => {
        if (
          detectionInFlightRef.current ||
          !detectorRef.current ||
          video.readyState < 2 ||
          video.videoWidth === 0 ||
          video.videoHeight === 0
        ) {
          return;
        }

        detectionInFlightRef.current = true;

        try {
          const faces = await detectorRef.current.detect(video);

          if (!faces.length) {
            updateFraming("outside");
          } else {
            updateFraming(evaluateFraming(faces[0]));
          }
        } catch (error) {
          console.error("Face framing detection unavailable.", error);
          updateFraming("unknown");
          clearFramingDetection();
        } finally {
          detectionInFlightRef.current = false;
        }
      };

      void detectFraming();
      framingIntervalRef.current = window.setInterval(() => {
        void detectFraming();
      }, 550);

      return () => {
        clearFramingDetection();
      };
    }, [clearFramingDetection, updateFraming, videoRef]);

    return (
      <div className="absolute inset-0 h-full w-full pointer-events-none">
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <path
            d="M50 20C61.5 20 70.5 29 72 40C73.5 52 68.5 67 57.5 75.5C54.25 78 52.25 79.25 50 79.25C47.75 79.25 45.75 78 42.5 75.5C31.5 67 26.5 52 28 40C29.5 29 38.5 20 50 20Z"
            fill="rgba(255,255,255,0.04)"
            stroke={STROKE_BY_STATE[stability]}
            strokeWidth="2.5"
            strokeDasharray="5 4"
            style={{ transition: "stroke 0.4s ease" }}
          />
          <path
            d="M37 50C41 55 45.25 57.5 50 57.5C54.75 57.5 59 55 63 50"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M39.5 43.5C42.5 40.5 46 39 50 39C54 39 57.5 40.5 60.5 43.5"
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </svg>

        <div className="absolute inset-x-0 top-[64%] flex justify-center px-4">
          <span
            className={`rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium text-white transition-opacity duration-300 ${
              stability === "stable" ? "opacity-0" : "opacity-100"
            }`}
          >
            Align teeth inside oval
          </span>
        </div>
      </div>
    );
  })
);

export default MouthGuideOverlay;
