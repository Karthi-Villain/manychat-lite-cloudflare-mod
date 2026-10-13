import { customReplyKey, ruleReplyKey, type DmFeatureSettings, type IceBreakersPublicationStatus } from "./dm-features";
import {
  dmFeaturesClientScript,
  dmFeaturesStyles,
  renderDmFeaturesPanel,
  renderDmMessageContext,
  type ReplyOption
} from "./dm-features-panel";
import type { InstagramTokenStatus } from "./instagram-token";
import type {
  ActivityFilters,
  DashboardStats,
  RecentEventRow,
  RecentMessageRow,
  RedirectBridgeSettings,
  ReplyStatsRow,
  Rule
} from "./types";

export type DashboardData = {
  dryRun: boolean;
  localPreview: boolean;
  rules: Rule[];
  recentEvents: RecentEventRow[];
  messageEvents: RecentMessageRow[];
  replyStats: ReplyStatsRow[];
  stats: DashboardStats;
  connection: InstagramTokenStatus;
  dmFeatures: DmFeatureSettings;
  publication: IceBreakersPublicationStatus;
  // The connected Instagram username (or OWNER_IG_USERNAME), without "@".
  accountUsername: string | null;
  filters: ActivityFilters;
  flash: string | null;
  bridgeSettings?: RedirectBridgeSettings;
};

const icons: Record<string, string> = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  message: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 2V11.5A8.5 8.5 0 0 1 9.5 3h3a8.5 8.5 0 0 1 8.5 8.5Z"/><path d="M7 9h8M7 13h5"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-6M2 20h20"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  activity: '<path d="M2 12h5l3-9 4 18 3-9h5"/>',
  external: '<path d="M15 3h6v6m0-6L10 14"/><path d="M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  alert: '<path d="m12 3 10 18H2zM12 9v4M12 17h.01"/>',
  logout: '<path d="M9 3H4v18h5m5-14 5 5-5 5M8 12h13"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>'
};

function icon(name: string, cls = ""): string {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.message}</svg>`;
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function number(value: number): string {
  return Number(value ?? 0).toLocaleString("en-US");
}

function plural(value: number, singular: string, pluralForm: string): string {
  return `${number(value)} ${value === 1 ? singular : pluralForm}`;
}

function badge(text: string, kind = "neutral"): string {
  return `<span class="badge ${kind}"><i></i>${esc(text)}</span>`;
}

function time(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? esc(value)
    : `<time datetime="${esc(date.toISOString())}" title="${esc(date.toISOString())}">${esc(date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }))} UTC</time>`;
}

function stat(label: string, value: number, detail: string, glyph: string, cls = ""): string {
  return `<article class="stat ${cls}"><div class="stat-label">${esc(label)}${icon(glyph)}</div><strong>${number(value)}</strong><span>${esc(detail)}</span></article>`;
}

function initials(username: string | null): string {
  const letters = (username ?? "").replace(/[^A-Za-z0-9]/g, "");
  return esc((letters.slice(0, 2) || "IG").toUpperCase());
}

export function renderDashboardPage(data: DashboardData): string {
  const active = data.rules.filter((rule) => rule.active).length;
  const handle = data.accountUsername ? `@${data.accountUsername}` : "Your Instagram account";
  const avatar = initials(data.accountUsername);
  const replyOptions: ReplyOption[] = [
    ...data.rules.map((rule) => ({
      key: ruleReplyKey(rule.id),
      label: rule.label,
      group: "rule" as const,
      detail: rule.active ? "" : "paused"
    })),
    ...data.dmFeatures.customReplies.map((reply) => ({
      key: customReplyKey(reply.id),
      label: reply.label,
      group: "text" as const,
      detail: ""
    }))
  ];
  const firstRule = data.rules.find((rule) => rule.active) ?? data.rules[0];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Instagram auto-DM</title><style>${styles}${dmFeaturesStyles}</style></head><body>
  <a class="skip" href="#main">Skip to content</a>
  <aside class="sidebar">
    <a class="brand" href="/admin"><span class="brand-mark">a<span>↗</span></span><span>auto-dm<span class="brand-sub">FOR INSTAGRAM</span></span></a>
    <div class="workspace-label">DASHBOARD</div>
    <nav class="primary-nav" aria-label="Dashboard navigation">
      <a class="selected" href="#overview">${icon("grid")}Overview</a>
      <a href="#automations">${icon("bolt")}Automations<span class="nav-count">${data.rules.length}</span></a>
      <a href="#bridge-settings">${icon("link")}Link bridge</a>
      <a href="#dm-tools">${icon("message")}DM tools</a>
      <a href="#performance">${icon("chart")}Reply stats</a>
      <a href="#activity">${icon("activity")}Activity</a>
      <a href="#connection">${icon("instagram")}Connection</a>
    </nav>
    <div class="sidebar-bottom">
      <div class="account"><div class="avatar">${avatar}</div><div><strong>${esc(handle)}</strong><span>Instagram</span></div>${icon("instagram")}</div>
      <div class="account-actions"><a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">Meta app settings ${icon("external")}</a><form action="/admin/logout" method="post"><button class="logout" aria-label="Log out" title="Log out">${icon("logout")}</button></form></div>
    </div>
  </aside>
  <div class="page"><header class="topbar"><span>Instagram <span class="slash">/</span> <strong>Overview</strong></span><div>${badge(data.dryRun ? "Test mode" : "Live mode", data.dryRun ? "amber" : "green")}<span class="mini-avatar">${avatar}</span><form class="mobile-logout" action="/admin/logout" method="post"><button class="text-link" aria-label="Log out">${icon("logout")}</button></form></div></header>
  <main id="main">
    ${data.flash ? `<div class="flash" role="status">${icon("check")}${esc(data.flash)}</div>` : ""}
    <section class="hero" id="overview"><div><h1>Instagram auto-DM</h1><p>Manage replies and view message activity.</p></div><button class="button primary" type="button" data-new-rule>${icon("plus")}New automation</button></section>
    ${data.localPreview ? '<div class="notice"><strong>Local preview</strong> · Counters and settings come from the local development database, not from Instagram.</div>' : ""}
    ${data.dryRun ? '<div class="notice">Test mode: matches are logged, but no messages are sent.</div>' : ""}
    ${data.connection.needsReconnect || data.connection.state === "error" ? `<div class="notice" role="alert"><strong>Instagram needs attention.</strong> ${esc(data.connection.error ?? "Check your connection.")} <a href="#connection" style="text-decoration:underline">View connection</a></div>` : ""}
    <section class="stats" aria-label="${data.localPreview ? "Local test data" : "All-time overview"}">
      ${stat("DMs sent", data.stats.sent, data.dryRun ? plural(data.stats.testMatches, "test match", "test matches") : "All time · comments + DMs", "message", "featured")}
      ${stat("Active automations", active, `${number(data.rules.length)} configured`, "bolt")}
      ${stat("Comments and DMs", data.stats.comments + data.stats.messages, `${plural(data.stats.comments, "comment", "comments")} · ${plural(data.stats.messages, "DM", "DMs")}`, "activity")}
      ${stat("Errors", data.stats.errors, data.stats.errors ? "Send or public reply errors" : "No errors recorded", data.stats.errors ? "alert" : "check")}
    </section>
    <div class="studio-grid"><div class="automation-column">
      <section id="automations"><div class="section-heading"><div><h2>Automations</h2></div><span class="count">${data.rules.length} total</span></div>
      <div class="search-field">${icon("search")}<input id="rule-search" type="search" aria-label="Search automations" placeholder="Find an automation…"></div>
      <div class="rule-list">${data.rules.map((rule) => ruleCard(rule, data.replyStats.find((row) => row.key === ruleReplyKey(rule.id)))).join("")}
      ${data.rules.length ? "" : '<div class="empty"><strong>No automations yet.</strong><p>Add a keyword and a reply.</p><button class="button secondary" type="button" data-new-rule>New automation</button></div>'}
      <p id="no-rules" class="empty" hidden>No automations match your search.</p></div></section>
    </div>
    <aside class="right-column">
      ${previewPanel(firstRule, handle, avatar)}
    </aside></div>
    ${renderBridgeSettingsPanel(data.bridgeSettings, data.accountUsername)}
    ${renderDmFeaturesPanel({
      settings: data.dmFeatures,
      publication: data.publication,
      options: replyOptions,
      username: data.accountUsername,
      dryRun: data.dryRun
    })}
    <section id="performance" class="performance panel"><div class="section-heading"><div><h2>Reply stats</h2></div><span class="muted small">${data.localPreview ? "Local test data" : "All time"}</span></div>${analytics(data.replyStats)}</section>
    <section id="activity" class="activity panel"><div class="section-heading"><div><h2>Recent activity</h2></div><a class="text-link" href="/admin#activity">Refresh ${icon("activity")}</a></div>
    <div class="activity-tabs" role="tablist" aria-label="Activity type"><button id="comments-tab" type="button" role="tab" aria-selected="true" aria-controls="comment-activity" data-tab="comment-activity">Comments <span>${data.recentEvents.length}</span></button><button id="messages-tab" type="button" role="tab" aria-selected="false" aria-controls="message-activity" data-tab="message-activity" tabindex="-1">Direct messages <span>${data.messageEvents.length}</span></button></div>
    <div id="comment-activity" role="tabpanel" aria-labelledby="comments-tab">${filters(data.filters)}${comments(data.recentEvents, data.dryRun)}</div><div id="message-activity" role="tabpanel" aria-labelledby="messages-tab" hidden><p class="muted small activity-note">Latest 30 incoming DMs, conversation starter taps, story replies and DM link opens. Filters apply to comments only.</p>${messages(data.messageEvents)}</div></section>
    ${connectionPanel(data.connection, data.dryRun)}
  </main></div>${newRuleDialog()}<script>${clientScript}${dmFeaturesClientScript}</script></body></html>`;
}

