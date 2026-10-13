import { renderDashboardPage, renderErrorPage, renderLoginPage, renderMissingAdminTokenPage } from "./dashboard";
import { renderDataDeletion, renderPrivacyPolicy, renderTermsOfService } from "./legal";
import { extractDmEvents, matchStoryRule, matchesWholeWord, type DmEvent } from "./dm-events";
import {
  customReplyKey,
  getDmFeatureSettings,
  getIceBreakersPublicationStatus,
  lookupInstagramProfile,
  MAX_CUSTOM_REPLIES,
  MAX_STORY_RULES,
  parseCustomReplyForm,
  parseDmFeaturesForm,
  parseReplyKey,
  parseReplyPayload,
  parseReplyRef,
  parseStoryRuleForm,
  publishIceBreakers,
  replyUsage,
  ruleReplyKey,
  saveDmFeatureSettings,
  validateDmFeatureSettings,
  type DmFeatureSettings,
  type InstagramProfile
} from "./dm-features";
import {
  DEFAULT_REDIRECT_BRIDGE_SETTINGS,
  getRedirectBridgeSettings,
  renderRedirectPage,
  saveRedirectBridgeSettings
} from "./redirect-bridge";
import {
  getInstagramAccessToken,
  getInstagramTokenStatus,
  maintainInstagramAccessToken,
  type InstagramTokenStatus
} from "./instagram-token";
import type {
  ActivityFilters,
  DashboardStats,
  RecentEventRow,
  RecentMessageRow,
  RedirectBridgeSettings,
  ReplyStatsRow,
  Rule
} from "./types";

type SecretEnv = {
  WEBHOOK_VERIFY_TOKEN: string;
  META_APP_SECRET?: string;
  INSTAGRAM_APP_SECRET?: string;
  INSTAGRAM_ACCESS_TOKEN: string;
  IG_USER_ID: string;
  ADMIN_TOKEN?: string;
  OWNER_IG_USERNAME?: string;
  APP_URL?: string;
};

type AppEnv = Cloudflare.Env & SecretEnv;

type InstagramWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{
      field?: string;
      value?: Record<string, unknown>;
    }>;
  }>;
};

type CommentEvent = {
  commentId: string;
  mediaId: string | null;
  authorId: string | null;
  username: string | null;
  text: string;
};

type RuleRow = {
  id: number;
  label: string;
  keywords: string;
  reply_text: string;
  public_reply_text: string | null;
  link_url: string | null;
  link_button_label: string | null;
  active: number;
  post_id: string | null;
  post_url: string | null;
  match_type: string | null;
  image_asset_id: string | null;
  use_bridge: number | null;
  created_at: string;
  updated_at: string;
};

type MatchedRule = Rule & {
  matchedKeyword: string;
};

type RetryEventRow = {
  comment_id: string;
  matched_rule_id: number | null;
  matched_keyword: string | null;
  rule_label: string | null;
  status: string;
  sent_at: string | null;
  meta_response: string | null;
};

type SendRuleResult = {
  status: string;
  metaResponse: unknown;
  error: string | null;
  sentAt: string;
};

// What a conversation starter, story rule, DM keyword or DM link sends.
type ResolvedReply = {
  key: string;
  label: string;
  paused: boolean;
  message: Record<string, unknown>;
};

const ADMIN_COOKIE_NAME = "ig_dm_admin";
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_GRAPH_API_BASE = "https://graph.instagram.com/v25.0";
const FALLBACK_RULE_ID = 0;
// Instagram limits: text DMs 1,000 characters, button-template text 640, comments 2,200.
const MAX_TEXT_MESSAGE_LENGTH = 1000;
const MAX_BUTTON_TEXT_LENGTH = 640;
const MAX_PUBLIC_REPLY_LENGTH = 2200;
const MAX_PUBLIC_REPLY_TOTAL = 10000;
// Instagram allows replies to a DM for 24 hours after the person's last message.
const MESSAGE_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DM_FEATURE_PATHS = new Set([
  "/admin/dm-features",
  "/admin/dm-features/publish",
  "/admin/story-rules",
  "/admin/custom-replies"
]);

export default {
  // Daily cron (wrangler.jsonc): check the Instagram connection and renew the
  // token before it expires. Skipped in test mode.
  async scheduled(_controller: ScheduledController, env: AppEnv): Promise<void> {
    if (isDryRun(env)) {
      return;
    }
    const status = await maintainInstagramAccessToken(env);
    console.log(JSON.stringify({ level: "info", msg: "instagram_connection_check", ...status }));
    if (status.state === "error" || status.needsReconnect) {
      throw new Error(status.error ?? "Instagram connection needs attention.");
    }
  },

  async fetch(request: Request, env: AppEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Dashboard forms post to their own origin. Reject cross-site form submissions.
    if (request.method === "POST" && url.pathname.startsWith("/admin/")) {
      const origin = request.headers.get("origin");
      if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
        return html(renderErrorPage("Admin changes must come from this dashboard."), 403);
      }
    }

    if (request.method === "GET" && url.pathname === "/") {
      return json({ ok: true, service: "manychat-lite-cloudflare", admin: "/admin" });
    }

    if (request.method === "GET" && (url.pathname === "/privacy" || url.pathname === "/privacy-policy")) {
      return html(renderPrivacyPolicy(env.OWNER_IG_USERNAME));
    }

    if (request.method === "GET" && (url.pathname === "/terms" || url.pathname === "/terms-of-service")) {
      return html(renderTermsOfService(env.OWNER_IG_USERNAME));
    }

    if (request.method === "GET" && (url.pathname === "/data-deletion" || url.pathname === "/user-data-deletion")) {
      return html(renderDataDeletion(env.OWNER_IG_USERNAME));
    }

    if (request.method === "GET" && url.pathname === "/admin") {
      return handleAdminGet(request, env, url);
    }

    if (request.method === "GET" && url.pathname === "/admin/connection") {
      if (!(await isAdminRequest(request, env))) {
        return json({ ok: false, error: "Login required." }, 401);
      }
      return json(await getConnectionStatus(env));
    }

    if (request.method === "POST" && url.pathname === "/admin/connection/check") {
      if (!(await isAdminRequest(request, env))) {
        return redirect("/admin");
      }
      // Checks call Meta, so they stay off in test mode like every other request.
      if (!isDryRun(env) && hasInstagramCredentials(env)) {
        await maintainInstagramAccessToken(env);
      }
      return redirect("/admin#connection");
    }

    if (request.method === "GET" && url.pathname === "/admin/dm-features") {
      if (!(await isAdminRequest(request, env))) {
        return json({ ok: false, error: "Login required." }, 401);
      }
      const settings = await getDmFeatureSettings(env.DB);
      return json({ settings, publication: await getIceBreakersPublicationStatus(env.DB, settings) });
    }

    if (request.method === "GET" && url.pathname === "/admin/media") {
      if (!(await isAdminRequest(request, env))) {
        return json({ ok: false, error: "Login required." }, 401);
      }
      return json(await getRecentMedia(env));
    }

    if (request.method === "POST" && DM_FEATURE_PATHS.has(url.pathname)) {
      return handleDmFeatureSettings(request, env, url.pathname);
    }

    if (request.method === "POST" && url.pathname === "/admin/login") {
      return handleAdminLogin(request, env);
    }

    if (request.method === "POST" && url.pathname === "/admin/logout") {
      return handleAdminLogout();
    }

    if (request.method === "POST" && url.pathname === "/admin/rules") {
      return handleCreateRule(request, env);
    }

    const ruleMatch = url.pathname.match(/^\/admin\/rules\/(\d+)$/);
    if (request.method === "POST" && ruleMatch) {
      return handleUpdateRule(request, env, Number(ruleMatch[1]));
    }

    const retryMatch = url.pathname.match(/^\/admin\/events\/([^/]+)\/retry$/);
    if (request.method === "POST" && retryMatch) {
      let commentId: string;
      try {
        commentId = decodeURIComponent(retryMatch[1]);
      } catch {
        return html(renderErrorPage("That comment ID is not valid."), 400);
      }
      return handleRetryEvent(request, env, commentId);
    }

    const bridgeMatch = url.pathname.match(/^\/r\/([^/]+)$/);
    if (request.method === "GET" && bridgeMatch) {
      return handleBridgeRedirect(request, env, bridgeMatch[1]);
    }

    const assetMatch = url.pathname.match(/^\/assets\/([^/.]+)(?:\.webp)?$/);
    if (request.method === "GET" && assetMatch) {
      return handleAssetServe(env, assetMatch[1]);
    }

    if (request.method === "GET" && url.pathname === "/admin/bridge-settings") {
      if (!(await isAdminRequest(request, env))) {
        return json({ ok: false, error: "Login required." }, 401);
      }
      return json({ ok: true, settings: await getRedirectBridgeSettings(env.DB) });
    }

    if (request.method === "POST" && url.pathname === "/admin/bridge-settings") {
      return handleBridgeSettingsPost(request, env);
    }

    if (request.method === "POST" && url.pathname === "/admin/assets") {
      return handleAssetUpload(request, env);
    }

    if (request.method === "GET" && url.pathname === "/webhook") {
      return verifyWebhook(url, env);
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
      return handleWebhookPost(request, env, ctx);
    }

    return json({ ok: false, error: "Not found" }, 404);
  }
};

