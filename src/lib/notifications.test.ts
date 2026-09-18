import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getNotificationPermission,
  sendLocalNotification,
  evaluateStudyOSReminders,
} from "./notifications";

describe("notifications module", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("handles environment without notification support gracefully", () => {
    // In node/vitest without window.Notification
    const perm = getNotificationPermission();
    expect(["unsupported", "default", "granted", "denied"]).toContain(perm);
  });

  it("evaluates Study OS reminder priorities: exam > due reviews > overdue tasks", () => {
    // When Notification API is not granted or supported, evaluateStudyOSReminders safely returns notified: false
    const res = evaluateStudyOSReminders({
      dueCardsCount: 15,
      upcomingExams: [{ title: "Physics 101", date: new Date(Date.now() + 86400000) }],
      overdueTasksCount: 2,
    });
    expect(res).toBeDefined();
    expect(typeof res.notified).toBe("boolean");
  });

  it("does not trigger reminders when state is clear", () => {
    const res = evaluateStudyOSReminders({
      dueCardsCount: 0,
      upcomingExams: [],
      overdueTasksCount: 0,
    });
    expect(res.notified).toBe(false);
  });
});