function renderBridgeSettingsPanel(settings: RedirectBridgeSettings | undefined, accountUsername: string | null): string {
  const effective = settings ?? {
    enabled: true,
    profilePicData: null,
    profilePicAssetId: null,
    headline: "Your link is almost ready...",
    quotation: "Good things come to those who create. ✨",
    author: "",
    countdownSeconds: 3,
    buttonText: "Open Link Now →",
    blurBackground: true
  };
  const avatar = effective.profilePicData || (effective.profilePicAssetId ? `/assets/${effective.profilePicAssetId}.webp` : null);

  return `<section id="bridge-settings" class="panel bridge-panel">
    <div class="section-heading">
      <div>
        <h2>Link Bridge &amp; Profile Waiting Page</h2>
        <p class="muted small">Shows an interactive 3-second waiting card with your Instagram profile picture, custom message/quote, and animated countdown before opening button links.</p>
      </div>
      <div class="heading-actions">
        ${badge(effective.enabled ? "Enabled" : "Disabled", effective.enabled ? "green" : "neutral")}
        <a href="/r/preview" target="_blank" rel="noopener noreferrer" class="button secondary small-btn">Live preview ↗</a>
      </div>
    </div>

    <form action="/admin/bridge-settings" method="post" class="bridge-form stack">
      <div class="bridge-top-grid">
        <div class="avatar-upload-box">
          <span class="field-label-text">Instagram Profile Picture</span>
          <div class="avatar-preview-circle">
            ${avatar ? `<img src="${esc(avatar)}" class="bridge-avatar-preview" alt="Profile avatar">` : `<div class="avatar-placeholder">${initials(accountUsername)}</div>`}
          </div>
          <input type="file" accept="image/*" class="bridge-avatar-input" title="Upload profile picture">
          <input type="hidden" name="profile_pic_asset_id" value="${esc(effective.profilePicAssetId ?? "")}">
          <input type="hidden" name="profile_pic_data" value="${esc(effective.profilePicData ?? "")}">
          <span class="field-help">Auto-compressed into WebP &amp; stored directly in Cloudflare D1.</span>
        </div>

        <div class="bridge-fields-column">
          <label class="switch-label">
            <input type="checkbox" name="enabled" ${effective.enabled ? "checked" : ""}>
            <span class="switch"></span>
            <strong>Enable 3-second profile waiting page</strong>
          </label>

          <label>Headline
            <input name="headline" value="${esc(effective.headline)}" placeholder="Your link is almost ready..." maxlength="120">
          </label>

          <div class="two-fields">
            <label>Custom message or quotation
              <input name="quotation" value="${esc(effective.quotation)}" placeholder="Good things come to those who create. ✨" maxlength="250">
            </label>
            <label>Quotation author <span class="optional">optional</span>
              <input name="author" value="${esc(effective.author)}" placeholder="${esc(accountUsername ? `@${accountUsername}` : "Creator")}" maxlength="60">
            </label>
          </div>

          <div class="two-fields">
            <label>Countdown (seconds)
              <input type="number" name="countdown_seconds" min="1" max="30" value="${effective.countdownSeconds || 3}">
            </label>
            <label>Skip button text
              <input name="button_text" value="${esc(effective.buttonText)}" placeholder="Open Link Now →" maxlength="50">
            </label>
          </div>

          <label class="checkbox-opt">
            <input type="checkbox" name="blur_background" ${effective.blurBackground ? "checked" : ""}>
            <span>Ambient background blur aura effect</span>
          </label>
        </div>
      </div>

      <div class="form-actions">
        <button class="button primary">Save bridge settings</button>
      </div>
    </form>
  </section>`;
}

function connectionPanel(connection: InstagramTokenStatus, dryRun: boolean): string {
  const label = dryRun ? "Test mode" : connection.state === "healthy" ? "Connected" : connection.needsReconnect ? "Reconnect required" : connection.state === "error" ? "Check failed" : "Not checked yet";
  return `<section id="connection" class="panel connection-panel"><div class="section-heading"><div><h2>Instagram connection</h2></div>${badge(label, !dryRun && connection.state === "healthy" ? "green" : "amber")}</div>
    <p>${dryRun ? "Connection checks and token renewal are off in test mode." : "Checked daily. The token renews automatically before it expires."}</p>
    ${connection.username ? `<p><strong>@${esc(connection.username)}</strong></p>` : ""}
    ${connection.error ? `<p class="notice" role="status">${esc(connection.error)}</p>` : ""}
    <dl class="connection-dates"><div><dt>Last checked</dt><dd>${connection.lastCheckedAt ? time(connection.lastCheckedAt) : "Not yet"}</dd></div><div><dt>Last renewed</dt><dd>${connection.lastRefreshedAt ? time(connection.lastRefreshedAt) : "Not yet"}</dd></div><div><dt>Next renewal</dt><dd>${connection.nextRefreshAt ? time(connection.nextRefreshAt) : "After the first check"}</dd></div><div><dt>Token expires</dt><dd>${connection.expiresAt ? time(connection.expiresAt) : "Confirmed after the first renewal"}</dd></div></dl>
    <div class="form-actions"><a class="text-link" href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">Open Meta settings ${icon("external")}</a><form action="/admin/connection/check" method="post"><button class="button secondary" ${dryRun ? "disabled" : ""}>Check connection</button></form></div>
  </section>`;
}

function previewHref(url: string | null): string {
  try {
    if (url && new URL(url).protocol === "https:") return `href="${esc(url)}" target="_blank" rel="noopener noreferrer"`;
  } catch { /* An invalid link is shown without a target. */ }
  return "";
}

type ReplyPreview = {
  title: string; keyword: string; text: string; source: string; active: boolean;
  publicReply: string; buttons: Array<{ title: string; url: string }>;
};

function rulePreview(rule: Rule): ReplyPreview {
  let keyword = rule.keywords[0]?.toUpperCase() ?? "";
  if (rule.matchType === "any") {
    keyword = "ANY COMMENT";
  } else if (rule.matchType === "exact") {
    keyword = `EXACT: ${keyword}`;
  }
  const source = rule.postId || rule.postUrl ? "POST COMMENT → DM" : "COMMENT → DM";
  return {
    title: rule.label,
    keyword,
    text: rule.replyText,
    source,
    active: rule.active,
    publicReply: rule.publicReplyText ?? "",
    buttons: rule.linkUrl && rule.linkButtonLabel ? [{ title: rule.linkButtonLabel, url: rule.linkUrl }] : []
  };
}