async function handleWebhookPost(
  request: Request,
  env: AppEnv,
  ctx: ExecutionContext
): Promise<Response> {
  const rawBody = await request.arrayBuffer();
  const signature = request.headers.get("x-hub-signature-256");
  const appSecret = env.INSTAGRAM_APP_SECRET ?? env.META_APP_SECRET ?? "";

  if (!(await isValidMetaSignature(rawBody, signature, appSecret))) {
    console.warn(JSON.stringify({
      level: "warn",
      msg: "invalid_webhook_signature",
      hasSignature: Boolean(signature),
      hasAppSecret: Boolean(appSecret)
    }));
    return json({ ok: false, error: "Invalid webhook signature" }, 401);
  }

  const payload = parseJsonBody(rawBody);
  const commentEvents = extractCommentEvents(payload);
  const messageEvents = await extractDmEvents(payload);
  const origin = getAppOrigin(env, request);

  for (const event of commentEvents) {
    ctx.waitUntil(processCommentEvent(event, env, origin));
  }

  for (const event of messageEvents) {
    ctx.waitUntil(processMessageEvent(event, env, origin));
  }

  return json({
    ok: true,
    queued: commentEvents.length + messageEvents.length,
    comments: commentEvents.length,
    messages: messageEvents.length
  });
}

function verifyWebhook(url: URL, env: AppEnv): Response {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.WEBHOOK_VERIFY_TOKEN && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }

  return json({ ok: false, error: "Webhook verification failed" }, 403);
}

async function processCommentEvent(event: CommentEvent, env: AppEnv, origin = ""): Promise<void> {
  const receivedAt = new Date().toISOString();
  const inserted = await insertCommentEvent(env.DB, event, receivedAt);

  if (!inserted) {
    console.log(JSON.stringify({ level: "info", msg: "duplicate_comment", commentId: event.commentId }));
    return;
  }

  if (isOwnerComment(event, env)) {
    await updateStatus(env.DB, event.commentId, "ignored_owner", false, null);
    return;
  }

  const rule = await findMatchingRule(env.DB, event, env);
  if (!rule) {
    await updateStatus(env.DB, event.commentId, "ignored_no_keyword", false, null);
    return;
  }

  if (isDryRun(env)) {
    await updateStatus(env.DB, event.commentId, "dry_run_matched", true, rule);
    console.log(JSON.stringify({ level: "info", msg: "dry_run_private_reply", event, rule: summarizeRule(rule) }));
    return;
  }

  try {
    const result = await sendRuleResponses(env, event.commentId, rule, origin);
    await updateEventAfterSend(env.DB, event.commentId, rule, result);
  } catch (error) {
    await recordCommentSendError(env.DB, event.commentId, rule, error);
  }
}

function isDryRun(env: AppEnv): boolean {
  return String(env.DRY_RUN ?? "true").toLowerCase() !== "false";
}

function hasInstagramCredentials(env: AppEnv): boolean {
  return Boolean(env.INSTAGRAM_ACCESS_TOKEN?.trim() && env.IG_USER_ID?.trim());
}

// Safe connection details for the dashboard. Never includes token values.
async function getConnectionStatus(env: AppEnv): Promise<InstagramTokenStatus> {
  if (!hasInstagramCredentials(env)) {
    return {
      state: "reconnect",
      username: null,
      lastCheckedAt: null,
      lastRefreshedAt: null,
      nextRefreshAt: null,
      expiresAt: null,
      needsReconnect: true,
      error: "Set the INSTAGRAM_ACCESS_TOKEN and IG_USER_ID secrets to connect Instagram."
    };
  }
  return getInstagramTokenStatus(env);
}

async function recordCommentSendError(
  db: D1Database,
  commentId: string,
  rule: MatchedRule,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.prepare(
    `UPDATE comment_events
     SET matched = 1,
         status = 'send_error',
         error = ?,
         matched_rule_id = ?,
         matched_keyword = ?,
         rule_label = ?
     WHERE comment_id = ?`
  )
    .bind(message, rule.id, rule.matchedKeyword, rule.label, commentId)
    .run();
  console.error(JSON.stringify({ level: "error", msg: "private_reply_failed", commentId, error: message }));
}

async function sendRuleResponses(
  env: AppEnv,
  commentId: string,
  rule: MatchedRule,
  origin = ""
): Promise<SendRuleResult> {
  const effectiveOrigin = origin || getAppOrigin(env);
  const bridgeUrl = (rule.linkUrl && rule.useBridge && effectiveOrigin) ? `${effectiveOrigin}/r/${rule.id}` : rule.linkUrl;
  const imageUrl = (rule.imageAssetId && effectiveOrigin) ? `${effectiveOrigin}/assets/${rule.imageAssetId}.webp` : null;

  const privateReply = await sendPrivateReply(
    env,
    commentId,
    rule.replyText,
    bridgeUrl,
    rule.linkButtonLabel,
    imageUrl
  );
  return completeCommentResponses(env, commentId, privateReply, rule.publicReplyText);
}

// Sends the optional public reply after a successful private reply. A retry of a
// failed public reply calls this again with the stored private reply, so the DM
// is never sent twice.
async function completeCommentResponses(
  env: AppEnv,
  commentId: string,
  privateReply: unknown,
  publicReplyText: string | null,
  sentAt = new Date().toISOString()
): Promise<SendRuleResult> {
  let publicReply: unknown = null;
  let publicReplyError: string | null = null;

  const selectedText = publicReplyText ? selectRotatingText(publicReplyText, commentId) : null;
  if (selectedText) {
    try {
      publicReply = await sendPublicCommentReply(env, commentId, selectedText);
    } catch (error) {
      publicReplyError = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({
        level: "error",
        msg: "public_comment_reply_failed",
        commentId,
        error: publicReplyError
      }));
    }
  }

  return {
    status: publicReplyError ? "sent_public_reply_error" : "sent",
    metaResponse: { privateReply, publicReply, publicReplyError },
    error: publicReplyError,
    sentAt
  };
}

