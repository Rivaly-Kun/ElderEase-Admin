/* eslint-disable no-unused-vars */
import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import jsQR from "jsqr";
import { X, AlertCircle, Camera } from "lucide-react";

const AIPoweredScanner = ({
  showScanner,
  setShowScanner,
  scChapterData,
  paymentsData,
  getImagePath,
  isDeceased,
  extractBarangay,
  onMemberFound, // NEW: callback to open profile modal
}) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scanningRef = useRef(false);
  const animationFrameRef = useRef(null);

  const [scanning, setScanning] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");

  // --- Stop camera ---
  const stopScanner = () => {
    console.log("⛔ Stopping scanner...");
    scanningRef.current = false;
    setScanning(false);
    setProcessingStatus("");

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      console.log("🎥 Stopping video tracks:", tracks.length);
      tracks.forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  };

  const scanLoop = () => {
    if (!scanningRef.current) {
      console.log("❌ Scanning stopped (ref is false)");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      console.warn("⚠️ Missing video or canvas element.");
      animationFrameRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      console.log(
        "⏳ Waiting for video data... readyState =",
        video.readyState
      );
      animationFrameRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    const ctx = canvas.getContext("2d");

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    if (!canvas.width || !canvas.height) {
      console.warn("⚠️ Canvas dimensions are zero.");
      animationFrameRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Try to detect QR code
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code && code.data) {
      console.log("✅ QR Data Detected:", code.data);

      // Visual feedback - green flash
      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.background = "rgba(0,255,0,0.3)";
      overlay.style.zIndex = "9999";
      overlay.style.pointerEvents = "none";
      document.body.appendChild(overlay);
      setTimeout(() => overlay.remove(), 200);

      // Audio feedback
      try {
        const audioContext = new (window.AudioContext ||
          window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 800;
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
      } catch (e) {
        console.log("Audio feedback failed:", e);
      }

      stopScanner();
      handleQRDetected(code.data);
      return;
    }

    // Continue scanning
    animationFrameRef.current = requestAnimationFrame(scanLoop);
  };

  // --- Start camera stream ---
  const startScanner = async () => {
    console.log("🔹 Starting scanner...");
    setProcessingStatus("Starting camera...");

    // Reset state
    scanningRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      console.log("✅ Camera stream acquired");

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", true);

        videoRef.current.onloadedmetadata = () => {
          videoRef.current
            .play()
            .then(() => {
              console.log("▶️ Video playing. Dimensions:", {
                width: videoRef.current.videoWidth,
                height: videoRef.current.videoHeight,
              });

              scanningRef.current = true;
              setScanning(true);
              setProcessingStatus("Camera ready - scanning for QR...");
              scanLoop();
            })
            .catch((err) => {
              console.error("Error playing video:", err);
              setProcessingStatus("Error starting video");
            });
        };
      } else {
        console.warn("⚠️ videoRef.current is null!");
      }
    } catch (error) {
      console.error("❌ Error accessing camera:", error);
      setProcessingStatus("Unable to access camera: " + error.message);
      alert("Camera access denied or unavailable: " + error.message);
    }
  };

  // --- Handle QR code data ---
  const handleQRDetected = (data) => {
    console.log("🔍 handleQRDetected called with:", data);
    setProcessingStatus("QR code detected! Processing...");

    // Try to extract OSCA ID from the data
    // Support formats: "2024-001", "OSCA-2024-001", or just the ID directly
    let oscaID = data.trim();

    // Try to find pattern like "2024-001" or "2024001"
    const match = data.match(/(\d{4}-?\d{3,})/);
    if (match) {
      oscaID = match[1];
    }

    console.log("📋 Parsed OSCA ID:", oscaID);

    // Search for member - try both with and without dash
    let member = scChapterData.find(
      (m) => m.oscaID.toString() === oscaID.toString()
    );

    // If not found, try without dash
    if (!member && oscaID.includes("-")) {
      const idWithoutDash = oscaID.replace("-", "");
      member = scChapterData.find(
        (m) => m.oscaID.toString().replace("-", "") === idWithoutDash
      );
    }

    // If not found, try with dash
    if (!member && !oscaID.includes("-")) {
      const parts = oscaID.match(/(\d{4})(\d+)/);
      if (parts) {
        const idWithDash = `${parts[1]}-${parts[2]}`;
        member = scChapterData.find((m) => m.oscaID.toString() === idWithDash);
      }
    }

    if (member) {
      console.log("✅ Member found:", member);
      handleMemberFound(member);
    } else {
      console.warn("⚠️ No matching member found for QR:", oscaID);
      console.log(
        "Available OSCA IDs:",
        scChapterData.map((m) => m.oscaID).slice(0, 10)
      );
      alert("❌ No matching member found for OSCA ID: " + oscaID);
      setProcessingStatus("Member not found - ready to scan again");
      startScanner();
    }
  };

  // --- When member is found ---
  const handleMemberFound = (member) => {
    console.log("👤 Member found:", member);
    setProcessingStatus("Member identified!");

    // Close the scanner
    stopScanner();
    setShowScanner(false);

    // Call the parent's callback to open the profile modal
    if (onMemberFound) {
      onMemberFound(member);
    }
  };

  // --- Start or stop camera when modal toggles ---
  useEffect(() => {
    console.log("🟢 showScanner changed:", showScanner);
    if (showScanner) {
      startScanner();
    } else {
      stopScanner();
    }

    return () => {
      console.log("🧹 Cleanup effect");
      stopScanner();
    };
  }, [showScanner]);

  if (!showScanner) return null;

  return (
    <>
      {/* Scanner modal */}
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">
                QR Code Scanner
              </h2>
              <p className="text-sm text-gray-500">{processingStatus}</p>
            </div>
            <button
              onClick={() => {
                console.log("❌ Close button pressed");
                stopScanner();
                setShowScanner(false);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="relative bg-black rounded-xl overflow-hidden aspect-video mb-4">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Scanning overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-64 border-4 border-green-500 rounded-lg relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-500"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-500"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500"></div>
              </div>
            </div>

            {/* Status indicator */}
            <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white px-4 py-2 rounded-lg">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    scanning ? "bg-green-500 animate-pulse" : "bg-red-500"
                  }`}
                ></div>
                <span className="text-sm font-medium">
                  {scanning ? "Scanning..." : "Starting..."}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-900 mb-1">
                Instructions:
              </p>
              <p className="text-xs text-blue-700">
                Position the QR code within the green square. Hold steady for
                best results. The scanner will automatically open the member
                profile when detected.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

AIPoweredScanner.propTypes = {
  showScanner: PropTypes.bool.isRequired,
  setShowScanner: PropTypes.func.isRequired,
  scChapterData: PropTypes.array.isRequired,
  paymentsData: PropTypes.array.isRequired,
  getImagePath: PropTypes.func.isRequired,
  isDeceased: PropTypes.func.isRequired,
  extractBarangay: PropTypes.func.isRequired,
  onMemberFound: PropTypes.func, // NEW: callback for when member is found
};

export default AIPoweredScanner;
