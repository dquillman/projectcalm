/* @jsxRuntime classic */
/* @jsx React.createElement */
// @ts-ignore
const { React } = window;
const { useState, useMemo, useEffect, useRef } = React;

import { btnBase, btnNeutral, btnPositive, cardBase, cardTone, subtleText, strongText } from "../../lib/styles";
import { daysUntilDue, priorityLabel, isOverdue, isDueToday, compareDue, toYMDLocal, classNames } from "../../lib/utils";
import { Task, Project, ID } from "../../lib/types";
import { db, auth } from "../../lib/firebase";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";

// Types for Chat
type Message = {
    id: string;
    role: "user" | "assistant";
    text: string;
    spokenText?: string;
    timestamp: number;
};

// Types for Voice
type VoicePreset = 'natural-female' | 'natural-male' | 'scifi' | 'custom' | 'hal-mode';

interface VoiceSettings {
    enabled: boolean;
    preset: VoicePreset;
    voiceURI: string; // 'auto' or specific URI
    rate: number;
    pitch: number;
    proactiveEnabled: boolean;
}

const DEFAULT_SETTINGS: VoiceSettings = {
    enabled: false,
    preset: 'natural-female',
    voiceURI: 'auto',
    rate: 1.0,
    pitch: 1.0,
    proactiveEnabled: false
};

interface AssistantViewProps {
    tasks: Task[];
    projects: Project[];
    userDisplayName?: string;
    onToggleTaskDone: (id: ID) => void;
    onToggleTaskToday: (id: ID) => void;
    onUpdateTaskMeta: (id: ID, patch: Partial<Task>) => void;
    onFocusTask: (id: ID) => void;
}

// --- Memory & Context Types ---
type UserProfile = {
    dayKey: string;
    createdAt: any;
    updatedAt: any;
    // Settings
    voiceEnabled: boolean;
    voicePreset: VoicePreset;
    proactiveEnabled: boolean;
    rate: number;
    pitch: number;
    // Counters (Reset Daily)
    completedCount: number;
    snoozedCount: number;
    focusCount: number;
    nudgesSent: number;
    nudgesIgnored: number;
    // Derived
    fatigueScore: number;
    prefersShortTasks: boolean;
    interruptionTolerance: 'low' | 'medium' | 'high';
};

type RecommendationContext = {
    prefersShortTasks?: boolean;
    fatigueScore?: number;
};

// --- V3 Recommendation Engine (Adapted) ---
function recommendNextTasks(tasks: Task[], projects: Project[], overrideTaskId?: string | null, context?: RecommendationContext): { now: Task | null; next: Task[]; rationale: string } {
    // 1. Filter candidates
    const projectSteps = projects.flatMap(p => p.steps.map(s => ({ ...s, title: `${p.name}: ${s.title}`, projectId: p.id } as Task)));
    const allItems = [...tasks, ...projectSteps];

    const candidates = allItems.filter(t => !t.done && !t.deletedAt);

    // 2. Sort Comparator
    const sortFn = (a: Task, b: Task) => {
        // A) Context Adaptation: Short tasks first if high fatigue
        if (context?.prefersShortTasks || (context?.fatigueScore && context.fatigueScore >= 60)) {
            const minsA = a.estimatedMinutes || 999;
            const minsB = b.estimatedMinutes || 999;
            const isShortA = minsA <= 20;
            const isShortB = minsB <= 20;
            if (isShortA !== isShortB) return isShortA ? -1 : 1;
        }

        // B) Priority: 1 (Critical) to 5 (Lowest). undefined => 99 (Last)
        const pa = a.priority ?? 99;
        const pb = b.priority ?? 99;
        if (pa !== pb) return pa - pb;

        // C) Estimated Minutes: Shortest first (Secondary sort)
        const ea = a.estimatedMinutes ?? 9999;
        const eb = b.estimatedMinutes ?? 9999;
        if (ea !== eb) return ea - eb;

        // D) Created At: Oldest first
        return (a.createdAt || '').localeCompare(b.createdAt || '');
    };

    // 3. Bucketize 
    let now: Task | null = null;
    let rationale = "";

    // Override Logic
    if (overrideTaskId) {
        const forced = candidates.find(t => t.id === overrideTaskId);
        if (forced) {
            now = forced;
            rationale = `You asked to focus on ${now.title} now.`;
        }
    }

    // Standard Selection
    if (!now) {
        // Sort each bucket with the context-aware sortFn
        const overdue = candidates.filter(t => isOverdue(t.dueDate)).sort(sortFn);
        const markedToday = candidates.filter(t => !isOverdue(t.dueDate) && t.today).sort(sortFn);
        const dueToday = candidates.filter(t => !isOverdue(t.dueDate) && !t.today && isDueToday(t.dueDate)).sort(sortFn);
        const upcoming = candidates.filter(t => !isOverdue(t.dueDate) && !t.today && !isDueToday(t.dueDate) && t.dueDate).sort(sortFn);
        const fallback = candidates.filter(t => !isOverdue(t.dueDate) && !t.today && !isDueToday(t.dueDate) && !t.dueDate).sort(sortFn);

        if (overdue.length > 0) {
            now = overdue[0];
            rationale = `${now.title} task is overdue. Let's get it back on track.`;
        } else if (markedToday.length > 0) {
            now = markedToday[0];
            rationale = `You marked ${now.title} as a focus for today.`;
        } else if (dueToday.length > 0) {
            now = dueToday[0];
            rationale = `${now.title} is due today.`;
        } else if (upcoming.length > 0) {
            now = upcoming[0];
            rationale = `${now.title} is your most important upcoming task.`;
        } else if (fallback.length > 0) {
            now = fallback[0];
            rationale = `${now.title} is the top priority item in your backlog.`;
        } else {
            rationale = "You're all caught up! Nothing to do.";
        }
    }

    // 4. Select "Next"
    const allSorted = candidates
        .filter(t => t.id !== now?.id)
        .sort((a, b) => {
            const overdueA = isOverdue(a.dueDate);
            const overdueB = isOverdue(b.dueDate);
            if (overdueA !== overdueB) return overdueA ? -1 : 1;

            const todayA = a.today || isDueToday(a.dueDate);
            const todayB = b.today || isDueToday(b.dueDate);
            if (todayA !== todayB) return todayA ? -1 : 1;

            return sortFn(a, b);
        });

    const next = allSorted.slice(0, 5);

    return { now, next, rationale };
}