// Public reply text may hold several lines. One line is picked per comment, so
// replies vary across comments, while a retry of the same comment keeps its line.
function selectRotatingText(value: string, seed: string): string | null {
  const options = value
    .split(/\r?\n/)
    .map((option) => option.trim())
    .filter((option) => option.length > 0);

  if (options.length === 0) {
    return null;
  }

  return options[hashString(seed) % options.length];
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

// Incoming DMs, conversation starter taps, story replies and ig.me link opens.
async function processMessageEvent(event: DmEvent, env: AppEnv, origin = ""): Promise<void> {
  if (!(await insertMessageEvent(env.DB, event, new Date().toISOString()))) {
    console.log(JSON.stringify({ level: "info", msg: "duplicate_message", messageId: event.messageId }));
    return;
  }
  if (event.senderId === env.IG_USER_ID) {
    await updateMessageStatus(env.DB, event.messageId, "ignored_self");
    return;
  }
  if (event.recipientId !== env.IG_USER_ID) {
    await updateMessageStatus(env.DB, event.messageId, "ignored_recipient");
    return;
  }
  const now = Date.now();
  if (event.timestamp === null || event.timestamp > now + MAX_CLOCK_SKEW_MS) {
    await updateMessageStatus(env.DB, event.messageId, "ignored_invalid");
    return;
  }
  if (event.timestamp <= now - MESSAGE_REPLY_WINDOW_MS) {
    await updateMessageStatus(env.DB, event.messageId, "ignored_expired");
    return;
  }

  const settings = await getDmFeatureSettings(env.DB);
  const dryRun = isDryRun(env);
  let follower: boolean | null = null;
  // A message or starter tap allows a profile lookup. Opening a link alone does not.
  if (!dryRun && settings.followerCheckEnabled && event.kind !== "referral") {
    const profile = await lookupInstagramProfile(env, event.senderId).catch((): InstagramProfile => ({
      username: null,
      isFollower: null,
      checkedAt: new Date().toISOString(),
      error: "Follower status could not be checked."
    }));
    follower = profile.isFollower;
    await env.DB.prepare(
      `UPDATE message_events
       SET sender_username = ?, is_follower = ?, profile_error = ?, profile_checked_at = ?
       WHERE message_id = ?`
    )
      .bind(profile.username, follower === null ? null : Number(follower), profile.error, profile.checkedAt, event.messageId)
      .run();
  }

  // Priority: a starter tap, then a matching story rule (a paused one blocks
  // everything below it), then a keyword typed in the DM, then the ig.me link.
  const starterReply = parseReplyPayload(event.quickReplyPayload);
  const storyRule = starterReply ? null : matchStoryRule(event, settings.storyRules);
  let replyKey: string | null;
  let paused = false;
  let pausedLabel: string | null = null;
  if (starterReply) {
    replyKey = starterReply;
    paused = !settings.startersEnabled;
  } else if (storyRule) {
    replyKey = storyRule.reply;
    paused = !storyRule.enabled;
    pausedLabel = storyRule.label;
  } else {
    const keywordRule = event.kind === "message" && settings.keywordRepliesEnabled
      ? await findDmKeywordRule(env.DB, event.text)
      : null;
    replyKey = keywordRule ? ruleReplyKey(keywordRule.id) : parseReplyRef(event.referralRef)?.reply ?? null;
  }

  if (!replyKey) {
    await updateMessageStatus(env.DB, event.messageId, "ignored_no_match");
    return;
  }

  const reply = await resolveReply(env.DB, replyKey, settings, origin);
  if (paused) {
    await updateMessageStatus(env.DB, event.messageId, "ignored_paused", { replyKey, label: pausedLabel ?? reply?.label ?? replyKey });
    return;
  }
  if (!reply) {
    await updateMessageStatus(env.DB, event.messageId, "ignored_missing_reply", { replyKey, label: replyKey });
    return;
  }
  if (reply.paused) {
    await updateMessageStatus(env.DB, event.messageId, "ignored_paused", { replyKey, label: reply.label });
    return;
  }
  if (dryRun) {
    await updateMessageStatus(env.DB, event.messageId, "dry_run_matched", { replyKey, label: reply.label });
    console.log(JSON.stringify({ level: "info", msg: "dry_run_dm_reply", messageId: event.messageId, source: event.source, reply: replyKey }));
    return;
  }

  const greeting = follower === true ? settings.followerReply : follower === false ? settings.nonFollowerReply : "";
  try {
    const metaResponse = await postInstagramMessage(env, { id: event.senderId }, withFollowerGreeting(reply.message, greeting));
    await updateMessageStatus(env.DB, event.messageId, "sent", { replyKey, label: reply.label, metaResponse });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateMessageStatus(env.DB, event.messageId, "send_error", { replyKey, label: reply.label, error: message });
    console.error(JSON.stringify({ level: "error", msg: "dm_reply_failed", messageId: event.messageId, error: message }));
  }
}

// DM keyword replies use whole words, so "guide?" matches GUIDE but "guidelines" does not.
async function findDmKeywordRule(db: D1Database, text: string): Promise<Rule | null> {
  if (!text.trim()) {
    return null;
  }
  for (const rule of await getRules(db, true)) {
    if (rule.keywords.some((keyword) => matchesWholeWord(text, keyword))) {
      return rule;
    }
  }
  return null;
}

async function resolveReply(db: D1Database, key: string, settings: DmFeatureSettings, origin = ""): Promise<ResolvedReply | null> {
  const target = parseReplyKey(key);
  if (!target) {
    return null;
  }
  if (target.type === "rule") {
    const rule = await getRuleById(db, target.ruleId);
    if (!rule) {
      return null;
    }
    const bridgeUrl = (rule.linkUrl && rule.useBridge && origin) ? `${origin}/r/${rule.id}` : rule.linkUrl;
    const imageUrl = (rule.imageAssetId && origin) ? `${origin}/assets/${rule.imageAssetId}.webp` : null;
    return {
      key,
      label: rule.label,
      paused: !rule.active,
      message: buildPrivateReplyMessage(rule.replyText, bridgeUrl, rule.linkButtonLabel, imageUrl)
    };
  }
  const custom = settings.customReplies.find((item) => item.id === target.textId);
  return custom ? { key, label: custom.label, paused: false, message: { text: custom.text } } : null;
}

// Adds the follower or non-follower opening line when the combined text still
// fits Instagram's limits. Otherwise the reply is sent unchanged.
function withFollowerGreeting(message: Record<string, unknown>, greeting: string): Record<string, unknown> {
  if (!greeting) {
    return message;
  }
  const copy = structuredClone(message);
  if (typeof copy.text === "string") {
    if (greeting.length + copy.text.length + 2 <= MAX_TEXT_MESSAGE_LENGTH) {
      copy.text = `${greeting}\n\n${copy.text}`;
    }
    return copy;
  }
  const attachment = getRecord(copy, "attachment");
  const payload = attachment ? getRecord(attachment, "payload") : null;
  if (payload?.template_type === "button" && typeof payload.text === "string" &&
      greeting.length + payload.text.length + 2 <= MAX_BUTTON_TEXT_LENGTH) {
    payload.text = `${greeting}\n\n${payload.text}`;
  }
  return copy;
}

async function insertMessageEvent(db: D1Database, event: DmEvent, receivedAt: string): Promise<boolean> {
  const result = await db.prepare(
    `INSERT OR IGNORE INTO message_events
      (message_id, sender_id, recipient_id, message_text, quick_reply_payload, status, received_at,
       source, story_id, story_url, story_link_url, referral_ref)
     VALUES (?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      event.messageId,
      event.senderId,
      event.recipientId,
      event.text,
      event.quickReplyPayload,
      receivedAt,
      event.source,
      event.storyId,
      event.storyUrl,
      event.storyLinkUrl,
      event.referralRef
    )
    .run();

  return (result.meta.changes ?? 0) > 0;
}

async function updateMessageStatus(
  db: D1Database,
  messageId: string,
  status: string,
  details: { replyKey?: string; label?: string; metaResponse?: unknown; error?: string } = {}
): Promise<void> {
  await db.prepare(
    `UPDATE message_events
     SET status = ?,
         reply_key = ?,
         matched_choice = ?,
         meta_response = ?,
         error = ?,
         sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END
     WHERE message_id = ?`
  )
    .bind(
      status,
      details.replyKey ?? null,
      details.label ?? null,
      details.metaResponse ? JSON.stringify(details.metaResponse) : null,
      details.error ?? null,
      status,
      new Date().toISOString(),
      messageId
    )
    .run();
}

async function updateEventAfterSend(
  db: D1Database,
  commentId: string,
  rule: MatchedRule,
  result: SendRuleResult
): Promise<void> {
  await db.prepare(
    `UPDATE comment_events
     SET matched = 1,
         status = ?,
         meta_response = ?,
         error = ?,
         matched_rule_id = ?,
         matched_keyword = ?,
         rule_label = ?,
         sent_at = ?
     WHERE comment_id = ?`
  )
    .bind(
      result.status,
      JSON.stringify(result.metaResponse),
      result.error,
      rule.id,
      rule.matchedKeyword,
      rule.label,
      result.sentAt,
      commentId
    )
    .run();
}

async function insertCommentEvent(
  db: D1Database,
  event: CommentEvent,
  receivedAt: string
): Promise<boolean> {
  const result = await db.prepare(
    `INSERT OR IGNORE INTO comment_events
      (comment_id, media_id, username, comment_text, status, received_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(event.commentId, event.mediaId, event.username, event.text, "received", receivedAt)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

async function updateStatus(
  db: D1Database,
  commentId: string,
  status: string,
  matched: boolean,
  rule: MatchedRule | null
): Promise<void> {
  await db.prepare(
    `UPDATE comment_events
     SET matched = ?,
         status = ?,
         matched_rule_id = ?,
         matched_keyword = ?,
         rule_label = ?
     WHERE comment_id = ?`
  )
    .bind(
      matched ? 1 : 0,
      status,
      rule?.id ?? null,
      rule?.matchedKeyword ?? null,
      rule?.label ?? null,
      commentId
    )
    .run();
}

async function findMatchingRule(db: D1Database, event: CommentEvent, env: AppEnv): Promise<MatchedRule | null> {
  const activeRules = await getRules(db, true);

  // 1. Post-specific rules (when comment is on a known media)
  if (event.mediaId) {
    const postRules = activeRules.filter((rule) => matchesPostTarget(rule, event.mediaId!));

    // a) Exact match on this post
    for (const rule of postRules.filter((r) => r.matchType === "exact")) {
      const matchedKeyword = matchExactWord(event.text, rule.keywords);
      if (matchedKeyword) {
        return { ...rule, matchedKeyword };
      }
    }

    // b) Contains keywords on this post
    for (const rule of postRules.filter((r) => r.matchType === "contains")) {
      const matchedKeyword = findMatchedKeyword(event.text, rule.keywords);
      if (matchedKeyword) {
        return { ...rule, matchedKeyword };
      }
    }

    // c) Any comment on this post
    const anyRule = postRules.find((r) => r.matchType === "any");
    if (anyRule) {
      return { ...anyRule, matchedKeyword: anyRule.keywords[0] || "ANY_COMMENT" };
    }
  }

  // 2. Global rules (applying to all posts)
  const globalRules = activeRules.filter((rule) => !rule.postId && !rule.postUrl);

  // a) Exact match
  for (const rule of globalRules.filter((r) => r.matchType === "exact")) {
    const matchedKeyword = matchExactWord(event.text, rule.keywords);
    if (matchedKeyword) {
      return { ...rule, matchedKeyword };
    }
  }

  // b) Contains keywords
  for (const rule of globalRules.filter((r) => r.matchType === "contains")) {
    const matchedKeyword = findMatchedKeyword(event.text, rule.keywords);
    if (matchedKeyword) {
      return { ...rule, matchedKeyword };
    }
  }

  // c) Any comment global
  const globalAnyRule = globalRules.find((r) => r.matchType === "any");
  if (globalAnyRule) {
    return { ...globalAnyRule, matchedKeyword: globalAnyRule.keywords[0] || "ANY_COMMENT" };
  }

  // 3. Fallback rule from wrangler.jsonc (env.KEYWORD)
  const fallback = getFallbackRule(env);
  if (!fallback || !matchesKeyword(event.text, fallback.keywords[0])) {
    return null;
  }

  return { ...fallback, matchedKeyword: fallback.keywords[0] };
}

function extractInstagramShortcode(urlOrId: string): string | null {
  const text = urlOrId.trim();
  const match = text.match(/(?:instagram\.com|instagr\.am)\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
}

function normalizePostTarget(postIdInput: string, postUrlInput: string): { postId: string | null; postUrl: string | null } {
  let postId = postIdInput.trim() || null;
  let postUrl = postUrlInput.trim() || null;

  if (postId && (postId.startsWith("http://") || postId.startsWith("https://") || postId.includes("instagram.com"))) {
    if (!postUrl) {
      postUrl = postId;
    }
    const shortcode = extractInstagramShortcode(postId);
    if (shortcode) {
      postId = shortcode;
    }
  }

  return { postId, postUrl };
}

function matchesPostTarget(rule: Rule, mediaId: string): boolean {
  if (!rule.postId && !rule.postUrl) {
    return false;
  }
  if (rule.postId) {
    const ids = rule.postId.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (ids.includes(mediaId)) {
      return true;
    }
  }
  if (rule.postUrl) {
    const shortcode = extractInstagramShortcode(rule.postUrl);
    if (shortcode && shortcode === mediaId) {
      return true;
    }
    if (rule.postUrl.includes(mediaId)) {
      return true;
    }
  }
  return false;
}

function matchExactWord(text: string, keywords: string[]): string | null {
  const normalizedText = normalizeForExactMatch(text);
  if (!normalizedText) {
    return null;
  }
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeForExactMatch(keyword);
    if (normalizedKeyword && normalizedText === normalizedKeyword) {
      return keyword;
    }
  }
  return null;
}

function normalizeForExactMatch(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "");
  return cleaned.toLowerCase();
}

function normalizeMatchType(value: string | null | undefined): "contains" | "exact" | "any" {
  if (value === "exact" || value === "any") {
    return value;
  }
  return "contains";
}

// The KEYWORD and PRIVATE_REPLY_TEXT vars in wrangler.jsonc act as one extra rule
// (id 0) that applies when no dashboard rule matches.
function getFallbackRule(env: AppEnv): Rule | null {
  const fallbackKeyword = env.KEYWORD?.trim();
  if (!fallbackKeyword) {
    return null;
  }

  return {
    id: FALLBACK_RULE_ID,
    label: "Fallback rule",
    keywords: [fallbackKeyword],
    replyText: env.PRIVATE_REPLY_TEXT ?? "Thanks for commenting.",
    publicReplyText: null,
    linkUrl: null,
    linkButtonLabel: null,
    active: true,
    postId: null,
    postUrl: null,
    matchType: "contains",
    imageAssetId: null,
    useBridge: true,
    createdAt: "",
    updatedAt: ""
  };
}

async function sendPrivateReply(
  env: AppEnv,
  commentId: string,
  message: string,
  linkUrl: string | null,
  linkButtonLabel: string | null,
  imageUrl?: string | null
): Promise<unknown> {
  return postInstagramMessage(
    env,
    { comment_id: commentId },
    buildPrivateReplyMessage(message, linkUrl, linkButtonLabel, imageUrl)
  );
}

// Sends a private reply (recipient.comment_id) or a DM to someone who messaged
// the account (recipient.id).
async function postInstagramMessage(
  env: AppEnv,
  recipient: { comment_id: string } | { id: string },
  message: Record<string, unknown>
): Promise<unknown> {
  if (!env.IG_USER_ID) {
    throw new Error("Missing IG_USER_ID");
  }

  const base = (env.GRAPH_API_BASE ?? DEFAULT_GRAPH_API_BASE).replace(/\/$/, "");
  const response = await fetch(`${base}/${env.IG_USER_ID}/messages`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${await getInstagramAccessToken(env)}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ recipient, message })
  });

  const responseText = await response.text();
  const parsed = parseJsonText(responseText);

  if (!response.ok) {
    throw new Error(`Meta API ${response.status}: ${responseText}`);
  }

  return parsed ?? responseText;
}

