"use client";
// cspell:ignore supabase SUPABASE Bicolano Bhojpuri

import { useState, useEffect, useRef, useMemo, useCallback, useId } from "react";
import {
  AudioWaveform,
  Mic,
  Copy,
  Users,
  History,
  BookOpen,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Download,
  Play,
  Key,
  Loader2,
  PhoneOff,
  Volume2,
  Phone,
  Upload,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  Maximize2,
  Minimize2,
  Pause,
  Plug2,
  X,
  FileUp,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import OrbitCore from "@vapi-ai/web";
import { Voice, UserTtsHistoryItem } from "@/lib/services/echo";
import DocsPane from "@/components/DocsPane";
import { enhanceTextForTTS, normalizeForTTS, BREAK_TAG } from "@/lib/tts-enhancer";
import { supabase } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";

// type Voice moved to echo.ts

const orbit = typeof window !== "undefined" ? new OrbitCore(process.env.NEXT_PUBLIC_ORBIT_TOKEN || "") : null;

const languageDialectMap: Record<string, string[]> = {
  "Filipino": ["Cebuano", "Tagalog", "Ilocano", "Bicolano"],
  "English": ["USA", "UK", "Australia", "Canada", "India", "Ireland"],
  "Spanish": ["Spain", "Mexico", "Argentina", "Colombia"],
  "French": ["France", "Canada", "Belgium"],
  "German": ["Germany", "Switzerland", "Austria"],
  "Hindi": ["Standard Hindi", "Bhojpuri", "Punjabi"],
  "Japanese": ["Tokyo", "Osaka", "Kyoto"],
  "Dutch": ["Belgium", "Netherlands"],
};

// Default sample agent (MorganCsr) for testing Orbit Web Call
const DEFAULT_SAMPLE_AGENT = {
  id: "019c51ea-8ce8-4962-9b83-70023ec0d6c2",
  name: "MorganCsr",
} as const;

// Fallback defaults when Ivan not found
const DEFAULT_AGENT_NAME = "Customer Support Bot";
const DEFAULT_AGENT_INTRO = "Hi! I'm your assistant. How can I help you today?";
const DEFAULT_AGENT_SKILLS = "You are a helpful customer support agent. You can answer questions about products, process orders, and handle returns. Be friendly and concise.";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("pane-audio");
  const [audioSubTab, setAudioSubTab] = useState("tts");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceSearch, setVoiceSearch] = useState("");
  const [voiceCategoryFilter, setVoiceCategoryFilter] = useState("all");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [ttsText, setTtsText] = useState(
    "Okay, you are NOT going to believe this. You know how I've been totally stuck on that short story? Like, staring at the screen for HOURS, just... nothing? I was seriously about to just trash the whole thing. But then! Last night, this one little phrase popped into my head. And it was like... the FLOODGATES opened! It all just CLICKED. I am so incredibly PUMPED. It went from feeling like a chore to feeling like... MAGIC."
  );
  const [ttsStatus, setTtsStatus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancingExpression, setIsEnhancingExpression] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [callStatus, setCallStatus] = useState<"idle" | "loading" | "active">("idle");
  const [activeAgentId, setActiveAgentId] = useState("");
  const [transcript, setTranscript] = useState<{ text: string; role: "user" | "agent" }[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [callVolume, setCallVolume] = useState(0);
  const [showTestCallModal, setShowTestCallModal] = useState(false);
  const audioVizId = useId();
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot">("login");
  const [authStatus, setAuthStatus] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthProcessing, setIsAuthProcessing] = useState(false);

  const [history, setHistory] = useState<UserTtsHistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const historyAudioRef = useRef<HTMLAudioElement>(null);
  const playHistoryAbortRef = useRef<AbortController | null>(null);
  const [historyAudioUrl, setHistoryAudioUrl] = useState<string | null>(null);
  const [playingHistoryId, setPlayingHistoryId] = useState<string | null>(null);
  const [downloadMenuId, setDownloadMenuId] = useState<string | null>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const [docsCopyFeedback, setDocsCopyFeedback] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("https://your-domain.com/api/v1");

  const [callLogFilterType, setCallLogFilterType] = useState<string>("all");
  const [callLogFilterAssistant, setCallLogFilterAssistant] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setApiBaseUrl(`${window.location.origin}/api/v1`);
    }
  }, []);

  useEffect(() => {
    if (!downloadMenuId) return;
    const handler = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setDownloadMenuId(null);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [downloadMenuId]);

  // Play history audio after React has updated the DOM (avoids AbortError from src update during play)
  useEffect(() => {
    if (!historyAudioUrl || !playingHistoryId || !historyAudioRef.current) return;
    const el = historyAudioRef.current;
    el.pause();
    el.play().catch(() => {});
  }, [historyAudioUrl, playingHistoryId]);

  const [models, setModels] = useState<{ model_id: string; name: string; languages: { language_id: string; name: string }[] }[]>([]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("echo-theme") as "dark" | "light" || "dark";
    setTheme(savedTheme);
    const isLight = savedTheme === "light";
    document.documentElement.classList.toggle("light-mode", isLight);
    document.body.classList.toggle("light-mode", isLight);

    if (!orbit) return;

    const onCallStart = () => setCallStatus("active");
    const onCallEnd = () => {
      setCallStatus("idle");
      setActiveAgentId("");
      setTranscript([]);
      setShowTestCallModal(false);
    };
    const onError = (e: unknown) => {
      console.error("Orbit Error:", e);
      setCallStatus("idle");
      setShowTestCallModal(false);
    };
    const onMessage = (message: { type: string; transcriptType?: string; transcript?: string; role?: "user" | "agent" }) => {
      if (message.type === "transcript" && message.transcriptType === "final" && message.transcript && message.role) {
        setTranscript(prev => [...prev, { text: message.transcript!, role: message.role! }]);
      }
      if (message.type === "speech-start") setIsSpeaking(true);
      if (message.type === "speech-end") setIsSpeaking(false);
    };
    const onVolumeLevel = (volume: number) => setCallVolume(volume);

    orbit.on("call-start", onCallStart);
    orbit.on("call-end", onCallEnd);
    orbit.on("error", onError);
    orbit.on("message", onMessage);
    orbit.on("volume-level", onVolumeLevel);

    return () => {
      orbit.off("call-start", onCallStart);
      orbit.off("call-end", onCallEnd);
      orbit.off("error", onError);
      orbit.off("message", onMessage);
      orbit.off("volume-level", onVolumeLevel);
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.auth.getSession().then((response: any) => {
      const { data: { session } } = response;
      setUser(session?.user ?? null);
      setIsAuthLoading(false);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      setUser(session?.user ?? null);
    });

    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return setAuthStatus("Email and password required.");
    setIsAuthProcessing(true);
    setAuthStatus("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthStatus(error.message);
    setIsAuthProcessing(false);
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) return setAuthStatus("Passwords do not match.");
    setIsAuthProcessing(true);
    setAuthStatus("");
    const response = await supabase.auth.signUp({
      email,
      password
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, data } = response as { error: any; data: any };
    if (error) {
      setAuthStatus(error.message);
    } else if (data.user && data.user.email_confirmed_at) {
      setAuthStatus("Registration successful! You are now logged in.");
      // User is automatically logged in if email is confirmed
      setUser(data.user);
    } else {
      setAuthStatus("Registration successful! You can now log in.");
    }
    setIsAuthProcessing(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return setAuthStatus("Email required.");
    setIsAuthProcessing(true);
    setAuthStatus("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setAuthStatus(error.message);
    else setAuthStatus("Reset link sent! Check your email.");
    setIsAuthProcessing(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("echo-theme", newTheme);
    const isLight = newTheme === "light";
    document.documentElement.classList.toggle("light-mode", isLight);
    document.body.classList.toggle("light-mode", isLight);
  };

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const fetchRealTimeHistory = useCallback(async () => {
    if (!user) {
      setHistory([]);
      return;
    }
    setIsHistoryLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setHistory([]);
        return;
      }
      const res = await fetch("/api/tts-history", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.warn("TTS history fetch failed:", res.status, errBody);
        setHistory([]);
        return;
      }
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch history:", err);
      setHistory([]);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === "pane-audio" && audioSubTab === "history") {
      fetchRealTimeHistory();
    }
  }, [activeTab, audioSubTab, user, fetchRealTimeHistory]);

  const fetchCallLogs = useCallback(async () => {
    setIsCallLogsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (callLogFilterAssistant) params.set("assistantId", callLogFilterAssistant);
      const res = await fetch(`/api/orbit/calls?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data)) setCallLogs(data);
      else setCallLogs([]);
    } catch {
      setCallLogs([]);
    } finally {
      setIsCallLogsLoading(false);
    }
  }, [callLogFilterAssistant]);

  useEffect(() => {
    if (activeTab === "pane-agents") fetchCallLogs();
  }, [activeTab, fetchCallLogs]);

  useEffect(() => {
    if (activeTab === "pane-call-logs") fetchCallLogs();
  }, [activeTab, callLogFilterAssistant, fetchCallLogs]);

  const handleToggleCall = async (assistantId: string) => {
    if (callStatus === "active") {
      orbit?.stop();
      return;
    }
    const idToUse = assistantId || DEFAULT_SAMPLE_AGENT.id;
    setShowTestCallModal(true);
    setCallVolume(0);
    setTranscript([]);
    setActiveAgentId(idToUse);
    setCallStatus("loading");
    try {
      await orbit?.start(idToUse);
    } catch (err) {
      console.error("Failed to start call:", err);
      setCallStatus("idle");
      setActiveAgentId("");
      setShowTestCallModal(false);
    }
  };

  const navItems = [
    { id: "pane-audio", label: "Audio", icon: <AudioWaveform size={18} />, desc: "TTS, STT, Voice Cloning & Library" },
    { id: "pane-agents", label: "Agents", icon: <Users size={18} />, desc: "Create and connect to AI agents" },
    { id: "pane-call-logs", label: "Call History", icon: <Phone size={18} />, desc: "Playback and transcripts for all calls" },
    { id: "pane-integrations", label: "Integrations", icon: <Plug2 size={18} />, desc: "Connect SMS, Email, CRM and more" },
    { id: "pane-docs", label: "Docs", icon: <FileText size={18} />, desc: "API documentation and test inbound" },
    { id: "pane-settings", label: "Settings", icon: <SettingsIcon size={18} />, desc: "Configure default Echo models and format" },
  ];

  const audioSubTabs = [
    { id: "tts", label: "Text to Speech", icon: <AudioWaveform size={15} /> },
    { id: "stt", label: "Speech to Text", icon: <Mic size={15} /> },
    { id: "clone", label: "Voice Cloning", icon: <Copy size={15} /> },
    { id: "voices", label: "Voices", icon: <BookOpen size={15} /> },
    { id: "history", label: "History", icon: <History size={15} /> },
  ];

  useEffect(() => {
    async function getVoices() {
      try {
        const res = await fetch("/api/echo/voices");
        const data = await res.json();
        if (Array.isArray(data)) {
          setVoices(data);
          if (data.length > 0) setSelectedVoice(data[0].voice_id);
        }
      } catch (error) {
        console.error("Failed to fetch voices:", error);
      }
    }
    async function getModels() {
      try {
        const res = await fetch("/api/echo/models");
        const data = await res.json();
        if (Array.isArray(data)) setModels(data);
      } catch (error) {
        console.error("Failed to fetch models:", error);
      }
    }
    getVoices();
    getModels();
  }, []);

  const [sttFile, setSttFile] = useState<File | null>(null);
  const [sttStatus, setSttStatus] = useState("");
  const [sttOutput, setSttOutput] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);

  const [cloneName, setCloneName] = useState("");
  const [cloneDesc, setCloneDesc] = useState("");
  const [cloneLanguage, setCloneLanguage] = useState("Filipino");
  const [cloneLocation, setCloneLocation] = useState("Cebuano");
  const [cloneGender, setCloneGender] = useState("Male");
  const [cloneAge, setCloneAge] = useState("Young");
  const [cloneConsent, setCloneConsent] = useState(false);
  const [cloneFiles, setCloneFiles] = useState<File[]>([]);
  const [cloneStatus, setCloneStatus] = useState("");
  const [isCloning, setIsCloning] = useState(false);

  useEffect(() => {
    if (languageDialectMap[cloneLanguage]) {
      setCloneLocation(languageDialectMap[cloneLanguage][0]);
    } else {
      setCloneLocation("General");
    }
  }, [cloneLanguage]);

  const handleAddExpression = async () => {
    if (!ttsText.trim()) return;
    setIsEnhancingExpression(true);
    setTtsStatus("");
    try {
      const res = await fetch("/api/tts-enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ttsText, mode: "expression" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Enhance failed");
      if (typeof data.enhanced === "string") setTtsText(data.enhanced);
      setTtsStatus("Expression added.");
    } catch (err) {
      console.error(err);
      setTtsStatus("Error: " + (err instanceof Error ? err.message : "Could not add expression."));
    } finally {
      setIsEnhancingExpression(false);
    }
  };

  const handleEnhanced = async () => {
    if (!ttsText.trim()) return;
    setIsEnhancingExpression(true);
    setTtsStatus("");
    try {
      const res = await fetch("/api/tts-enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ttsText, mode: "enhance" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Enhance failed");
      if (typeof data.enhanced === "string") setTtsText(data.enhanced);
      setTtsStatus("Enhanced.");
    } catch (err) {
      console.error(err);
      setTtsStatus("Error: " + (err instanceof Error ? err.message : "Could not enhance."));
    } finally {
      setIsEnhancingExpression(false);
    }
  };

  const handleGenerateTTS = async () => {
    if (!selectedVoice || !ttsText.trim()) {
      setTtsStatus("Select a voice and enter text.");
      return;
    }

    setIsGenerating(true);
    setTtsStatus("Synthesizing...");

    try {
      const res = await fetch("/api/echo/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId: selectedVoice,
          text: ttsText,
          modelId: "echo_flash_v2.5",
          outputFormat: "mp3_44100_128"
        }),
      });

      if (!res.ok) throw new Error("Synthesis failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
      }
      setTtsStatus("Ready");

      // Save to user TTS history when logged in
      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const formData = new FormData();
          formData.set("text", ttsText.trim());
          formData.set("voice_id", selectedVoice);
          formData.set("voice_name", voices.find(v => v.voice_id === selectedVoice)?.name ?? "Unknown");
          formData.set("audio", new File([blob], "tts.mp3", { type: "audio/mpeg" }));
          try {
            const saveRes = await fetch("/api/tts-history", {
              method: "POST",
              headers: { Authorization: `Bearer ${session.access_token}` },
              body: formData,
            });
            if (saveRes.ok) {
              const saved = await saveRes.json();
              setHistory(prev => [saved, ...prev]);
            }
          } catch {
            // Non-blocking: playback already succeeded
          }
        }
      }
    } catch (error) {
      console.error(error);
      setTtsStatus("Error: Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTranscribe = async () => {
    if (!sttFile) return;

    setIsTranscribing(true);
    setSttStatus("Uploading & Transcribing...");

    try {
      const formData = new FormData();
      formData.append("file", sttFile);
      const res = await fetch("/api/echo/stt", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Transcription failed");
      }

      const data = await res.json();
      setSttOutput(data.text || JSON.stringify(data, null, 2));
      setSttStatus("Transcription Complete");
    } catch (error) {
      console.error(error);
      setSttOutput("Error: Transcription failed.");
      setSttStatus("Failed");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleClone = async () => {
    if (!cloneName || cloneFiles.length === 0) {
      setCloneStatus("Name and files are required.");
      return;
    }
    if (!cloneConsent) {
      setCloneStatus("Please confirm the legal disclaimer.");
      return;
    }

    setIsCloning(true);
    setCloneStatus("Cloning...");

    try {
      const formData = new FormData();
      formData.append("name", cloneName);
      formData.append("description", cloneDesc);
      const labels = {
        language: cloneLanguage,
        accent: cloneLocation,
        gender: cloneGender,
        age: cloneAge,
        cloned: "true"
      };
      formData.append("labels", JSON.stringify(labels));
      cloneFiles.forEach(f => formData.append("files", f));

      const res = await fetch("/api/echo/clone", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Cloning failed");

      setCloneStatus("Voice cloned successfully!");
      setCloneName("");
      setCloneDesc("");
      setCloneFiles([]);
      setCloneConsent(false);
    } catch (error) {
      console.error(error);
      setCloneStatus("Error: Cloning failed.");
    } finally {
      setIsCloning(false);
    }
  };

  const handlePlayPreview = (url?: string) => {
    if (!url) return;
    if (currentAudio) currentAudio.pause();
    const audio = new Audio(url);
    audio.play();
    setCurrentAudio(audio);
  };

  const handlePlayHistory = async (id: string) => {
    if (currentAudio) currentAudio.pause();
    playHistoryAbortRef.current?.abort();
    playHistoryAbortRef.current = new AbortController();
    const signal = playHistoryAbortRef.current.signal;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setTtsStatus("Sign in to play history.");
      return;
    }
    setTtsStatus("Fetching audio...");
    try {
      const res = await fetch(`/api/tts-history/${id}/audio`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg = (errBody as { error?: string })?.error || res.statusText || "Failed to fetch history audio";
        throw new Error(`${msg} (${res.status})`);
      }
      const blob = await res.blob();
      if (signal.aborted) return;
      if (historyAudioUrl) URL.revokeObjectURL(historyAudioUrl);
      const url = URL.createObjectURL(blob);
      setHistoryAudioUrl(url);
      setPlayingHistoryId(id);
      setTtsStatus("Playing");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error(err);
      setTtsStatus("Error playing history");
    }
  };

  const handleDownloadHistory = async (id: string, text: string, format: "mp3" | "wav") => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setTtsStatus("Sign in to download.");
      return;
    }
    setTtsStatus("Preparing download...");
    try {
      const res = await fetch(`/api/tts-history/${id}/audio?format=${format}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg = (errBody as { error?: string })?.error || res.statusText || "Failed to fetch history audio";
        throw new Error(`${msg} (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const ext = format === "wav" ? "wav" : "mp3";
      const a = document.createElement("a");
      a.href = url;
      a.download = `EburonAI_${text.substring(0, 20).replace(/[^a-z0-9]/gi, "_")}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setTtsStatus("");
    } catch (err) {
      console.error(err);
      setTtsStatus("Error downloading audio");
    }
  };

  const [agentBases, setAgentBases] = useState<{ id: string; name?: string }[]>([]);
  const [agentBasesError, setAgentBasesError] = useState<string | null>(null);
  const [isFetchingBases, setIsFetchingBases] = useState(false);
  const [userAssistantId, setUserAssistantId] = useState<string | null>(null);
  const [newAgentName, setNewAgentName] = useState(DEFAULT_AGENT_NAME);
  const [agentStatus, setAgentStatus] = useState("");
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);

  // Create-from-scratch form (beside iPhone dialer)
  const [agentLanguage, setAgentLanguage] = useState("en");
  const [agentVoice, setAgentVoice] = useState("vapi:elliot");
  const [agentIntroSpiel, setAgentIntroSpiel] = useState(DEFAULT_AGENT_INTRO);
  const [agentSkillsPrompt, setAgentSkillsPrompt] = useState(DEFAULT_AGENT_SKILLS);
  const [kbFiles, setKbFiles] = useState<File[]>([]);
  const [dialerNumber, setDialerNumber] = useState("");
  const [phonebookEntries, setPhonebookEntries] = useState<{ name: string; number: string }[]>([]);
  const [selectedDialerAgentId, setSelectedDialerAgentId] = useState("");
  const [dialerCallStatus, setDialerCallStatus] = useState("");
  const [isDialerCalling, setIsDialerCalling] = useState(false);
  const [callLogs, setCallLogs] = useState<{ id: string; type?: string; status?: string; customer?: { number?: string }; assistantId?: string; createdAt?: string }[]>([]);
  const [isCallLogsLoading, setIsCallLogsLoading] = useState(false);
  const [playingCallLogId, setPlayingCallLogId] = useState<string | null>(null);
  const [callLogRecordingUrl, setCallLogRecordingUrl] = useState<string | null>(null);
  const [callLogPlaybackError, setCallLogPlaybackError] = useState<string | null>(null);
  const [expandedCallLogId, setExpandedCallLogId] = useState<string | null>(null);
  const [expandedCallTranscript, setExpandedCallTranscript] = useState<string | null>(null);
  const [isExpandedCallLoading, setIsExpandedCallLoading] = useState(false);
  const callLogAudioRef = useRef<HTMLAudioElement>(null);
  const longPress0Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPress0HandledRef = useRef(false);

  const handlePlayCallLog = useCallback(async (callId: string) => {
    setCallLogPlaybackError(null);
    if (playingCallLogId === callId) {
      callLogAudioRef.current?.pause();
      setPlayingCallLogId(null);
      setCallLogRecordingUrl(null);
      return;
    }
    try {
      const res = await fetch(`/api/orbit/calls/${callId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to fetch call");
      const url = data?.artifact?.recordingUrl || data?.artifact?.stereoRecordingUrl;
      if (!url) {
        setCallLogPlaybackError("No recording available for this call.");
        return;
      }
      setCallLogRecordingUrl(url);
      setPlayingCallLogId(callId);
    } catch (err) {
      setCallLogPlaybackError(err instanceof Error ? err.message : "Could not load recording");
    }
  }, [playingCallLogId]);

  useEffect(() => {
    if (callLogRecordingUrl && callLogAudioRef.current) {
      callLogAudioRef.current.src = callLogRecordingUrl;
      callLogAudioRef.current.play().catch(() => {});
    }
  }, [callLogRecordingUrl]);

  const handleExpandCallLog = useCallback(async (callId: string) => {
    if (expandedCallLogId === callId) {
      setExpandedCallLogId(null);
      setExpandedCallTranscript(null);
      return;
    }
    setExpandedCallLogId(callId);
    setExpandedCallTranscript(null);
    setIsExpandedCallLoading(true);
    try {
      const res = await fetch(`/api/orbit/calls/${callId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to fetch call");
      const transcript = formatCallTranscript(data);
      setExpandedCallTranscript(transcript);
    } catch {
      setExpandedCallTranscript("(Could not load transcript)");
    } finally {
      setIsExpandedCallLoading(false);
    }
  }, [expandedCallLogId]);

  const formatCallTranscript = (call: { transcript?: unknown; messages?: unknown[] }) => {
    if (call.transcript && typeof call.transcript === "string") return call.transcript;
    const messages = call.messages ?? call.transcript;
    if (Array.isArray(messages)) {
      return messages
        .filter((m: { transcript?: string }) => m.transcript)
        .map((m: { role?: string; message?: string; content?: string; transcript?: string }) => {
          const text = m.message ?? m.content ?? m.transcript ?? "";
          const role = m.role ?? "unknown";
          const label = role === "user" ? "Customer" : role === "assistant" ? "Agent" : role;
          return `${label}: ${text}`;
        })
        .filter(Boolean)
        .join("\n");
    }
    return "(No transcript available)";
  };

  const getCallFromTo = (c: { type?: string; customer?: { number?: string } }) => {
    const num = c.customer?.number ?? "—";
    if (c.type === "inboundPhoneCall") return { from: num, to: "Our line" };
    if (c.type === "outboundPhoneCall") return { from: "Our line", to: num };
    return { from: "—", to: num || "—" };
  };

  const handleDialKeyDown = (digit: string) => {
    if (digit !== "0") {
      setDialerNumber((n) => (n + digit).slice(0, 15));
      return;
    }
    longPress0HandledRef.current = false;
    longPress0Ref.current = setTimeout(() => {
      longPress0Ref.current = null;
      longPress0HandledRef.current = true;
      setDialerNumber((n) => (n + "+").slice(0, 15));
    }, 500);
  };

  const handleDialKeyUp = (digit: string) => {
    if (digit !== "0") return;
    if (longPress0Ref.current) {
      clearTimeout(longPress0Ref.current);
      longPress0Ref.current = null;
    }
    if (!longPress0HandledRef.current) {
      setDialerNumber((n) => (n + "0").slice(0, 15));
    }
    longPress0HandledRef.current = false;
  };

  const fetchAgentBases = async () => {
    setIsFetchingBases(true);
    setAgentBasesError(null);
    try {
      const res = await fetch("/api/orbit/assistants");
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data?.error === 'string' ? data.error : 'Failed to load agents';
        setAgentBasesError(msg);
        setAgentBases([]);
        return;
      }
      setAgentBases(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch bases:", error);
      setAgentBasesError("Could not load agents. Check your API key.");
      setAgentBases([]);
    } finally {
      setIsFetchingBases(false);
    }
  };

  useEffect(() => {
    if (activeTab === "pane-agents" || activeTab === "pane-call-logs") {
      fetchAgentBases();
    }
  }, [activeTab]);

  // Load agent form defaults: Ivan from VAPI, or user's assistant
  const loadAgentFormDefaults = useCallback(async () => {
    if (!user) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const [userRes, assistantsRes] = await Promise.all([
        fetch("/api/user-assistant", {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        }),
        fetch("/api/orbit/assistants", { cache: "no-store" }),
      ]);
      const userData = await userRes.json();
      const assistantsRaw = await assistantsRes.json();
      const assistants = Array.isArray(assistantsRaw) ? assistantsRaw : [];
      const myAssistantId = userData?.assistantId ?? null;
      setUserAssistantId(myAssistantId);

      const ivanId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_IVAN_ID;
      const ivan = ivanId
        ? assistants.find((a: { id?: string }) => a.id === ivanId)
        : assistants.find((a: { name?: string }) => /ivan/i.test(a.name || ""));
      const defaultAssistant = myAssistantId
        ? assistants.find((a: { id?: string }) => a.id === myAssistantId) ?? ivan
        : ivan;

      if (defaultAssistant?.id) {
        const detailRes = await fetch(`/api/orbit/assistants/${defaultAssistant.id}`, { cache: "no-store" });
        const detail = await detailRes.json();
        if (detail?.id) {
          const sysMsg = detail.model?.messages?.find((m: { role?: string }) => m.role === "system");
          setNewAgentName(detail.name || DEFAULT_AGENT_NAME);
          setAgentIntroSpiel(detail.firstMessage || DEFAULT_AGENT_INTRO);
          setAgentSkillsPrompt(sysMsg?.content || DEFAULT_AGENT_SKILLS);
          const lang = detail.transcriber?.language;
          setAgentLanguage(lang === "multi" ? "multilingual" : lang || "en");
          const v = detail.voice;
          if (v?.provider && v?.voiceId) {
            setAgentVoice(`${v.provider}:${v.voiceId}`);
          }
        }
      }
    } catch {
      // Keep current defaults
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === "pane-agents" && user) {
      loadAgentFormDefaults();
    }
  }, [activeTab, user, loadAgentFormDefaults]);

  // Always include default sample agent first, then fetched agents (no duplicate id)
  const displayAgents = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name?: string }[] = [{ ...DEFAULT_SAMPLE_AGENT }];
    seen.add(DEFAULT_SAMPLE_AGENT.id);
    agentBases.forEach((a) => {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        out.push(a);
      }
    });
    return out;
  }, [agentBases]);

  const [showUserProfile, setShowUserProfile] = useState(false);

  const handleEditAgain = useCallback(() => {
    setAgentStatus("");
    loadAgentFormDefaults();
  }, [loadAgentFormDefaults]);

  const handleCreateMyAgent = async () => {
    if (!newAgentName.trim()) {
      setAgentStatus("Agent name is required.");
      return;
    }
    if (!user) {
      setAgentStatus("Sign in to create or update your agent.");
      return;
    }
    setIsCreatingAgent(true);
    const isUpdate = !!userAssistantId;
    setAgentStatus(isUpdate ? "Updating agent..." : "Creating agent...");
    try {
      const voiceParts = agentVoice.split(":");
      const voice = voiceParts.length >= 2
        ? { provider: voiceParts[0] as "vapi" | "11labs", voiceId: voiceParts.slice(1).join(":") }
        : undefined;
      const body: Record<string, unknown> = {
        name: newAgentName.trim(),
        firstMessage: agentIntroSpiel.trim() || undefined,
        systemPrompt: agentSkillsPrompt.trim() || "You are a helpful AI assistant.",
        language: agentLanguage,
        voice,
      };
      if (isUpdate) body.assistantId = userAssistantId;
      const res = await fetch("/api/orbit/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || (isUpdate ? "Agent update failed" : "Agent creation failed"));
      const assistantId = data.id;
      setAgentStatus(isUpdate ? "Agent updated! Loading into dialer." : "Agent created! Loading into dialer.");
      setSelectedDialerAgentId(assistantId);
      setUserAssistantId(assistantId);
      setAgentBases((prev) => {
        const exists = prev.some((a) => a.id === assistantId);
        if (exists) return prev.map((a) => a.id === assistantId ? { ...a, name: data.name || newAgentName } : a);
        return [...prev, { id: assistantId, name: data.name || newAgentName }];
      });
      if (!isUpdate) {
        const { data: { session } } = await supabase.auth.getSession();
        await fetch("/api/user-assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ assistantId }),
        });
      }
      fetchAgentBases();
    } catch (error) {
      console.error(error);
      setAgentStatus("Error: " + (error instanceof Error ? error.message : (isUpdate ? "Update failed." : "Creation failed.")));
    } finally {
      setIsCreatingAgent(false);
    }
  };

  const handleBulkPhonebookUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const lines = text.split(/\r?\n/).filter(Boolean);
      const entries: { name: string; number: string }[] = [];
      for (const line of lines) {
        const parts = line.split(/[,;\t]/).map((p) => p.trim());
        if (parts.length >= 2) {
          entries.push({ name: parts[0], number: parts[1].replace(/\D/g, "").slice(-10) });
        } else if (parts[0] && /^\d+$/.test(parts[0].replace(/\D/g, ""))) {
          entries.push({ name: "Unknown", number: parts[0].replace(/\D/g, "").slice(-10) });
        }
      }
      setPhonebookEntries((prev) => [...prev, ...entries]);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const activeItem = navItems.find((item) => item.id === activeTab);

  const voiceCategories = useMemo(() => {
    const cats = new Set(voices.map((v) => v.category || "general"));
    return ["all", ...Array.from(cats).sort()];
  }, [voices]);

  const filteredVoices = useMemo(() => {
    let filtered = voices;
    if (voiceCategoryFilter !== "all") {
      filtered = filtered.filter((v) => (v.category || "general") === voiceCategoryFilter);
    }
    if (voiceSearch.trim()) {
      const q = voiceSearch.toLowerCase();
      filtered = filtered.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.labels?.language || "").toLowerCase().includes(q) ||
          (v.labels?.accent || "").toLowerCase().includes(q) ||
          (v.description || "").toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [voices, voiceCategoryFilter, voiceSearch]);

  if (isAuthLoading) {
    return (
      <div className="app bg-black flex items-center justify-center">
        <Loader2 className="animate-spin text-lime" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-header text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://eburon.ai/icon-eburon.svg"
              alt="Eburon"
              className="mx-auto mb-4 rounded-xl logo-img-lg"
            />
            <h1>Eburon AI</h1>
            <p className="text-2xs text-faint uppercase tracking-widest">Premium Voice Synthesis</p>
          </div>

          <div className="auth-tabs">
            <div
              className={`auth-tab ${authMode === "login" ? "active" : ""}`}
              onClick={() => { setAuthMode("login"); setAuthStatus(""); }}
            >
              Login
            </div>
            <div
              className={`auth-tab ${authMode === "register" ? "active" : ""}`}
              onClick={() => { setAuthMode("register"); setAuthStatus(""); }}
            >
              Register
            </div>
          </div>

          <form onSubmit={authMode === "login" ? handleEmailSignIn : authMode === "register" ? handleEmailSignUp : handleResetPassword}>
            <div className="field">
              <label>Email Address</label>
              <input
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {authMode !== "forgot" && (
              <div className="field">
                <label>Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            )}

            {authMode === "register" && (
              <div className="field">
                <label>Confirm Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            )}

            <button className="btn primary w-full mt-4" disabled={isAuthProcessing}>
              {isAuthProcessing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                authMode === "login" ? "Sign In" : authMode === "register" ? "Create Account" : "Send Reset Link"
              )}
            </button>

            {authStatus && (
              <p className={`text-2xs text-center mt-4 ${authStatus.toLowerCase().includes("error") || authStatus.toLowerCase().includes("fail") || authStatus.toLowerCase().includes("match") ? "text-bad" : "text-lime"}`}>
                {authStatus}
              </p>
            )}

            <div className="auth-footer">
              <span
                className="auth-link"
                onClick={() => {
                  setAuthMode(authMode === "forgot" ? "login" : "forgot");
                  setAuthStatus("");
                }}
              >
                {authMode === "forgot" ? "Back to Login" : "Forgot your password?"}
              </span>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`app${isFullscreen ? " fullscreen-mode" : ""}`}>
      {/* SIDEBAR */}
      <aside className="card">
        <div className="cardBody sidebar-inner">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://eburon.ai/icon-eburon.svg"
              alt="Eburon"
              className="rounded-xl logo-img"
            />
            <div>
              <div className="brand-name">Eburon AI</div>
            </div>
          </div>

          <nav className="nav-menu">
            {navItems.map((item) => (
              <div
                key={item.id}
                className={`nav-item ${activeTab === item.id ? "active" : ""}`}
                onClick={() => setActiveTab(item.id)}
              >
                {item.icon} {item.label}
              </div>
            ))}
          </nav>

          {/* User Profile Area */}
          <div className="sidebar-profile">
            <div 
              className="profile-info cursor-pointer hover:bg-gray-800 rounded-lg p-2 transition-colors"
              onClick={() => setShowUserProfile(!showUserProfile)}
            >
              <div className="profile-avatar text-xs overflow-hidden bg-lime-500 text-black rounded-full w-8 h-8 flex items-center justify-center font-bold">
                {user.email?.charAt(0).toUpperCase()}
              </div>
              <div className="profile-details">
                <div className="profile-name text-sm font-medium">{user.email}</div>
                <div className="profile-tier text-xs text-gray-400">Click for options</div>
              </div>
              <div className={`profile-chevron transition-transform ${showUserProfile ? 'rotate-180' : ''}`}>
                ▼
              </div>
            </div>
            
            {showUserProfile && (
              <div className="profile-dropdown bg-gray-800 rounded-lg p-2 mt-2 border border-gray-700">
                <div className="profile-item text-sm text-gray-300 px-2 py-1">
                  {user.email}
                </div>
                <div className="profile-separator border-t border-gray-700 my-1"></div>
                <button 
                  onClick={handleLogout}
                  className="profile-logout text-sm text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-gray-700 transition-colors w-full text-left"
                >
                  Sign Out
                </button>
              </div>
            )}
            <div className="api-badge flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="status-dot ok"></div>
                <span>Connected</span>
              </div>
              <button
                className="btn icon-only scale-90"
                onClick={toggleTheme}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="card">
        <div className="cardHeader">
          <div className="title">
            <h1>{activeItem?.label}</h1>
            <small>{activeItem?.desc}</small>
          </div>
          <div className="header-actions">
            <button className="btn" onClick={() => setIsModalOpen(true)} title="Configuration">
              <Key size={14} className="mr-2" /> <span className="text-lime">Configured</span>
            </button>
            <button
              className="btn icon-only"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>

        <div className="cardBody">
          {activeTab === "pane-audio" && (
            <div className="tab-pane active">
              {/* Sub-tab bar */}
              <div className="sub-tabs">
                {audioSubTabs.map((st) => (
                  <button
                    key={st.id}
                    className={`sub-tab${audioSubTab === st.id ? " active" : ""}`}
                    onClick={() => setAudioSubTab(st.id)}
                  >
                    {st.icon} {st.label}
                  </button>
                ))}
              </div>

              {/* TTS Sub-tab */}
              {audioSubTab === "tts" && (
                <>
                  <div className="field">
                    <label htmlFor="ttsVoiceSelect">Select Voice</label>
                    <select
                      id="ttsVoiceSelect"
                      title="Select a voice for synthesis"
                      value={selectedVoice}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                    >
                      {voices.length === 0 ? (
                        <option value="">Loading voices...</option>
                      ) : (
                        voices.map((v) => (
                          <option key={v.voice_id} value={v.voice_id}>
                            {v.name} {v.labels?.accent ? `(${v.labels.accent})` : ""}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="field flex-1">
                    <div className="flex flex-wrap justify-between items-center gap-2 mb-1">
                      <label htmlFor="ttsText">Text to Synthesize</label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn text-2xs"
                          onClick={() => setTtsText(enhanceTextForTTS(ttsText))}
                          title="Symbols only: @ → at, . → dot (emails, URLs)"
                        >
                          Enhance symbols
                        </button>
                        <button
                          type="button"
                          className="btn text-2xs text-lime border border-lime/50"
                          onClick={() => setTtsText(normalizeForTTS(ttsText))}
                          title="Normalize numbers, currency, phone, abbreviations for speech"
                        >
                          Normalize for TTS
                        </button>
                        <button
                          type="button"
                          className="btn text-2xs"
                          onClick={() => setTtsText(ttsText + (ttsText.endsWith(" ") ? "" : " ") + BREAK_TAG)}
                          title="Append [pause]"
                        >
                          Add pause
                        </button>
                        <button
                          type="button"
                          className="btn text-2xs"
                          onClick={handleEnhanced}
                          disabled={isEnhancingExpression || !ttsText.trim()}
                          title="Add nuances for natural speech (no brackets)"
                        >
                          {isEnhancingExpression ? <Loader2 size={12} className="animate-spin" /> : "Enhanced"}
                        </button>
                        <button
                          type="button"
                          className="btn text-2xs text-lime border border-lime/50"
                          onClick={handleAddExpression}
                          disabled={isEnhancingExpression || !ttsText.trim()}
                          title="Use AI to add expressive tags"
                        >
                          Add expression
                        </button>
                      </div>
                    </div>
                    <textarea
                      id="ttsText"
                      placeholder="Write natural speech. Add pause with [pause]."
                      value={ttsText}
                      onChange={(e) => setTtsText(e.target.value)}
                    ></textarea>
                  </div>
                  <div className="flex gap-2.5 items-center">
                    <button
                      className="btn primary"
                      id="btnGenerateTTS"
                      onClick={handleGenerateTTS}
                      disabled={isGenerating}
                    >
                      {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
                      Generate Speech
                    </button>
                    <span id="ttsStatus" className={`text-xs ${ttsStatus.startsWith("Error") ? "text-bad" : "text-muted"}`}>
                      {ttsStatus}
                    </span>
                  </div>
                  <div className="audio-output-container">
                    <label className="mb-3 block">Audio Output</label>
                    <audio id="ttsAudio" controls className="w-full" ref={audioRef}></audio>
                  </div>
                </>
              )}

              {/* STT Sub-tab */}
              {audioSubTab === "stt" && (
                <>
                  <div className="field">
                    <label htmlFor="sttFile">Audio File</label>
                    <input
                      type="file"
                      id="sttFile"
                      accept="audio/*"
                      onChange={(e) => setSttFile(e.target.files?.[0] || null)}
                    />
                  </div>
                  <div className="flex gap-2.5 items-center mb-6">
                    <button
                      className="btn primary"
                      onClick={handleTranscribe}
                      disabled={isTranscribing || !sttFile}
                    >
                      {isTranscribing ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
                      Transcribe Audio
                    </button>
                    <span className={`text-xs ${sttStatus.includes("Error") || sttStatus === "Failed" ? "text-bad" : "text-muted"}`}>
                      {sttStatus}
                    </span>
                  </div>
                  <div className="field flex-1">
                    <label htmlFor="sttOutput">Transcription Result</label>
                    <textarea
                      id="sttOutput"
                      readOnly
                      placeholder="Transcription will appear here..."
                      value={sttOutput}
                    ></textarea>
                  </div>
                </>
              )}

              {/* Voice Cloning Sub-tab */}
              {audioSubTab === "clone" && (
                <>
                <div className="field">
                <label htmlFor="cloneName">Voice Name</label>
                <input
                  type="text"
                  id="cloneName"
                  placeholder="e.g. My Custom Voice"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="cloneDesc">Description</label>
                <textarea
                  id="cloneDesc"
                  placeholder="Describe the voice..."
                  value={cloneDesc}
                  onChange={(e) => setCloneDesc(e.target.value)}
                  className="h-20"
                ></textarea>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="cloneLanguage">Language & Model</label>
                  <select
                    id="cloneLanguage"
                    className="input-field"
                    value={cloneLanguage}
                    onChange={(e) => {
                      setCloneLanguage(e.target.value);
                      setCloneLocation("General");
                    }}
                  >
                    <option value="Filipino">Filipino</option>
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Japanese">Japanese</option>
                    <option value="en">Auto Detect</option>
                    {models.find(m => m.model_id === "eleven_multilingual_v2")?.languages.map(lang => (
                      <option key={lang.language_id} value={lang.language_id}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="cloneLocation">Regional Dialect / Accent</label>
                  <select
                    id="cloneLocation"
                    title="Select Accent or Dialect"
                    className="input-field"
                    value={cloneLocation}
                    onChange={(e) => setCloneLocation(e.target.value)}
                    disabled={!cloneLanguage}
                  >
                    <option value="">Auto-detect</option>
                    {cloneLanguage && languageDialectMap[cloneLanguage]?.map(dialect => (
                      <option key={dialect} value={dialect}>{dialect}</option>
                    ))}
                    {/* Fallback options if cloneLanguage is not set or not found in map */}
                    {!cloneLanguage || !languageDialectMap[cloneLanguage] && (
                      <>
                        <option value="General">General / Standard</option>
                        <option value="USA">USA / North America</option>
                        <option value="UK">UK / British</option>
                        <option value="Australia">Australian</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label htmlFor="cloneGender">Gender</label>
                  <select 
                    id="cloneGender" 
                    value={cloneGender}
                    onChange={(e) => setCloneGender(e.target.value)}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Non-binary">Non-binary</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="cloneAge">Age Group</label>
                  <select 
                    id="cloneAge" 
                    value={cloneAge}
                    onChange={(e) => setCloneAge(e.target.value)}
                  >
                    <option value="Young">Young</option>
                    <option value="Middle-aged">Middle-aged</option>
                    <option value="Old">Old</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="cloneFiles">Sample Files (Multiple allowed)</label>
                <div className="upload-zone" onClick={() => document.getElementById("cloneFiles")?.click()}>
                  <Volume2 size={24} className="mb-2 mx-auto" />
                  <div>{cloneFiles.length > 0 ? `${cloneFiles.length} files selected` : "Drop samples here or click to browse"}</div>
                  <input 
                    type="file" 
                    id="cloneFiles" 
                    multiple 
                    accept="audio/*" 
                    onChange={(e) => setCloneFiles(Array.from(e.target.files || []))}
                  />
                </div>
              </div>
              <div className="field">
                <div className="flex items-start gap-3 p-4 bg-white/5 border border-white/10 rounded-xl mb-4">
                  <input 
                    type="checkbox" 
                    id="cloneConsent" 
                    className="mt-1"
                    checked={cloneConsent}
                    onChange={(e) => setCloneConsent(e.target.checked)}
                  />
                  <label htmlFor="cloneConsent" className="text-2xs text-faint leading-relaxed cursor-pointer select-none">
                    I hereby confirm that I have all necessary rights or consents to upload and clone these voice samples and that I will not use the platform-generated content for any illegal, fraudulent, or harmful purpose. I reaffirm my obligation to abide by Eburon AI Terms of Service and Privacy Policy.
                  </label>
                </div>
              </div>

              <div className="flex gap-2.5 items-center">
                <button 
                  className="btn primary" 
                  onClick={handleClone}
                  disabled={isCloning || !cloneName || cloneFiles.length === 0 || !cloneConsent}
                >
                  {isCloning ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />} 
                  Clone Voice
                </button>
                <span className={`text-xs ${cloneStatus.startsWith("Error") ? "text-bad" : "text-muted"}`}>
                  {cloneStatus}
                </span>
              </div>
              </>
              )}

              {/* Voices Sub-tab */}
              {audioSubTab === "voices" && (
                <>
                  {/* Search bar */}
                  <div className="voice-search-bar">
                    <Search size={18} className="voice-search-icon" />
                    <input
                      type="text"
                      placeholder="Search library voices..."
                      value={voiceSearch}
                      onChange={(e) => setVoiceSearch(e.target.value)}
                      className="voice-search-input"
                    />
                    <button className="voice-filter-btn" title="Filters">
                      <SlidersHorizontal size={16} /> Filters
                    </button>
                  </div>

                  {/* Category pills */}
                  <div className="voice-category-pills">
                    {voiceCategories.map((cat) => (
                      <button
                        key={cat}
                        className={`voice-category-pill${voiceCategoryFilter === cat ? " active" : ""}`}
                        onClick={() => setVoiceCategoryFilter(cat)}
                      >
                        {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Voice grid */}
                  <div className="voice-section-header">
                    <span>All voices</span>
                    <span className="voice-count">{filteredVoices.length}</span>
                  </div>
                  <div className="voice-grid">
                    {filteredVoices.length === 0 ? (
                      <div className="placeholder-pane h-32 col-span-3 flex items-center justify-center text-muted">
                        {voices.length === 0 ? "Loading voices…" : "No voices match your search"}
                      </div>
                    ) : (
                      filteredVoices.map((v) => (
                        <div
                          key={v.voice_id}
                          className="voice-card"
                          onClick={() => handlePlayPreview(v.preview_url)}
                        >
                          <div className="voice-card-avatar">
                            <Volume2 size={18} />
                          </div>
                          <div className="voice-card-info">
                            <div className="voice-card-name">{v.name}</div>
                            <div className="voice-card-category">{v.category || "General"}</div>
                            <div className="voice-card-tags">
                              {v.labels?.language && <span className="voice-tag">{v.labels.language}</span>}
                              {v.labels?.accent && <span className="voice-tag">{v.labels.accent}</span>}
                              {v.labels?.gender && <span className="voice-tag">{v.labels.gender}</span>}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              {/* History Sub-tab */}
              {audioSubTab === "history" && (
                <>
                  <div className="pane-header">
                    <label>TTS History</label>
                    {user ? (
                      <button className="btn text-2xs" onClick={fetchRealTimeHistory}>
                        <RefreshCw size={12} /> Refresh
                      </button>
                    ) : null}
                  </div>
                  {!user ? (
                    <div className="placeholder-pane h-32 flex items-center justify-center text-muted">
                      Sign in to save and view your TTS history.
                    </div>
                  ) : (
                    <>
                      {historyAudioUrl && (
                        <div className="mb-4 p-4 rounded-xl border border-border bg-panel flex items-center gap-4">
                          <audio
                            ref={historyAudioRef}
                            src={historyAudioUrl}
                            controls
                            className="flex-1 h-10"
                            onEnded={() => { setTtsStatus(""); setPlayingHistoryId(null); }}
                          />
                          <span className="text-2xs text-muted">Now playing</span>
                        </div>
                      )}
                      <div className="history-list">
                        {isHistoryLoading ? (
                          <div className="placeholder-pane h-32 flex items-center justify-center"><Loader2 className="animate-spin" size={24} /></div>
                        ) : history.length === 0 ? (
                          <div className="placeholder-pane h-32 flex items-center justify-center text-muted">No TTS history yet. Generate speech to see it here.</div>
                        ) : (
                          history.slice(0, 50).map((h) => (
                            <div key={h.id} className="history-card">
                              <button
                                className={`history-play-btn ${playingHistoryId === h.id ? "playing" : ""}`}
                                onClick={() => handlePlayHistory(h.id)}
                                title="Play"
                                aria-label="Play"
                              >
                                {playingHistoryId === h.id ? (
                                  <Volume2 size={26} className="text-inherit" />
                                ) : (
                                  <Play size={26} fill="currentColor" className="text-lime" />
                                )}
                              </button>
                              <div className="history-card-body">
                                <div className="history-card-text" title={h.text}>{h.text}</div>
                                <div className="history-card-meta">
                                  <span className="voice-pill">{h.voice_name}</span>
                                  <span className="history-card-date">{new Date(h.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              </div>
                              <div className="history-card-actions">
                                <button
                                  className="history-card-action"
                                  onClick={() => { setTtsText(h.text); setSelectedVoice(h.voice_id); setAudioSubTab("tts"); }}
                                  title="Re-synthesize"
                                >
                                  <AudioWaveform size={16} />
                                </button>
                                <div className="relative" ref={downloadMenuId === h.id ? downloadMenuRef : undefined}>
                                  <button
                                    className="history-card-action"
                                    onClick={(e) => { e.stopPropagation(); setDownloadMenuId(downloadMenuId === h.id ? null : h.id); }}
                                    title="Download"
                                  >
                                    <Download size={16} />
                                  </button>
                                  {downloadMenuId === h.id && (
                                    <div className="absolute right-0 top-full mt-1 z-20 rounded-lg border border-border bg-panel py-1 min-w-[90px] shadow-xl">
                                      <button className="block w-full text-left px-4 py-2 text-sm hover:bg-limeDim"
                                        onClick={() => { handleDownloadHistory(h.id, h.text, "mp3"); setDownloadMenuId(null); }}>MP3</button>
                                      <button className="block w-full text-left px-4 py-2 text-sm hover:bg-limeDim"
                                        onClick={() => { handleDownloadHistory(h.id, h.text, "wav"); setDownloadMenuId(null); }}>WAV</button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === "pane-agents" && (
            <div className="tab-pane active">
              <div className="pane-header">
                <label>Agents</label>
                <button
                  type="button"
                  className="btn icon-only"
                  onClick={fetchAgentBases}
                  disabled={isFetchingBases}
                  title="Refresh agents"
                >
                  {isFetchingBases ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                </button>
              </div>

              {/* Phone call / Web call header */}
              <div className="flex gap-3 mb-6">
                <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-xl border border-white/10 bg-white/5">
                  <Phone size={20} className="text-lime" />
                  <span className="font-medium">Phone call</span>
                  <span className="text-2xs text-muted">Use dialer below</span>
                </div>
                <button
                  type="button"
                  className="btn primary flex-1 flex items-center justify-center gap-2 px-4 py-3"
                  onClick={() => {
                    const agentId = selectedDialerAgentId || displayAgents[0]?.id || DEFAULT_SAMPLE_AGENT.id;
                    setSelectedDialerAgentId(agentId || "");
                    handleToggleCall(agentId);
                  }}
                  disabled={callStatus === "loading"}
                >
                  <Volume2 size={20} />
                  Web call
                  <span className="text-2xs opacity-80">Orb & live transcription</span>
                </button>
              </div>
              {agentBasesError && (
                <div className="mb-4 p-3 rounded border border-red-500/50 bg-red-500/10 text-red-200 text-2xs">
                  {agentBasesError}
                </div>
              )}

              <div className="agents-layout">
                {/* iPhone Mockup Dialer */}
                <div className="iphone-mockup">
                  <div className="iphone-frame">
                    <div className="iphone-notch"></div>
                    <div className="iphone-screen">
                      <div className="dialer-header">
                        <span className="dialer-time">Dialer</span>
                      </div>
                      <div className="dialer-agent-select">
                        <label className="text-2xs text-faint">Agent for calls</label>
                        <select
                          title="Select agent for calls"
                          value={selectedDialerAgentId}
                          onChange={(e) => setSelectedDialerAgentId(e.target.value)}
                          className="dialer-select"
                        >
                          <option value="">Select agent</option>
                          {displayAgents.map((a) => (
                            <option key={a.id} value={a.id}>{a.name || a.id}</option>
                          ))}
                        </select>
                      </div>
                      <div className="dialer-number-display">
                        <input
                          type="tel"
                          placeholder="Enter number"
                          value={dialerNumber}
                          onChange={(e) => setDialerNumber(e.target.value.replace(/\D/g, "").slice(0, 15))}
                          className="dialer-number-input"
                        />
                        {dialerNumber && (
                          <button
                            type="button"
                            className="dialer-backspace"
                            onClick={() => setDialerNumber((n) => n.slice(0, -1))}
                            title="Backspace"
                            aria-label="Backspace"
                          >
                            ←
                          </button>
                        )}
                      </div>
                      <div className="dialer-pad">
                        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((digit) => (
                          <button
                            key={digit}
                            type="button"
                            className="dialer-key"
                            onClick={digit === "0" ? undefined : () => setDialerNumber((n) => (n + digit).slice(0, 15))}
                            onPointerDown={digit === "0" ? () => handleDialKeyDown(digit) : undefined}
                            onPointerUp={digit === "0" ? () => handleDialKeyUp(digit) : undefined}
                            onPointerLeave={digit === "0" ? () => { if (longPress0Ref.current) { clearTimeout(longPress0Ref.current); longPress0Ref.current = null; } } : undefined}
                          >
                            {digit === "0" ? (
                              <span className="dialer-key-0"><span>0</span><span className="dialer-key-plus">+</span></span>
                            ) : (
                              digit
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="dialer-actions">
                        <button
                          className="dialer-call-btn-round"
                          onClick={async () => {
                            const num = dialerNumber.replace(/\s/g, "").replace(/[^\d+]/g, "");
                            if (!num) return;
                            if (!selectedDialerAgentId) {
                              setDialerCallStatus("Select an agent first.");
                              return;
                            }
                            setIsDialerCalling(true);
                            setDialerCallStatus("");
                            try {
                              const res = await fetch("/api/orbit/call", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ assistantId: selectedDialerAgentId, customerNumber: num }),
                              });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data?.error || "Outbound call failed");
                              setDialerCallStatus("Call initiated. Calling the number.");
                              fetchCallLogs();
                            } catch (err) {
                              setDialerCallStatus("Error: " + (err instanceof Error ? err.message : "Call failed"));
                            } finally {
                              setIsDialerCalling(false);
                            }
                          }}
                          disabled={!dialerNumber.trim() || isDialerCalling}
                        >
                          {isDialerCalling ? <Loader2 size={24} className="animate-spin" /> : <Phone size={24} />}
                        </button>
                        {dialerCallStatus && (
                          <span className={`text-2xs block mt-1 ${dialerCallStatus.startsWith("Error") ? "text-bad" : "text-muted"}`}>
                            {dialerCallStatus}
                          </span>
                        )}
                        <label className="upload-phonebook-btn">
                          <Upload size={14} />
                          Upload phonebook
                          <input
                            type="file"
                            accept=".csv,.txt"
                            onChange={handleBulkPhonebookUpload}
                            hidden
                          />
                        </label>
                      </div>
                      {phonebookEntries.length > 0 && (
                        <div className="phonebook-list">
                          <div className="phonebook-header text-2xs text-faint">{phonebookEntries.length} contacts</div>
                          <div className="phonebook-scroll">
                            {phonebookEntries.slice(0, 8).map((p, i) => (
                              <div
                                key={i}
                                className="phonebook-row"
                                onClick={() => setDialerNumber(p.number)}
                              >
                                <span>{p.name}</span>
                                <span className="text-lime">{p.number}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Create Agent Form */}
                <div className="create-agent-form">
                  <h3 className="create-agent-title">Create My Agent</h3>
                  <div className="field">
                    <label>Agent Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Customer Support Bot"
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Voice</label>
                    <select
                      title="Select voice for agent"
                      value={agentVoice}
                      onChange={(e) => setAgentVoice(e.target.value)}
                      className="w-full"
                    >
                      <optgroup label="Built-in voices">
                        <option value="vapi:elliot">Elliot</option>
                        <option value="vapi:savannah">Savannah</option>
                      </optgroup>
                      <optgroup label="Custom / Cloned">
                        {voices.length === 0 ? (
                          <option value="11labs:EXAVITQu4vr4xnSDxMaL" disabled>Loading voices…</option>
                        ) : (
                          voices.map((v) => (
                            <option key={v.voice_id} value={`11labs:${v.voice_id}`}>
                              {v.name}{v.labels?.cloned === "true" ? " (cloned)" : ""}
                            </option>
                          ))
                        )}
                      </optgroup>
                    </select>
                  </div>
                  <div className="field">
                    <label>Languages Spoken</label>
                    <select
                      title="Languages spoken by agent"
                      value={agentLanguage}
                      onChange={(e) => setAgentLanguage(e.target.value)}
                    >
                      <option value="multilingual">Multilingual</option>
                      <option value="en">English</option>
                      <option value="en-US">English (US)</option>
                      <option value="en-GB">English (UK)</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="it">Italian</option>
                      <option value="pt">Portuguese</option>
                      <option value="nl">Dutch</option>
                      <option value="pl">Polish</option>
                      <option value="ru">Russian</option>
                      <option value="ja">Japanese</option>
                      <option value="zh">Chinese</option>
                      <option value="ko">Korean</option>
                      <option value="hi">Hindi</option>
                      <option value="ar">Arabic</option>
                      <option value="tr">Turkish</option>
                      <option value="vi">Vietnamese</option>
                      <option value="id">Indonesian</option>
                      <option value="th">Thai</option>
                      <option value="fil">Filipino</option>
                      <option value="sv">Swedish</option>
                      <option value="da">Danish</option>
                      <option value="fi">Finnish</option>
                      <option value="no">Norwegian</option>
                      <option value="cs">Czech</option>
                      <option value="el">Greek</option>
                      <option value="he">Hebrew</option>
                      <option value="hu">Hungarian</option>
                      <option value="ro">Romanian</option>
                      <option value="uk">Ukrainian</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Intro Spiel (first message)</label>
                    <textarea
                      placeholder="Hi! I'm your assistant. How can I help you today?"
                      value={agentIntroSpiel}
                      onChange={(e) => setAgentIntroSpiel(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="field">
                    <label>Skills & Description (system prompt)</label>
                    <textarea
                      placeholder="You are a helpful customer support agent. You can answer questions about products, process orders, and handle returns. Be friendly and concise."
                      value={agentSkillsPrompt}
                      onChange={(e) => setAgentSkillsPrompt(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="field">
                    <label>Knowledge Base Documents</label>
                    <label className="kb-upload-zone">
                      <FileUp size={24} className="upload-icon" />
                      <span className="upload-text">Drop files here or click to upload</span>
                      <span className="upload-hint">PDF, TXT, DOCX — max 10 MB each</span>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.txt,.docx,.doc,.md,.csv"
                        hidden
                        onChange={(e) => {
                          if (e.target.files) {
                            setKbFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {kbFiles.length > 0 && (
                      <div className="kb-file-list">
                        {kbFiles.map((f, i) => (
                          <div key={`${f.name}-${i}`} className="kb-file-item">
                            <FileText size={14} />
                            <span>{f.name}</span>
                            <span className="file-size">{(f.size / 1024).toFixed(0)} KB</span>
                            <button
                              type="button"
                              className="remove-file"
                              onClick={() => setKbFiles((prev) => prev.filter((_, j) => j !== i))}
                              title="Remove file"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      className="btn primary flex-1 create-my-agent-btn"
                      onClick={handleCreateMyAgent}
                      disabled={isCreatingAgent || !newAgentName.trim()}
                    >
                      {isCreatingAgent ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
                      Use this agent
                    </button>
                    <button
                      className="btn"
                      onClick={handleEditAgain}
                      disabled={isCreatingAgent}
                    >
                      Edit again
                    </button>
                  </div>
                  <span className={`text-xs block mt-2 ${agentStatus.startsWith("Error") ? "text-bad" : "text-muted"}`}>
                    {agentStatus}
                  </span>
                </div>
              </div>

              <div className="mt-6">
                <label className="mb-3 block">Available Agents ({displayAgents.length})</label>
                <div className="grid grid-2">
                  {displayAgents.map((a) => (
                    <div key={a.id} className="card p-5 flex flex-col items-center text-center transition-all group relative overflow-hidden hover:border-lime">
                      <div className="w-12 h-12 rounded-full bg-limeDim flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Users size={20} className="text-lime" />
                      </div>
                      <div className="font-bold mb-1">{a.name || "Unnamed Assistant"}</div>
                      <div className="text-2xs text-faint mb-4 truncate w-full">{a.id}</div>
                      
                      <div className="flex gap-2 w-full mt-auto">
                        <button 
                          className="btn flex-1 text-2xs"
                          onClick={() => handleToggleCall(a.id)}
                          disabled={callStatus === "loading" || (callStatus === "active" && activeAgentId !== a.id)}
                        >
                          {callStatus === "loading" && activeAgentId === a.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            "Test Call"
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                  {displayAgents.length === 0 && !isFetchingBases && !agentBasesError && (
                    <div className="placeholder-pane h-20 text-2xs col-span-2">
                      No agents yet. Create one using the form above or in the&nbsp;
                      <a href="https://dashboard.vapi.ai" target="_blank" rel="noopener noreferrer" className="text-lime hover:underline">agent dashboard</a>.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <label className="mb-3 block">Active Call</label>
                <div className={`placeholder-pane h-32 text-2xs ${callStatus === "active" ? "border-lime" : ""}`}>
                  {callStatus === "active" ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="status-dot ok animate-pulse"></div>
                      <div className="text-lime">Session Active: {activeAgentId}</div>
                    </div>
                  ) : (
                    "No active call. Use the dialer or Test Call to start."
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "pane-call-logs" && (
            <div className="tab-pane active">
              <div className="pane-header">
                <label>Call History</label>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={callLogFilterType}
                    onChange={(e) => setCallLogFilterType(e.target.value)}
                    className="input text-2xs py-1.5 px-2 rounded border border-border bg-panel"
                    aria-label="Filter by call type"
                  >
                    <option value="all">All types</option>
                    <option value="inboundPhoneCall">Inbound</option>
                    <option value="outboundPhoneCall">Outbound</option>
                    <option value="webCall">Web</option>
                  </select>
                  <select
                    value={callLogFilterAssistant}
                    onChange={(e) => setCallLogFilterAssistant(e.target.value)}
                    className="input text-2xs py-1.5 px-2 rounded border border-border bg-panel min-w-[140px]"
                    aria-label="Filter by agent"
                  >
                    <option value="">All agents</option>
                    {agentBases.map((a) => (
                      <option key={a.id} value={a.id}>{a.name || a.id}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn"
                    onClick={fetchCallLogs}
                    disabled={isCallLogsLoading}
                  >
                    {isCallLogsLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Refresh
                  </button>
                </div>
              </div>
              {callLogPlaybackError && (
                <div className="mb-4 p-3 rounded-xl border border-red-500/50 bg-red-500/10 text-red-200 text-2xs">
                  {callLogPlaybackError}
                </div>
              )}
              {callLogRecordingUrl && (
                <div className="call-history-player mb-4">
                  <div className="call-history-player-inner">
                    <div className="call-history-player-label">
                      <Volume2 size={16} className="text-lime" />
                      <span>Now playing</span>
                    </div>
                    <audio
                      ref={callLogAudioRef}
                      src={callLogRecordingUrl}
                      controls
                      className="flex-1"
                      onEnded={() => { setPlayingCallLogId(null); setCallLogRecordingUrl(null); }}
                    />
                  </div>
                </div>
              )}
              <div className="call-logs-table">
                {isCallLogsLoading && callLogs.length === 0 ? (
                  <div className="placeholder-pane h-32 flex items-center justify-center text-muted">
                    Loading call history…
                  </div>
                ) : (() => {
                  const filtered = callLogFilterType === "all"
                    ? callLogs
                    : callLogs.filter((c) => c.type === callLogFilterType);
                  return filtered.length === 0 ? (
                    <div className="placeholder-pane h-32 flex items-center justify-center text-muted">
                      No calls yet
                    </div>
                  ) : (
                    <div className="call-logs-rows">
                      {filtered.map((c) => {
                        const { from, to } = getCallFromTo(c);
                        const isExpanded = expandedCallLogId === c.id;
                        const isPlaying = playingCallLogId === c.id;
                        const callType = c.type === "webCall" ? "web" : c.type === "outboundPhoneCall" ? "outbound" : "inbound";
                        const callLabel = c.type === "webCall" ? "Web" : c.type === "outboundPhoneCall" ? "Outbound" : c.type === "inboundPhoneCall" ? "Inbound" : c.type ?? "—";
                        return (
                          <div key={c.id}>
                            <div className="call-log-row" onClick={() => handleExpandCallLog(c.id)}>
                              <span className="call-log-id" title={c.id}>
                                {isExpanded ? <ChevronDown size={14} style={{ display: "inline", marginRight: 6 }} /> : <ChevronRight size={14} style={{ display: "inline", marginRight: 6 }} />}
                                {from || to || c.id.slice(0, 12)}
                              </span>
                              <span className={`call-log-type ${callType}`}>{callLabel}</span>
                              <span className="call-log-date">
                                {c.createdAt ? new Date(c.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                              </span>
                              <span className="call-log-duration">
                                <button
                                  type="button"
                                  className={`action-btn ${isPlaying ? "text-lime" : ""}`}
                                  onClick={(e) => { e.stopPropagation(); handlePlayCallLog(c.id); }}
                                  title={isPlaying ? "Stop" : "Play"}
                                  aria-label={isPlaying ? "Stop" : "Play"}
                                >
                                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                                </button>
                              </span>
                            </div>
                            {isExpanded && (
                              <div className="call-log-expanded">
                                <div className="flex items-center gap-3 text-2xs text-muted">
                                  <span>From: <strong>{from || "—"}</strong></span>
                                  <span>→</span>
                                  <span>To: <strong>{to || "—"}</strong></span>
                                </div>
                                <div className="call-log-transcript-header">
                                  <FileText size={14} />
                                  <span>Transcript</span>
                                </div>
                                {isExpandedCallLoading ? (
                                  <div className="flex items-center gap-2 text-muted text-2xs">
                                    <Loader2 size={14} className="animate-spin" />
                                    Loading transcript…
                                  </div>
                                ) : expandedCallTranscript ? (
                                  <pre className="call-log-transcript-text">{expandedCallTranscript}</pre>
                                ) : <span className="text-2xs text-faint">No transcript available</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {activeTab === "pane-integrations" && (
            <div className="tab-pane active">
              <div className="pane-header">
                <div>
                  <label>Integrations</label>
                  <div className="text-2xs text-faint mt-1">Connect your Vapi agents to external tools and services</div>
                </div>
              </div>
              <div className="integrations-grid">
                {[
                  { key: "sms", icon: "📱", cls: "sms", title: "SMS / Messaging", provider: "Twilio · Vonage", desc: "Send and receive SMS messages during or after calls. Trigger follow-up texts, confirmations, and alerts.", available: true },
                  { key: "email", icon: "📧", cls: "email", title: "Email", provider: "SendGrid · Mailgun", desc: "Automate email follow-ups, send transcripts, receipts, and notifications after each conversation.", available: true },
                  { key: "calendar", icon: "📅", cls: "calendar", title: "Calendar", provider: "Cal.com · Google Calendar", desc: "Let agents book, reschedule, and cancel appointments directly during a call.", available: true },
                  { key: "crm", icon: "🗂", cls: "crm", title: "CRM", provider: "GoHighLevel · HubSpot", desc: "Sync call data, transcripts, and contact info with your CRM automatically.", available: true },
                  { key: "slack", icon: "💬", cls: "slack", title: "Slack", provider: "Slack API", desc: "Get real-time call notifications, summaries, and alerts posted to Slack channels.", available: false },
                  { key: "webhook", icon: "🔗", cls: "webhook", title: "Custom Webhooks", provider: "Zapier · Make · n8n", desc: "Trigger any workflow via webhooks. Connect to thousands of apps through automation platforms.", available: true },
                ].map((intg) => (
                  <div key={intg.key} className="integration-card">
                    <div className="integration-card-header">
                      <div className={`integration-icon ${intg.cls}`}>{intg.icon}</div>
                      <div>
                        <div className="integration-card-title">{intg.title}</div>
                        <div className="integration-card-provider">{intg.provider}</div>
                      </div>
                    </div>
                    <div className="integration-card-desc">{intg.desc}</div>
                    <div className="integration-card-footer">
                      <span className="integration-status">
                        <span className={`dot ${intg.available ? "available" : "coming"}`}></span>
                        <span className="text-faint">{intg.available ? "Ready to connect" : "Coming soon"}</span>
                      </span>
                      <button className="btn-connect" disabled={!intg.available}>
                        {intg.available ? "Connect" : "Soon"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "pane-docs" && (
            <div className="tab-pane active">
              <DocsPane
                apiBaseUrl={apiBaseUrl}
                onCopyFeedback={(msg) => {
                  setDocsCopyFeedback(msg);
                  setTimeout(() => setDocsCopyFeedback(""), 2000);
                }}
              />
              {docsCopyFeedback && (
                <div className="fixed bottom-6 right-6 px-4 py-2 rounded-lg bg-lime text-bg font-medium text-sm shadow-lg z-50">
                  {docsCopyFeedback}
                </div>
              )}
            </div>
          )}

          {activeTab === "pane-settings" && (
            <div className="tab-pane active">
              <div className="field">
                <label>Default Echo Model</label>
                <select title="Default model for TTS">
                  <option>echo_flash_v2.5</option>
                  <option>echo_multilingual_v2</option>
                  <option>echo_turbo_v2.5</option>
                </select>
              </div>
              <div className="field">
                <label>Output Format</label>
                <select title="Default audio output format">
                  <option>mp3_44100_128</option>
                  <option>wav_44100</option>
                  <option>pcm_24000</option>
                </select>
              </div>
              <div className="field">
                <label>Stability (TTS)</label>
                <input type="range" min="0" max="1" step="0.1" defaultValue="0.5" title="Adjust voice stability" />
              </div>
              <div className="field">
                <label>Similarity Boost (TTS)</label>
                <input type="range" min="0" max="1" step="0.1" defaultValue="0.7" title="Adjust voice similarity" />
              </div>
              <div className="mt-4">
                <button className="btn primary" onClick={() => alert("Settings saved locally (Simulated)")}>Save Settings</button>
              </div>
            </div>
          )}

          {!["pane-audio", "pane-agents", "pane-call-logs", "pane-integrations", "pane-docs", "pane-settings"].includes(activeTab) && (
            <div className="tab-pane active placeholder-pane">
              Coming Soon: {activeItem?.label}
            </div>
          )}
        </div>
      </main>

      {/* Test Call Modal: orb, audio visualizer, live transcription */}
      {showTestCallModal && (
        <div className="call-overlay call-modal">
          <div className="call-content">
            <div className="orb-container">
              <div className={`orb active ${isSpeaking ? "speaking" : ""}`}></div>
              {callStatus === "loading" && (
                <div className="text-muted text-sm">Connecting...</div>
              )}
              {callStatus === "active" && (
                <>
                  <div className="text-lime font-bold tracking-widest uppercase text-xs">Web Call</div>
                  <div className="text-2xs text-faint">{activeAgentId}</div>
                  <div className={`audio-visualizer audio-viz-${audioVizId.replace(/:/g, "")} mt-4`} aria-hidden>
                    <style>{`
                      ${Array.from({ length: 12 })
                        .map(
                          (_, i) =>
                            `.audio-viz-${audioVizId.replace(/:/g, "")} .audio-bar:nth-child(${i + 2}) { --bar-height: ${8 + Math.min(92, callVolume * 100 * (0.5 + 0.5 * Math.sin(i * 0.6)))}%; }`
                        )
                        .join("\n")}
                    `}</style>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="audio-bar" />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="transcript-box">
              <div className="text-2xs text-faint mb-2 uppercase tracking-wider">Live transcription</div>
              {transcript.length === 0 ? (
                <div className="text-faint italic">Awaiting audio input...</div>
              ) : (
                transcript.map((t, idx) => (
                  <div key={idx} className={`mb-4 ${t.role === "user" ? "text-right" : "text-left"}`}>
                    <div className={`inline-block p-3 rounded-xl ${t.role === "user" ? "bg-white/5" : "text-lime"}`}>
                      {t.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="call-controls">
              <button
                className="btn danger px-8 py-4 rounded-full"
                onClick={() => {
                  orbit?.stop();
                  setShowTestCallModal(false);
                }}
              >
                <PhoneOff size={20} /> End call
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Overlay */}
      {isModalOpen && (
        <div className="modal-overlay flex">
          <div className="modal">
            <div className="title mb-5">
              <h1>🔑 Configuration</h1>
              <small>Environment variables are already configured.</small>
            </div>
            <div className="flex gap-2.5 justify-end mt-6">
              <button className="btn" onClick={() => setIsModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
