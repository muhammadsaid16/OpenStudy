"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { Plus, Trash2, Pencil, Layers, Link2, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Modal, Input, EmptyState, Skeleton } from "@/components/ui";
import { RevealHeading } from "@/components/reveal-heading";
import { ScrambleSubtitle } from "@/components/scramble-subtitle";
import { showUndo } from "@/components/undo-toast";
import { showToast } from "@/components/toast";
import { SubjectTopicMenu } from "@/components/subject-topic-menu";
import { exportBundle, getBundles, createBundle, updateBundle, deleteBundle, importCardsIntoBundle, getSubjects } from "@/app/actions";
import { encodeShare, parseSharedBundle, SHARE_URL_LIMIT } from "@/lib/share";
import { BundleColorPicker } from "@/components/bundle-color-picker";
import { themeAccent } from "@/lib/bundle-colors";
import { useAppStore } from "@/lib/store";
import { spotlightProps } from "@/lib/interactions";
import { useLiveData } from "@/lib/use-live-data";

type Bundle = Awaited<ReturnType<typeof getBundles>>[number];

export default function BundlesPage() {
  const t = useT();
  const router = useRouter();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState(() => themeAccent(typeof window !== "undefined" ? (document.documentElement.getAttribute("data-theme") as string) : "aurora"));
  const theme = useAppStore((s: { theme: string }) => s.theme);
  useEffect(() => { if (createOpen) setNewColor(themeAccent(theme)); }, [createOpen, theme]);
  const [newSubjectId, setNewSubjectId] = useState("");
  const [newTopicId, setNewTopicId] = useState("");
  const [subjects, setSubjects] = useState<{ id: string; name: string; color: string }[]>([]);

  // Edit modal
  const [editBundle, setEditBundle] = useState<Bundle | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("#DFE104");

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Bundle | null>(null);
  const [shareBusy, setShareBusy] = useState<string | null>(null);


  // Realtime: bundles + subjects re-fetch on ANY table change.
  const live = useLiveData(() => Promise.all([getBundles(), getSubjects()]), []);
  useEffect(() => {
    if (!live) return;
    const [b, s] = live;
    setBundles(b);
    setSubjects(s);
    setLoaded(true);
  }, [live]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setCreateOpen(true);
      }
      if (e.key === "Escape") {
        setCreateOpen(false);
        setEditBundle(null);
        setDeleteTarget(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const bundle = await createBundle({ name: newName.trim(), description: newDesc.trim() || undefined, color: newColor, topicId: newTopicId || null });
      setBundles((prev) => [{ ...(bundle as unknown as Bundle), topic: (bundle as unknown as { topic?: unknown }).topic ?? null, _count: { flashcards: 0 } } as unknown as Bundle, ...prev]);
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      setNewColor(themeAccent(useAppStore.getState().theme));
      setNewSubjectId("");
      setNewTopicId("");
    } catch (e) {
      console.error("Failed to create bundle:", e);
      showToast("Failed to create bundle. Check console for details.", "danger");
    }
  };

  const handleEdit = async () => {
    if (!editBundle || !editName.trim()) return;
    setLoading(true);
    try {
      await updateBundle(editBundle.id, { name: editName.trim(), description: editDesc.trim() || undefined, color: editColor });
      setBundles((prev) =>
        prev.map((b) => (b.id === editBundle.id ? { ...b, name: editName.trim(), description: editDesc.trim() || null, color: editColor } : b))
      );
      setEditBundle(null);
    } catch (e) {
      console.error("Failed to edit bundle:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const snapshot = deleteTarget;
    setDeleteTarget(null); // close modal immediately
    // Optimistically remove from UI. The real DB delete fires via the
    // toast's onCommit (module-scoped timer) so UNDO cancels it reliably
    // even if you navigate away — no page-closure cancellation bug.
    setBundles((prev) => prev.filter((b) => b.id !== snapshot.id));
    showUndo({
      message: `Bundle "${snapshot.name}" deleted`,
      duration: 5000,
      undo: async () => {
        // Restore into UI list (re-fetch to get fresh state)
        const fresh = await getBundles();
        setBundles(fresh);
      },
      onCommit: async () => {
        try {
          await deleteBundle(snapshot.id);
        } catch (e) {
          console.error("Failed to delete bundle:", e);
        }
      },
    });
  };

  return (
    <div className="p-8 lg:p-12">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-end justify-between">
          <div>
            <RevealHeading text={t("page.bundles")} className="text-4xl lg:text-6xl" />
            <ScrambleSubtitle
              text={t("page.bundles.subtitle")}
              className="mt-2 text-sm text-muted-fg uppercase tracking-widest"
            />
          </div>
          {!(loaded && bundles.length === 0) && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => document.getElementById("share-import")?.click()}>
                Import share
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={16} />
                New bundle
              </Button>
            </div>
          )}
          <input
            id="share-import"
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const shared = parseSharedBundle(JSON.parse(await f.text()));
                const created = await createBundle({ name: shared.name, description: shared.description ?? undefined });
                await importCardsIntoBundle(created.id, shared.cards.map((c) => ({
                  front: c.front, back: c.back, description: c.description ?? undefined,
                  tags: c.tags ?? undefined, kind: c.kind ?? undefined, choices: c.choices ?? undefined,
                })));
                router.push("/bundles/" + created.id + "/cards");
              } catch {
                showToast("Import failed: not a valid share file.", "danger");
              }
            }}
          />
        </div>
      </div>

      {/* Grid */}
      {!loaded ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl p-6">
              <Skeleton className="h-12 w-12 mb-4" />
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))}
        </div>
      ) : bundles.length === 0 ? (
        <EmptyState
          icon={<Layers size={48} />}
          title={t("bundles.emptyTitle")}
          description={t("bundles.emptyDesc")}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              {t("bundles.createBundle")}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
          {bundles.map((bundle) => (
            <Link
              key={bundle.id}
              href={`/bundles/${bundle.id}/cards`}
              {...spotlightProps()}
              className="spotlight-card group relative flex h-72 w-full max-w-xs flex-col justify-between overflow-hidden rounded-2xl glass p-6 text-start transition-all duration-200 hover:-translate-y-1"
              style={{ backgroundImage: `radial-gradient(140% 120% at 0% 0%, ${(bundle.color || "#DFE104")}14, transparent 55%)` }}
            >

              {/* Header: icon + quick actions */}
              <div className="flex items-start justify-between">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-black transition-transform duration-200 group-hover:scale-110"
                  style={{
                    backgroundColor: `${bundle.color || "#DFE104"}1f`,
                    color: bundle.color || "#DFE104",
                    boxShadow: `inset 0 0 0 1px ${(bundle.color || "#DFE104")}3d`,
                  }}
                >
                  {bundle.name.charAt(0)}
                </div>
                <div className="flex -me-2 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100" onClick={(e) => e.preventDefault()}>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (shareBusy) return;
                      setShareBusy(bundle.id);
                      try {
                        const json = await exportBundle(bundle.id);
                        const data = JSON.parse(json) as { name: string; description?: string | null; cards: { front: string; back: string; description?: string | null; tags?: string[]; kind?: string; choices?: string[] }[] };
                        if (!data.cards.length) {
                          showToast(`"${bundle.name}" has no cards yet — add cards before sharing.`, "warning");
                          return;
                        }
                        const payload = { name: data.name, ...(data.description ? { description: data.description } : {}), cards: data.cards.map((c) => ({ front: c.front, back: c.back, ...(c.description ? { description: c.description } : {}), ...(c.kind && c.kind !== "basic" ? { kind: c.kind as "cloze" | "choice" } : {}), ...(c.choices?.length ? { choices: c.choices } : {}), ...(c.tags?.length ? { tags: c.tags } : {}) })) };
                        const hash = encodeShare(payload as Parameters<typeof encodeShare>[0]);
                        if (hash.length > SHARE_URL_LIMIT) {
                          // Too big for a link — download file instead (same as ShareBundleButton fallback)
                          const blob = new Blob([JSON.stringify({ app: "studymax-share", version: 1, ...payload }, null, 2)], { type: "application/json" });
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(blob);
                          a.download = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".studymax-bundle.json";
                          a.click();
                          URL.revokeObjectURL(a.href);
                          showToast("Deck too big for a link — downloaded file instead. Send the file.", "warning");
                        } else {
                          const url = `${window.location.origin}/share#${hash}`;
                          await navigator.clipboard.writeText(url).catch(() => {
                            const ta = document.createElement("textarea");
                            ta.value = url;
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand("copy");
                            ta.remove();
                          });
                          showToast("Share link copied — works on any device", "success");
                        }
                      } catch {
                        showToast("Could not build share link", "danger");
                      } finally {
                        setShareBusy(null);
                      }
                    }}
                    aria-label="Copy share link"
                    title={t("share.copyLinkDesc")}
                    className="flex items-center gap-1 rounded-full px-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-fg hover:text-accent disabled:opacity-50"
                    disabled={shareBusy === bundle.id}
                  >
                    <Link2 size={13} />
                    {shareBusy === bundle.id ? "…" : "Share"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      router.push(`/bundles/${bundle.id}/cards`);
                    }}
                    aria-label={t("bundles.manageCards")}
                    title={t("bundles.manageCards")}
                    className="flex items-center gap-1 rounded-full px-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-fg hover:text-accent"
                  >
                    <Layers size={13} />
                    Manage
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setEditBundle(bundle);
                      setEditName(bundle.name);
                      setEditDesc(bundle.description || "");
                      setEditColor(bundle.color);
                    }}
                    aria-label={t("bundles.editBundle")}
                    className="rounded-full p-2.5 text-muted-fg transition-colors hover:bg-accent-soft hover:text-accent"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setDeleteTarget(bundle);
                    }}
                    aria-label={t("bundles.deleteBundle")}
                    className="rounded-full p-2.5 text-muted-fg transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="mt-3 min-w-0">
                <h3 className="truncate text-xl font-bold text-fg transition-colors group-hover:text-accent">
                  {bundle.name}
                </h3>
                {/* Topic badge */}
                {(bundle as unknown as { topic?: { name: string; subject?: { name: string } | null } | null }).topic && (
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
                    {(bundle as unknown as { topic: { subject?: { name: string } | null; name: string } }).topic.subject?.name
                      ? `${(bundle as unknown as { topic: { subject: { name: string } | null; name: string } }).topic.subject!.name} › `
                      : ""}
                    {(bundle as unknown as { topic: { name: string } }).topic.name}
                  </p>
                )}
                {bundle.description && (
                  <p className="mt-1.5 line-clamp-2 text-sm text-muted-fg">
                    {bundle.description}
                  </p>
                )}
              </div>

              {/* Footer — always-visible actions */}
              <div className="flex items-center justify-between gap-2" onClick={(e) => e.preventDefault()}>
                <span
                  className="rounded-full px-2.5 py-1 font-mono text-xs"
                  style={{ backgroundColor: `${bundle.color || "#DFE104"}14`, color: bundle.color || "#DFE104" }}
                >
                  {bundle._count.flashcards} card{bundle._count.flashcards !== 1 ? "s" : ""}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      router.push(`/bundles/${bundle.id}/cards`);
                    }}
                    className="py-2 text-xs font-bold uppercase tracking-widest text-accent hover:underline"
                  >
                    Manage cards
                  </button>
                  {bundle._count.flashcards > 0 && (
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-fg group-hover:underline">
                      Study →
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t("modal.newBundle")}>
        <div className="space-y-6">
          <Input label=t("bundles.bundleNameShort") placeholder="e.g. IELTS vocabulary" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input label="Description (optional)" placeholder={t("modal.briefDesc")} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          <BundleColorPicker value={newColor} onChange={setNewColor} />
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">Subject & topic (optional)</label>
            <SubjectTopicMenu
              subjects={subjects}
              subjectId={newSubjectId}
              topicId={newTopicId}
              onSubjectChange={setNewSubjectId}
              onTopicChange={setNewTopicId}
              subjectOptional
            />
          </div>
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleCreate} disabled={loading || !newName.trim()}>
              {loading ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editBundle} onClose={() => setEditBundle(null)} title={t("bundles.editBundle")}>
        {editBundle && (
          <div className="space-y-6">
            <Input label=t("bundles.bundleNameShort") value={editName} onChange={(e) => setEditName(e.target.value)} />
            <Input label="Description (optional)" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            <BundleColorPicker value={editColor} onChange={setEditColor} />
            <div className="flex justify-end gap-4 pt-4">
              <Button variant="ghost" onClick={() => setEditBundle(null)}>{t("common.cancel")}</Button>
              <Button onClick={handleEdit} disabled={loading || !editName.trim()}>{t("common.save")}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t("bundles.deleteBundle")}>
        {deleteTarget && (
          <div className="space-y-6">
            <p className="text-sm text-muted-fg">
              Delete &quot;{deleteTarget.name}&quot; and all its flashcards? This cannot be undone.
            </p>
            <div className="flex justify-end gap-4 pt-2">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</Button>
              <Button variant="danger" onClick={handleDelete} disabled={loading}>{t("common.delete")}</Button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