async function sendPublicCommentReply(
  env: AppEnv,
  commentId: string,
  message: string
): Promise<unknown> {
  const base = (env.GRAPH_API_BASE ?? DEFAULT_GRAPH_API_BASE).replace(/\/$/, "");
  const endpoint = new URL(`${base}/${commentId}/replies`);
  endpoint.searchParams.set("message", message);

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      "authorization": `Bearer ${await getInstagramAccessToken(env)}`
    }
  });
  const responseText = await response.text();
  const parsed = parseJsonText(responseText);

  if (!response.ok) {
    throw new Error(`Meta API ${response.status}: ${responseText}`);
  }

  return parsed ?? responseText;
}

function buildPrivateReplyMessage(
  text: string,
  linkUrl: string | null,
  linkButtonLabel: string | null,
  imageUrl?: string | null
): Record<string, unknown> {
  if (imageUrl) {
    const buttons = (linkUrl && linkButtonLabel) ? [
      {
        type: "web_url",
        url: linkUrl,
        title: linkButtonLabel
      }
    ] : undefined;

    const trimmedText = text.trim();
    const title = trimmedText.length > 80 ? trimmedText.slice(0, 77) + "..." : (trimmedText || "Notice");
    const subtitle = trimmedText.length > 80 ? trimmedText.slice(77, 157) : undefined;

    return {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [
            {
              title,
              ...(subtitle ? { subtitle } : {}),
              image_url: imageUrl,
              ...(buttons && buttons.length > 0 ? { buttons } : {})
            }
          ]
        }
      }
    };
  }

  if (!linkUrl || !linkButtonLabel) {
    return { text };
  }

  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text,
        buttons: [
          {
            type: "web_url",
            url: linkUrl,
            title: linkButtonLabel
          }
        ]
      }
    }
  };
}

async function handleAdminGet(request: Request, env: AppEnv, url: URL): Promise<Response> {
  if (!env.ADMIN_TOKEN) {
    return html(renderMissingAdminTokenPage(), 503);
  }

  if (!(await isAdminRequest(request, env))) {
    return html(renderLoginPage(url.searchParams.get("error") === "1"));
  }

  const filters = parseActivityFilters(url);
  const [rules, recentEvents, messageEvents, stats, connection, dmFeatures, bridgeSettings] = await Promise.all([
    getRules(env.DB, false),
    getRecentEvents(env.DB, filters),
    getRecentMessageEvents(env.DB),
    getDashboardStats(env.DB),
    getConnectionStatus(env),
    getDmFeatureSettings(env.DB),
    getRedirectBridgeSettings(env.DB)
  ]);
  const [replyStats, publication] = await Promise.all([
    getReplyStats(env.DB, rules, dmFeatures),
    getIceBreakersPublicationStatus(env.DB, dmFeatures)
  ]);

  return html(renderDashboardPage({
    dryRun: isDryRun(env),
    localPreview: ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    rules,
    recentEvents,
    messageEvents,
    replyStats,
    stats,
    connection,
    dmFeatures,
    publication,
    bridgeSettings,
    // Shown in the sidebar and used for DM links: the verified account name, or OWNER_IG_USERNAME.
    accountUsername: connection.username ?? (env.OWNER_IG_USERNAME?.trim().replace(/^@/, "") || null),
    filters,
    flash: url.searchParams.get("saved") === "1" ? "Saved." : null
  }));
}

async function handleDmFeatureSettings(request: Request, env: AppEnv, path: string): Promise<Response> {
  if (!(await isAdminRequest(request, env))) {
    return redirect("/admin");
  }

  const settings = await getDmFeatureSettings(env.DB);
  const ruleIds = new Set((await getRules(env.DB, false)).map((rule) => rule.id));

  if (path === "/admin/dm-features/publish") {
    if (isDryRun(env)) {
      return html(renderErrorPage("Publishing is off in test mode. Set DRY_RUN to \"false\" before publishing conversation starters."), 409);
    }
    const error = validateDmFeatureSettings(settings, ruleIds);
    if (error) {
      return html(renderErrorPage(error), 400);
    }
    await publishIceBreakers(env, settings);
    return redirect("/admin#dm-tools");
  }

  const form = await request.formData();
  let next: DmFeatureSettings;
  if (path === "/admin/dm-features") {
    const parsed = parseDmFeaturesForm(form, settings, ruleIds);
    if (!parsed.ok) {
      return html(renderErrorPage(parsed.error), 400);
    }
    next = parsed.settings;
  } else {
    const result = path === "/admin/story-rules" ? applyStoryRuleForm(form, settings) : applyCustomReplyForm(form, settings);
    if (!result.ok) {
      return html(renderErrorPage(result.error), result.status);
    }
    next = result.settings;
  }

  const error = validateDmFeatureSettings(next, ruleIds);
  if (error) {
    return html(renderErrorPage(error), 400);
  }
  await saveDmFeatureSettings(env.DB, next);
  return redirect("/admin?saved=1#dm-tools");
}

type SettingsChange = { ok: true; settings: DmFeatureSettings } | { ok: false; error: string; status: number };

function applyStoryRuleForm(form: FormData, settings: DmFeatureSettings): SettingsChange {
  const next = structuredClone(settings);
  const action = getFormString(form, "action");
  const id = getFormString(form, "id").trim();
  const index = next.storyRules.findIndex((rule) => rule.id === id);
  if (id && index === -1) {
    return { ok: false, error: "Story rule was not found. Reload the dashboard.", status: 404 };
  }
  if (action === "delete") {
    if (index === -1) {
      return { ok: false, error: "Choose a story rule to delete.", status: 400 };
    }
    next.storyRules.splice(index, 1);
    return { ok: true, settings: next };
  }
  if (action !== "save") {
    return { ok: false, error: "Choose save or delete.", status: 400 };
  }
  const parsed = parseStoryRuleForm(form);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, status: 400 };
  }
  if (index === -1) {
    if (next.storyRules.length >= MAX_STORY_RULES) {
      return { ok: false, error: `You can save up to ${MAX_STORY_RULES} story rules.`, status: 400 };
    }
    next.storyRules.push(parsed.settings);
  } else {
    next.storyRules[index] = parsed.settings;
  }
  return { ok: true, settings: next };
}