export const AssistantView = ({
    tasks,
    projects,
    userDisplayName,
    onToggleTaskDone,
    onToggleTaskToday,
    onUpdateTaskMeta,
    onFocusTask
}: AssistantViewProps) => {

    // --- Agenda State ---
    const [showAgenda, setShowAgenda] = useState(true);
    const [forcedNowTaskId, setForcedNowTaskId] = useState<string | null>(null);

    // --- Memory & Context State ---
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [user, setUser] = useState(auth.currentUser);


    // Debug UI State
    const [debugLog, setDebugLog] = useState<string[]>([]);
    const log = (msg: string) => {
        console.log("DEBUG:", msg);
        setDebugLog(prev => [msg, ...prev].slice(0, 5));
    };

    // Auth Listener
    useEffect(() => {
        const unsub = auth.onAuthStateChanged((u) => {
            setUser(u);
            log(`Auth: ${u ? u.uid : "No User"}`);
        });
        return () => unsub();
    }, []);

    // Firestore Sync
    useEffect(() => {
        if (!user) {
            log("Sync: Waiting for user...");
            return;
        }
        log(`Sync: Starting ${user.uid.slice(0, 4)}...`);
        const uid = user.uid;
        const ref = doc(db, "user_profiles", uid);

        const unsub = onSnapshot(ref, (snap) => {
            log(`Sync: Snapshot (Exists: ${snap.exists()})`);
            if (snap.exists()) {
                const data = snap.data() as UserProfile;
                const todayKey = toYMDLocal(new Date());
                if (data.dayKey !== todayKey) {
                    // Reset Logic
                    setDoc(ref, {
                        dayKey: todayKey,
                        completedCount: 0,
                        snoozedCount: 0,
                        focusCount: 0,
                        nudgesSent: 0,
                        nudgesIgnored: 0,
                        fatigueScore: 0,
                        prefersShortTasks: false,
                        interruptionTolerance: 'high',
                        updatedAt: serverTimestamp()
                    } as any, { merge: true });
                } else {
                    setProfile(data);
                }
            } else {
                log("Sync: Creating Defaults...");
                const defaults: UserProfile = {
                    dayKey: toYMDLocal(new Date()),
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    voiceEnabled: false,
                    voicePreset: 'natural-female',
                    proactiveEnabled: false,
                    rate: 1.0,
                    pitch: 1.0,
                    completedCount: 0,
                    snoozedCount: 0,
                    focusCount: 0,
                    nudgesSent: 0,
                    nudgesIgnored: 0,
                    fatigueScore: 0,
                    prefersShortTasks: false,
                    interruptionTolerance: 'high'
                };
                setDoc(ref, defaults).then(() => log("Profile Created"));
            }
        }, (err) => {
            console.error(err);
            log(`Sync Error: ${err.message}`);
        });
        return () => unsub();
    }, [user]);

    // Derived Context for Recommendation
    const recContext: RecommendationContext = useMemo(() => ({
        prefersShortTasks: profile?.prefersShortTasks,
        fatigueScore: profile?.fatigueScore
    }), [profile]);

    // --- Derived Data (Unified Tasks + Steps) ---
    const allItems = useMemo(() => {
        const steps = projects.flatMap(p => p.steps.map(s => ({ ...s, title: `${p.name}: ${s.title}`, projectId: p.id } as Task)));
        return [...tasks, ...steps].filter(t => !t.done && !t.deletedAt);
    }, [tasks, projects]);

    // Derived Agenda Data
    const agendaData = useMemo(() => {
        if (!showAgenda) return null;

        const { now, next, rationale } = recommendNextTasks(tasks, projects, forcedNowTaskId, recContext);

        const overdueCount = allItems.filter(t => isOverdue(t.dueDate)).length;
        const todayCount = allItems.filter(t => t.today || isDueToday(t.dueDate)).length;

        return { nowTask: now, nextTasks: next, rationale, overdueCount, todayCount };
    }, [tasks, projects, showAgenda, forcedNowTaskId, recContext, allItems]);

    // Profile Helper
    const updateProfile = async (patch: Partial<UserProfile>) => {
        if (!user) {
            console.error("Cannot update profile: No user");
            return;
        }
        const ref = doc(db, "user_profiles", user.uid);

        // Recalculate fatigue if counters change
        let newPatch = { ...patch, updatedAt: serverTimestamp() };
        if (profile && (patch.completedCount !== undefined || patch.snoozedCount !== undefined || patch.focusCount !== undefined || patch.nudgesIgnored !== undefined)) {
            const c = (patch.completedCount ?? profile.completedCount) * 6;
            const s = (patch.snoozedCount ?? profile.snoozedCount) * 5;
            const f = (patch.focusCount ?? profile.focusCount) * 3;
            const n = (patch.nudgesIgnored ?? profile.nudgesIgnored) * 4;
            const fatigue = Math.min(100, Math.max(0, c + s + f + n));

            const prefersShort = fatigue >= 60 || (patch.snoozedCount ?? profile.snoozedCount) >= 3;

            // Tolerance logic
            const ni = patch.nudgesIgnored ?? profile.nudgesIgnored;
            const ns = patch.nudgesSent ?? profile.nudgesSent; // Wait, nudgesSent doesn't affect calculation in simple model for now? 
            let tolerance: 'low' | 'medium' | 'high' = 'high';
            if (ni >= 2) tolerance = 'low';
            else if (ni === 1) tolerance = 'medium';

            newPatch = { ...newPatch, fatigueScore: fatigue, prefersShortTasks: prefersShort, interruptionTolerance: tolerance };
        }

        setDoc(ref, newPatch, { merge: true });
    };

    // --- Actions ---
    const handleSnooze = (taskId: ID) => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        const tomorrowStr = toYMDLocal(d);
        if (tomorrowStr) onUpdateTaskMeta(taskId, { dueDate: tomorrowStr });
    };

    const handleTaskDoneWrapper = (id: ID) => {
        onToggleTaskDone(id);
        const t = tasks.find(x => x.id === id);
        if (t && !t.done && profile) {
            updateProfile({ completedCount: profile.completedCount + 1 });
        }
    };

    const handleSnoozeWrapper = (id: ID) => {
        handleSnooze(id);
        if (profile) updateProfile({ snoozedCount: profile.snoozedCount + 1 });
    };

    const handleFocusWrapper = (id: ID) => {
        onFocusTask(id);
        if (profile) updateProfile({ focusCount: profile.focusCount + 1 });
    };

    // --- Voice Logic (Synced) ---
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const isSpeakingRef = useRef(false);
    useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

    // Load voices
    useEffect(() => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            const load = () => setVoices(window.speechSynthesis.getVoices());
            if (window.speechSynthesis.onvoiceschanged !== undefined) {
                window.speechSynthesis.onvoiceschanged = load;
            }
            load();
        }
    }, []);

    // Sync Voice Settings from Profile
    const voiceSettings: VoiceSettings = useMemo(() => {
        if (profile) {
            return {
                enabled: profile.voiceEnabled,
                preset: profile.voicePreset,
                voiceURI: 'auto', // Keep simple for now, or add to profile if needed (schema said preset only, but we can add uri)
                rate: profile.rate,
                pitch: profile.pitch,
                proactiveEnabled: profile.proactiveEnabled
            };
        }
        return DEFAULT_SETTINGS;
    }, [profile]);

    const updateVoiceSettings = (patch: Partial<VoiceSettings>) => {
        // Map to profile fields
        const profilePatch: Partial<UserProfile> = {};
        if (patch.enabled !== undefined) profilePatch.voiceEnabled = patch.enabled;
        if (patch.preset !== undefined) profilePatch.voicePreset = patch.preset;
        if (patch.proactiveEnabled !== undefined) profilePatch.proactiveEnabled = patch.proactiveEnabled;
        if (patch.rate !== undefined) profilePatch.rate = patch.rate;
        if (patch.pitch !== undefined) profilePatch.pitch = patch.pitch;

        updateProfile(profilePatch);
    };

    const pickVoice = (voices: SpeechSynthesisVoice[], preset: VoicePreset, preferredURI: string): SpeechSynthesisVoice | null => {
        if (preferredURI !== 'auto' && preferredURI) {
            return voices.find(v => v.voiceURI === preferredURI) || null;
        }
        const lowerName = (v: SpeechSynthesisVoice) => v.name.toLowerCase();

        if (preset === 'hal-mode') {
            // STRICT MALE VOICE SEARCH
            // 1. Google US English (often best/neutral male)
            // 2. Microsoft David (Standard Windows Male)
            // 3. Any "Google" Male
            // 4. Any "US" Male
            // 5. Any Male voice at all
            return voices.find(v => v.name === 'Google US English') ||
                voices.find(v => v.name.includes('Microsoft David')) ||
                voices.find(v => lowerName(v).includes('google') && lowerName(v).includes('male')) ||
                voices.find(v => lowerName(v).includes('male') && lowerName(v).includes('us')) ||
                voices.find(v => lowerName(v).includes('male')) ||
                voices[0] || null;
        }

        // Helper for quality voices
        const isPremium = (v: SpeechSynthesisVoice) => {
            const n = lowerName(v);
            return n.includes('google') || n.includes('natural') || n.includes('premium') || n.includes('enhanced');
        };

        if (preset === 'natural-female') {
            return voices.find(v => isPremium(v) && lowerName(v).includes('female')) ||
                voices.find(v => lowerName(v).includes('female')) ||
                voices[0] || null;
        }

        if (preset === 'natural-male' || preset === 'scifi') {
            return voices.find(v => isPremium(v) && lowerName(v).includes('male')) ||
                voices.find(v => lowerName(v).includes('male')) ||
                voices[0] || null;
        }

        return voices[0] || null;
    };

    const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const stopSpeaking = () => {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
            if (pauseTimeoutRef.current) {
                clearTimeout(pauseTimeoutRef.current);
                pauseTimeoutRef.current = null;
            }
            setIsSpeaking(false);
        }
    };

    const speak = (text: string) => {
        if (!voiceSettings.enabled || !window.speechSynthesis) return;
        stopSpeaking();

        // Sanitize text for speech: Remove markdown symbols (*, _, #, etc)
        const cleanText = text.replace(/[*_#`]/g, '').trim();

        const targetVoice = pickVoice(voices, voiceSettings.preset, voiceSettings.voiceURI);
        const isHalMode = voiceSettings.preset === 'hal-mode';

        // Helper to setup utterance
        const createUtterance = (t: string) => {
            const u = new SpeechSynthesisUtterance(t);
            if (targetVoice) u.voice = targetVoice;
            u.rate = voiceSettings.rate;
            u.pitch = voiceSettings.pitch;
            return u;
        };

        if (isHalMode) {
            // Split by sentence delimiters but keep them attached or just split by space after?
            // Simple split by . ! ?
            const chunks = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
            let index = 0;

            const playNext = () => {
                if (index >= chunks.length) {
                    setIsSpeaking(false);
                    return;
                }

                const chunk = chunks[index].trim();
                if (!chunk) {
                    index++;
                    playNext();
                    return;
                }

                const u = createUtterance(chunk);
                u.onstart = () => setIsSpeaking(true);
                u.onend = () => {
                    index++;
                    // Deliberate pause
                    pauseTimeoutRef.current = setTimeout(() => {
                        playNext();
                    }, 650);
                };
                u.onerror = () => setIsSpeaking(false);
                window.speechSynthesis.speak(u);
            };

            setIsSpeaking(true);
            playNext();

        } else {
            // Standard continuous 
            const u = createUtterance(cleanText);
            u.onstart = () => setIsSpeaking(true);
            u.onend = () => setIsSpeaking(false);
            u.onerror = () => setIsSpeaking(false);
            window.speechSynthesis.speak(u);
        }
    };

    const applyPreset = (p: VoicePreset) => {
        let updates: Partial<VoiceSettings> = { preset: p, voiceURI: 'auto', enabled: true }; // Auto-enable
        if (p === 'natural-female') updates = { ...updates, rate: 1.0, pitch: 1.0 };
        else if (p === 'natural-male') updates = { ...updates, rate: 1.0, pitch: 1.0 }; // More natural pitch
        else if (p === 'scifi') updates = { ...updates, rate: 0.9, pitch: 0.85 };
        else if (p === 'hal-mode') updates = { ...updates, rate: 0.85, pitch: 0.6 }; // Deep and slow
        updateVoiceSettings(updates);
    };

    // --- Chat State ---
    const [messages, setMessages] = useState<Message[]>([
        { id: 'init', role: 'assistant', text: `Hello ${userDisplayName || 'there'}. Ready to help!`, timestamp: Date.now() }
    ]);
    const [inputText, setInputText] = useState("");

    // Auto-speak hook (Standard)
    useEffect(() => {
        if (!voiceSettings.enabled) return;
        const last = messages[messages.length - 1];
        if (last && last.role === 'assistant') {
            const now = Date.now();
            if (now - last.timestamp < 2000) {
                speak(last.spokenText || last.text);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages]);

    const runMorningCheckIn = () => {
        const { now, next } = recommendNextTasks(tasks, projects, forcedNowTaskId, recContext);
        const overdue = allItems.filter(t => isOverdue(t.dueDate));

        let msg = `☀️ **Morning Check-In**\n\n`;

        // 1. Top 3
        const top3 = next.slice(0, 3);
        if (now) top3.unshift(now);
        const uniqueTop = Array.from(new Set(top3)).slice(0, 3);

        if (uniqueTop.length > 0) {
            msg += `**Top Priorities:**\n`;
            uniqueTop.forEach(t => msg += `• ${t.title}\n`);
        } else {
            msg += `Your list looks clear for now!\n`;
        }

        // 2. First Move
        if (now) {
            msg += `\n**First Move:** ${now.title}\nClick Focus to start.\n`;
        }

        // 3. Risks
        if (overdue.length > 0) {
            msg += `\n**Risks:** You have ${overdue.length} overdue items. Consider clearing them first.\n`;
            msg += `❓ *Do you have 30 mins to tackle the backlog now?*`;
        } else if (uniqueTop.some(t => t.estimatedMinutes && t.estimatedMinutes > 60)) {
            msg += `\n❓ *You have big tasks today. Do you have a long block of time preserved?*`;
        }

        const botMsg: Message = {
            id: Date.now().toString(),
            role: "assistant",
            text: msg,
            spokenText: `Good Morning ${userDisplayName || 'Dave'}. Let's do a morning check-in.`, // Custom spoken phrase
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, botMsg]);
    };

    const runEveningReview = () => {
        const overdue = allItems.filter(t => isOverdue(t.dueDate));
        const todayLeft = allItems.filter(t => t.today || isDueToday(t.dueDate));

        const carryover = [...overdue, ...todayLeft].slice(0, 5);

        let msg = `🌙 **Evening Review**\n\n`;

        // 1. Wins (From Profile)
        const wins = profile ? profile.completedCount : 0;
        const focus = profile ? profile.focusCount : 0;

        msg += `**Wins Today:**\n`;
        msg += `• Completed: ${wins}\n`;
        msg += `• Focus Sessions: ${focus}\n`;

        if (profile && profile.fatigueScore > 50) {
            msg += `• Fatigue Score: ${profile.fatigueScore} (Take it easy!)\n`;
        }

        // 2. Carryover
        if (carryover.length > 0) {
            msg += `\n**Carryover (${carryover.length}):**\n`;
            carryover.forEach(t => msg += `• ${t.title}\n`);
            msg += `\n*Suggestion: Snooze these or mark them 'Today' for tomorrow in the Agenda.*`;
        } else {
            msg += `\n**All clear!** No immediate carryover tasks. Great job.`;
        }

        const botMsg: Message = { id: Date.now().toString(), role: "assistant", text: msg, timestamp: Date.now() };
        setMessages(prev => [...prev, botMsg]);
    };

    const handleSendMessage = (text: string) => {
        if (!text.trim()) return;
        const newMsg: Message = { id: Date.now().toString(), role: "user", text: text, timestamp: Date.now() };
        setMessages(prev => [...prev, newMsg]);
        setInputText("");

        setTimeout(() => {
            let responseText = "";
            const lower = text.toLowerCase().trim();

            const overrideMatch = lower.match(/(?:want to do|start|focus on) (.+?)(?: next| now|$)/i);

            if (overrideMatch && overrideMatch[1]) {
                const query = overrideMatch[1].trim();
                const found = tasks.find(t => !t.done && !t.deletedAt && t.title.toLowerCase().includes(query));
                if (found) {
                    setForcedNowTaskId(found.id);
                    responseText = `Okay, I've moved "${found.title}" to your active task.`;
                } else {
                    responseText = `I couldn't find a task matching "${query}".`;
                }
            }
            else if (lower.includes("morning check")) { runMorningCheckIn(); return; }
            else if (lower.includes("evening review")) { runEveningReview(); return; }
            else if (lower.includes("what should i do next") || lower.includes("what next")) {
                const { now, rationale } = recommendNextTasks(tasks, projects, forcedNowTaskId, recContext);
                if (now) {
                    responseText = `${rationale} I recommend you start with "${now.title}". Click Focus to start.`;
                } else {
                    responseText = "You have no tasks pending! Enjoy your free time.";
                }
            }
            else if (lower.includes("good morning")) { responseText = `Good morning ${userDisplayName || 'Dave'}`; }
            else if (lower.includes("clear memory")) {
                if (window.confirm("Are you sure you want to clear your assistant memory? This resets all stats.")) {
                    if (auth.currentUser) {
                        const ref = doc(db, "user_profiles", auth.currentUser.uid);
                        // reset defaults
                        const defaults: UserProfile = {
                            dayKey: toYMDLocal(new Date()),
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                            voiceEnabled: false,
                            voicePreset: 'natural-female',
                            proactiveEnabled: false,
                            rate: 1.0,
                            pitch: 1.0,
                            completedCount: 0,
                            snoozedCount: 0,
                            focusCount: 0,
                            nudgesSent: 0,
                            nudgesIgnored: 0,
                            fatigueScore: 0,
                            prefersShortTasks: false,
                            interruptionTolerance: 'high'
                        };
                        setDoc(ref, defaults);
                        responseText = "Memory cleared. Starting fresh!";
                    }
                } else {
                    responseText = "Cancelled.";
                }
            }
            else { responseText = `I heard: "${text}". I'm listening!`; }

            const botMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", text: responseText, timestamp: Date.now() };
            setMessages(prev => [...prev, botMsg]);
        }, 600);
    };

    // --- Proactive Mode Implementation ---
    const hasNudgedRef = useRef(false);
    const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastActivityRef = useRef(Date.now());
    const nudgeSentAtRef = useRef<number | null>(null);
    const profileRef = useRef(profile); // Ref for profile to avoid stale closures
    useEffect(() => { profileRef.current = profile; }, [profile]);

    // Reset idle timer on activity
    useEffect(() => {
        // Interruption Tolerance: Low -> 15 min, else 8 min
        const tolerance = profileRef.current?.interruptionTolerance || 'high';
        const IDLE_TIMEOUT = (tolerance === 'low' ? 15 : 8) * 60 * 1000;

        const resetTimer = () => {
            lastActivityRef.current = Date.now();
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            hasNudgedRef.current = false;

            if (voiceSettings.proactiveEnabled) {
                idleTimerRef.current = setTimeout(handleIdleTimeout, IDLE_TIMEOUT);
            }
        };

        const handleIdleTimeout = () => {
            if (!voiceSettings.proactiveEnabled) return;
            if (hasNudgedRef.current) return;
            if (isSpeakingRef.current) return;

            const { now } = recommendNextTasks(tasks, projects, forcedNowTaskId, recContext);
            if (now) {
                const nudgeText = `Ready for the next step? I recommend: ${now.title}. Click Focus to start.`;
                const nudgeMsg: Message = { id: Date.now().toString() + '-proactive', role: 'assistant', text: nudgeText, timestamp: Date.now() };
                setMessages(prev => [...prev, nudgeMsg]);

                // Track Nudge
                if (profileRef.current) updateProfile({ nudgesSent: profileRef.current.nudgesSent + 1 });
                hasNudgedRef.current = true;
                nudgeSentAtRef.current = Date.now();

                // Start "Ignored" Check
                setTimeout(() => {
                    // Check if ignored: User active since nudge, but nudgeSentAtRef still set (meaning not focused / cleared)
                    if (nudgeSentAtRef.current && lastActivityRef.current > nudgeSentAtRef.current) {
                        // User was active after nudge, but didn't focus on the recommended task.
                        // Increment nudgesIgnored and recalculate fatigue/tolerance.
                        if (!auth.currentUser || !profileRef.current) return;
                        const ref = doc(db, "user_profiles", auth.currentUser.uid);

                        const currentProfile = profileRef.current;
                        const newIgnored = currentProfile.nudgesIgnored + 1;

                        // Recalculate fatigue and tolerance based on new ignored count
                        const c = currentProfile.completedCount * 6;
                        const s = currentProfile.snoozedCount * 5;
                        const f = currentProfile.focusCount * 3;
                        const n = newIgnored * 4;
                        const fatigue = Math.min(100, Math.max(0, c + s + f + n));

                        let newTolerance: 'low' | 'medium' | 'high' = 'high';
                        if (newIgnored >= 2) newTolerance = 'low';
                        else if (newIgnored === 1) newTolerance = 'medium';

                        setDoc(ref, {
                            nudgesIgnored: newIgnored,
                            fatigueScore: fatigue,
                            interruptionTolerance: newTolerance,
                            updatedAt: serverTimestamp()
                        }, { merge: true });

                        nudgeSentAtRef.current = null; // Clear after processing
                    }
                }, 2 * 60 * 1000); // Check 2 minutes after nudge
            }
        };

        // Attach listeners
        window.addEventListener('mousemove', resetTimer);
        window.addEventListener('keydown', resetTimer);
        window.addEventListener('touchstart', resetTimer);
        window.addEventListener('scroll', resetTimer);
        resetTimer();

        return () => {
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            window.removeEventListener('mousemove', resetTimer);
            window.removeEventListener('keydown', resetTimer);
            window.removeEventListener('touchstart', resetTimer);
            window.removeEventListener('scroll', resetTimer);
        };
    }, [voiceSettings.proactiveEnabled, tasks, forcedNowTaskId, profileRef.current?.interruptionTolerance]); // Re-bind if tolerance changes

    // Effect to clear nudgeSentAtRef if focusCount changes (user focused on something)
    useEffect(() => {
        if (nudgeSentAtRef.current && profile?.focusCount !== undefined && profileRef.current?.focusCount !== undefined && profile.focusCount > profileRef.current.focusCount) {
            nudgeSentAtRef.current = null; // User focused, so nudge was not ignored.
        }
    }, [profile?.focusCount]);


    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-200px)] min-h-[400px] overflow-hidden relative">
            {/* DEBUG OVERLAY */}
            <div className="absolute top-2 right-2 flex flex-col items-end gap-1 pointer-events-none z-50">
                {debugLog.map((msg, i) => (
                    <div key={i} className="bg-slate-900/90 text-white text-[10px] px-2 py-1 rounded border border-slate-700 font-mono">
                        {msg}
                    </div>
                ))}
            </div>
            {/* AGENDA */}
            <div className={classNames("flex flex-col gap-4 p-4 rounded-xl border border-slate-700/50 bg-slate-800/20 overflow-y-auto")}>
                <h2 className={classNames("text-xl font-bold", strongText)}>Daily Agenda</h2>
                {!showAgenda ? (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-70">
                        <button className={classNames(btnBase, btnPositive, "px-6 py-3 text-lg")} onClick={() => setShowAgenda(true)}>Show Agenda</button>
                    </div>
                ) : (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
                        <div className="p-4 bg-indigo-900/30 border border-indigo-500/30 rounded-lg shadow-lg shadow-indigo-900/20">
                            <div className="text-indigo-300 text-xs font-bold uppercase tracking-wider mb-2">Do This Now</div>
                            {agendaData?.nowTask ? (
                                <div>
                                    <div className="text-lg font-semibold text-white">{agendaData.nowTask.title}</div>
                                    <div className="text-indigo-200/90 text-sm mt-1 mb-3 italic">"{agendaData.rationale}"</div>
                                    <div className="text-indigo-200/50 text-xs flex gap-2 mb-3">
                                        {agendaData.nowTask.priority && <span>P{agendaData.nowTask.priority}</span>}
                                        {agendaData.nowTask.dueDate && <span>Due: {agendaData.nowTask.dueDate}</span>}
                                        {agendaData.nowTask.today && <span className="text-emerald-400">★ Today</span>}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleTaskDoneWrapper(agendaData.nowTask!.id)} className="px-3 py-1 bg-green-600/20 hover:bg-green-600/40 text-green-300 text-xs rounded border border-green-600/50">Done</button>
                                        <button onClick={() => handleFocusWrapper(agendaData.nowTask!.id)} className="px-3 py-1 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-xs rounded border border-indigo-600/50">Focus</button>
                                        <button onClick={() => handleSnoozeWrapper(agendaData.nowTask!.id)} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded border border-slate-600">Snooze</button>
                                        <button onClick={() => onToggleTaskToday(agendaData.nowTask!.id)} className="px-3 py-1 bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-300 text-xs rounded border border-yellow-600/50">{agendaData.nowTask.today ? "Un-Today" : "Today"}</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-slate-400 italic">No pressing tasks found!</div>
                            )}
                        </div>
                        <div>
                            <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Up Next</div>
                            <div className="space-y-2">
                                {agendaData?.nextTasks && agendaData.nextTasks.length > 0 ? (
                                    agendaData.nextTasks.map(t => (
                                        <div key={t.id} className="p-3 bg-slate-800/50 rounded border border-slate-700 flex justify-between items-start group">
                                            <div>
                                                <div className="font-medium text-slate-200">{t.title}</div>
                                                <div className="text-xs text-slate-500 flex gap-2 mt-1">
                                                    {t.priority && <span>P{t.priority}</span>}
                                                    {t.dueDate && <span>{t.dueDate}</span>}
                                                    {isOverdue(t.dueDate) && <span className="text-rose-400">Overdue</span>}
                                                </div>
                                            </div>
                                            <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                                                <button onClick={() => handleTaskDoneWrapper(t.id)} title="Done" className="p-1 hover:text-green-400 text-slate-400">✅</button>
                                                <button onClick={() => handleFocusWrapper(t.id)} title="Focus" className="p-1 hover:text-indigo-400 text-slate-400">🎯</button>
                                                <button onClick={() => handleSnoozeWrapper(t.id)} title="Snooze" className="p-1 hover:text-blue-400 text-slate-400">💤</button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-slate-500 text-sm p-2">Nothing else lined up right now.</div>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-center text-sm">
                            <div className="p-2 bg-rose-900/20 rounded border border-rose-800/30">
                                <div className="text-rose-400 font-bold">{agendaData?.overdueCount}</div>
                                <div className="text-rose-200/60 text-xs">Overdue</div>
                            </div>
                            <div className="p-2 bg-emerald-900/20 rounded border border-emerald-800/30">
                                <div className="text-emerald-400 font-bold">{agendaData?.todayCount}</div>
                                <div className="text-emerald-200/60 text-xs">Today</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* CHAT */}
            <div className={classNames("flex flex-col rounded-xl border border-slate-700/50 bg-slate-800/20 overflow-hidden")}>
                <div className="p-4 border-b border-slate-700/50 bg-slate-900/50 backdrop-blur">
                    <h2 className={classNames("font-bold", strongText)}>Assistant Chat</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-700 text-slate-200 rounded-bl-none'}`}>
                                {msg.text}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-2 border-t border-slate-700/30 overflow-x-auto whitespace-nowrap scrollbar-hide">
                    <div className="flex gap-2">
                        {["Morning Check-In", "Evening Review", "What next?", "Good morning"].map(prompt => (
                            <button key={prompt} className="px-3 py-1 bg-slate-700/40 hover:bg-slate-700/70 text-xs text-slate-300 rounded-full border border-slate-600 transition-colors" onClick={() => handleSendMessage(prompt)}>
                                {prompt}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="p-3 border-t border-slate-700/50 bg-slate-900/30">
                    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); handleSendMessage(inputText); }}>
                        <input className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" placeholder="Type a message..." value={inputText} onChange={e => setInputText(e.target.value)} />
                        <button type="submit" className={classNames(btnBase, btnPositive, "px-4")}>Send</button>
                    </form>
                </div>
            </div>

            {/* AVATAR / VOICE PANEL */}
            {/* AVATAR / VOICE PANEL */}
            <div className={classNames("flex flex-col gap-4 p-4 rounded-xl border border-slate-700/50 bg-slate-800/20 overflow-y-auto")}>
                <div className="flex justify-between items-center">
                    <h2 className={classNames("text-xl font-bold", strongText)}>Avatar & Memory</h2>
                    <button onClick={() => { updateVoiceSettings({ enabled: !voiceSettings.enabled }); if (voiceSettings.enabled) stopSpeaking(); }} className={`text-xs px-2 py-1 rounded border ${voiceSettings.enabled ? 'border-green-600 bg-green-900/30 text-green-400' : 'border-slate-600 bg-slate-800 text-slate-400'}`}>
                        {voiceSettings.enabled ? 'ON' : 'OFF'}
                    </button>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-900/40 rounded-xl border border-slate-800/50 relative overflow-hidden min-h-[180px]">
                    <div className={`w-32 h-32 rounded-full mb-4 shadow-lg flex items-center justify-center relative transition-all duration-300 ${voiceSettings.preset === 'hal-mode' ? 'bg-black shadow-red-900/50 border-4 border-slate-400' : 'bg-gradient-to-tr from-indigo-500 to-purple-500'}`}>
                        {/* HAL LENS EFFECT */}
                        {voiceSettings.preset === 'hal-mode' && (
                            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.1),transparent_40%)]"></div>
                        )}

                        {/* Standard Ping for others */}
                        {isSpeaking && voiceSettings.preset !== 'hal-mode' && <div className="absolute -inset-2 rounded-full border-2 border-indigo-400/50 animate-ping"></div>}

                        <div className={`absolute inset-1 rounded-full flex items-center justify-center z-10 overflow-hidden relative ${voiceSettings.preset === 'hal-mode' ? 'bg-black' : 'bg-slate-900'}`}>
                            {voiceSettings.preset === 'hal-mode' ? (
                                <div className="relative flex items-center justify-center">
                                    {/* Outer Glow */}
                                    <div className={`absolute w-16 h-16 rounded-full bg-red-600/20 blur-xl ${isSpeaking ? 'animate-pulse opacity-100' : 'opacity-50'}`}></div>
                                    {/* Inner Nav/Ring */}
                                    <div className="w-12 h-12 rounded-full bg-red-900 shadow-[inset_0_0_10px_rgba(0,0,0,0.8)] flex items-center justify-center border border-red-950">
                                        {/* The Eye */}
                                        <div className={`w-4 h-4 rounded-full bg-red-500 shadow-[0_0_15px_4px_rgba(255,0,0,0.8)] ${isSpeaking ? 'scale-110 brightness-150' : 'scale-100'}`}></div>
                                        {/* Glare */}
                                        <div className="absolute top-3 left-3 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]"></div>
                                    </div>
                                </div>
                            ) : (
                                <span className="text-5xl relative z-20">
                                    {voiceSettings.preset.includes('female') ? '👩‍💼' : voiceSettings.preset === 'scifi' ? '🤖' : '👨‍💼'}
                                </span>
                            )}
                            {isSpeaking && voiceSettings.preset !== 'hal-mode' && <div className="absolute bottom-8 w-8 h-1 bg-white/20 rounded-full animate-pulse"></div>}
                        </div>
                    </div>

                    <div className="h-8 flex items-end gap-1 mb-2">
                        {isSpeaking ? (
                            <React.Fragment>
                                <div className="w-1 bg-indigo-400 animate-[bounce_1s_infinite] h-4"></div>
                                <div className="w-1 bg-purple-400 animate-[bounce_1.2s_infinite] h-6"></div>
                                <div className="w-1 bg-blue-400 animate-[bounce_0.8s_infinite] h-8"></div>
                                <div className="w-1 bg-purple-400 animate-[bounce_1.1s_infinite] h-5"></div>
                                <div className="w-1 bg-indigo-400 animate-[bounce_0.9s_infinite] h-3"></div>
                            </React.Fragment>
                        ) : (
                            <div className="h-1 w-20 bg-slate-700/50 rounded-full"></div>
                        )}
                    </div>

                    <div className="text-center z-20">
                        <h3 className="text-white font-medium">{voiceSettings.preset === 'scifi' ? 'System AI' : 'Assistant'}</h3>
                        <p className="text-xs text-slate-500">{isSpeaking ? 'Speaking...' : voiceSettings.proactiveEnabled ? 'Watching for idle...' : 'Listening'}</p>
                    </div>
                </div>

                {/* MEMORY STATS */}
                <div className="p-3 bg-slate-900/30 rounded-lg border border-slate-800 space-y-2">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Today's Memory</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between p-2 bg-slate-800/50 rounded">
                            <span className="text-slate-400">Wins</span>
                            <span className="text-emerald-400 font-mono">{profile?.completedCount || 0}</span>
                        </div>
                        <div className="flex justify-between p-2 bg-slate-800/50 rounded">
                            <span className="text-slate-400">Focus</span>
                            <span className="text-indigo-400 font-mono">{profile?.focusCount || 0}</span>
                        </div>
                        <div className="flex justify-between p-2 bg-slate-800/50 rounded">
                            <span className="text-slate-400">Fatigue</span>
                            <span className={`font-mono ${(profile?.fatigueScore || 0) > 60 ? 'text-rose-400' : 'text-green-400'}`}>{profile?.fatigueScore || 0}%</span>
                        </div>
                        <div className="flex justify-between p-2 bg-slate-800/50 rounded">
                            <span className="text-slate-400">Tolerance</span>
                            <span className={`font-mono capitalization ${(profile?.interruptionTolerance || 'high') === 'low' ? 'text-rose-400' : 'text-blue-300'}`}>{profile?.interruptionTolerance || 'High'}</span>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                        <button onClick={() => { if (confirm("Reset today's tracking?")) updateProfile({ completedCount: 0, focusCount: 0, snoozedCount: 0, nudgesIgnored: 0, nudgesSent: 0 }); }} className="flex-1 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] rounded border border-slate-600">
                            Reset Today
                        </button>
                        <button onClick={() => handleSendMessage("clear memory")} className="flex-1 py-1 bg-rose-900/20 hover:bg-rose-900/30 text-rose-400 text-[10px] rounded border border-rose-800/40">
                            Clear All
                        </button>
                    </div>
                </div>

                {/* SETTINGS */}
                <div className="space-y-4 p-4 bg-slate-900/30 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between">
                        <label className="text-xs text-slate-400 font-semibold">Proactive Mode</label>
                        <button
                            onClick={() => updateVoiceSettings({ proactiveEnabled: !voiceSettings.proactiveEnabled })}
                            className={`w-8 h-4 rounded-full flex items-center transition-colors duration-300 ${voiceSettings.proactiveEnabled ? 'bg-indigo-600 justify-end' : 'bg-slate-700 justify-start'}`}
                        >
                            <div className="w-3 h-3 bg-white rounded-full mx-0.5" />
                        </button>
                    </div>

                    <div>
                        <label className="text-xs text-slate-400 mb-1 block font-semibold">Voice Preset</label>
                        <select className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none" value={voiceSettings.preset} onChange={(e) => applyPreset(e.target.value as VoicePreset)}>
                            <option value="natural-female">Natural Female</option>
                            <option value="natural-male">Natural Male</option>
                            <option value="scifi">Classic Sci-Fi</option>
                            <option value="hal-mode">HAL Mode</option>
                            <option value="custom">Custom</option>
                        </select>
                    </div>
                    {voiceSettings.preset === 'custom' && (
                        <div>
                            <label className="text-xs text-slate-400 mb-1 block">Specific Voice</label>
                            <select className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none" value={voiceSettings.voiceURI} onChange={(e) => updateVoiceSettings({ voiceURI: e.target.value, preset: 'custom' })}>
                                <option value="auto">Auto Select</option>
                                {voices.map(v => (<option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>))}
                            </select>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-slate-400 mb-1 block">Rate: {voiceSettings.rate}</label>
                            <input type="range" min="0.5" max="2" step="0.1" className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" value={voiceSettings.rate} onChange={(e) => updateVoiceSettings({ rate: parseFloat(e.target.value), preset: 'custom' })} />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 mb-1 block">Pitch: {voiceSettings.pitch}</label>
                            <input type="range" min="0.5" max="2" step="0.1" className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" value={voiceSettings.pitch} onChange={(e) => updateVoiceSettings({ pitch: parseFloat(e.target.value), preset: 'custom' })} />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button className={classNames(btnBase, btnNeutral, "flex-1 text-xs")} onClick={() => { const lastMsg = messages.filter(m => m.role === 'assistant').pop(); if (lastMsg) speak(lastMsg.text); }}>Speak Last</button>
                        <button className={classNames(btnBase, "bg-rose-900/30 border-rose-800 text-rose-400 hover:bg-rose-900/50 flex-none px-3 text-xs")} onClick={stopSpeaking}>Stop</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
