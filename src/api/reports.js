import { supabase } from "@/lib/supabase";
import { platform } from "@/platform";

const BUCKET = "bug-reports";
const MAX_FILES = 4;

let cachedVersion;
async function getAppVersion() {
  if (cachedVersion !== undefined) return cachedVersion;
  try {
    cachedVersion = (await platform.getVersion()) || null;
  } catch {
    cachedVersion = null;
  }
  return cachedVersion;
}

async function currentUserId() {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("forbidden");
  return userId;
}

/**
 * Chemin `{user_id}/{report_id}/{message_id}/{fichier}` : l'auteur en premier segment
 * autorise l'envoi avant que le signalement existe en base.
 */
async function uploadAttachments(userId, reportId, messageId, files) {
  const out = [];
  for (const file of (files || []).slice(0, MAX_FILES)) {
    const ext = (file.name?.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${userId}/${reportId}/${messageId}/${crypto.randomUUID()}.${ext || "png"}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || "image/png", upsert: false });
    if (error) throw error;
    out.push({ path, contentType: file.type || "image/png", sizeBytes: file.size });
  }
  return out;
}

/** Fichiers envoyés dont l'écriture en base a échoué. */
async function discardAttachments(attachments) {
  const paths = (attachments || []).map((a) => a.path).filter(Boolean);
  if (!paths.length) return;
  try {
    await supabase.storage.from(BUCKET).remove(paths);
  } catch {
    // L'erreur d'origine prime.
  }
}

export function listMyReports() {
  return supabase.rpc("report_my_list").then(({ data, error }) => {
    if (error) throw error;
    return data;
  });
}

export async function createReport({ category, body, files = [], context = null }) {
  const userId = await currentUserId();

  const reportId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const attachments = await uploadAttachments(userId, reportId, messageId, files);

  const { data, error } = await supabase.rpc("report_create", {
    p_id: reportId,
    p_message_id: messageId,
    p_category: category,
    p_body: body,
    p_attachments: attachments,
    p_app_version: await getAppVersion(),
    p_platform: platform.os || platform.name,
    p_context: context || null,
  });
  if (error) {
    // Un refus (cooldown) laisserait les fichiers orphelins.
    await discardAttachments(attachments);
    throw error;
  }
  return data;
}

export function getReportMessages(reportId) {
  return supabase.rpc("report_messages", { p_report_id: reportId }).then(({ data, error }) => {
    if (error) throw error;
    return data;
  });
}

export async function sendReportMessage(reportId, body, files = []) {
  const messageId = crypto.randomUUID();
  const attachments = files.length
    ? await uploadAttachments(await currentUserId(), reportId, messageId, files)
    : [];
  const { data, error } = await supabase.rpc("report_send_message", {
    p_report_id: reportId,
    p_message_id: messageId,
    p_body: body,
    p_attachments: attachments,
  });
  if (error) {
    await discardAttachments(attachments);
    throw error;
  }
  return data;
}

/** URL signée, temporaire. */
export async function getAttachmentUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data?.signedUrl || null;
}

export function subscribeReport(reportId, onChange) {
  if (!reportId) return () => {};
  const channel = supabase
    .channel(`report-${reportId}-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "bug_report_messages", filter: `report_id=eq.${reportId}` },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "bug_reports", filter: `id=eq.${reportId}` },
      onChange,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeMyReports(onChange) {
  const channel = supabase
    .channel(`my-reports-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "bug_reports" }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