// Chat-style preview of the selected automation. The client script updates it as you edit.
function previewPanel(rule: Rule | undefined, handle: string, avatar: string): string {
  const preview = rule ? rulePreview(rule) : null;
  const publicReplies = (preview?.publicReply ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  return `<section class="preview-panel" id="reply-preview" aria-label="Reply preview"><div class="preview-heading"><span class="eyebrow" id="preview-heading">${esc((preview?.title ?? "Reply preview").toUpperCase())}</span><span class="preview-tag">Preview</span></div><div class="chat-header"><div class="avatar">${avatar}</div><div><strong>${esc(handle)}</strong><span>Instagram message</span></div>${icon("instagram")}</div><div class="chat"><div class="chat-date" id="preview-source">${esc(preview?.source ?? "COMMENT → DM")}</div><div class="incoming"><span id="preview-keyword">${esc(preview?.keyword ?? "KEYWORD")}</span> ↵</div><div class="chat-reply"><span class="chat-avatar">${avatar.slice(0, 1).toLowerCase()}</span><div><div id="preview-message" class="bubble">${esc(preview?.text ?? "Your message appears here.")}</div><div class="chat-buttons" id="preview-buttons">${(preview?.buttons ?? []).map((button) => `<a ${previewHref(button.url)}>${esc(button.title)} ↗</a>`).join("")}</div></div></div><div class="public-preview" id="preview-public" ${publicReplies.length ? "" : "hidden"}><span id="preview-public-label">${publicReplies.length > 1 ? `Public reply · 1 of ${publicReplies.length}` : "Public reply"}</span><p id="preview-public-text">${esc(publicReplies[0] ?? "")}</p></div><p class="preview-note" id="preview-note">${preview ? (preview.active ? "Preview only. No messages are sent." : "Paused. This automation will not send replies.") : "Create an automation to preview its reply."}</p></div>
    <div class="flow-explainer"><div><span>1</span><p><strong>Someone comments</strong> or DMs a keyword</p></div><div><span>2</span><p><strong>They get your DM</strong> with an optional link button</p></div><div><span>3</span><p><strong>Commenters see a public reply</strong> if you add one</p></div></div></section>`;
}

function ruleCard(rule: Rule, stats?: ReplyStatsRow): string {
  const glyph = rule.linkUrl ? "link" : "message";
  const postScoped = Boolean(rule.postId || rule.postUrl);
  const matchBadge = rule.matchType === "any"
    ? badge("Any comment", "amber")
    : rule.matchType === "exact"
      ? badge("Exact word", "purple")
      : badge("Keywords", "green");
  const scopeBadge = postScoped ? badge("Specific post", "blue") : badge("All posts", "neutral");
  const chipsHtml = rule.matchType === "any"
    ? '<span>ANY COMMENT</span>'
    : rule.keywords.map((key) => `<span>${esc(key.toUpperCase())}</span>`).join("");
  const postTargetLabel = postScoped ? `Post: ${esc(rule.postId || rule.postUrl || "Specific post")}` : "All posts";

  return `<details class="rule-card ${rule.active ? "" : "paused"}" data-search="${esc([rule.label, rule.postId ?? "", rule.postUrl ?? "", ...rule.keywords].join(" ").toLowerCase())}" data-preview="${esc(JSON.stringify(rulePreview(rule)))}"><summary><span class="flow-icon ${rule.linkUrl ? "link" : "text"}">${icon(glyph)}</span><span class="rule-summary"><strong>${esc(rule.label)}</strong><span class="rule-meta">${esc(postTargetLabel)} <span class="tiny-arrow">→</span> Send a DM${rule.linkUrl ? " with a link" : ""}</span><span class="chips">${scopeBadge}${matchBadge}${chipsHtml}</span></span><span class="rule-end">${badge(rule.active ? "Active" : "Paused", rule.active ? "green" : "neutral")}<span class="delivery-count">${number(stats?.sent ?? 0)} sent</span></span><span class="chevron">⌄</span></summary>
    <form action="/admin/rules/${rule.id}" method="post" class="rule-edit">
      <div class="two-fields">
        <label>Automation name<input name="label" value="${esc(rule.label)}" required maxlength="100"></label>
        <div>
          <span class="field-label-text">Target post</span>
          <div class="segmented-control">
            <label><input type="radio" name="post_scope" value="all" ${!postScoped ? "checked" : ""}><span>All posts</span></label>
            <label><input type="radio" name="post_scope" value="specific" ${postScoped ? "checked" : ""}><span>Specific post</span></label>
          </div>
        </div>
      </div>

      <div class="specific-post-box" ${postScoped ? "" : "hidden"}>
        <div class="two-fields">
          <label>Post URL or Media ID
            <input name="post_id" value="${esc(rule.postId ?? "")}" placeholder="e.g. 17923456789 or https://www.instagram.com/p/...">
            <span class="field-help">Numeric Instagram Media ID or shortcode</span>
          </label>
          <label>Post link <span class="optional">optional</span>
            <input name="post_url" type="url" value="${esc(rule.postUrl ?? "")}" placeholder="https://www.instagram.com/p/...">
          </label>
        </div>
        <div class="post-picker-bar">
          <button type="button" class="button secondary small-btn" data-load-posts>${icon("instagram")} Browse recent posts</button>
          <span class="field-help recent-posts-status"></span>
        </div>
      </div>

      <div class="trigger-mode-box">
        <span class="field-label-text">When someone comments</span>
        <div class="trigger-options">
          <label class="trigger-opt">
            <input type="radio" name="match_type" value="contains" ${rule.matchType === "contains" ? "checked" : ""}>
            <div><strong>Contains keywords</strong><span>Comment contains any of the keywords</span></div>
          </label>
          <label class="trigger-opt">
            <input type="radio" name="match_type" value="exact" ${rule.matchType === "exact" ? "checked" : ""}>
            <div><strong>Exact word or phrase</strong><span>Comment matches the exact word (e.g. PROMPT)</span></div>
          </label>
          <label class="trigger-opt">
            <input type="radio" name="match_type" value="any" ${rule.matchType === "any" ? "checked" : ""}>
            <div><strong>Any comment</strong><span>Any comment on this post triggers the reply</span></div>
          </label>
        </div>
      </div>

      <label class="keywords-field" ${rule.matchType === "any" ? "hidden" : ""}>Keywords
        <input name="keywords" value="${esc(rule.keywords.join(", "))}" ${rule.matchType === "any" ? "" : "required"}>
        <span class="field-help">Separate multiple keywords with commas. Comments match without case sensitivity.</span>
      </label>

      <label>DM message<textarea name="reply_text" rows="3" required>${esc(rule.replyText)}</textarea></label>
      <label>Public comment reply <span class="optional">optional · one variation per line</span><textarea name="public_reply_text" rows="2">${esc(rule.publicReplyText ?? "")}</textarea></label>
      <div class="two-fields">
        <label>Button link<input name="link_url" type="url" value="${esc(rule.linkUrl ?? "")}" placeholder="https://…"></label>
        <label>Button label<input name="link_button_label" value="${esc(rule.linkButtonLabel ?? "")}" maxlength="20" placeholder="Read more"></label>
      </div>
      <label class="checkbox-opt">
        <input type="checkbox" name="use_bridge" ${rule.useBridge ? "checked" : ""}>
        <span>Open link via 3-second profile waiting page</span>
      </label>
      <div class="image-attachment-box">
        <span class="field-label-text">DM image attachment <span class="optional">optional · WebP</span></span>
        <input type="hidden" name="image_asset_id" value="${esc(rule.imageAssetId ?? "")}">
        <div class="image-preview-wrapper" ${rule.imageAssetId ? "" : "hidden"}>
          <img src="${rule.imageAssetId ? `/assets/${esc(rule.imageAssetId)}.webp` : ""}" class="dm-image-thumb" alt="Attached image">
          <button type="button" class="button danger small-btn" data-remove-image>Remove image</button>
        </div>
        <input type="file" accept="image/*" class="dm-image-file-input" ${rule.imageAssetId ? "hidden" : ""}>
        <span class="field-help">Images are compressed to WebP and saved directly in Cloudflare database.</span>
      </div>
      <div class="form-actions">
        <label class="switch-label"><input type="checkbox" name="active" ${rule.active ? "checked" : ""}><span class="switch"></span>Active</label>
        <div>
          <button class="button danger" name="action" value="delete" formnovalidate data-delete>Delete</button>
          <button class="button primary" name="action" value="save">Save changes</button>
        </div>
      </div>
    </form>
  </details>`;
}

function analytics(rows: ReplyStatsRow[]): string {
  if (!rows.length) return '<div class="empty">No automations yet.</div>';
  const source = (row: ReplyStatsRow): string => row.kind === "text"
    ? "Custom reply · DMs"
    : row.kind === "fallback" ? "KEYWORD fallback · comments" : "Keyword rule · comments + DMs";
  return `<div class="table-scroll"><table><thead><tr><th>Automation</th><th>Comment matches</th><th>DM matches</th><th>DMs sent</th><th>Errors</th><th>Last sent</th></tr></thead><tbody>${rows.map((row) => `<tr><td><strong>${esc(row.label)}</strong><div class="field-help">${source(row)}</div></td><td>${row.kind === "text" ? '<span class="muted">—</span>' : number(row.commentMatches)}</td><td>${row.kind === "fallback" ? '<span class="muted">—</span>' : number(row.dmMatches)}</td><td><span class="sent-value">${number(row.sent)}</span></td><td>${row.errors ? `<span class="error-value">${number(row.errors)}</span>` : '<span class="muted">0</span>'}</td><td class="muted">${row.lastSentAt ? time(row.lastSentAt) : "Not sent yet"}</td></tr>`).join("")}</tbody></table></div><p class="field-help">Matches include test-mode matches. DMs sent counts delivered messages only.</p>`;
}

function filters(value: ActivityFilters): string {
  const options = [["", "All statuses"], ["sent", "Sent"], ["error", "Errors"], ["dry_run_matched", "Test matches"], ["ignored_no_keyword", "No keyword"], ["ignored_owner", "Your comments"]];
  return `<form class="filters" action="/admin#activity" method="get"><label>Status<select name="status">${options.map(([key, name]) => `<option value="${key}" ${value.status === key ? "selected" : ""}>${name}</option>`).join("")}</select></label><label>Keyword<input name="keyword" value="${esc(value.keyword)}" placeholder="Any keyword"></label><label>Username<input name="username" value="${esc(value.username)}" placeholder="@reader"></label><label>Date (UTC)<input name="date" type="date" value="${esc(value.date)}"></label><button class="button secondary">Apply</button><a href="/admin#activity" class="text-link">Clear</a></form>`;
}

const STATUS_NAMES: Record<string, string> = {
  sent: "Sent", sent_public_reply_error: "Public reply failed", send_error: "Send failed", dry_run_matched: "Test match",
  ignored_no_keyword: "No keyword", ignored_no_match: "No match", ignored_owner: "Your comment", ignored_self: "Your message",
  ignored_paused: "Paused", ignored_expired: "Reply window closed", ignored_recipient: "Another account",
  ignored_invalid: "Invalid timestamp", ignored_missing_reply: "Reply removed", received: "Received", retrying: "Retrying"
};

function status(value: string): string {
  return badge(STATUS_NAMES[value] ?? value.replace(/_/g, " "), value === "sent" ? "green" : value.includes("error") ? "red" : value === "dry_run_matched" ? "amber" : "neutral");
}

function comments(rows: RecentEventRow[], dryRun: boolean): string {
  if (!rows.length) return `<div class="empty">${icon("message")}<strong>No matching comments.</strong><p>Comments appear here once Instagram sends them. Clear the filters to see all comments.</p></div>`;
  return `<div class="events">${rows.map((row) => {
    const postTag = row.media_id ? `<span class="event-post-id" title="Instagram Media ID">${icon("instagram")} ${esc(row.media_id)}</span>` : "";
    const keywordDisplay = row.matched_keyword === "ANY_COMMENT" ? "Any comment" : row.matched_keyword ? esc(row.matched_keyword.toUpperCase()) : "";
    return `<article class="event"><div class="event-avatar">${esc((row.username ?? "?").slice(0, 1).toUpperCase())}</div><div class="event-body"><div class="event-title"><strong>${esc(row.username ? "@" + row.username : "Unknown user")}</strong>${time(row.received_at)}</div><p>${esc(row.comment_text)}</p><span class="event-rule">${esc(row.rule_label ?? "No matching automation")}${keywordDisplay ? ` <span>· ${keywordDisplay}</span>` : ""}${postTag ? ` <span>· ${postTag}</span>` : ""}</span>${row.error ? `<details class="error-details"><summary>View error</summary><p>${esc(row.error)}</p></details>` : ""}</div><div class="event-state">${status(row.status)}${!dryRun && (row.status === "send_error" || row.status === "sent_public_reply_error") ? `<form action="/admin/events/${encodeURIComponent(row.comment_id)}/retry" method="post"><button class="text-link">${row.status === "sent_public_reply_error" ? "Retry public reply" : "Retry send"} ↗</button></form>` : ""}</div></article>`;
  }).join("")}</div><p class="field-help">Showing the latest ${rows.length} matching comments (up to 50).</p>`;
}

function messages(rows: RecentMessageRow[]): string {
  if (!rows.length) return `<div class="empty">${icon("mail")}<strong>No DMs yet.</strong><p>Subscribe to the messages, messaging_postbacks and messaging_referral webhooks to receive them.</p></div>`;
  return `<div class="events">${rows.map((row) => `<article class="event"><div class="event-avatar">${icon("message")}</div><div class="event-body"><div class="event-title"><strong>${row.sender_username ? `@${esc(row.sender_username.replace(/^@/, ""))}` : `Instagram user · ${esc(row.sender_id.slice(-6))}`}</strong>${time(row.received_at)}</div>${row.message_text ? `<p>${esc(row.message_text)}</p>` : ""}<span class="event-rule">${esc(row.matched_choice ?? "No matching automation")}</span>${renderDmMessageContext(row)}${row.error ? `<details class="error-details"><summary>View error</summary><p>${esc(row.error)}</p></details>` : ""}</div><div class="event-state">${status(row.status)}</div></article>`).join("")}</div>`;
}

function newRuleDialog(): string {
  return `<dialog id="new-rule"><div class="dialog-heading"><div><h2>New automation</h2></div><button class="close-dialog" aria-label="Close dialog" type="button">×</button></div><form method="post" action="/admin/rules" class="stack">
    <label>Automation name<input name="label" placeholder="Post promotion / Lead magnet" maxlength="100" required></label>
    <div>
      <span class="field-label-text">Target post</span>
      <div class="segmented-control">
        <label><input type="radio" name="post_scope" value="all" checked><span>All posts &amp; reels</span></label>
        <label><input type="radio" name="post_scope" value="specific"><span>Specific post or reel</span></label>
      </div>
    </div>
    <div class="specific-post-box" hidden>
      <div class="two-fields">
        <label>Post URL or Media ID
          <input name="post_id" placeholder="e.g. 17923456789 or https://www.instagram.com/p/...">
          <span class="field-help">Instagram numeric Media ID or paste post URL</span>
        </label>
        <label>Post link <span class="optional">optional</span>
          <input name="post_url" type="url" placeholder="https://www.instagram.com/p/...">
        </label>
      </div>
      <div class="post-picker-bar">
        <button type="button" class="button secondary small-btn" data-load-posts>${icon("instagram")} Browse recent posts</button>
        <span class="field-help recent-posts-status"></span>
      </div>
    </div>
    <div class="trigger-mode-box">
      <span class="field-label-text">When someone comments</span>
      <div class="trigger-options">
        <label class="trigger-opt">
          <input type="radio" name="match_type" value="contains" checked>
          <div><strong>Contains keywords</strong><span>Comment contains any keyword</span></div>
        </label>
        <label class="trigger-opt">
          <input type="radio" name="match_type" value="exact">
          <div><strong>Exact word or phrase</strong><span>Comment matches exact word (e.g. PROMPT)</span></div>
        </label>
        <label class="trigger-opt">
          <input type="radio" name="match_type" value="any">
          <div><strong>Any comment</strong><span>Any comment on this post triggers the reply</span></div>
        </label>
      </div>
    </div>
    <label class="keywords-field">Keywords
      <input name="keywords" placeholder="GUIDE, checklist, free" required>
      <span class="field-help">Separate multiple keywords with commas. Matches without case sensitivity.</span>
    </label>
    <label>DM message<textarea name="reply_text" rows="3" placeholder="Here’s the link: https://…" required></textarea></label>
    <label>Public comment reply <span class="optional">optional · one variation per line</span><textarea name="public_reply_text" rows="2" placeholder="Sent you a DM!&#10;Check your inbox!"></textarea></label>
    <div class="two-fields">
      <label>Button link<input name="link_url" type="url" placeholder="https://…"></label>
      <label>Button label<input name="link_button_label" maxlength="20" placeholder="Read more"></label>
    </div>
    <label class="checkbox-opt">
      <input type="checkbox" name="use_bridge" checked>
      <span>Open link via 3-second profile waiting page</span>
    </label>
    <div class="image-attachment-box">
      <span class="field-label-text">DM image attachment <span class="optional">optional · WebP</span></span>
      <input type="hidden" name="image_asset_id" value="">
      <div class="image-preview-wrapper" hidden>
        <img src="" class="dm-image-thumb" alt="Attached image">
        <button type="button" class="button danger small-btn" data-remove-image>Remove image</button>
      </div>
      <input type="file" accept="image/*" class="dm-image-file-input">
      <span class="field-help">Images are compressed to WebP and saved directly in Cloudflare database.</span>
    </div>
    <div class="form-actions">
      <label class="switch-label"><input name="active" type="checkbox" checked><span class="switch"></span>Active</label>
      <button class="button primary">Create automation ${icon("arrow")}</button>
    </div>
  </form></dialog>`;
}

const clientScript = `
const dialog = document.getElementById('new-rule');
document.querySelectorAll('[data-new-rule]').forEach(button => button.addEventListener('click', () => dialog.showModal()));
document.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
document.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', event => { if (!confirm('Delete this automation?')) event.preventDefault(); }));
document.getElementById('rule-search').addEventListener('input', event => { const query = event.target.value.trim().toLowerCase(); const rules = [...document.querySelectorAll('[data-search]')]; let count = 0; rules.forEach(rule => { rule.hidden = !rule.dataset.search.includes(query); if (!rule.hidden) count++; }); document.getElementById('no-rules').hidden = count > 0 || !query; });
const previewPanel = document.getElementById('reply-preview');
const previewMessage = document.getElementById('preview-message');
const previewButtons = document.getElementById('preview-buttons');
function validPreviewUrl(value) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; } }
function previewLink(title, url) { const link = document.createElement('a'); const href = validPreviewUrl(url); link.textContent = title; if (href) { link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; } return link; }
function showPreview(config) {
  document.getElementById('preview-heading').textContent = (config.title || 'Reply preview').toUpperCase();
  document.getElementById('preview-keyword').textContent = config.keyword || 'KEYWORD';
  document.getElementById('preview-source').textContent = config.source;
  previewPanel.setAttribute('aria-label', (config.title || 'Reply') + ' preview');
  previewMessage.textContent = config.text || 'Your message appears here.';
  previewButtons.replaceChildren();
  (config.buttons || []).forEach(button => { if (validPreviewUrl(button.url)) previewButtons.append(previewLink(button.title + ' ↗', button.url)); });
  const publicReplies = (config.publicReply || '').split(String.fromCharCode(10)).map(text => text.trim()).filter(Boolean);
  document.getElementById('preview-public').hidden = !publicReplies.length;
  document.getElementById('preview-public-label').textContent = publicReplies.length > 1 ? 'Public reply · 1 of ' + publicReplies.length : 'Public reply';
  document.getElementById('preview-public-text').textContent = publicReplies[0] || '';
  document.getElementById('preview-note').textContent = config.active ? 'Preview only. No messages are sent.' : 'Paused. This automation will not send replies.';
}
function previewRule(card) {
  const config = JSON.parse(card.dataset.preview);
  const form = card.querySelector('form');
  config.title = form.elements.namedItem('label').value || 'Reply';
  const matchType = form.querySelector('input[name="match_type"]:checked')?.value || 'contains';
  const isSpecific = form.querySelector('input[name="post_scope"]:checked')?.value === 'specific';
  config.source = isSpecific ? 'POST COMMENT → DM' : 'COMMENT → DM';
  const rawKey = form.elements.namedItem('keywords')?.value.split(',')[0].trim().toUpperCase() || '';
  if (matchType === 'any') {
    config.keyword = 'ANY COMMENT';
  } else if (matchType === 'exact') {
    config.keyword = 'EXACT: ' + (rawKey || 'WORD');
  } else {
    config.keyword = rawKey || 'KEYWORD';
  }
  config.active = form.elements.namedItem('active').checked;
  config.publicReply = form.elements.namedItem('public_reply_text').value;
  config.text = form.elements.namedItem('reply_text').value;
  config.buttons = [{ title: form.elements.namedItem('link_button_label').value, url: form.elements.namedItem('link_url').value }].filter(button => button.title && button.url);
  showPreview(config);
}
document.querySelectorAll('.rule-card').forEach(card => {
  card.addEventListener('toggle', () => { if (card.open) previewRule(card); });
  card.addEventListener('focusin', () => { if (card.open) previewRule(card); });
  card.addEventListener('input', () => previewRule(card));
});
function initAutomationForms(root) {
  root.querySelectorAll('form').forEach(form => {
    const postScopeRadios = form.querySelectorAll('input[name="post_scope"]');
    const specificBox = form.querySelector('.specific-post-box');
    const updateScope = () => {
      const isSpecific = form.querySelector('input[name="post_scope"]:checked')?.value === 'specific';
      if (specificBox) specificBox.hidden = !isSpecific;
    };
    postScopeRadios.forEach(radio => radio.addEventListener('change', updateScope));

    const matchTypeRadios = form.querySelectorAll('input[name="match_type"]');
    const keywordsField = form.querySelector('.keywords-field');
    const keywordsInput = keywordsField?.querySelector('input[name="keywords"]');
    const updateMatch = () => {
      const matchType = form.querySelector('input[name="match_type"]:checked')?.value || 'contains';
      if (keywordsField) {
        keywordsField.hidden = matchType === 'any';
        if (keywordsInput) keywordsInput.required = matchType !== 'any';
      }
    };
    matchTypeRadios.forEach(radio => radio.addEventListener('change', updateMatch));

    const browseBtn = form.querySelector('[data-load-posts]');
    const statusEl = form.querySelector('.recent-posts-status');
    const postIdInput = form.querySelector('input[name="post_id"]');
    const postUrlInput = form.querySelector('input[name="post_url"]');
    let cachedMedia = null;
    if (browseBtn) {
      browseBtn.addEventListener('click', async () => {
        let gallery = form.querySelector('.post-gallery-modal');
        if (gallery) {
          gallery.remove();
          if (statusEl) statusEl.textContent = '';
          return;
        }

        browseBtn.disabled = true;
        if (statusEl) statusEl.textContent = 'Loading posts…';
        try {
          if (!cachedMedia) {
            const res = await fetch('/admin/media');
            const data = await res.json();
            if (data.ok && Array.isArray(data.media)) {
              cachedMedia = data.media;
            } else {
              cachedMedia = [];
            }
          }

          if (cachedMedia && cachedMedia.length > 0) {
            if (statusEl) statusEl.textContent = cachedMedia.length + ' posts available. Click a post to select:';
            gallery = document.createElement('div');
            gallery.className = 'post-gallery-modal';

            const currentId = (postIdInput?.value || '').trim();

            const header = document.createElement('div');
            header.className = 'post-gallery-header';
            header.innerHTML = '<input type="search" placeholder="Filter ' + cachedMedia.length + ' posts by name or ID…" class="post-gallery-search" aria-label="Filter posts">' +
              '<span class="post-gallery-count">' + cachedMedia.length + ' posts</span>' +
              '<button type="button" class="post-gallery-close" title="Close post list" aria-label="Close">✕</button>';

            const scrollList = document.createElement('div');
            scrollList.className = 'post-gallery-scroll';

            cachedMedia.forEach((m, idx) => {
              const num = idx + 1;
              const isSelected = currentId && (currentId === m.id || (m.permalink && currentId.includes(m.id)));
              const card = document.createElement('div');
              card.className = 'post-card-item' + (isSelected ? ' is-selected' : '');
              card.dataset.id = m.id;
              card.dataset.search = ((m.caption || '') + ' ' + m.id + ' ' + (m.mediaType || '')).toLowerCase();

              const safeCaption = m.caption ? m.caption.replace(/</g, '&lt;').replace(/>/g, '&gt;') : ('Instagram Post #' + num);
              const typeIcon = m.mediaType === 'VIDEO' ? '🎬' : m.mediaType === 'CAROUSEL_ALBUM' ? '🎠' : '📷';
              const typeLabel = m.mediaType === 'VIDEO' ? 'REEL' : m.mediaType === 'CAROUSEL_ALBUM' ? 'CAROUSEL' : 'POST';

              let thumbHtml = '';
              if (m.thumbnailUrl) {
                thumbHtml = '<img src="' + m.thumbnailUrl + '" alt="Post #' + num + '" class="post-card-thumb-img" loading="lazy">' +
                  '<div class="post-card-thumb-fallback" style="display:none">' + typeIcon + '<span>#' + num + '</span></div>';
              } else {
                thumbHtml = '<div class="post-card-thumb-fallback">' + typeIcon + '<span>#' + num + '</span></div>';
              }

              card.innerHTML = '<span class="post-num-badge">#' + num + '</span>' +
                '<div class="post-card-thumb-box">' + thumbHtml + '</div>' +
                '<div class="post-card-content">' +
                  '<div class="post-card-name" title="' + safeCaption + '">' + safeCaption + '</div>' +
                  '<div class="post-card-meta">' +
                    '<span class="post-type-tag">' + typeIcon + ' ' + typeLabel + '</span>' +
                    '<span class="post-card-id">ID: ' + m.id + '</span>' +
                    (m.permalink ? '<a href="' + m.permalink + '" target="_blank" rel="noopener noreferrer" class="post-card-ig-link" onclick="event.stopPropagation()">View on IG ↗</a>' : '') +
                  '</div>' +
                '</div>' +
                '<span class="post-select-cta">' + (isSelected ? '✓ Selected' : 'Select') + '</span>';

              const thumbImg = card.querySelector('.post-card-thumb-img');
              if (thumbImg) {
                thumbImg.addEventListener('error', () => {
                  thumbImg.style.display = 'none';
                  const fb = card.querySelector('.post-card-thumb-fallback');
                  if (fb) fb.style.display = 'flex';
                });
              }

              card.addEventListener('click', () => {
                scrollList.querySelectorAll('.post-card-item').forEach(el => {
                  el.classList.remove('is-selected');
                  const cta = el.querySelector('.post-select-cta');
                  if (cta) cta.textContent = 'Select';
                });
                card.classList.add('is-selected');
                const cta = card.querySelector('.post-select-cta');
                if (cta) cta.textContent = '✓ Selected';

                if (postIdInput) postIdInput.value = m.id;
                if (postUrlInput && m.permalink) postUrlInput.value = m.permalink;
                if (statusEl) statusEl.textContent = '✓ Selected Post #' + num + ' (' + m.id + ')';

                let selBadge = form.querySelector('.selected-post-preview-pill');
                if (!selBadge && postIdInput) {
                  selBadge = document.createElement('div');
                  selBadge.className = 'selected-post-preview-pill';
                  postIdInput.parentNode.appendChild(selBadge);
                }
                if (selBadge) {
                  selBadge.innerHTML = '<span><strong>Post #' + num + ':</strong> ' + (m.caption || m.id).slice(0, 40) + '…</span>';
                }

                const ruleCard = form.closest('.rule-card');
                if (ruleCard) previewRule(ruleCard);
              });

              scrollList.appendChild(card);
            });

            gallery.appendChild(header);
            gallery.appendChild(scrollList);

            const pickerBar = browseBtn.closest('.post-picker-bar');
            if (pickerBar) {
              pickerBar.insertAdjacentElement('afterend', gallery);
            } else {
              browseBtn.parentNode.insertAdjacentElement('afterend', gallery);
            }

            const searchInput = header.querySelector('.post-gallery-search');
            searchInput.addEventListener('input', () => {
              const q = searchInput.value.toLowerCase().trim();
              let visibleCount = 0;
              scrollList.querySelectorAll('.post-card-item').forEach(item => {
                const text = item.dataset.search || '';
                const match = !q || text.includes(q);
                item.hidden = !match;
                if (match) visibleCount++;
              });
              const countEl = header.querySelector('.post-gallery-count');
              if (countEl) countEl.textContent = visibleCount + ' posts';
            });

            header.querySelector('.post-gallery-close').addEventListener('click', () => {
              gallery.remove();
              if (statusEl) statusEl.textContent = '';
            });

          } else {
            if (statusEl) statusEl.textContent = 'No posts returned from Meta. You can enter Post URL or Media ID manually.';
          }
        } catch (err) {
          console.error(err);
          if (statusEl) statusEl.textContent = 'Could not load posts. You can enter Post URL or Media ID manually.';
        } finally {
          browseBtn.disabled = false;
        }
      });
    }
  });
}
initAutomationForms(document);
function compressToWebP(file, maxWidth = 1000, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth || h > maxWidth) {
          if (w > h) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
          else { w = Math.round((w * maxWidth) / h); h = maxWidth; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/webp', quality);
        resolve({ dataUrl, filename: (file.name || 'image').replace(/\.[^.]+$/, '') + '.webp' });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function initMediaUploads(root) {
  root.querySelectorAll('.dm-image-file-input').forEach(input => {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const box = input.closest('.image-attachment-box');
      if (!box) return;
      const assetIdInput = box.querySelector('input[name="image_asset_id"]');
      const previewWrapper = box.querySelector('.image-preview-wrapper');
      const thumb = box.querySelector('.dm-image-thumb');
      try {
        input.disabled = true;
        const compressed = await compressToWebP(file);
        const res = await fetch('/admin/assets', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filename: compressed.filename, data_base64: compressed.dataUrl, mime_type: 'image/webp' })
        });
        const data = await res.json();
        if (data.ok && data.id) {
          if (assetIdInput) assetIdInput.value = data.id;
          if (thumb) thumb.src = data.url;
          if (previewWrapper) previewWrapper.hidden = false;
          input.hidden = true;
        } else {
          alert(data.error || 'Failed to upload image.');
        }
      } catch (err) {
        alert('Image processing error: ' + (err.message || err));
      } finally {
        input.disabled = false;
        input.value = '';
      }
    });
  });

  root.querySelectorAll('[data-remove-image]').forEach(btn => {
    btn.addEventListener('click', () => {
      const box = btn.closest('.image-attachment-box');
      if (!box) return;
      const assetIdInput = box.querySelector('input[name="image_asset_id"]');
      const previewWrapper = box.querySelector('.image-preview-wrapper');
      const fileInput = box.querySelector('.dm-image-file-input');
      if (assetIdInput) assetIdInput.value = '';
      if (previewWrapper) previewWrapper.hidden = true;
      if (fileInput) fileInput.hidden = false;
    });
  });

  const avatarInput = root.querySelector('.bridge-avatar-input');
  if (avatarInput) {
    avatarInput.addEventListener('change', async () => {
      const file = avatarInput.files?.[0];
      if (!file) return;
      const box = avatarInput.closest('.avatar-upload-box');
      if (!box) return;
      const assetIdInput = box.querySelector('input[name="profile_pic_asset_id"]');
      const dataInput = box.querySelector('input[name="profile_pic_data"]');
      const previewCircle = box.querySelector('.avatar-preview-circle');
      try {
        avatarInput.disabled = true;
        const compressed = await compressToWebP(file, 600, 0.88);
        const res = await fetch('/admin/assets', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filename: 'profile_' + compressed.filename, data_base64: compressed.dataUrl, mime_type: 'image/webp' })
        });
        const data = await res.json();
        if (data.ok && data.id) {
          if (assetIdInput) assetIdInput.value = data.id;
          if (dataInput) dataInput.value = compressed.dataUrl;
          if (previewCircle) {
            previewCircle.innerHTML = '<img src="' + data.url + '" class="bridge-avatar-preview" alt="Profile avatar">';
          }
        } else {
          alert(data.error || 'Failed to upload avatar.');
        }
      } catch (err) {
        alert('Avatar upload error: ' + (err.message || err));
      } finally {
        avatarInput.disabled = false;
      }
    });
  }
}
initMediaUploads(document);
const tabs = [...document.querySelectorAll('[data-tab]')];
function selectTab(tab) { tabs.forEach(item => { const active = item === tab; item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1; document.getElementById(item.dataset.tab).hidden = !active; }); }
tabs.forEach((tab, index) => { tab.addEventListener('click', () => selectTab(tab)); tab.addEventListener('keydown', event => { if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; tabs[next].focus(); selectTab(tabs[next]); } }); });
if (location.hash === '#messages' && tabs[1]) selectTab(tabs[1]);
document.querySelectorAll('.primary-nav a').forEach(link => link.addEventListener('click', () => { document.querySelectorAll('.primary-nav a').forEach(item => item.classList.toggle('selected', item === link)); }));
document.querySelectorAll('form').forEach(form => form.addEventListener('submit', () => { form.setAttribute('aria-busy', 'true'); }));
`;

const styles = `
.checkbox-opt{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:500;color:#354d3e;cursor:pointer;margin:6px 0}
.checkbox-opt input{accent-color:#3e674b}
.image-attachment-box{background:#f9faf6;border:1px solid #e1e7da;border-radius:9px;padding:12px;margin:10px 0}
.image-preview-wrapper{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.dm-image-thumb{width:68px;height:68px;object-fit:cover;border-radius:8px;border:1px solid #c8d4bf;background:#fff}
.dm-image-file-input{font-size:11px;width:100%}
.bridge-panel{margin-top:26px}
.bridge-top-grid{display:grid;grid-template-columns:220px 1fr;gap:24px;margin-bottom:16px}
@media(max-width:820px){.bridge-top-grid{grid-template-columns:1fr}}
.avatar-upload-box{display:flex;flex-direction:column;align-items:center;text-align:center;padding:16px;background:#f9faf6;border:1px solid #e1e7da;border-radius:12px}
.avatar-preview-circle{width:90px;height:90px;border-radius:50%;overflow:hidden;border:3px solid #3e674b;background:#e9dfcc;margin:10px 0 12px;display:flex;align-items:center;justify-content:center}
.bridge-avatar-preview{width:100%;height:100%;object-fit:cover}
.avatar-placeholder{font-size:26px;font-weight:700;color:#5a685c}
.bridge-avatar-input{font-size:11px;width:100%;margin-bottom:6px}
.bridge-fields-column{display:flex;flex-direction:column;gap:12px}
.connection-panel{margin-top:26px}
.connection-panel>p{font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:14px}
.connection-dates{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:18px;margin:22px 0}
.connection-dates dt{font-size:10px;color:var(--muted);margin-bottom:6px}
.connection-dates dd{margin:0;font-size:12px}
.connection-panel .form-actions form{margin:0}
.button:disabled{cursor:default;opacity:.55}
.badge.blue{background:#e7f0fa;color:#24588a}
.badge.purple{background:#f3e8ff;color:#6b21a8}
.field-label-text{font-size:11px;font-weight:600;display:block;margin-bottom:6px;color:#3d4f40}
.segmented-control{display:inline-flex;background:#ebf0e4;border-radius:8px;padding:3px;gap:3px;border:1px solid #dce4d2}
.segmented-control label{font-size:11px;cursor:pointer;margin:0}
.segmented-control input{position:absolute;opacity:0;pointer-events:none}
.segmented-control span{display:block;padding:5px 12px;border-radius:6px;font-weight:500;color:#5a685c;transition:background .15s,color .15s}
.segmented-control input:checked+span{background:#fff;color:#233b32;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.specific-post-box{background:#f9faf6;border:1px solid #e1e7da;border-radius:9px;padding:12px;margin:10px 0}
.post-picker-bar{display:flex;align-items:center;gap:12px;margin-top:8px}
.small-btn{padding:5px 10px;font-size:10px;min-height:30px}
.trigger-mode-box{margin:12px 0}
.trigger-options{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
@media(max-width:760px){.trigger-options{grid-template-columns:1fr}}
.trigger-opt{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border:1px solid #dde3d5;border-radius:8px;cursor:pointer;background:#fff;transition:border-color .15s,background .15s}
.trigger-opt:hover{border-color:#aac18c;background:#fbfcf9}
.trigger-opt input{margin-top:3px;accent-color:#3e674b}
.trigger-opt div strong{display:block;font-size:11px;font-weight:600;color:#29372f}
.trigger-opt div span{display:block;font-size:9px;color:var(--muted);margin-top:2px;line-height:1.3}
.trigger-opt:has(input:checked){border-color:#3e674b;background:#f3f7ee}
.event-post-id{display:inline-flex;align-items:center;gap:3px;color:#24588a;font-size:9px;background:#e7f0fa;padding:1px 5px;border-radius:4px}
.event-post-id .icon{width:11px;height:11px}
.post-gallery-modal{margin-top:10px;background:#ffffff;border:1px solid #dce4d2;border-radius:12px;padding:12px;box-shadow:0 4px 18px rgba(0,0,0,.07)}
.post-gallery-header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #edf2e8}
.post-gallery-search{flex:1;font-size:11px;padding:7px 10px;border:1px solid #d5ded0;border-radius:7px;background:#fcfdfa}
.post-gallery-count{font-size:11px;font-weight:600;color:#556858;white-space:nowrap}
.post-gallery-close{background:none;border:0;color:#78867a;font-size:14px;cursor:pointer;padding:4px 8px;border-radius:5px}
.post-gallery-close:hover{background:#f1f5eb;color:#233b32}
.post-gallery-scroll{max-height:290px;overflow-y:auto;display:flex;flex-direction:column;gap:7px;padding-right:4px}
.post-gallery-scroll::-webkit-scrollbar{width:6px}
.post-gallery-scroll::-webkit-scrollbar-track{background:#f1f4ed;border-radius:4px}
.post-gallery-scroll::-webkit-scrollbar-thumb{background:#c3cfbe;border-radius:4px}
.post-gallery-scroll::-webkit-scrollbar-thumb:hover{background:#9fae99}
.post-card-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;background:#f9faf6;border:1px solid #e2e8db;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}
.post-card-item:hover{background:#f2f7ec;border-color:#8eaa60;transform:translateY(-1px)}
.post-card-item.is-selected{background:#ebf5df;border-color:#3e674b;box-shadow:0 0 0 2px rgba(62,103,75,.2)}
.post-num-badge{font-size:11px;font-weight:700;color:#284333;background:#dcebaf;padding:3px 7px;border-radius:6px;min-width:32px;text-align:center;flex-shrink:0}
.post-card-thumb-box{width:54px;height:54px;border-radius:8px;overflow:hidden;background:#e5ece0;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:1px solid #d5ded0}
.post-card-thumb-img{width:100%;height:100%;object-fit:cover;display:block}
.post-card-thumb-fallback{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#5d6f5f;background:linear-gradient(135deg,#e4eee0 0%,#d5e5cf 100%);gap:2px}
.post-card-content{flex:1;min-width:0}
.post-card-name{font-size:12px;font-weight:600;color:#24382c;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px}
.post-card-meta{display:flex;align-items:center;gap:8px;font-size:10px;color:#6c7b6f;flex-wrap:wrap}
.post-type-tag{font-size:9px;font-weight:600;padding:1px 5px;border-radius:4px;background:#e3ebdc;color:#38513e}
.post-card-id{font-family:monospace;font-size:9.5px;color:#556758}
.post-card-ig-link{font-size:9.5px;color:#335b40;text-decoration:underline}
.post-card-ig-link:hover{color:#1e3726}
.post-select-cta{font-size:10px;font-weight:600;padding:5px 9px;border-radius:6px;background:#e8efe2;color:#2d4734;flex-shrink:0;border:1px solid #d0deca;transition:all .15s}
.post-card-item:hover .post-select-cta,.post-card-item.is-selected .post-select-cta{background:#3e674b;color:#fff;border-color:#3e674b}
.selected-post-preview-pill{display:inline-flex;align-items:center;gap:6px;background:#ebf5df;border:1px solid #b7cfa6;border-radius:7px;padding:4px 9px;font-size:10.5px;color:#2b4933;margin-top:6px}
:root{--bg:#f6f7f3;--panel:#fff;--ink:#233b32;--text:#29372f;--muted:#768078;--line:#e4e8df;--green:#3e674b;--lime:#dcebaf;--soft:#f1f5eb;--amber:#93682b;--radius:14px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);font-size:14px;line-height:1.5;color-scheme:light}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:28px}
body{margin:0;background:var(--bg)}
button,input,textarea,select{font:inherit}
button,a,input,textarea,select,summary{-webkit-tap-highlight-color:transparent}
button,a{touch-action:manipulation}
button{cursor:pointer}
a{color:inherit;text-decoration:none}
button{border:0}
button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #8eaa60;outline-offset:4px}
input:focus,textarea:focus,select:focus{outline:0;border-color:#7d9563;box-shadow:0 0 0 3px #a4be7529}
h1,h2,h3,p{margin:0}
h2{font-size:20px;letter-spacing:-.5px;font-weight:600}
button .icon{flex:none}
.icon{width:20px;height:20px;display:inline-block;flex:none;vertical-align:middle}
.muted{color:var(--muted)}
.small{font-size:12px}
.sr-only,.skip:not(:focus){position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.skip:focus{position:fixed;left:15px;top:10px;padding:10px;background:white;z-index:100}
[hidden]{display:none!important}
.sidebar{position:fixed;inset:0 auto 0 0;width:242px;background:#203d32;color:#eaf0df;display:flex;flex-direction:column;padding:36px 22px 18px;z-index:10}
.brand{display:flex;gap:12px;align-items:center;font-size:27px;letter-spacing:-1px;font-weight:600;margin-bottom:55px;padding:0 7px}
.brand-mark{display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;background:var(--lime);color:#294632;width:39px;height:43px;border-radius:13px 13px 13px 3px;font-size:35px;position:relative;line-height:1;padding-bottom:7px}
.brand-mark span{font-family:Arial;font-size:14px;position:absolute;right:4px;top:4px}
.brand-sub{display:block;color:#a4b4a5;font-size:8px;letter-spacing:1.6px;font-weight:500;margin-top:1px}
.workspace-label{font-size:9px;letter-spacing:1.8px;color:#9bae9d;padding:0 14px;margin-bottom:15px}
.primary-nav{display:flex;flex-direction:column;gap:6px}
.primary-nav>a{padding:12px 13px;display:flex;align-items:center;gap:12px;border-radius:8px;color:#c4d0c3;font-size:12px;transition:background .15s}
.primary-nav>a:hover{background:#2e4b3e}
.primary-nav>a.selected{background:#dae9b1;color:#213b2c;font-weight:600}
.primary-nav .icon{width:18px;height:18px}
.nav-count{margin-left:auto;font-size:10px;background:#49634b;color:#e8efdf;border-radius:5px;padding:1px 6px}
.sidebar-bottom{margin-top:auto;padding-top:50px}
.account{border-top:1px solid #49604e;padding:23px 2px 14px;display:flex;align-items:center;gap:10px}
.account strong{font-size:12px;display:block;font-weight:500}
.account span{color:#9eb19f;display:block;font-size:9px;margin-top:3px}
.account>.icon{margin-left:auto;width:17px;color:#b5c8ad}
.avatar{width:37px;height:37px;flex:none;display:flex;align-items:center;justify-content:center;background:#f0e5ce;color:#65583f;border:3px solid #ffffff29;border-radius:50%;font-family:Georgia;font-size:12px}
.account-actions{display:flex;align-items:center;justify-content:space-between;color:#adbfad;font-size:10px;padding-left:5px}
.account-actions .icon{width:12px;height:12px;margin-left:4px}
.logout{background:none;color:#adbfad;padding:8px}
.logout .icon{width:16px;height:16px}
.mobile-logout{display:none}
.page{margin-left:242px}
.topbar{height:74px;border-bottom:1px solid var(--line);background:#f9faf6;display:flex;justify-content:space-between;align-items:center;padding:0 46px;font-size:11px;color:var(--muted)}
.topbar strong{color:#425243;font-weight:500}
.slash{padding:0 14px;color:#c3c9bd}
.topbar>div{display:flex;align-items:center;gap:20px}
.mini-avatar{width:29px;height:29px;border-radius:50%;background:#e9dfcc;display:grid;place-items:center;color:#615b43;font-size:10px}
main{max-width:1500px;margin:0 auto;padding:38px 46px 32px}
.hero{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:31px}
.eyebrow{font-size:9px;letter-spacing:1.6px;font-weight:600;color:#7a886f;margin-bottom:9px}
.hero h1{font-family:Georgia,'Times New Roman',serif;font-size:40px;font-weight:400;line-height:1.2;letter-spacing:-1.5px;color:#263f32;margin-bottom:12px}
.hero h1>span{color:#87a15c}
.hero>div>p:last-child{color:var(--muted);font-size:12px}
.button{display:inline-flex;align-items:center;justify-content:center;gap:9px;border-radius:7px;padding:10px 15px;font-size:11px;font-weight:600;white-space:nowrap;border:1px solid transparent;min-height:39px;transition:background .15s,transform .15s}
.button:hover{transform:translateY(-1px)}
.button .icon{width:15px;height:15px}
.primary{background:#335b40;color:#fff}
.primary:hover{background:#25482f}
.secondary{background:#fff;color:#3f563f;border-color:#dbe2d2}
.secondary:hover{background:var(--soft)}
.danger{color:#a35442;background:transparent}
.danger:hover{background:#fff2ec}
.full{width:100%}
.badge{display:inline-flex;align-items:center;gap:5px;font-size:9px;line-height:1.5;font-weight:500;padding:4px 8px;border-radius:5px;white-space:nowrap;background:#eff1ec;color:#727d6b}
.badge i{width:4px;height:4px;border-radius:50%;background:currentColor}
.badge.green{background:#ecf2e6;color:#4f7042}
.badge.amber{background:#faf0dd;color:#8f6730}
.badge.red{background:#f9e9e3;color:#a04b3d}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px;margin-bottom:37px}
.stat{border:1px solid var(--line);background:#fff;border-radius:var(--radius);padding:19px 20px 17px;min-height:145px;display:flex;flex-direction:column;gap:7px}
.stat-label{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#657461}
.stat-label .icon{width:16px;height:16px;color:#94a084}
.stat>strong{font-size:34px;font-weight:500;line-height:1.2;letter-spacing:-1.6px;color:#314a36}
.stat>span{font-size:9px;color:var(--muted);margin-top:auto}
.stat.featured{background:#eaf0dc;border-color:#dfe7cd}
.stat.featured .stat-label,.stat.featured>span{color:#617647}
.studio-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:26px;align-items:start}
.automation-column{min-width:0}
.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
.section-heading .eyebrow{margin-bottom:5px}
.count{padding:5px 9px;border:1px solid var(--line);border-radius:6px;font-size:10px;color:#7d8576}
.search-field{display:flex;align-items:center;gap:9px;margin-bottom:16px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:#fff}
.search-field .icon{width:15px;height:15px;color:#8d9984}
.search-field input{border:0;padding:11px 0;font-size:11px;box-shadow:none;min-width:0}
.search-field:focus-within{outline:2px solid #aac18c}
.rule-list{display:flex;flex-direction:column;gap:11px}
.rule-card{background:#fff;border:1px solid var(--line);border-radius:11px;overflow:hidden}
.rule-card>summary{display:flex;align-items:center;gap:13px;padding:19px 17px;cursor:pointer;list-style:none}
.rule-card>summary::-webkit-details-marker{display:none}
.rule-card>summary:hover{background:#fcfdf9}
.flow-icon{width:40px;height:40px;display:flex;align-items:center;justify-content:center;flex:none;background:#f1f1e8;border:1px solid #e9ebdf;border-radius:10px;color:#808565}
.flow-icon.mail{background:#eaf0eb;color:#638572}
.rule-summary{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}
.rule-summary>strong{font-size:12px;font-weight:600;overflow-wrap:anywhere}
.rule-meta{font-size:9px;color:#7e8878}
.tiny-arrow{margin:0 5px;color:#a9b19e}
.chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}
.chips>span,.inline-keyword{font-family:ui-monospace,SFMono-Regular,monospace;font-size:9px;padding:2px 6px;border:1px solid #e7eadf;background:#f8f9f4;color:#6b795c;border-radius:4px}
.rule-end{display:flex;align-items:flex-end;flex-direction:column;gap:8px}
.delivery-count{font-size:9px;color:#8b9484}
.chevron{margin-left:6px;color:#8b9484;transition:transform .2s}
.rule-card[open] .chevron{transform:rotate(180deg)}
.rule-edit{border-top:1px solid var(--line);padding:20px;display:flex;flex-direction:column;gap:16px}
.paused .flow-icon{opacity:.6}
.panel{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:24px}
.title-with-icon{display:flex;align-items:center;gap:12px}
.title-with-icon .eyebrow{font-size:8px;letter-spacing:1.1px}
.section-description{color:var(--muted);font-size:11px;line-height:1.8;margin-bottom:21px}
.stack{display:flex;flex-direction:column;gap:17px}
label{display:flex;flex-direction:column;gap:7px;font-size:10px;font-weight:600;color:#52634b;min-width:0}
input,select,textarea{background:#fff;color:#34482f;border:1px solid #dfe5d8;border-radius:7px;padding:11px 12px;width:100%;font-size:12px;font-weight:400;transition:border-color .15s,box-shadow .15s}
textarea{resize:vertical;min-height:65px;line-height:1.65}
input::placeholder,textarea::placeholder{color:#a0a996;font-size:11px}
.field-help{font-size:9px;color:#88917f;font-weight:400;line-height:1.7}
.advanced{border:1px solid var(--line);border-radius:8px;padding:12px}
.advanced>summary{font-size:10px;font-weight:500;color:#68765d;cursor:pointer}
.advanced>summary>span{font-weight:400;color:#929a8a;float:right;font-size:9px}
.advanced textarea{margin-top:13px}
.two-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.form-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:17px;border-top:1px solid var(--line);margin-top:3px}
.form-actions>div{display:flex;gap:6px}
.switch-label{flex-direction:row;align-items:center;position:relative;cursor:pointer;font-size:10px;gap:8px;font-weight:500}
.switch-label input{position:absolute;width:32px;height:19px;opacity:0;margin:0}
.switch{width:30px;height:17px;border-radius:20px;background:#d6dccf;position:relative;flex:none}
.switch:after{content:'';position:absolute;width:11px;height:11px;left:3px;top:3px;background:white;border-radius:50%;transition:transform .15s}
.switch-label input:checked+.switch{background:#63844b}
.switch-label input:checked+.switch:after{transform:translateX(13px)}
.switch-label input:focus-visible+.switch{outline:3px solid #8da663;outline-offset:3px}
.optional{font-size:9px;color:#939c89;font-weight:400;display:inline}
.right-column{position:sticky;top:24px;display:flex;flex-direction:column;gap:24px}
.preview-panel{background:#fff;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.preview-heading{display:flex;justify-content:space-between;align-items:center;padding:17px 21px;border-bottom:1px solid var(--line)}
.preview-heading .eyebrow{font-size:8px;margin:0}
.preview-tag{font-size:8px;color:#969e8e;border:1px solid var(--line);border-radius:4px;padding:3px 6px}
.chat-header{display:flex;gap:9px;align-items:center;padding:18px 21px;border-bottom:1px solid #eef0e8}
.chat-header .avatar{width:30px;height:30px;font-size:10px;border:0}
.chat-header strong{font-size:11px;display:block;font-weight:600}
.chat-header>div>span{display:block;font-size:8px;color:#939b8b;margin-top:1px}
.chat-header>.icon{margin-left:auto;width:16px;height:16px;color:#9ba591}
.chat{padding:19px 19px 0;background:#fdfefa}
.chat-date{text-align:center;font-size:7px;color:#9fa693;letter-spacing:1.2px;margin-bottom:22px}
.incoming{padding:9px 13px;background:#e9eedf;border:1px solid #e2e7d9;border-radius:12px 12px 3px 12px;margin-left:auto;width:fit-content;font-size:10px;color:#57654d;margin-bottom:23px}
.incoming>span{font-size:11px;margin-left:12px;color:#9aa88a}
.chat-reply{display:grid;grid-template-columns:22px minmax(0,1fr);gap:7px}
.chat-avatar{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:#e8ddc5;color:#726851;font-family:Georgia;font-size:13px;align-self:end}
.bubble{font-size:10px;line-height:1.75;background:#fff;border:1px solid #e7ebdf;border-radius:11px 11px 0 0;padding:13px 12px;white-space:pre-wrap;overflow-wrap:anywhere;color:#637158}
.chat-buttons>a{display:flex;align-items:center;justify-content:center;gap:7px;padding:11px 5px;background:white;border:1px solid #e7ebdf;border-top:0;font-size:9px;color:#607b40;font-weight:600}
.chat-buttons>a:last-child{border-radius:0 0 11px 11px}
.chat-buttons .icon{width:11px;height:11px}
.preview-note{font-size:8px;text-align:center;line-height:1.7;color:#9ba48f;padding:24px 0}
.flow-explainer{border-top:1px solid var(--line);padding:18px 21px;background:#f7f9f1;display:flex;flex-direction:column;gap:13px}
.flow-explainer>div{display:flex;gap:9px;align-items:center}
.flow-explainer>div>span{font-size:8px;width:21px;height:21px;display:grid;place-items:center;background:#e8eddd;border-radius:50%;color:#809166}
.flow-explainer p{font-size:9px;color:#818c73}
.flow-explainer strong{font-weight:600;color:#627b42}
.performance,.activity{margin-top:27px}
.performance{padding-bottom:16px}
.table-scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:11px;white-space:nowrap}
th{text-align:left;font-size:9px;font-weight:500;color:#8b9480;padding:12px;background:#f8f9f4;border-bottom:1px solid var(--line)}
th:first-child{border-radius:7px 0 0 0}
th:last-child{border-radius:0 7px 0 0}
td{padding:15px 12px;border-bottom:1px solid #eff1e9;font-size:10px}
td strong{font-weight:500;color:#59684d}
tr:last-child td{border-bottom:0}
.sent-value{font-weight:600;color:#617b44}
.error-value{color:#a45b44}
.performance>.field-help{margin-top:9px}
.text-link{display:inline-flex;align-items:center;gap:7px;color:#738557;font-size:10px;font-weight:500;background:transparent;padding:0}
.text-link:hover{text-decoration:underline;text-underline-offset:3px}
.text-link .icon{width:13px;height:13px}
.activity-tabs{display:flex;gap:25px;border-bottom:1px solid var(--line);margin-bottom:18px}
.activity-tabs>button{background:none;font-size:11px;color:#8c9580;padding:0 1px 12px;border-bottom:2px solid transparent;margin-bottom:-1px}
.activity-tabs>button[aria-selected=true]{color:#4a6734;border-bottom-color:#6e884b}
.activity-tabs>button>span{font-size:9px;padding:2px 6px;border-radius:5px;background:#f0f3e9;margin-left:5px}
.filters{display:grid;grid-template-columns:1.1fr 1fr 1fr 1.2fr auto auto;gap:12px;align-items:end;padding:0 0 17px;border-bottom:1px solid var(--line)}
.filters input,.filters select{font-size:10px;padding:9px 10px;min-height:36px}
.filters label{font-size:9px;gap:5px}
.filters .button{min-height:36px}
.filters .text-link{align-self:center;padding-top:20px}
.event{display:flex;gap:12px;padding:19px 0;border-bottom:1px solid #edf0e5}
.event:last-child{border:0}
.event-avatar{display:flex;justify-content:center;align-items:center;width:30px;height:30px;border-radius:50%;background:#eef0e6;color:#8e997f;font-family:Georgia;font-size:13px;flex:none}
.event-avatar .icon{width:13px;height:13px}
.event-body{flex:1;min-width:0}
.event-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.event-title strong{font-size:10px;font-weight:500;color:#5a6d4d}
.event-title time{font-size:8px;color:#a0a791}
.event-body>p{font-size:11px;color:#6d7961;margin:6px 0;overflow-wrap:anywhere}
.event-rule{font-size:9px;color:#93a07f}
.event-rule>span{color:#889873}
.event-state{display:flex;align-items:flex-end;flex-direction:column;gap:9px}
.event-state .text-link{font-size:9px}
.error-details{font-size:10px;color:#a3644b;margin-top:8px;overflow-wrap:anywhere}
.error-details summary{cursor:pointer}
.error-details p{margin-top:5px}
.activity-note{margin-bottom:12px}
.empty{text-align:center;padding:36px 20px;color:#8a947e;font-size:12px}
.empty>.icon{display:block;margin:0 auto 12px;color:#8fa278}
.empty strong{display:block;font-size:12px;font-weight:500;color:#67785a;margin-bottom:6px}
.empty p{font-size:10px;max-width:340px;margin:0 auto 14px}
.notice,.flash{padding:12px 16px;background:#f5eedc;border:1px solid #e9dfc5;color:#8c744d;border-radius:8px;margin-bottom:20px;font-size:11px}
.flash{display:flex;align-items:center;gap:10px;background:#eaf1df;border-color:#dce7cd;color:#59733d}
.flash .icon{width:16px;height:16px}
footer{display:flex;justify-content:space-between;align-items:center;padding:29px 0;color:#9ba48e;font-size:9px}
footer>span{display:flex;align-items:center;gap:8px}
footer .icon{width:13px;height:13px}
dialog{border:1px solid var(--line);border-radius:18px;width:min(560px,calc(100% - 32px));max-height:calc(100dvh - 48px);overflow:auto;padding:28px;box-shadow:0 25px 100px #17342330;background:#fff;color:var(--text)}
dialog::backdrop{background:#1f352e66;backdrop-filter:blur(4px)}
.dialog-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:15px;margin-bottom:23px}
.close-dialog{background:#f3f5ee;border-radius:50%;width:28px;height:28px;font-size:20px;color:#849675}
.dialog-heading h2{font-size:22px}
dialog .form-actions{margin-top:8px}
@media(min-width:1600px){.studio-grid{grid-template-columns:minmax(0,1fr) 360px}.hero h1{font-size:45px}.rule-card>summary{padding:22px}.chat{padding:22px 25px 0}.bubble{font-size:12px}.chat-buttons>a{font-size:11px}}
@media(max-width:1200px){.sidebar{width:204px;padding:30px 15px 15px}.brand{font-size:25px;gap:9px;padding:0 3px}.brand-sub{font-size:7px}.primary-nav>a{padding:12px 10px;font-size:11px;gap:10px}.page{margin-left:204px}main{padding:30px 30px 32px}.topbar{padding:0 30px}.hero h1{font-size:34px}.studio-grid{grid-template-columns:minmax(0,1fr) 290px;gap:20px}.stat{padding:17px 14px}.stat-label{font-size:10px}.stat>span{font-size:8px}.stats{gap:12px}.rule-card>summary{gap:9px;padding:16px 13px}.flow-icon{width:34px;height:34px}.rule-summary>strong{font-size:11px}.rule-meta{font-size:8px}.panel{padding:20px}.form-actions{flex-wrap:wrap}.filters{grid-template-columns:1fr 1fr 1fr}.filters .text-link{padding:0;justify-self:start}}
@media(max-width:1000px){.sidebar{width:184px;padding-left:11px;padding-right:11px}.page{margin-left:184px}.brand{font-size:22px}.brand-mark{width:33px;height:37px;font-size:30px}.brand-sub{font-size:6px;letter-spacing:1.2px}.primary-nav>a{font-size:10px;gap:8px}.primary-nav .icon{width:16px;height:16px}.account>div>span{font-size:8px}.account>.icon{display:none}main{padding:27px 23px 32px}.topbar{padding:0 23px}.hero{align-items:flex-start;gap:15px}.hero h1{font-size:31px}.hero>.button{font-size:9px;padding:10px}.studio-grid{grid-template-columns:minmax(0,1fr) 260px;gap:17px}.rule-end .delivery-count{display:none}.rule-card .badge{font-size:8px;padding:3px 6px}.rule-meta{font-size:8px}.chevron{margin-left:0}.rule-card>summary{flex-wrap:wrap}.rule-end{margin-left:auto}.title-with-icon{gap:8px}.stats{gap:9px}.stat{min-height:129px;padding:14px 11px}.stat-label{font-size:9px}.stat-label .icon{width:13px;height:13px}.stat>strong{font-size:29px}.stat>span{font-size:8px}.section-heading h2{font-size:19px}.chat{padding:16px 13px 0}.chat-reply{grid-template-columns:19px minmax(0,1fr);gap:5px}.chat-avatar{width:19px;height:19px}.two-fields{grid-template-columns:1fr}}
@media(max-width:820px){.sidebar{width:70px;align-items:center;padding:25px 10px}.brand{padding:0;margin-bottom:35px}.brand>span:last-child,.workspace-label,.account,.account-actions,.primary-nav>a>.nav-count{display:none}.primary-nav{width:100%;gap:8px}.primary-nav>a{font-size:0;padding:14px;gap:0;justify-content:center}.primary-nav .icon{width:20px;height:20px}.page{margin-left:70px}.studio-grid{grid-template-columns:minmax(0,1fr) 260px;gap:16px}.hero h1{font-size:30px}.hero>div>p:last-child{font-size:10px}.hero>.button{padding:9px}.hero{margin-bottom:24px}.stats{margin-bottom:28px}.rule-card>summary{padding:15px 12px}.rule-summary{flex-basis:calc(100% - 70px)}.rule-end{flex-direction:row;align-items:center;margin-left:43px}.rule-end .delivery-count{display:block}.chevron{margin-left:auto}.panel{padding:18px}.title-with-icon .eyebrow{font-size:7px}.hero .eyebrow{font-size:8px}.section-heading .eyebrow{font-size:8px}.form-actions{gap:14px}.form-actions>.button{width:100%}.filters{gap:10px}.topbar{height:61px}}
@media(max-width:680px){.right-column{position:static}.mobile-logout{display:block}.sidebar{position:static;width:100%;height:auto;padding:15px 20px;flex-direction:row;justify-content:space-between}.brand{margin:0;gap:9px;font-size:22px}.brand>span:last-child{display:block}.brand-mark{width:29px;height:32px;font-size:27px;border-radius:9px 9px 9px 2px}.brand-mark span{font-size:11px}.brand-sub{font-size:6px;letter-spacing:1.1px}.primary-nav{flex-direction:row;width:auto;gap:4px}.primary-nav>a{padding:9px}.primary-nav>a:nth-child(4),.primary-nav>a:nth-child(6){display:none}.primary-nav .icon{width:18px;height:18px}.sidebar-bottom{display:none}.page{margin:0}.topbar{height:48px;padding:0 20px;font-size:10px}.topbar>div{gap:10px}.topbar .badge{font-size:8px}.mini-avatar{height:24px;width:24px;font-size:8px}main{padding:26px 20px 32px}.hero{display:block}.hero h1{font-size:34px;letter-spacing:-1.2px}.hero>div>p:last-child{font-size:11px}.hero>.button{margin-top:19px;font-size:11px;padding:10px 13px}.stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.stat{padding:16px;min-height:131px}.stat-label{font-size:11px}.stat>strong{font-size:33px}.stat>span{font-size:9px}.stat-label .icon{width:16px;height:16px}.studio-grid{grid-template-columns:1fr;gap:23px}.rule-summary{flex-basis:0}.rule-end{margin-left:auto;flex-direction:column;align-items:flex-end}.rule-card>summary{gap:12px;padding:18px 15px}.rule-end .delivery-count{display:block}.rule-summary>strong{font-size:12px}.rule-meta{font-size:9px}.rule-card .badge{font-size:9px}.rule-card .chevron{margin-left:2px}.right-column{display:grid;grid-template-columns:1fr;gap:23px}.preview-panel{max-width:none}.chat{padding:22px 24px 0}.chat-date{font-size:8px}.incoming{font-size:12px}.chat-reply{grid-template-columns:25px minmax(0,1fr);gap:9px;padding-right:28px}.chat-avatar{width:25px;height:25px;font-size:15px}.bubble{font-size:12px}.chat-buttons>a{font-size:11px}.preview-note{font-size:9px}.flow-explainer p{font-size:10px}.panel{padding:21px}.title-with-icon{gap:12px}.form-actions{flex-wrap:nowrap}.form-actions>.button{width:auto}.two-fields{grid-template-columns:1fr 1fr}.section-description{font-size:12px}label{font-size:11px}.field-help{font-size:10px}.filters{grid-template-columns:1fr 1fr}.filters input,.filters select{font-size:11px}.filters .text-link{padding:0}.event{gap:9px}.event-title{gap:4px;flex-direction:column;align-items:flex-start}.event-state{max-width:110px}.event-state .badge{font-size:8px;white-space:normal}.event-body>p{font-size:11px}.event-rule{font-size:8px}.event-avatar{width:26px;height:26px}.section-heading{flex-wrap:wrap}.performance .small{font-size:9px}.performance,.activity{margin-top:23px}footer{font-size:8px;gap:15px}footer>span{font-size:8px}dialog{padding:22px}.dialog-heading h2{font-size:20px}}
.public-preview{margin:20px 0 0 29px;padding:12px;border:1px solid var(--line);border-radius:8px;background:white}
.public-preview>span{font-size:8px;color:var(--muted)}
.public-preview>p{font-size:10px;color:var(--text);margin-top:5px;white-space:pre-wrap}
.rule-card[open]{border-color:#a8b88d}
.incoming #preview-keyword{margin:0;color:inherit;font-size:inherit}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*:before,*:after{transition:none!important;animation:none!important}}
.flow-icon.link{background:#eaf0eb;color:#638572}.flow-icon.text{background:#edf2df;color:#698549}
.table-scroll{position:relative}.connection-panel>p.notice{color:#8c744d}
`;

function renderAccessPage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · Instagram auto-DM</title><style>${styles}
  .login-shell{min-height:100dvh;display:grid;place-items:center;padding:24px;max-width:none}.login-panel{width:100%;max-width:410px;border:1px solid var(--line);border-radius:20px;padding:36px;background:white;box-shadow:0 20px 70px #23442b0a}.login-panel h1{font-family:Georgia,serif;font-size:33px;font-weight:400;letter-spacing:-1px;line-height:1.2;margin-bottom:27px;overflow-wrap:anywhere}.login-panel button{background:#335b40;color:white;border-radius:7px;padding:12px;font-size:12px;font-weight:500}.login-panel .alert{padding:12px;border-radius:7px;background:#faf0e6;color:#a36549;font-size:12px;margin-bottom:18px}.login-panel a{color:#52703c;text-decoration:underline}.login-panel pre{white-space:pre-wrap;font-size:12px;background:var(--soft);padding:12px}.login-panel p.muted{font-size:12px}.login-panel label span{font-size:12px}.login-panel input{font-size:14px}
  </style></head><body>${body}</body></html>`;
}

export function renderLoginPage(invalid: boolean): string {
  return renderAccessPage("Login", `
    <main class="login-shell">
      <section class="login-panel">
        <p class="eyebrow">Instagram Auto-DM</p>
        <h1>Admin Login</h1>
        ${invalid ? '<p class="alert">That token did not match.</p>' : ""}
        <form method="post" action="/admin/login" class="stack">
          <label>
            <span>Admin token</span>
            <input name="token" type="password" autocomplete="current-password" autofocus required>
          </label>
          <button type="submit">Open Dashboard</button>
        </form>
      </section>
    </main>
  `);
}

export function renderMissingAdminTokenPage(): string {
  return renderAccessPage("Admin Token Missing", `
    <main class="login-shell">
      <section class="login-panel">
        <p class="eyebrow">Setup Needed</p>
        <h1>Set ADMIN_TOKEN</h1>
        <p class="muted">Create an admin token before using the dashboard.</p>
        <pre>npx wrangler secret put ADMIN_TOKEN</pre>
      </section>
    </main>
  `);
}

export function renderErrorPage(message: string): string {
  return renderAccessPage("Error", `
    <main class="login-shell">
      <section class="login-panel">
        <p class="eyebrow">Could Not Save</p>
        <h1>${esc(message)}</h1>
        <p><a href="/admin">Back to dashboard</a></p>
      </section>
    </main>
  `);
}