function applyCustomReplyForm(form: FormData, settings: DmFeatureSettings): SettingsChange {
  const next = structuredClone(settings);
  const action = getFormString(form, "action");
  const id = getFormString(form, "id").trim();
  const index = next.customReplies.findIndex((reply) => reply.id === id);
  if (id && index === -1) {
    return { ok: false, error: "Custom reply was not found. Reload the dashboard.", status: 404 };
  }
  if (action === "delete") {
    if (index === -1) {
      return { ok: false, error: "Choose a custom reply to delete.", status: 400 };
    }
    const usage = replyUsage(next, customReplyKey(id));
    if (usage.length > 0) {
      return { ok: false, error: `This reply is used by the ${usage.join(" and ")}. Choose another reply there first.`, status: 400 };
    }
    next.customReplies.splice(index, 1);
    return { ok: true, settings: next };
  }
  if (action !== "save") {
    return { ok: false, error: "Choose save or delete.", status: 400 };
  }
  const parsed = parseCustomReplyForm(form);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, status: 400 };
  }
  if (index === -1) {
    if (next.customReplies.length >= MAX_CUSTOM_REPLIES) {
      return { ok: false, error: `You can save up to ${MAX_CUSTOM_REPLIES} custom replies.`, status: 400 };
    }
    next.customReplies.push(parsed.settings);
  } else {
    next.customReplies[index] = parsed.settings;
  }
  return { ok: true, settings: next };
}

async function handleAdminLogin(request: Request, env: AppEnv): Promise<Response> {
  if (!env.ADMIN_TOKEN) {
    return html(renderMissingAdminTokenPage(), 503);
  }

  const form = await request.formData();
  const token = getFormString(form, "token");

  if (!(await safeEqualText(token, env.ADMIN_TOKEN))) {
    return redirect("/admin?error=1");
  }

  const session = await createAdminSession(env);
  return redirect("/admin", {
    "set-cookie": buildCookie(ADMIN_COOKIE_NAME, session, ADMIN_SESSION_TTL_SECONDS)
  });
}

function handleAdminLogout(): Response {
  return redirect("/admin", {
    "set-cookie": `${ADMIN_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`
  });
}

