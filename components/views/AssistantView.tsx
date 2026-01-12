/* @jsxRuntime classic */
/* @jsx React.createElement */
import React, { useState, useMemo, useEffect, useRef } from 'react';

import { btnBase, btnNeutral, btnPositive, cardBase, cardTone, subtleText, strongText } from "../../lib/styles";
import { daysUntilDue, priorityLabel, isOverdue, isDueToday, compareDue, toYMDLocal, classNames, sanitizeForFirestore } from "../../lib/utils";
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
type VoicePreset = 'natural-female' | 'natural-male' | 'scifi' | 'custom' | 'hal-mode' | 'spicoli';

interface VoiceSettings {
    enabled: boolean;
    preset: VoicePreset;
    voiceURI: string; // 'auto' or specific URI
    rate: number;
    pitch: number;
    proactiveEnabled: boolean;
}

const DEFAULT_SETTINGS: VoiceSettings = {
    enabled: true,
    preset: 'spicoli',
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
    onToggleStepDone?: (projectId: ID, stepId: ID) => void;
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

// --- Time Blocking Types ---
export type TimeBlockStatus = 'planned' | 'done' | 'skipped';
export type BlockType = 'focus' | 'break' | 'lunch' | 'quiet';

export interface TimeBlock {
    start: string; // HH:MM
    end: string;   // HH:MM
    type: BlockType;
    taskId?: string;
    taskTitle?: string; // Cached title
    projectId?: string; // For Project Steps
    status: TimeBlockStatus;
    partIndex?: number; // If split across blocks
}

export interface DailyPlan {
    dayKey: string;
    blocks: TimeBlock[];
}

export interface SchedulingPreferences {
    workDayStart: string;
    workDayEnd: string;
    focusBlockMinutes: number;
    breakMinutes: number;
    lunchStart: string;
    lunchMinutes: number;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    allowEveningBlocks: boolean;
}

const DEFAULT_SCHED_PREFS: SchedulingPreferences = {
    workDayStart: "09:00",
    workDayEnd: "17:00",
    focusBlockMinutes: 50,
    breakMinutes: 10,
    lunchStart: "12:00",
    lunchMinutes: 45,
    allowEveningBlocks: false
};


// --- V3 Recommendation Engine (Adapted) ---
function recommendNextTasks(tasks: Task[], projects: Project[], overrideTaskId?: string | null, context?: RecommendationContext): { now: Task | null; next: Task[]; allSorted: Task[]; rationale: string } {
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

    // Calculate how many items are "important" (Overdue or Today)
    const importantCount = allSorted.filter(t => isOverdue(t.dueDate) || t.today || isDueToday(t.dueDate)).length;
    // Show at least 5 items, but expand to show all important ones if there are more
    const next = allSorted.slice(0, Math.max(5, importantCount));

    return { now, next, allSorted, rationale };
}

export const AssistantView = ({
    tasks,
    projects,
    userDisplayName,
    onToggleTaskDone,
    onToggleTaskToday,
    onUpdateTaskMeta,
    onFocusTask,
    onToggleStepDone
}: AssistantViewProps) => {

    // --- Agenda State ---
    const [showAgenda, setShowAgenda] = useState(true);
    const [forcedNowTaskId, setForcedNowTaskId] = useState<string | null>(null);

    // --- Memory & Context State ---
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [user, setUser] = useState(auth.currentUser);

    // Voice Input State
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);


    // Debug UI State
    const [debugLog, setDebugLog] = useState<string[]>([]);
    const log = (msg: string) => {
        console.log("DEBUG:", msg);
        setDebugLog(prev => [msg, ...prev].slice(0, 5));
    };

    // --- Time Blocking State ---
    const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null);
    const [schedPrefs, setSchedPrefs] = useState<SchedulingPreferences>(DEFAULT_SCHED_PREFS);
    const [showSchedSettings, setShowSchedSettings] = useState(false);
    const [planError, setPlanError] = useState<string | null>(null);

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
        const todayKey = toYMDLocal(new Date());

        // 1. Profile Listener
        const profileRef = doc(db, "user_profiles", user.uid);
        const unsubProfile = onSnapshot(profileRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                // Check if day changed
                if (data.dayKey !== todayKey) {
                    // Reset daily counters
                    setDoc(profileRef, {
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
                    if (data) {
                        setProfile(data as UserProfile);
                        // Load scheduling preferences from profile if they exist
                        const prefs = { ...DEFAULT_SCHED_PREFS };

                        const sanitizeTime = (t: string) => {
                            // Ensure HH:MM (24h)
                            // If looks like 9:00 AM, parse it.
                            if (!t) return "09:00";
                            if (t.match(/^\d{2}:\d{2}$/)) return t;
                            if (t.match(/^\d{1}:\d{2}$/)) return `0${t}`;

                            // Try simple parse
                            try {
                                // limited AM/PM support for legacy data
                                const lower = t.toLowerCase();
                                if (lower.includes('pm') && !lower.includes('12')) {
                                    const parts = lower.replace('pm', '').trim().split(':');
                                    let h = parseInt(parts[0]);
                                    if (h < 12) h += 12;
                                    return `${h.toString().padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
                                }
                                if (lower.includes('am')) {
                                    const parts = lower.replace('am', '').trim().split(':');
                                    let h = parseInt(parts[0]);
                                    if (h === 12) h = 0;
                                    return `${h.toString().padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
                                }
                            } catch (e) {
                                return "09:00";
                            }
                            return t;
                        };

                        if (data.workDayStart) prefs.workDayStart = sanitizeTime(data.workDayStart);
                        if (data.workDayEnd) prefs.workDayEnd = sanitizeTime(data.workDayEnd);
                        if (data.focusBlockMinutes) prefs.focusBlockMinutes = data.focusBlockMinutes;
                        if (data.breakMinutes) prefs.breakMinutes = data.breakMinutes;
                        if (data.lunchStart) prefs.lunchStart = sanitizeTime(data.lunchStart);
                        if (data.lunchMinutes) prefs.lunchMinutes = data.lunchMinutes;
                        if (data.allowEveningBlocks !== undefined) prefs.allowEveningBlocks = data.allowEveningBlocks;
                        setSchedPrefs(prefs);
                    }
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
                    rate: 1,
                    pitch: 1,
                    completedCount: 0,
                    snoozedCount: 0,
                    focusCount: 0,
                    nudgesSent: 0,
                    nudgesIgnored: 0,
                    fatigueScore: 0,
                    prefersShortTasks: false,
                    interruptionTolerance: 'high'
                };
                setDoc(profileRef, defaults);
                setProfile(defaults);
            }
        });

        // 2. Daily Plan Listener
        const planId = `${user.uid}_${todayKey}`;
        const planRef = doc(db, "daily_plans", planId);
        const unsubPlan = onSnapshot(planRef, (snap) => {
            if (snap.exists()) {
                setDailyPlan(snap.data() as DailyPlan);
            } else {
                setDailyPlan(null);
            }
        });

        return () => {
            unsubProfile();
            unsubPlan();
        };
    }, [user, userDisplayName]);

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

        setDoc(ref, sanitizeForFirestore(newPatch), { merge: true })
            .catch(err => console.error("Profile update failed:", err));
    };

    // --- Actions ---
    const handleSnooze = (taskId: ID) => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        const tomorrowStr = toYMDLocal(d);
        if (tomorrowStr) onUpdateTaskMeta(taskId, { dueDate: tomorrowStr });
    };

    const handleTaskDoneWrapper = (id: ID) => {
        // 1. Check if it's a project step
        const stepMatch = projects.find(p => p.steps.some(s => s.id === id));
        if (stepMatch && onToggleStepDone) {
            onToggleStepDone(stepMatch.id, id);
        } else {
            // 2. Regular task
            onToggleTaskDone(id);
        }

        // Profile updates (simplified, generic count)
        const t = tasks.find(x => x.id === id); // This only finds regular tasks for profile stats? 
        // Actually, we should count step completion too.
        if (profile) {
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


    // --- Time Blocking Logic ---

    const saveDailyPlan = async (plan: DailyPlan) => {
        console.log("saveDailyPlan called. User:", user?.uid);
        if (!user) {
            console.error("saveDailyPlan abort: no user");
            return;
        }
        setPlanError(null);
        try {
            // Sanitize entire plan to remove undefined values recursively
            const safePlan = sanitizeForFirestore({ ...plan });

            const planId = `${user.uid}_${plan.dayKey}`;
            await setDoc(doc(db, "daily_plans", planId), safePlan);
        } catch (err: any) {
            console.error("Save Plan Error:", err);
            setPlanError(err.message || "Failed to save plan");
        }
    };

    const updateSchedPrefs = async (patch: Partial<SchedulingPreferences>) => {
        if (!user) return;
        const newPrefs = { ...schedPrefs, ...patch };
        setSchedPrefs(newPrefs);
        // Persist to user_profile
        await setDoc(doc(db, "user_profiles", user.uid), sanitizeForFirestore(patch), { merge: true })
            .catch(err => console.error("SchedPrefs update failed:", err));
    };

    const generatePlan = async () => {
        if (!user) return;
        const todayKey = toYMDLocal(new Date());

        // 1. Parse Times
        const hmToMin = (hm: string) => {
            const [h, m] = hm.split(':').map(Number);
            return h * 60 + m;
        };
        const minToHm = (m: number) => {
            const h = Math.floor(m / 60);
            const min = m % 60;
            return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        };

        const workStart = hmToMin(schedPrefs.workDayStart);
        const workEnd = hmToMin(schedPrefs.workDayEnd);
        const lunchStart = hmToMin(schedPrefs.lunchStart);
        const lunchEnd = lunchStart + schedPrefs.lunchMinutes;

        // 2. Candidates
        const { now: nowTask, allSorted } = recommendNextTasks(tasks, projects, null, recContext);
        // Include 'now' task at the start, as allSorted excludes it.
        const candidates = nowTask ? [nowTask, ...allSorted] : allSorted;
        // Use all candidates for scheduling, not just top 5 (which is for UI display)

        const newBlocks: TimeBlock[] = [];
        // Smart Start: If today, avoid scheduling in the past.
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const snapNow = Math.ceil(nowMin / 5) * 5;
        const realTodayKey = toYMDLocal(new Date());
        const isToday = todayKey === realTodayKey;

        console.log("Smart Schedule Debug:", { todayKey, realTodayKey, isToday, nowMin, snapNow, workStart });

        let cursor = isToday ? Math.max(workStart, snapNow) : workStart;
        console.log("Cursor starting at:", cursor);

        // Helper to add block
        const addBlock = (start: number, duration: number, type: BlockType, task?: Task, part?: number) => {
            const end = start + duration;

            const block: TimeBlock = {
                start: minToHm(start),
                end: minToHm(end),
                type,
                status: 'planned',
                ...(task?.id ? { taskId: task.id } : {}),
                ...(task?.title ? { taskTitle: task.title } : {}),
                ...((task as any)?.projectId ? { projectId: (task as any).projectId } : {}),
                ...(typeof part === 'number' ? { partIndex: part } : {})
            };

            newBlocks.push(block);
            return end;
        };

        // 3. Scheduling Loop
        let taskIndex = 0;

        while (cursor < workEnd) {
            // Check Lunch
            // If we are at or past lunch start (and haven't passed lunch end), add lunch.
            if (cursor >= lunchStart && cursor < lunchEnd) {
                cursor = addBlock(cursor, schedPrefs.lunchMinutes, 'lunch');
                continue;
            }

            // If the standard focus block would overshoot lunch start:
            if (cursor < lunchStart && (cursor + schedPrefs.focusBlockMinutes > lunchStart)) {

                const timeUntilLunch = lunchStart - cursor;

                // If we have a decent chunk of time (e.g. >= 30 mins), schedule a short focus task
                if (timeUntilLunch >= 30) {
                    // Get a task if available
                    if (taskIndex < candidates.length) {
                        const task = candidates[taskIndex];
                        addBlock(cursor, timeUntilLunch, 'focus', task);
                        taskIndex++;
                    } else {
                        addBlock(cursor, timeUntilLunch, 'focus'); // Emply focus
                    }
                    cursor += timeUntilLunch; // Now at LunchStart
                    // Continue loop -> next iteration will trigger the "cursor >= lunchStart" check above
                    continue;
                } else {
                    // Too short for focus, just break/prep for lunch
                    // (or if exactly 0 gap, this adds 0 length block? No, gap > 0 check implied by overshoot check + previous lunch check fail)
                    if (timeUntilLunch > 0) {
                        addBlock(cursor, timeUntilLunch, 'break');
                        cursor += timeUntilLunch;
                    }
                    continue;
                }
            }

            // Add Focus Block
            // Get next task
            if (taskIndex < candidates.length) {
                const task = candidates[taskIndex];
                const est = task.estimatedMinutes || 25;

                // If task is huge, we split it. If small, we fit it.
                // Current logic: One task per block.
                // Improvement: If task < block, maybe stack? user asked for simple logic first.

                // Let's assume 1 task = 1 focus block for now, unless task > block.
                let remainingEst = est;
                let parts = 1;

                if (est > schedPrefs.focusBlockMinutes) {
                    // Multi-block task
                    // We will schedule one part now.
                    // IMPORTANT: We do NOT increment taskIndex yet if parts remain, 
                    // BUT for simplicity of this v1, let's just schedule "Part 1" and move on?
                    // Or better: consume slots.

                    // Implementation: consume ONE block for this task. 
                    // Label it Part X.
                    // The loop continues. If we want to schedule the REST of the task, we need to keep it as candidate.
                    // Let's just strictly simply: 1 slot = 1 task from list. 
                    // If task > slot, we label it (big task).
                    addBlock(cursor, schedPrefs.focusBlockMinutes, 'focus', task);
                    // Add Break
                    cursor += schedPrefs.focusBlockMinutes;
                    if (cursor < workEnd && cursor !== lunchStart) {
                        cursor = addBlock(cursor, schedPrefs.breakMinutes, 'break');
                    }
                    taskIndex++;
                } else {
                    // Task fits
                    // FIX: Actually schedule the task!
                    const duration = Math.max(15, est); // Minimum 15 mins
                    addBlock(cursor, duration, 'focus', task);
                    cursor += duration;

                    if (cursor < workEnd && cursor !== lunchStart) {
                        cursor = addBlock(cursor, schedPrefs.breakMinutes, 'break');
                    }
                    taskIndex++;
                }

            } else {
                // No more tasks, but day isn't over.
                // Add empty focus block "Deep Work / Free Focus"
                addBlock(cursor, schedPrefs.focusBlockMinutes, 'focus');

                cursor += schedPrefs.focusBlockMinutes;
                if (cursor < workEnd && cursor !== lunchStart) {
                    cursor = addBlock(cursor, schedPrefs.breakMinutes, 'break');
                }
            }
        }

        const plan: DailyPlan = { dayKey: todayKey, blocks: newBlocks };
        await saveDailyPlan(plan);
        speak(`I've blocked out your day with ${newBlocks.filter(b => b.type === 'focus').length} focus sessions.`);
        speak(`I've blocked out your day with ${newBlocks.filter(b => b.type === 'focus').length} focus sessions.`);
    };

    const handleSwapBlock = async (index: number) => {
        if (!dailyPlan || !user) return;

        // 1. Get current candidates again
        const { allSorted: candidates } = recommendNextTasks(tasks, projects, null, recContext);

        // 2. Find a task NOT in the current plan
        const currentTaskIds = new Set(dailyPlan.blocks.map(b => b.taskId).filter(Boolean));
        const candidate = candidates.find(t => !currentTaskIds.has(t.id));

        if (!candidate) {
            alert("No other candidate tasks available to swap in!");
            return;
        }

        // 3. Update the block
        const newBlocks = [...dailyPlan.blocks];
        // Ensure we preserve timing, just swap task info
        newBlocks[index] = {
            ...newBlocks[index],
            taskId: candidate.id,
            taskTitle: candidate.title,
            status: 'planned',
            type: 'focus', // Force type to focus
            partIndex: undefined // Reset part index if it was a split task (simplification)
        };

        const newPlan = { ...dailyPlan, blocks: newBlocks };
        setDailyPlan(newPlan); // Optimistic
        await saveDailyPlan(newPlan); // Persist
    };

    const handleClearBlock = async (index: number) => {
        if (!dailyPlan || !user) return;

        const newBlocks = [...dailyPlan.blocks];
        const block = newBlocks[index];

        // Keep the time slot, but remove task info
        // We need to use conditional spread logic in save, but here we can just set undefined
        // actually the 'TimeBlock' type allows optional taskId.
        delete block.taskId;
        delete block.taskTitle;
        delete block.partIndex;
        block.status = 'planned'; // Reset status if it was stuck

        const newPlan = { ...dailyPlan, blocks: newBlocks };
        setDailyPlan(newPlan);
        await saveDailyPlan(newPlan);
    };

    const clearPlan = async () => {
        if (!user) return;
        await setDoc(doc(db, "daily_plans", `${user.uid}_${toYMDLocal(new Date())}`), { blocks: [] }, { merge: true });
        // effectively clearing blocks or deleting doc. empty blocks is fine.
        speak("Time blocks cleared.");
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
                voiceURI: 'auto',
                rate: profile.rate,
                pitch: profile.pitch,
                proactiveEnabled: profile.proactiveEnabled
            };
        }
        return DEFAULT_SETTINGS;
    }, [profile]);

    // Migration: Upgrade legacy default to Spicoli
    useEffect(() => {
        if (profile && profile.voicePreset === 'natural-female') {
            console.log("Migrating persona to Spicoli...");
            updateProfile({ voicePreset: 'spicoli' });
        }
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

        if (preset === 'natural-male' || preset === 'scifi' || preset === 'spicoli') {
            return voices.find(v => isPremium(v) && lowerName(v).includes('male')) ||
                voices.find(v => lowerName(v).includes('male')) ||
                voices.find(v => v.name.includes('David')) || // Windows default male
                voices.find(v => v.name.includes('Google US English')) || // Common chrome male
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
            let processedText = t;

            // HAL Mode Text Transform
            if (voiceSettings.preset === 'hal-mode') {
                // Add pauses for comma/periods to make it slower/measured
                processedText = processedText.replace(/, /g, ', ... ').replace(/\. /g, '. ... ');
            }

            const u = new SpeechSynthesisUtterance(processedText);
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
        else if (p === 'hal-mode') updates = { ...updates, rate: 0.85, pitch: 0.6 }; // Deep and slow
        else if (p === 'spicoli') updates = { ...updates, rate: 0.9, pitch: 0.9 }; // Relaxed
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
                speak(last.spokenText || last.text || '');
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

        if (voiceSettings.preset === 'spicoli') {
            msg = msg.replace("Morning Check-In", "Morning Surf Report 🌊")
                .replace("Top Priorities", "Big Waves to Catch")
                .replace("First Move", "Drop In on This")
                .replace("Click Focus to start", "Paddle into it, dude.");
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

        if (voiceSettings.preset === 'spicoli') {
            msg = msg.replace("Evening Review", "Sunset Session 🌅")
                .replace("Wins Today", "Totally Righteous Wins")
                .replace("Focus Sessions", "Tubular Sessions")
                .replace("Fatigue Score", "Wipeout Level");
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

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopSpeaking();
            if (responseTimeoutRef.current) clearTimeout(responseTimeoutRef.current);
            if (recognitionRef.current) recognitionRef.current.stop();
        };
    }, []);

    const responseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const stopListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setIsListening(false);
    };

    const toggleListening = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Voice input not supported in this browser.");
            return;
        }

        if (isListening) {
            stopListening();
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = (event: any) => {
            console.error("Speech recognition error", event.error);
            setIsListening(false);
        };

        recognition.onresult = (event: any) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript) {
                setInputText(prev => prev + (prev ? " " : "") + finalTranscript);
            }
        };

        recognitionRef.current = recognition;
        recognition.start();
    };

    const handleSendMessage = (text: string) => {
        if (!text.trim()) return;
        const newMsg: Message = { id: Date.now().toString(), role: "user", text: text, timestamp: Date.now() };
        setMessages(prev => [...prev, newMsg]);
        setInputText("");

        if (responseTimeoutRef.current) clearTimeout(responseTimeoutRef.current);

        responseTimeoutRef.current = setTimeout(() => {
            let responseText = "";
            const lower = text.toLowerCase().trim();

            const overrideMatch = lower.match(/(?:want to do|start|focus on) (.+?)(?: next| now|$)/i);

            if (overrideMatch && overrideMatch[1]) {
                const query = overrideMatch[1].trim();
                const found = tasks.find(t => !t.done && !t.deletedAt && t.title.toLowerCase().includes(query));
                if (found) {
                    setForcedNowTaskId(found.id);
                    responseText = voiceSettings.preset === 'spicoli'
                        ? `Right on! I've moved "${found.title}" to your board. Let's ride it.`
                        : `Okay, I've moved "${found.title}" to your active task.`;
                } else {
                    responseText = voiceSettings.preset === 'spicoli'
                        ? `Bummer, dude. I couldn't find a task matching "${query}".`
                        : `I couldn't find a task matching "${query}".`;
                }
            }
            else if (lower.includes("morning check")) { runMorningCheckIn(); return; }
            else if (lower.includes("evening review")) { runEveningReview(); return; }
            else if (lower.includes("what should i do next") || lower.includes("what next")) {
                const { now, rationale } = recommendNextTasks(tasks, projects, forcedNowTaskId, recContext);
                if (now) {
                    responseText = voiceSettings.preset === 'spicoli'
                        ? `${rationale} Dude, you should totally shred on "${now.title}". Click Focus, man.`
                        : `${rationale} I recommend you start with "${now.title}". Click Focus to start.`;
                } else {
                    responseText = voiceSettings.preset === 'spicoli'
                        ? "Whoa, clear waters! No tasks pending. Go grab some tasty waves!"
                        : "You have no tasks pending! Enjoy your free time.";
                }
            }
            else if (lower.includes("good morning")) {
                responseText = voiceSettings.preset === 'spicoli' ? `Aloha, ${userDisplayName || 'dude'}!` : `Good morning ${userDisplayName || 'Dave'}`;
            }
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
            else {
                responseText = voiceSettings.preset === 'spicoli'
                    ? `Whoa, I heard: "${text}". I'm all ears, bud.`
                    : `I heard: "${text}". I'm listening!`;
            }

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
                                        {isOverdue(agendaData.nowTask.dueDate) && <span className="text-rose-400 font-bold">Overdue</span>}
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
                                                    {t.today && <span className="text-emerald-400">Today</span>}
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
                        <button type="button" onClick={toggleListening} className={classNames("p-2 rounded-lg transition-colors border border-transparent", isListening ? "bg-rose-500/20 text-rose-400 animate-pulse border-rose-500/50" : "text-slate-400 hover:text-white hover:bg-slate-700/50")} title={isListening ? "Stop Listening" : "Voice Input"}>
                            {isListening ? "🛑" : "🎤"}
                        </button>
                        <input className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" placeholder="Type a message..." value={inputText} onChange={e => setInputText(e.target.value)} />
                        <button type="submit" className={classNames(btnBase, btnPositive, "px-4")}>Send</button>
                    </form>
                </div>
            </div>

            {/* AVATAR / VOICE PANEL */}
            {/* AVATAR / VOICE PANEL */}
            <div className={classNames("flex flex-col gap-4 p-4 rounded-xl border border-slate-700/50 bg-slate-800/20 overflow-y-auto")}>
                <div className="flex justify-between items-center">
                    <h2 className={classNames("text-xl font-bold", strongText)}>Avatar & Voice</h2>
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
                            {voiceSettings.preset === 'spicoli' ? (
                                <div className={`relative w-full h-full rounded-full overflow-hidden border-2 border-indigo-500/50 ${isSpeaking ? 'animate-[pulse_0.5s_ease-in-out_infinite] scale-105' : ''}`}>
                                    <img src="spicoli.png" alt="Spicoli" className="w-full h-full object-cover" />
                                </div>
                            ) : voiceSettings.preset === 'hal-mode' ? (
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

                    {/* Spicoli Debug / Force Switch */}
                    <div className="text-xs text-slate-500 mb-2 font-mono">
                        Preset: {voiceSettings.preset}<br />
                        Voices: {voices.length}<br />
                        Speaking: {isSpeaking ? 'YES' : 'NO'}
                    </div>
                    {voiceSettings.preset !== 'spicoli' && (
                        <button
                            onClick={() => applyPreset('spicoli')}
                            className="text-xs bg-indigo-600 text-white px-2 py-1 rounded mb-4 hover:bg-indigo-500"
                        >
                            Force Spicoli Mode
                        </button>
                    )}

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

                {/* TIME BLOCKING PANEL */}
                <div className="p-3 bg-slate-900/30 rounded-lg border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Time Blocking</div>
                        <button onClick={() => setShowSchedSettings(!showSchedSettings)} className="text-[10px] text-slate-400 underline opacity-70 hover:opacity-100">
                            {showSchedSettings ? 'Hide Settings' : 'Settings'}
                        </button>
                    </div>

                    {showSchedSettings && (
                        <div className="bg-slate-950/50 p-2 rounded text-[10px] space-y-2 border border-slate-800">
                            <div className="flex justify-between items-center">
                                <span>Work Day</span>
                                <div className="flex gap-1">
                                    <input
                                        type="time"
                                        className="bg-white/10 text-slate-100 border border-slate-700 rounded px-2 py-1 w-20 text-center"
                                        style={{ colorScheme: 'dark' }}
                                        value={schedPrefs.workDayStart}
                                        onChange={(e) => updateSchedPrefs({ workDayStart: e.target.value })}
                                    />
                                    <span className="self-center">-</span>
                                    <input
                                        type="time"
                                        className="bg-white/10 text-slate-100 border border-slate-700 rounded px-2 py-1 w-20 text-center"
                                        style={{ colorScheme: 'dark' }}
                                        value={schedPrefs.workDayEnd}
                                        onChange={(e) => updateSchedPrefs({ workDayEnd: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="flex justify-between items-center">
                                <span>Lunch Start</span>
                                <input
                                    type="time"
                                    className="bg-white/10 text-slate-100 border border-slate-700 rounded px-2 py-1 w-20 text-center"
                                    style={{ colorScheme: 'dark' }}
                                    value={schedPrefs.lunchStart}
                                    onChange={(e) => updateSchedPrefs({ lunchStart: e.target.value })}
                                />
                            </div>
                            <div className="flex justify-between items-center">
                                <span>Lunch (mins)</span>
                                <input
                                    type="number"
                                    className="bg-white/10 text-slate-100 border border-slate-700 rounded px-2 py-1 w-12 text-center"
                                    value={schedPrefs.lunchMinutes}
                                    onChange={(e) => updateSchedPrefs({ lunchMinutes: parseInt(e.target.value) })}
                                />
                            </div>
                            <div className="flex justify-between items-center">
                                <span>Focus (mins)</span>
                                <input
                                    type="number"
                                    className="bg-white/10 text-slate-100 border border-slate-700 rounded px-2 py-1 w-12 text-center"
                                    value={schedPrefs.focusBlockMinutes}
                                    onChange={(e) => updateSchedPrefs({ focusBlockMinutes: parseInt(e.target.value) })}
                                />
                            </div>
                            <div className="flex justify-between items-center">
                                <span>Break (mins)</span>
                                <input
                                    type="number"
                                    className="bg-white/10 text-slate-100 border border-slate-700 rounded px-2 py-1 w-12 text-center"
                                    value={schedPrefs.breakMinutes}
                                    onChange={(e) => updateSchedPrefs({ breakMinutes: parseInt(e.target.value) })}
                                />
                            </div>
                        </div>
                    )}

                    {planError && (
                        <div className="p-2 bg-rose-900/20 border border-rose-900/40 rounded text-[10px] text-rose-400">
                            {planError}
                        </div>
                    )}

                    {!dailyPlan || dailyPlan.blocks.length === 0 ? (
                        <div className="text-center py-4">
                            <p className="text-xs text-slate-400 mb-3">No plan for today.</p>
                            <button onClick={generatePlan} className={classNames(btnBase, btnPositive, "w-full text-xs")}>Generate Today's Plan</button>
                        </div>
                    ) : (
                        <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
                            {dailyPlan.blocks.map((b, i) => (
                                <div key={i} className={`flex items-start gap-2 p-2 rounded border text-xs ${b.type === 'focus' ? (b.status === 'done' ? 'bg-emerald-900/20 border-emerald-900/40 opacity-70' : 'bg-slate-800 border-slate-700') :
                                    b.type === 'lunch' ? 'bg-amber-900/10 border-amber-900/20 text-amber-500' :
                                        'bg-slate-900/50 border-transparent text-slate-500'
                                    }`}>
                                    <div className="flex flex-col w-14 shrink-0 font-mono text-[10px] opacity-70">
                                        <span>{b.start}</span>
                                        <span>{b.end}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="group flex justify-between items-center relative">
                                            <span className="truncate font-medium" title={b.taskTitle}>
                                                {b.type === 'focus' ? (b.taskTitle || (b.taskId ? 'Unknown Task' : 'Deep Work / Free Focus')) : b.type.toUpperCase()}
                                            </span>
                                            {b.type !== 'lunch' && b.status !== 'done' && (
                                                <div className="hidden group-hover:flex gap-1 absolute right-0 bg-slate-800 pl-2">
                                                    {b.taskId && (
                                                        <button title="Focus" onClick={() => onFocusTask(b.taskId!)} className="p-1 hover:text-indigo-400">
                                                            🔍
                                                        </button>
                                                    )}
                                                    {b.taskId && (
                                                        <button title="Done" onClick={() => {
                                                            if (b.taskId) {
                                                                // 1. Try block's projectId
                                                                if (b.projectId && onToggleStepDone) {
                                                                    onToggleStepDone(b.projectId, b.taskId);
                                                                } else {
                                                                    // 2. Fallback: Search projects for this step ID
                                                                    // This handles cases where the plan is old or projectId wasn't saved
                                                                    const validProject = projects.find(p => p.steps.some(s => s.id === b.taskId));

                                                                    if (validProject && onToggleStepDone) {
                                                                        onToggleStepDone(validProject.id, b.taskId!);
                                                                    } else {
                                                                        // 3. Must be a regular task
                                                                        onToggleTaskDone(b.taskId);
                                                                    }
                                                                }
                                                            }
                                                            // Optimistically update block status locally? 
                                                            // We wait for sync or simple local refresh:
                                                            const newBlocks = [...dailyPlan.blocks];
                                                            newBlocks[i].status = 'done';
                                                            saveDailyPlan({ ...dailyPlan, blocks: newBlocks });
                                                        }} className="p-1 hover:text-emerald-400">
                                                            ✅
                                                        </button>
                                                    )}
                                                    <button title="Swap Task" onClick={() => handleSwapBlock(i)} className="p-1 hover:text-amber-400 text-[10px]">
                                                        🔄
                                                    </button>
                                                    <button title="Clear Slot" onClick={() => handleClearBlock(i)} className="p-1 hover:text-rose-400 text-[10px]">
                                                        ❌
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-slate-800">
                                <button onClick={generatePlan} className={classNames(btnBase, btnNeutral, "text-xs")}>Regenerate</button>
                                <button onClick={clearPlan} className={classNames(btnBase, "bg-rose-900/20 text-rose-400 hover:bg-rose-900/30 border-rose-900/30 text-xs")}>Clear Plan</button>
                            </div>
                        </div>
                    )}
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
                            <option value="hal-mode">HAL Mode</option>
                            <option value="custom">Custom</option>
                        </select>
                        {voiceSettings.preset === 'hal-mode' && (
                            <p className="text-[10px] text-slate-500 mt-1 italic">
                                HAL Mode is a style preset using browser voices. Not an exact replica.
                            </p>
                        )}
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
            {/* VERSION */}
            <div className="absolute bottom-1 right-1 text-[10px] text-slate-600 opacity-50 font-mono select-none">v0.3.41</div>
        </div>
    );
}
