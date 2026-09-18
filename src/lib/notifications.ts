"use client";

// ─── Local browser notifications (Study OS §17) ─────────────────
// Local, offline-first notification system. Requests permission on user
// opt-in, sends notifications via window.Notification API with deduplication
// so the user is never spammed with repetitive alerts.

export type NotificationStatus = "default" | "granted" | "denied" | "unsupported";

export function getNotificationPermission(): NotificationStatus {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationStatus> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  try {
    const perm = await Notification.requestPermission();
    return perm;
  } catch {
    return "denied";
  }
}

export interface LocalNotificationPayload {
  title: string;
  body: string;
  tag?: string;
  href?: string;
}

const STORAGE_PREFIX = "openstudy_notif_last_";
const MIN_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours between notifications of same tag

/**
 * Sends a local notification if permissions allow and cooldown has passed.
 * Returns true if notification was shown, false otherwise.
 */
export function sendLocalNotification(payload: LocalNotificationPayload): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;

  const tag = payload.tag ?? "general";
  const now = Date.now();
  const lastKey = STORAGE_PREFIX + tag;
  const lastSent = parseInt(localStorage.getItem(lastKey) ?? "0", 10);

  if (now - lastSent < MIN_COOLDOWN_MS) {
    return false; // Still in cooldown
  }

  try {
    const notif = new Notification(payload.title, {
      body: payload.body,
      icon: "/favicon.ico",
      tag,
    });

    localStorage.setItem(lastKey, String(now));

    if (payload.href) {
      notif.onclick = () => {
        window.focus();
        if (window.location.pathname !== payload.href) {
          window.location.href = payload.href!;
        }
      };
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Evaluates Study OS state and dispatches high-priority reminders.
 */
export function evaluateStudyOSReminders(state: {
  dueCardsCount: number;
  upcomingExams: { title: string; date?: Date | null }[];
  overdueTasksCount: number;
}): { notified: boolean; reason?: string } {
  // 1. Imminent exam alert (highest priority)
  const imminent = state.upcomingExams.find((e) => {
    if (!e.date) return false;
    const diffDays = (new Date(e.date).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    return diffDays >= 0 && diffDays <= 3;
  });

  if (imminent) {
    const shown = sendLocalNotification({
      title: "OpenStudy: Exam Approaching",
      body: `"${imminent.title}" is coming up within 3 days. Take a practice drill now!`,
      tag: "exam_imminent",
      href: "/exam",
    });
    if (shown) return { notified: true, reason: "exam_imminent" };
  }

  // 2. Due cards backlog protection
  if (state.dueCardsCount >= 10) {
    const shown = sendLocalNotification({
      title: "OpenStudy: Reviews Due",
      body: `You have ${state.dueCardsCount} flashcards due for review. Protect your memory retention!`,
      tag: "due_reviews",
      href: "/review",
    });
    if (shown) return { notified: true, reason: "due_reviews" };
  }

  // 3. Overdue tasks reminder
  if (state.overdueTasksCount > 0) {
    const shown = sendLocalNotification({
      title: "OpenStudy: Pending Tasks",
      body: `You have ${state.overdueTasksCount} overdue study tasks to complete.`,
      tag: "overdue_tasks",
      href: "/plan",
    });
    if (shown) return { notified: true, reason: "overdue_tasks" };
  }

  return { notified: false };
}