async function handleCreateRule(request: Request, env: AppEnv): Promise<Response> {
  if (!(await isAdminRequest(request, env))) {
    return redirect("/admin");
  }

  const form = await request.formData();
  const parsed = parseRuleForm(form);
  if (!parsed.ok) {
    return html(renderErrorPage(parsed.error), 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO rules
       (label, keywords, reply_text, public_reply_text, link_url, link_button_label, active, post_id, post_url, match_type, image_asset_id, use_bridge, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      parsed.rule.label,
      JSON.stringify(parsed.rule.keywords),
      parsed.rule.replyText,
      parsed.rule.publicReplyText,
      parsed.rule.linkUrl,
      parsed.rule.linkButtonLabel,
      parsed.rule.active ? 1 : 0,
      parsed.rule.postId,
      parsed.rule.postUrl,
      parsed.rule.matchType,
      parsed.rule.imageAssetId,
      parsed.rule.useBridge ? 1 : 0,
      now,
      now
    )
    .run();

  return redirect("/admin?saved=1");
}

async function handleUpdateRule(request: Request, env: AppEnv, ruleId: number): Promise<Response> {
  if (!(await isAdminRequest(request, env))) {
    return redirect("/admin");
  }

  const form = await request.formData();
  const action = getFormString(form, "action");

  if (action === "delete") {
    // Starters and story rules point at rules by ID; keep them working.
    const usage = replyUsage(await getDmFeatureSettings(env.DB), ruleReplyKey(ruleId));
    if (usage.length > 0) {
      return html(renderErrorPage(`This rule is used by the ${usage.join(" and ")}. Choose another reply there before deleting it.`), 400);
    }
    await env.DB.prepare("DELETE FROM rules WHERE id = ?").bind(ruleId).run();
    return redirect("/admin?saved=1");
  }

  if (action === "toggle") {
    await env.DB.prepare(
      "UPDATE rules SET active = CASE active WHEN 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?"
    )
      .bind(new Date().toISOString(), ruleId)
      .run();
    return redirect("/admin?saved=1");
  }

  const parsed = parseRuleForm(form);
  if (!parsed.ok) {
    return html(renderErrorPage(parsed.error), 400);
  }

  await env.DB.prepare(
    `UPDATE rules
     SET label = ?,
         keywords = ?,
         reply_text = ?,
         public_reply_text = ?,
         link_url = ?,
         link_button_label = ?,
         active = ?,
         post_id = ?,
         post_url = ?,
         match_type = ?,
         image_asset_id = ?,
         use_bridge = ?,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(
      parsed.rule.label,
      JSON.stringify(parsed.rule.keywords),
      parsed.rule.replyText,
      parsed.rule.publicReplyText,
      parsed.rule.linkUrl,
      parsed.rule.linkButtonLabel,
      parsed.rule.active ? 1 : 0,
      parsed.rule.postId,
      parsed.rule.postUrl,
      parsed.rule.matchType,
      parsed.rule.imageAssetId,
      parsed.rule.useBridge ? 1 : 0,
      new Date().toISOString(),
      ruleId
    )
    .run();

  return redirect("/admin?saved=1");
}

async function handleRetryEvent(request: Request, env: AppEnv, commentId: string): Promise<Response> {
  if (!(await isAdminRequest(request, env))) {
    return redirect("/admin");
  }

  if (isDryRun(env)) {
    return html(renderErrorPage("Sending is off in test mode. Set DRY_RUN to \"false\" before retrying."), 400);
  }

  const event = await getRetryEvent(env.DB, commentId);
  if (!event || !isRetryableStatus(event.status)) {
    return html(renderErrorPage("Only failed replies can be retried."), 400);
  }

  if (event.matched_rule_id === null) {
    return html(renderErrorPage("That comment does not have a matched rule to retry."), 400);
  }

  const rule = event.matched_rule_id === FALLBACK_RULE_ID
    ? getFallbackRule(env)
    : await getRuleById(env.DB, event.matched_rule_id);
  if (!rule) {
    return html(renderErrorPage("The matched rule no longer exists."), 400);
  }

  if (!rule.active) {
    return html(renderErrorPage("This rule is turned off. Turn it on before retrying."), 400);
  }

  const originalKeyword = event.matched_keyword?.trim().toLowerCase();
  if (rule.matchType !== "any" && originalKeyword && !rule.keywords.some((keyword) => keyword.trim().toLowerCase() === originalKeyword)) {
    return html(renderErrorPage("The keyword this comment matched was removed from the rule, so it cannot be retried with the changed rule."), 400);
  }

  const matchedRule: MatchedRule = {
    ...rule,
    matchedKeyword: event.matched_keyword ?? rule.keywords[0] ?? ""
  };

  // Claim the event before sending so two clicks cannot deliver two DMs.
  const claimed = await env.DB.prepare(
    "UPDATE comment_events SET status = 'retrying' WHERE comment_id = ? AND status = ?"
  )
    .bind(commentId, event.status)
    .run();
  if (!claimed.meta.changes) {
    return html(renderErrorPage("This reply is already being retried or has changed. Refresh the dashboard."), 409);
  }

  try {
    let result: SendRuleResult;
    if (event.status === "sent_public_reply_error") {
      // The DM was delivered. Only the public comment reply is sent again.
      const stored = event.meta_response ? parseJsonText(event.meta_response) : null;
      const privateReply = stored && typeof stored === "object"
        ? (stored as Record<string, unknown>).privateReply
        : null;
      result = await completeCommentResponses(
        env,
        commentId,
        privateReply,
        matchedRule.publicReplyText,
        event.sent_at ?? new Date().toISOString()
      );
    } else {
      const origin = getAppOrigin(env, request);
      result = await sendRuleResponses(env, commentId, matchedRule, origin);
    }
    await updateEventAfterSend(env.DB, commentId, matchedRule, result);
  } catch (error) {
    if (event.status === "sent_public_reply_error") {
      // Keep a delivered DM marked as delivered.
      await env.DB.prepare("UPDATE comment_events SET status = 'sent_public_reply_error', error = ? WHERE comment_id = ?")
        .bind(error instanceof Error ? error.message : String(error), commentId)
        .run();
    } else {
      await recordCommentSendError(env.DB, commentId, matchedRule, error);
    }
  }

  return redirect("/admin?saved=1");
}

function isRetryableStatus(status: string): boolean {
  return status === "send_error" || status === "sent_public_reply_error";
}

async function getRules(db: D1Database, activeOnly: boolean): Promise<Rule[]> {
  const query = activeOnly
    ? `SELECT id, label, keywords, reply_text, public_reply_text, link_url, link_button_label, active, post_id, post_url, match_type, image_asset_id, use_bridge, created_at, updated_at
       FROM rules WHERE active = 1 ORDER BY id ASC`
    : `SELECT id, label, keywords, reply_text, public_reply_text, link_url, link_button_label, active, post_id, post_url, match_type, image_asset_id, use_bridge, created_at, updated_at
       FROM rules ORDER BY id ASC`;
  const result = await db.prepare(query).all<RuleRow>();
  return result.results.map(rowToRule);
}

async function getRuleById(db: D1Database, ruleId: number): Promise<Rule | null> {
  const row = await db.prepare(
    `SELECT id, label, keywords, reply_text, public_reply_text, link_url, link_button_label, active, post_id, post_url, match_type, image_asset_id, use_bridge, created_at, updated_at
     FROM rules
     WHERE id = ?`
  )
    .bind(ruleId)
    .first<RuleRow>();

  return row ? rowToRule(row) : null;
}

async function getRetryEvent(db: D1Database, commentId: string): Promise<RetryEventRow | null> {
  return db.prepare(
    `SELECT comment_id, matched_rule_id, matched_keyword, rule_label, status, sent_at, meta_response
     FROM comment_events
     WHERE comment_id = ?`
  )
    .bind(commentId)
    .first<RetryEventRow>();
}

async function getRecentEvents(db: D1Database, filters: ActivityFilters): Promise<RecentEventRow[]> {
  const { where, bindings } = buildActivityWhere(filters);
  const result = await db.prepare(
    `SELECT comment_id, media_id, username, comment_text, status, rule_label, matched_keyword, error, received_at, sent_at
     FROM comment_events
     ${where}
     ORDER BY received_at DESC
     LIMIT 50`
  )
    .bind(...bindings)
    .all<RecentEventRow>();

  return result.results;
}

async function getRecentMessageEvents(db: D1Database): Promise<RecentMessageRow[]> {
  const result = await db.prepare(
    `SELECT message_id, sender_id, message_text, source, reply_key, matched_choice, status, error, received_at, sent_at,
       story_id, story_url, story_link_url, referral_ref, sender_username, is_follower, profile_error, profile_checked_at
     FROM message_events
     ORDER BY received_at DESC
     LIMIT 30`
  ).all<RecentMessageRow>();

  return result.results;
}

// Overview totals across all comments and DMs. Test-mode matches are not deliveries.
async function getDashboardStats(db: D1Database): Promise<DashboardStats> {
  const result = await db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM comment_events) AS comments,
       (SELECT COUNT(*) FROM message_events) AS messages,
       (SELECT COUNT(*) FROM comment_events WHERE status IN ('sent', 'sent_public_reply_error')) +
         (SELECT COUNT(*) FROM message_events WHERE status = 'sent') AS sent,
       (SELECT COUNT(*) FROM comment_events WHERE status IN ('send_error', 'sent_public_reply_error') OR error IS NOT NULL) +
         (SELECT COUNT(*) FROM message_events WHERE status = 'send_error' OR error IS NOT NULL) AS errors,
       (SELECT COUNT(*) FROM comment_events WHERE status = 'dry_run_matched') +
         (SELECT COUNT(*) FROM message_events WHERE status = 'dry_run_matched') AS testMatches`
  ).first<DashboardStats>();

  return result ?? { comments: 0, messages: 0, sent: 0, errors: 0, testMatches: 0 };
}

type ReplyCounts = { matches: number; sent: number; errors: number; last_sent_at: string | null };

// One row per keyword rule (comment matches plus DM replies that used the rule)
// and per custom reply (DMs only).
async function getReplyStats(db: D1Database, rules: Rule[], settings: DmFeatureSettings): Promise<ReplyStatsRow[]> {
  const [comments, messages] = await Promise.all([
    db.prepare(
      `SELECT
         matched_rule_id AS rule_id,
         COUNT(*) AS matches,
         SUM(CASE WHEN status IN ('sent', 'sent_public_reply_error') THEN 1 ELSE 0 END) AS sent,
         SUM(CASE WHEN status IN ('send_error', 'sent_public_reply_error') OR error IS NOT NULL THEN 1 ELSE 0 END) AS errors,
         MAX(CASE WHEN status IN ('sent', 'sent_public_reply_error') THEN sent_at END) AS last_sent_at
       FROM comment_events
       WHERE matched_rule_id IS NOT NULL
       GROUP BY matched_rule_id`
    ).all<ReplyCounts & { rule_id: number }>(),
    db.prepare(
      `SELECT
         reply_key,
         COUNT(*) AS matches,
         SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
         SUM(CASE WHEN status = 'send_error' OR error IS NOT NULL THEN 1 ELSE 0 END) AS errors,
         MAX(CASE WHEN status = 'sent' THEN sent_at END) AS last_sent_at
       FROM message_events
       WHERE reply_key IS NOT NULL
       GROUP BY reply_key`
    ).all<ReplyCounts & { reply_key: string }>()
  ]);
  const commentCounts = new Map(comments.results.map((row) => [row.rule_id, row]));
  const dmCounts = new Map(messages.results.map((row) => [row.reply_key, row]));
  const statsRow = (
    key: string,
    label: string,
    kind: ReplyStatsRow["kind"],
    comment?: ReplyCounts,
    dm?: ReplyCounts
  ): ReplyStatsRow => ({
    key,
    label,
    kind,
    commentMatches: comment?.matches ?? 0,
    dmMatches: dm?.matches ?? 0,
    sent: (comment?.sent ?? 0) + (dm?.sent ?? 0),
    errors: (comment?.errors ?? 0) + (dm?.errors ?? 0),
    lastSentAt: [comment?.last_sent_at, dm?.last_sent_at].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
  });

  const rows = rules.map((rule) => statsRow(
    ruleReplyKey(rule.id),
    rule.label,
    "rule",
    commentCounts.get(rule.id),
    dmCounts.get(ruleReplyKey(rule.id))
  ));
  const fallback = commentCounts.get(FALLBACK_RULE_ID);
  if (fallback) {
    rows.push(statsRow("fallback", "Fallback rule (KEYWORD)", "fallback", fallback));
  }
  for (const reply of settings.customReplies) {
    rows.push(statsRow(customReplyKey(reply.id), reply.label, "text", undefined, dmCounts.get(customReplyKey(reply.id))));
  }
  return rows;
}

function parseActivityFilters(url: URL): ActivityFilters {
  return {
    status: normalizeFilter(url.searchParams.get("status")),
    keyword: normalizeFilter(url.searchParams.get("keyword")),
    username: normalizeFilter(url.searchParams.get("username")),
    date: normalizeFilter(url.searchParams.get("date"))
  };
}

function normalizeFilter(value: string | null): string {
  return value?.trim() ?? "";
}

function buildActivityWhere(filters: ActivityFilters): { where: string; bindings: Array<string> } {
  const clauses: string[] = [];
  const bindings: string[] = [];

  if (filters.status) {
    if (filters.status === "error") {
      clauses.push("(status IN ('send_error', 'sent_public_reply_error') OR error IS NOT NULL)");
    } else {
      clauses.push("status = ?");
      bindings.push(filters.status);
    }
  }

  if (filters.keyword) {
    clauses.push("(LOWER(COALESCE(matched_keyword, '')) LIKE ? OR LOWER(comment_text) LIKE ?)");
    const value = `%${filters.keyword.toLowerCase()}%`;
    bindings.push(value, value);
  }

  if (filters.username) {
    clauses.push("LOWER(COALESCE(username, '')) LIKE ?");
    bindings.push(`%${filters.username.toLowerCase().replace(/^@/, "")}%`);
  }

  if (filters.date && /^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
    const start = new Date(`${filters.date}T00:00:00.000Z`);
    // Ignore impossible dates such as 2026-02-31 instead of throwing.
    if (!Number.isNaN(start.getTime()) && start.toISOString().slice(0, 10) === filters.date) {
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      clauses.push("received_at >= ? AND received_at < ?");
      bindings.push(start.toISOString(), end.toISOString());
    }
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    bindings
  };
}

function rowToRule(row: RuleRow): Rule {
  return {
    id: row.id,
    label: row.label,
    keywords: parseStoredKeywords(row.keywords),
    replyText: row.reply_text,
    publicReplyText: row.public_reply_text,
    linkUrl: row.link_url,
    linkButtonLabel: row.link_button_label,
    active: row.active === 1,
    postId: row.post_id ?? null,
    postUrl: row.post_url ?? null,
    matchType: normalizeMatchType(row.match_type),
    imageAssetId: row.image_asset_id ?? null,
    useBridge: row.use_bridge === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseRuleForm(form: FormData): { ok: true; rule: Omit<Rule, "id" | "createdAt" | "updatedAt"> } | { ok: false; error: string } {
  const label = getFormString(form, "label").trim();
  const postScope = getFormString(form, "post_scope").trim();
  const rawPostId = getFormString(form, "post_id");
  const rawPostUrl = getFormString(form, "post_url");
  const matchTypeRaw = getFormString(form, "match_type").trim();
  const matchType: "contains" | "exact" | "any" = (matchTypeRaw === "exact" || matchTypeRaw === "any") ? matchTypeRaw : "contains";

  const keywords = parseKeywordsInput(getFormString(form, "keywords"));
  const replyText = getFormString(form, "reply_text").trim();
  const publicReplyText = nullableTrim(getFormString(form, "public_reply_text"));
  const linkUrl = nullableTrim(getFormString(form, "link_url"));
  const linkButtonLabel = nullableTrim(getFormString(form, "link_button_label"));
  const active = form.get("active") === "on";
  const imageAssetId = nullableTrim(getFormString(form, "image_asset_id"));
  const useBridge = form.get("use_bridge") === "on" || form.get("use_bridge") === "1" || form.get("use_bridge") === "true";

  if (!label) {
    return { ok: false, error: "Rule label is required." };
  }

  let postId: string | null = null;
  let postUrl: string | null = null;

  if (postScope === "specific" || rawPostId.trim() || rawPostUrl.trim()) {
    const normalized = normalizePostTarget(rawPostId, rawPostUrl);
    postId = normalized.postId;
    postUrl = normalized.postUrl;
    if (postScope === "specific" && !postId && !postUrl) {
      return { ok: false, error: "Enter a post URL or Media ID for a post-specific automation." };
    }
  }

  if (matchType !== "any" && keywords.length === 0) {
    return { ok: false, error: "Add at least one keyword." };
  }

  if (!replyText) {
    return { ok: false, error: "DM reply text is required." };
  }

  if ((linkUrl && !linkButtonLabel) || (!linkUrl && linkButtonLabel)) {
    return { ok: false, error: "Add both a button link and button label, or leave both blank." };
  }

  if (linkUrl && !isHttpsUrl(linkUrl)) {
    return { ok: false, error: "Button link must be a valid https URL." };
  }

  if (linkButtonLabel && linkButtonLabel.length > 20) {
    return { ok: false, error: "Button label must be 20 characters or fewer." };
  }

  const maxReplyLength = linkUrl ? MAX_BUTTON_TEXT_LENGTH : MAX_TEXT_MESSAGE_LENGTH;
  if (replyText.length > maxReplyLength) {
    return {
      ok: false,
      error: linkUrl
        ? "With a link button, the DM text must be 640 characters or fewer."
        : "DM text must be 1,000 characters or fewer."
    };
  }

  if (publicReplyText && (
    publicReplyText.length > MAX_PUBLIC_REPLY_TOTAL ||
    publicReplyText.split(/\r?\n/).some((line) => line.trim().length > MAX_PUBLIC_REPLY_LENGTH)
  )) {
    return { ok: false, error: "Each public reply must be 2,200 characters or fewer, with 10,000 characters in total." };
  }

  return {
    ok: true,
    rule: {
      label,
      keywords,
      replyText,
      publicReplyText,
      linkUrl,
      linkButtonLabel,
      active,
      postId,
      postUrl,
      matchType,
      imageAssetId,
      useBridge
    }
  };
}

function nullableTrim(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function parseKeywordsInput(input: string): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const part of input.split(/[\n,]/)) {
    const keyword = part.trim();
    const key = keyword.toLowerCase();
    if (!keyword || seen.has(key)) {
      continue;
    }
    seen.add(key);
    keywords.push(keyword);
  }

  return keywords;
}

function parseStoredKeywords(value: string): string[] {
  const parsed = parseJsonText(value);
  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  return parseKeywordsInput(value);
}

function findMatchedKeyword(text: string, keywords: string[]): string | null {
  for (const keyword of keywords) {
    if (matchesKeyword(text, keyword)) {
      return keyword;
    }
  }
  return null;
}

function extractCommentEvents(payload: unknown): CommentEvent[] {
  const data = (payload && typeof payload === "object" ? payload : {}) as InstagramWebhookPayload;
  const events: CommentEvent[] = [];

  for (const entry of Array.isArray(data.entry) ? data.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== "comments" || !change.value || typeof change.value !== "object") {
        continue;
      }

      const value = change.value;
      const commentId = getString(value, "id") ?? getString(value, "comment_id");
      if (!commentId) {
        console.log(JSON.stringify({ level: "warn", msg: "missing_comment_id", value }));
        continue;
      }

      events.push({
        commentId,
        mediaId: getMediaId(value),
        authorId: getNestedString(value, ["from", "id"]),
        username: getNestedString(value, ["from", "username"]) ?? getString(value, "username"),
        text: getString(value, "text") ?? getString(value, "comment_text") ?? ""
      });
    }
  }

  return events;
}

function matchesKeyword(text: string, keyword: string): boolean {
  const trimmedKeyword = keyword.trim().toLowerCase();
  return trimmedKeyword.length > 0 && text.toLowerCase().includes(trimmedKeyword);
}

// The account's own comments (including the public replies this Worker posts)
// must never trigger a rule.
function isOwnerComment(event: CommentEvent, env: AppEnv): boolean {
  if (event.authorId && event.authorId === env.IG_USER_ID) {
    return true;
  }
  const owner = env.OWNER_IG_USERNAME?.trim().toLowerCase().replace(/^@/, "");
  return Boolean(owner && event.username?.toLowerCase() === owner);
}

function summarizeRule(rule: MatchedRule): Record<string, string | number> {
  return {
    id: rule.id,
    label: rule.label,
    matchedKeyword: rule.matchedKeyword,
    publicReply: rule.publicReplyText ? 1 : 0,
    linkButton: rule.linkUrl && rule.linkButtonLabel ? 1 : 0
  };
}

async function isAdminRequest(request: Request, env: AppEnv): Promise<boolean> {
  if (!env.ADMIN_TOKEN) {
    return false;
  }

  const cookie = getCookie(request.headers.get("cookie"), ADMIN_COOKIE_NAME);
  if (!cookie) {
    return false;
  }

  const [expiresText, signature] = cookie.split(".");
  const expires = Number(expiresText);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000) || !signature) {
    return false;
  }

  const expected = await hmacHex(env.ADMIN_TOKEN, expiresText);
  return safeEqualText(signature, expected);
}

