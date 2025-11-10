import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { ref, onValue, set } from "firebase/database";
import jsQR from "jsqr";
import {
  QrCode,
  X,
  Calendar,
  MapPin,
  Clock,
  Users,
  User,
  History,
  AlertCircle,
  CheckCircle,
  Scan,
  Loader2,
  StopCircle,
} from "lucide-react";
import { db } from "../services/firebase";
import { createAuditLogger } from "../utils/AuditLogger";

const normalizeOscaId = (value) =>
  (value || "")
    .toString()
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();

const parseOscaIdFromPayload = (rawValue) => {
  if (!rawValue) return "";
  const trimmed = String(rawValue).trim();

  const dashedPattern = trimmed.match(/(\d{4}-\d{3,})/);
  if (dashedPattern) {
    return dashedPattern[1];
  }

  const numericPattern = trimmed.match(/(\d{7,})/);
  if (numericPattern) {
    const digits = numericPattern[1];
    if (digits.length === 7) {
      return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    }
    return digits;
  }

  return trimmed;
};

const formatDateTime = (isoString) => {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} • ${date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

const formatRelativeTime = (isoString) => {
  if (!isoString) return "—";
  const targetTime = new Date(isoString).getTime();
  if (Number.isNaN(targetTime)) return "—";
  const now = Date.now();
  const diffMs = now - targetTime;

  if (diffMs < 30 * 1000) return "Just now";
  if (diffMs < 60 * 60 * 1000)
    return `${Math.floor(diffMs / (60 * 1000))} min ago`;
  if (diffMs < 24 * 60 * 60 * 1000)
    return `${Math.floor(diffMs / (60 * 60 * 1000))} hr ago`;

  return new Date(isoString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const getEventTimestamp = (event) => {
  if (!event?.date) return 0;
  const base = event.date;
  const timeSegment = event.time ? event.time.trim() : "";
  const safeTime =
    timeSegment && /\d{1,2}:\d{2}/.test(timeSegment)
      ? timeSegment.padStart(5, "0")
      : "00:00";
  const composed = `${base}T${safeTime}`;
  const parsed = Date.parse(composed);
  if (!Number.isNaN(parsed)) return parsed;
  const fallback = Date.parse(base);
  return Number.isNaN(fallback) ? 0 : fallback;
};

const EventAttendanceModal = ({ open, onClose, currentUser = null }) => {
  const [events, setEvents] = useState([]);
  const [members, setMembers] = useState([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [scannerActive, setScannerActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [manualOscaId, setManualOscaId] = useState("");
  const [lastSuccess, setLastSuccess] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const scanningRef = useRef(false);
  const pauseRef = useRef(false);
  const processingRef = useRef(false);
  const mediaStreamRef = useRef(null);
  const eventsRefState = useRef(events);
  const membersRefState = useRef(members);
  const selectedEventIdRef = useRef(selectedEventId);

  useEffect(() => {
    eventsRefState.current = events;
  }, [events]);

  useEffect(() => {
    membersRefState.current = members;
  }, [members]);

  useEffect(() => {
    selectedEventIdRef.current = selectedEventId;
  }, [selectedEventId]);

  const actorId = currentUser?.uid || currentUser?.id || "unknown";
  const actorLabel =
    currentUser?.actorLabel ||
    currentUser?.displayName ||
    currentUser?.name ||
    currentUser?.email ||
    currentUser?.username ||
    "Unknown";

  const auditLogger = useMemo(
    () => createAuditLogger(actorId, actorLabel, currentUser?.role),
    [actorId, actorLabel, currentUser?.role]
  );

  const stopScanner = () => {
    scanningRef.current = false;
    pauseRef.current = false;
    processingRef.current = false;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setIsStreaming(false);
  };

  const playFeedback = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const context = new AudioCtx();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.25);
      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + 0.3);
    } catch (error) {
      console.warn("Audio feedback unavailable", error);
    }
  };

  const registerAttendance = async (rawPayload, method) => {
    const currentEvents = eventsRefState.current;
    const currentMembers = membersRefState.current;
    const chosenEventId = selectedEventIdRef.current;

    if (!chosenEventId) {
      setErrorMessage("Select an event before scanning.");
      setStatusMessage("");
      return false;
    }

    const decodedOsca = parseOscaIdFromPayload(rawPayload);
    if (!decodedOsca) {
      setErrorMessage("QR code does not contain a valid OSCA ID.");
      setStatusMessage("");
      return false;
    }

    const normalizedTarget = normalizeOscaId(decodedOsca);
    const matchedMember =
      currentMembers.find(
        (member) => normalizeOscaId(member.oscaID) === normalizedTarget
      ) ||
      currentMembers.find(
        (member) =>
          normalizeOscaId(member.oscaNumber) === normalizedTarget ||
          normalizeOscaId(member.idNumber) === normalizedTarget
      );

    if (!matchedMember) {
      setErrorMessage(`No member found with ID ${decodedOsca}.`);
      setStatusMessage("");
      return false;
    }

    const eventRecord = currentEvents.find((evt) => evt.id === chosenEventId);
    if (!eventRecord) {
      setErrorMessage("Selected event is no longer available.");
      setStatusMessage("");
      return false;
    }

    const nowIso = new Date().toISOString();
    const attendanceRef = ref(
      db,
      `events/${chosenEventId}/attendance/${matchedMember.firebaseKey}`
    );
    const existingEntry = eventRecord.attendance?.[matchedMember.firebaseKey];

    const fullName =
      `${matchedMember.firstName || ""} ${matchedMember.lastName || ""}`
        .trim()
        .replace(/\s+/g, " ") ||
      matchedMember.displayName ||
      matchedMember.fullName ||
      matchedMember.name ||
      "Member";

    const attendancePayload = {
      memberId: matchedMember.firebaseKey,
      displayName: fullName,
      oscaID: matchedMember.oscaID || decodedOsca,
      barangay: matchedMember.barangay || "",
      firstCheckedInAt:
        existingEntry?.firstCheckedInAt || existingEntry?.checkedInAt || nowIso,
      lastCheckedInAt: nowIso,
      checkedInBy: actorLabel,
      checkedInById: actorId,
      method: method === "manual" ? "manual" : "qr",
    };

    attendancePayload.checkedInAt = attendancePayload.firstCheckedInAt;

    await set(attendanceRef, attendancePayload);

    await auditLogger.logAction("ATTEND", "Events", {
      recordId: chosenEventId,
      eventTitle: eventRecord.title,
      memberId: matchedMember.firebaseKey,
      memberName: fullName,
      oscaID: attendancePayload.oscaID,
      checkedInAt: nowIso,
      method: attendancePayload.method,
    });

    playFeedback();

    setErrorMessage("");
    setStatusMessage(
      `Checked in ${fullName} at ${new Date(nowIso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    );
    setLastSuccess({
      memberName: fullName,
      oscaID: attendancePayload.oscaID,
      time: nowIso,
      method: attendancePayload.method,
    });
    setManualOscaId("");

    return true;
  };

  const scanFrame = () => {
    if (!scanningRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      animationRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    if (pauseRef.current) {
      animationRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      animationRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      animationRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code?.data) {
      pauseRef.current = true;
      if (!processingRef.current) {
        processingRef.current = true;
        registerAttendance(code.data, "qr").finally(() => {
          processingRef.current = false;
          setTimeout(() => {
            pauseRef.current = false;
          }, 1200);
        });
      }
    }

    animationRef.current = requestAnimationFrame(scanFrame);
  };

  const startScanner = async () => {
    if (isStreaming) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not supported on this device.");
      setScannerActive(false);
      return;
    }

    try {
      setCameraError("");
      setStatusMessage("Starting camera...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", true);
        await videoRef.current.play();
        scanningRef.current = true;
        setIsStreaming(true);
        setStatusMessage("Scanner ready. Present a QR code.");
        animationRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (error) {
      console.error("Unable to start camera", error);
      setCameraError(error?.message || "Unable to access camera");
      setScannerActive(false);
      stopScanner();
    }
  };

  useEffect(() => {
    if (!open) {
      stopScanner();
      setScannerActive(false);
      setStatusMessage("");
      setErrorMessage("");
      setManualOscaId("");
      return;
    }

    const eventsRefDb = ref(db, "events");
    const membersRefDb = ref(db, "members");

    const unsubscribeEvents = onValue(eventsRefDb, (snapshot) => {
      if (snapshot.exists()) {
        const raw = snapshot.val();
        const mapped = Object.entries(raw).map(([id, value]) => ({
          id,
          ...value,
          attendance: value?.attendance || {},
        }));
        mapped.sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b));
        setEvents(mapped);
      } else {
        setEvents([]);
      }
      setEventsLoaded(true);
    });

    const unsubscribeMembers = onValue(membersRefDb, (snapshot) => {
      if (snapshot.exists()) {
        const raw = snapshot.val();
        const mapped = Object.entries(raw).map(([id, value]) => ({
          firebaseKey: id,
          ...value,
        }));
        setMembers(mapped);
      } else {
        setMembers([]);
      }
      setMembersLoaded(true);
    });

    return () => {
      unsubscribeEvents();
      unsubscribeMembers();
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !events.length) {
      if (!events.length) {
        setSelectedEventId("");
      }
      return;
    }

    if (
      selectedEventId &&
      events.some((event) => event.id === selectedEventId)
    ) {
      return;
    }

    const sorted = [...events].sort(
      (a, b) => getEventTimestamp(a) - getEventTimestamp(b)
    );
    const upcoming = sorted.find(
      (event) => getEventTimestamp(event) >= Date.now()
    );
    const fallback = sorted[0];
    const nextId = (upcoming || fallback)?.id || "";
    if (nextId) {
      setSelectedEventId(nextId);
    }
  }, [events, open, selectedEventId]);

  useEffect(() => {
    if (!open) return;
    if (scannerActive) {
      startScanner();
    } else {
      stopScanner();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerActive, open]);

  const handleManualSubmit = async (event) => {
    event.preventDefault();
    if (!manualOscaId.trim()) return;
    processingRef.current = true;
    const success = await registerAttendance(manualOscaId.trim(), "manual");
    processingRef.current = false;
    if (!success) {
      pauseRef.current = false;
    }
  };

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  const attendanceEntries = useMemo(() => {
    if (!selectedEvent?.attendance) return [];
    return Object.values(selectedEvent.attendance).sort((a, b) => {
      const timeA = new Date(a.lastCheckedInAt || a.checkedInAt || 0).getTime();
      const timeB = new Date(b.lastCheckedInAt || b.checkedInAt || 0).getTime();
      return timeB - timeA;
    });
  }, [selectedEvent]);

  const attendanceCount = attendanceEntries.length;
  const dataLoading = open && (!eventsLoaded || !membersLoaded);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center px-4 py-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col lg:flex-row">
        <div className="lg:w-72 xl:w-80 bg-gradient-to-b from-purple-600 to-purple-700 text-white p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Event Check-In</h2>
            </div>
            <button
              onClick={() => {
                setScannerActive(false);
                onClose();
              }}
              className="p-2 rounded-full hover:bg-white/10 transition"
              aria-label="Close check-in modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <label className="text-xs uppercase tracking-wide text-purple-100/80 mb-2">
            Select Event
          </label>
          <div className="relative mb-4">
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full appearance-none bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-white/40"
            >
              <option value="" className="text-gray-800">
                Choose an event
              </option>
              {events.map((event) => (
                <option
                  key={event.id}
                  value={event.id}
                  className="text-gray-800"
                >
                  {event.title || "Untitled"}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 pointer-events-none">
              ▾
            </div>
          </div>

          {selectedEvent ? (
            <div className="space-y-4 text-sm text-purple-50">
              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 mt-0.5" />
                <div>
                  <p className="font-semibold text-white">
                    {selectedEvent.title}
                  </p>
                  <p>
                    {selectedEvent.date
                      ? new Date(selectedEvent.date).toLocaleDateString(
                          undefined,
                          {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          }
                        )
                      : "Date not set"}
                  </p>
                  <p className="text-xs text-purple-100">
                    {selectedEvent.time
                      ? `Starts ${selectedEvent.time}`
                      : "Time not set"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 mt-0.5" />
                <div>
                  <p className="font-semibold text-white">Location</p>
                  <p>{selectedEvent.location || "To be announced"}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Users className="w-4 h-4 mt-0.5" />
                <div>
                  <p className="font-semibold text-white">Attendance</p>
                  <p>
                    {attendanceCount} attendee{attendanceCount === 1 ? "" : "s"}
                  </p>
                  {attendanceEntries[0] && (
                    <p className="text-xs text-purple-100">
                      Last check-in{" "}
                      {formatRelativeTime(
                        attendanceEntries[0].lastCheckedInAt ||
                          attendanceEntries[0].checkedInAt
                      )}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-white/20">
                <p className="text-xs uppercase tracking-wide text-purple-100/80 mb-3">
                  Recent check-ins
                </p>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/30">
                  {attendanceEntries.length === 0 && (
                    <p className="text-xs text-purple-100/80">
                      No attendees recorded yet.
                    </p>
                  )}
                  {attendanceEntries.slice(0, 6).map((entry) => (
                    <div
                      key={entry.memberId}
                      className="bg-white/10 rounded-lg px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-white">
                        {entry.displayName || "Unnamed"}
                      </p>
                      <p className="text-xs text-purple-100">
                        {entry.oscaID || "No OSCA ID"}
                      </p>
                      <p className="text-[11px] text-purple-200 mt-1">
                        {formatDateTime(
                          entry.lastCheckedInAt || entry.checkedInAt
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-8 text-sm text-purple-100">
              <p>Select an event to view its attendance details.</p>
            </div>
          )}
        </div>

        <div className="flex-1 p-6 lg:p-8 flex flex-col gap-6">
          {dataLoading ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading events and members…</span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    Check-in Station
                  </h3>
                  <p className="text-sm text-gray-500">
                    Scan member QR cards or enter an OSCA ID manually to mark
                    attendance.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setScannerActive((prev) => !prev)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition text-sm font-medium ${
                      scannerActive
                        ? "border-red-200 text-red-600 bg-red-50 hover:bg-red-100"
                        : "border-purple-200 text-purple-600 bg-purple-50 hover:bg-purple-100"
                    }`}
                  >
                    {scannerActive ? (
                      <>
                        <StopCircle className="w-4 h-4" />
                        Stop Scanner
                      </>
                    ) : (
                      <>
                        <Scan className="w-4 h-4" />
                        Start Scanner
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2">
                  <div className="relative bg-gray-900 rounded-2xl overflow-hidden aspect-video flex items-center justify-center">
                    {scannerActive ? (
                      <>
                        <video
                          ref={videoRef}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                        <canvas ref={canvasRef} className="hidden" />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-72 h-72 max-w-[80%] border-4 border-green-500 rounded-xl relative">
                            <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-green-500" />
                            <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-green-500" />
                            <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-green-500" />
                            <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-green-500" />
                          </div>
                        </div>
                        <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-1.5 rounded-full text-xs font-medium">
                          {isStreaming ? "Live" : "Starting"}
                        </div>
                      </>
                    ) : (
                      <div className="text-gray-200 text-center px-6">
                        <QrCode className="w-16 h-16 mx-auto mb-4" />
                        <p className="text-sm">
                          Scanner idle. Click{" "}
                          <span className="font-semibold">Start Scanner</span>{" "}
                          to begin scanning QR codes.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 space-y-3">
                    {cameraError && (
                      <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                        <AlertCircle className="w-4 h-4 mt-0.5" />
                        <div>
                          <p className="font-semibold">Camera error</p>
                          <p>{cameraError}</p>
                        </div>
                      </div>
                    )}

                    {statusMessage && (
                      <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
                        <CheckCircle className="w-4 h-4" />
                        <span>{statusMessage}</span>
                      </div>
                    )}

                    {errorMessage && (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-3 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        <span>{errorMessage}</span>
                      </div>
                    )}

                    {lastSuccess && (
                      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-4 py-3 text-sm">
                        <History className="w-4 h-4" />
                        <div>
                          <p className="font-semibold">
                            Last attendee: {lastSuccess.memberName}
                          </p>
                          <p className="text-xs text-blue-600">
                            {lastSuccess.oscaID || "No OSCA ID"} •{" "}
                            {formatDateTime(lastSuccess.time)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  <form
                    onSubmit={handleManualSubmit}
                    className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4"
                  >
                    <p className="text-sm font-semibold text-gray-900 mb-3">
                      Manual Check-in
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          OSCA ID
                        </label>
                        <input
                          type="text"
                          value={manualOscaId}
                          onChange={(e) => setManualOscaId(e.target.value)}
                          placeholder="e.g., 2025-001"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition"
                      >
                        <User className="w-4 h-4" />
                        Check in manually
                      </button>
                    </div>
                  </form>

                  <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
                    <p className="text-sm font-semibold text-gray-900 mb-3">
                      Attendance Summary
                    </p>
                    <div className="space-y-3 text-sm text-gray-600">
                      <div className="flex items-center justify-between">
                        <span>Total attendees</span>
                        <span className="font-semibold text-gray-900">
                          {attendanceCount}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Recorded by</span>
                        <span className="font-semibold text-gray-900">
                          {actorLabel}
                        </span>
                      </div>
                      {selectedEvent?.description && (
                        <div className="pt-2 border-t border-gray-200 text-xs text-gray-500 leading-5">
                          {selectedEvent.description}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

EventAttendanceModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  currentUser: PropTypes.shape({
    uid: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    actorLabel: PropTypes.string,
    displayName: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
    username: PropTypes.string,
    role: PropTypes.string,
  }),
};

export default EventAttendanceModal;