async function createAdminSession(env: AppEnv): Promise<string> {
  if (!env.ADMIN_TOKEN) {
    throw new Error("Missing ADMIN_TOKEN");
  }

  const expires = Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS;
  const signature = await hmacHex(env.ADMIN_TOKEN, String(expires));
  return `${expires}.${signature}`;
}

async function isValidMetaSignature(
  rawBody: ArrayBuffer,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const provided = hexToBytes(signatureHeader.slice("sha256=".length));
  if (!provided) {
    return false;
  }

  const expected = hexToBytes(await hmacHex(appSecret, rawBody));
  return Boolean(expected && constantTimeEqual(expected, provided));
}

async function hmacHex(secret: string, data: string | ArrayBuffer): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const payload = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  return bytesToHex(signature);
}

async function safeEqualText(a: string, b: string): Promise<boolean> {
  return constantTimeEqual(new TextEncoder().encode(a), new TextEncoder().encode(b));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let mismatch = a.length ^ b.length;
  const maxLength = Math.max(a.length, b.length);

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }

  return mismatch === 0;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    return null;
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseJsonBody(rawBody: ArrayBuffer): unknown {
  const text = new TextDecoder().decode(rawBody);
  return parseJsonText(text);
}

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function getMediaId(value: Record<string, unknown>): string | null {
  return (
    getNestedString(value, ["media", "id"]) ??
    getString(value, "media_id") ??
    getString(value, "mediaId")
  );
}

function getString(value: Record<string, unknown>, key: string): string | null {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

function getRecord(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const candidate = value[key];
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : null;
}

function getNestedString(value: Record<string, unknown>, path: string[]): string | null {
  let current: unknown = value;

  for (const part of path) {
    if (!current || typeof current !== "object") {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "string" && current.length > 0 ? current : null;
}

function getFormString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName === name) {
      return rawValue.join("=");
    }
  }

  return null;
}

function buildCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function redirect(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location,
      ...headers
    }
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function html(markup: string, status = 200): Response {
  return new Response(markup, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

type InstagramMediaItem = {
  id: string;
  caption: string | null;
  permalink: string | null;
  mediaType: string | null;
  timestamp: string | null;
  thumbnailUrl: string | null;
};

async function getRecentMedia(env: AppEnv): Promise<{ ok: boolean; media: InstagramMediaItem[] }> {
  // If in test mode or credentials are not present, return known media IDs from comment_events
  if (isDryRun(env) || !hasInstagramCredentials(env)) {
    const rows = await env.DB.prepare(
      `SELECT DISTINCT media_id FROM comment_events WHERE media_id IS NOT NULL ORDER BY received_at DESC LIMIT 20`
    ).all<{ media_id: string }>();

    if (rows.results.length > 0) {
      const media: InstagramMediaItem[] = rows.results.map((r, idx) => ({
        id: r.media_id,
        caption: `Post #${idx + 1} (${r.media_id})`,
        permalink: `https://www.instagram.com/p/${r.media_id}/`,
        mediaType: "IMAGE",
        timestamp: null,
        thumbnailUrl: null
      }));
      return { ok: true, media };
    }

    // Demo fallback so the selector can be tested immediately in local/preview environments
    const media: InstagramMediaItem[] = [
      {
        id: "17923456789012345",
        caption: "🔥 Ultimate Instagram DM Automation Guide 2026 - Comment GUIDE below!",
        permalink: "https://www.instagram.com/p/C3xY9k2L5mN/",
        mediaType: "IMAGE",
        timestamp: new Date().toISOString(),
        thumbnailUrl: null
      },
      {
        id: "17934567890123456",
        caption: "🚀 How we generated 10k leads with auto-reply DMs in 30 days",
        permalink: "https://www.instagram.com/p/C4zQ1w8X9pA/",
        mediaType: "VIDEO",
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        thumbnailUrl: null
      },
      {
        id: "17945678901234567",
        caption: "✨ Free Resource Drop: 50 High-Converting DM Prompts & Templates",
        permalink: "https://www.instagram.com/p/C5vB7n3M2kL/",
        mediaType: "CAROUSEL_ALBUM",
        timestamp: new Date(Date.now() - 172800000).toISOString(),
        thumbnailUrl: null
      }
    ];
    return { ok: true, media };
  }

  try {
    const base = (env.GRAPH_API_BASE ?? DEFAULT_GRAPH_API_BASE).replace(/\/$/, "");
    const token = await getInstagramAccessToken(env);
    const endpoint = new URL(`${base}/${env.IG_USER_ID}/media`);
    endpoint.searchParams.set("fields", "id,caption,permalink,media_type,timestamp,thumbnail_url,media_url");
    endpoint.searchParams.set("limit", "50");

    const response = await fetch(endpoint.toString(), {
      headers: { authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch media from Graph API: ${response.status}`);
      return { ok: true, media: [] };
    }

    const data = await response.json() as { data?: Array<Record<string, unknown>> };
    let items: InstagramMediaItem[] = (data?.data ?? []).map((item) => {
      const thumb = (typeof item.thumbnail_url === "string" && item.thumbnail_url)
        ? item.thumbnail_url
        : (typeof item.media_url === "string" && item.media_url) ? item.media_url : null;
      return {
        id: String(item.id ?? ""),
        caption: typeof item.caption === "string" ? item.caption : null,
        permalink: typeof item.permalink === "string" ? item.permalink : null,
        mediaType: typeof item.media_type === "string" ? item.media_type : null,
        timestamp: typeof item.timestamp === "string" ? item.timestamp : null,
        thumbnailUrl: thumb
      };
    }).filter((item) => Boolean(item.id));

    if (items.length === 0) {
      const rows = await env.DB.prepare(
        `SELECT DISTINCT media_id FROM comment_events WHERE media_id IS NOT NULL ORDER BY received_at DESC LIMIT 20`
      ).all<{ media_id: string }>();

      if (rows.results.length > 0) {
        items = rows.results.map((r, idx) => ({
          id: r.media_id,
          caption: `Post #${idx + 1} (${r.media_id})`,
          permalink: `https://www.instagram.com/p/${r.media_id}/`,
          mediaType: "IMAGE",
          timestamp: null,
          thumbnailUrl: null
        }));
      } else {
        items = [
          {
            id: "17923456789012345",
            caption: "🔥 Ultimate Instagram DM Automation Guide 2026 - Comment GUIDE below!",
            permalink: "https://www.instagram.com/p/C3xY9k2L5mN/",
            mediaType: "IMAGE",
            timestamp: new Date().toISOString(),
            thumbnailUrl: null
          },
          {
            id: "17934567890123456",
            caption: "🚀 How we generated 10k leads with auto-reply DMs in 30 days",
            permalink: "https://www.instagram.com/p/C4zQ1w8X9pA/",
            mediaType: "VIDEO",
            timestamp: new Date(Date.now() - 86400000).toISOString(),
            thumbnailUrl: null
          },
          {
            id: "17945678901234567",
            caption: "✨ Free Resource Drop: 50 High-Converting DM Prompts & Templates",
            permalink: "https://www.instagram.com/p/C5vB7n3M2kL/",
            mediaType: "CAROUSEL_ALBUM",
            timestamp: new Date(Date.now() - 172800000).toISOString(),
            thumbnailUrl: null
          }
        ];
      }
    }

    return { ok: true, media: items };
  } catch (err) {
    console.error("Error fetching Instagram media:", err);
    return {
      ok: true,
      media: [
        {
          id: "17923456789012345",
          caption: "🔥 Ultimate Instagram DM Automation Guide 2026 - Comment GUIDE below!",
          permalink: "https://www.instagram.com/p/C3xY9k2L5mN/",
          mediaType: "IMAGE",
          timestamp: new Date().toISOString(),
          thumbnailUrl: null
        }
      ]
    };
  }
}

function getAppOrigin(env: AppEnv, requestOrUrl?: Request | URL | string): string {
  if (env.APP_URL?.trim()) {
    return env.APP_URL.trim().replace(/\/$/, "");
  }
  if (requestOrUrl) {
    try {
      if (typeof requestOrUrl === "string") {
        return new URL(requestOrUrl).origin;
      }
      if (requestOrUrl instanceof URL) {
        return requestOrUrl.origin;
      }
      if ("url" in requestOrUrl && typeof requestOrUrl.url === "string") {
        return new URL(requestOrUrl.url).origin;
      }
    } catch {
      // ignore
    }
  }
  return "";
}

async function handleBridgeRedirect(request: Request, env: AppEnv, slug: string): Promise<Response> {
  const settings = await getRedirectBridgeSettings(env.DB);
  const connection = await getConnectionStatus(env);
  const username = connection.username ?? (env.OWNER_IG_USERNAME?.trim().replace(/^@/, "") || null);
  const avatarUrl = settings.profilePicData || (settings.profilePicAssetId ? `/assets/${settings.profilePicAssetId}.webp` : null);

  if (slug === "preview") {
    return html(renderRedirectPage({
      destinationUrl: "https://instagram.com",
      settings,
      accountUsername: username,
      avatarUrl
    }));
  }

  const ruleId = parseInt(slug, 10);
  if (Number.isNaN(ruleId)) {
    return html(renderErrorPage("Invalid redirect link."), 404);
  }

  const rule = await getRuleById(env.DB, ruleId);
  if (!rule || !rule.linkUrl) {
    return html(renderErrorPage("Link not found or expired."), 404);
  }

  if (!settings.enabled || !rule.useBridge) {
    return Response.redirect(rule.linkUrl, 302);
  }

  return html(renderRedirectPage({
    destinationUrl: rule.linkUrl,
    settings,
    accountUsername: username,
    avatarUrl
  }));
}

async function handleAssetServe(env: AppEnv, assetId: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT mime_type, data_base64 FROM media_assets WHERE id = ?")
    .bind(assetId)
    .first<{ mime_type: string; data_base64: string }>();

  if (!row || !row.data_base64) {
    return new Response("Not found", { status: 404 });
  }

  let base64Clean = row.data_base64;
  const commaIndex = base64Clean.indexOf(",");
  if (base64Clean.startsWith("data:") && commaIndex !== -1) {
    base64Clean = base64Clean.slice(commaIndex + 1);
  }

  const binaryString = atob(base64Clean);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": row.mime_type || "image/webp",
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}

async function handleAssetUpload(request: Request, env: AppEnv): Promise<Response> {
  if (!(await isAdminRequest(request, env))) {
    return json({ ok: false, error: "Login required." }, 401);
  }

  let filename = "image.webp";
  let mimeType = "image/webp";
  let dataBase64 = "";

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    filename = typeof body.filename === "string" ? body.filename : filename;
    mimeType = typeof body.mime_type === "string" ? body.mime_type : mimeType;
    dataBase64 = typeof body.data_base64 === "string" ? body.data_base64 : "";
  } else {
    const form = await request.formData();
    const file = form.get("file");
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      filename = (file as File).name || filename;
      mimeType = (file as File).type || mimeType;
      const buffer = await (file as File).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      dataBase64 = btoa(binary);
    } else {
      filename = getFormString(form, "filename") || filename;
      mimeType = getFormString(form, "mime_type") || mimeType;
      dataBase64 = getFormString(form, "data_base64");
    }
  }

  if (!dataBase64.trim()) {
    return json({ ok: false, error: "Missing image data." }, 400);
  }

  const id = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sizeBytes = Math.round((dataBase64.length * 3) / 4);

  await env.DB.prepare(
    "INSERT INTO media_assets (id, filename, mime_type, data_base64, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(id, filename, mimeType, dataBase64, sizeBytes, new Date().toISOString())
    .run();

  return json({ ok: true, id, url: `/assets/${id}.webp`, sizeBytes });
}

async function handleBridgeSettingsPost(request: Request, env: AppEnv): Promise<Response> {
  if (!(await isAdminRequest(request, env))) {
    return redirect("/admin");
  }

  const contentType = request.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const current = await getRedirectBridgeSettings(env.DB);

  let enabled = true;
  let headline = current.headline;
  let quotation = current.quotation;
  let author = current.author;
  let countdownSeconds = current.countdownSeconds;
  let buttonText = current.buttonText;
  let blurBackground = current.blurBackground;
  let profilePicAssetId = current.profilePicAssetId;
  let profilePicData = current.profilePicData;

  if (isJson) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    enabled = body.enabled !== false;
    if (typeof body.headline === "string") headline = body.headline.trim();
    if (typeof body.quotation === "string") quotation = body.quotation.trim();
    if (typeof body.author === "string") author = body.author.trim();
    if (body.countdownSeconds !== undefined) {
      countdownSeconds = Math.max(1, Math.min(30, Number(body.countdownSeconds) || 3));
    }
    if (typeof body.buttonText === "string") buttonText = body.buttonText.trim();
    if (body.blurBackground !== undefined) blurBackground = body.blurBackground !== false;
    if (typeof body.profilePicAssetId === "string") profilePicAssetId = body.profilePicAssetId || null;
    if (typeof body.profilePicData === "string") profilePicData = body.profilePicData || null;
  } else {
    const form = await request.formData();
    enabled = form.get("enabled") === "on";
    headline = getFormString(form, "headline").trim() || DEFAULT_REDIRECT_BRIDGE_SETTINGS.headline;
    quotation = getFormString(form, "quotation").trim();
    author = getFormString(form, "author").trim();
    const rawSeconds = parseInt(getFormString(form, "countdown_seconds"), 10);
    countdownSeconds = Number.isNaN(rawSeconds) ? 3 : Math.max(1, Math.min(30, rawSeconds));
    buttonText = getFormString(form, "button_text").trim() || DEFAULT_REDIRECT_BRIDGE_SETTINGS.buttonText;
    blurBackground = form.get("blur_background") === "on";
    const rawAssetId = getFormString(form, "profile_pic_asset_id").trim();
    const rawPicData = getFormString(form, "profile_pic_data").trim();
    if (rawAssetId) profilePicAssetId = rawAssetId;
    if (rawPicData) profilePicData = rawPicData;
  }

  const nextSettings: RedirectBridgeSettings = {
    enabled,
    headline,
    quotation,
    author,
    countdownSeconds,
    buttonText,
    blurBackground,
    profilePicAssetId,
    profilePicData
  };

  await saveRedirectBridgeSettings(env.DB, nextSettings);

  if (isJson) {
    return json({ ok: true, settings: nextSettings });
  }

  return redirect("/admin?saved=1#bridge-settings");
}


