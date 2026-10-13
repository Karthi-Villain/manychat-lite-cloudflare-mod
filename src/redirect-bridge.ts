import type { RedirectBridgeSettings } from "./types";

export const DEFAULT_REDIRECT_BRIDGE_SETTINGS: RedirectBridgeSettings = {
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

export async function getRedirectBridgeSettings(db: D1Database): Promise<RedirectBridgeSettings> {
  const row = await db.prepare("SELECT value FROM automation_settings WHERE key = 'redirect_bridge'").first<{ value: string }>();
  if (!row?.value) {
    return DEFAULT_REDIRECT_BRIDGE_SETTINGS;
  }
  try {
    const parsed = JSON.parse(row.value) as Partial<RedirectBridgeSettings>;
    return {
      ...DEFAULT_REDIRECT_BRIDGE_SETTINGS,
      ...parsed,
      countdownSeconds: Math.max(1, Math.min(30, Number(parsed.countdownSeconds) || 3))
    };
  } catch {
    return DEFAULT_REDIRECT_BRIDGE_SETTINGS;
  }
}

export async function saveRedirectBridgeSettings(db: D1Database, settings: RedirectBridgeSettings): Promise<void> {
  await db.prepare(
    "INSERT INTO automation_settings (key, value, updated_at) VALUES ('redirect_bridge', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  )
    .bind(JSON.stringify(settings), new Date().toISOString())
    .run();
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

type RenderPageOptions = {
  destinationUrl: string;
  settings: RedirectBridgeSettings;
  accountUsername: string | null;
  avatarUrl: string | null;
};

export function renderRedirectPage(options: RenderPageOptions): string {
  const { destinationUrl, settings, accountUsername, avatarUrl } = options;
  const username = accountUsername ? `@${accountUsername.replace(/^@/, "")}` : "@creator";
  const seconds = Math.max(1, Math.min(30, settings.countdownSeconds || 3));
  const effectiveAvatar = settings.profilePicData || avatarUrl || "";
  let host = "";
  try {
    host = new URL(destinationUrl).hostname;
  } catch {
    host = destinationUrl;
  }

  const avatarMarkup = effectiveAvatar
    ? `<img src="${esc(effectiveAvatar)}" alt="${esc(username)}" class="avatar-img">`
    : `<div class="avatar-fallback">${esc((username.replace(/^@/, "")[0] || "A").toUpperCase())}</div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="dark">
  <noscript>
    <meta http-equiv="refresh" content="${seconds};url=${esc(destinationUrl)}">
  </noscript>
  <title>Redirecting · ${esc(username)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090c10;
      --card-bg: rgba(18, 24, 38, 0.75);
      --card-border: rgba(255, 255, 255, 0.12);
      --text: #f0f4fc;
      --muted: #8b9bb4;
      --primary: #4f46e5;
      --accent: #ec4899;
      --ring-gradient: linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px 16px;
      overflow-x: hidden;
      position: relative;
    }
    /* Ambient backdrop aura */
    .bg-blur-container {
      position: fixed;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
      z-index: 0;
    }
    .ambient-glow-1 {
      position: absolute;
      top: -15%;
      left: 50%;
      transform: translateX(-50%);
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(236, 72, 153, 0.22) 0%, rgba(79, 70, 229, 0.15) 50%, transparent 70%);
      filter: blur(60px);
      animation: pulseGlow 6s ease-in-out infinite alternate;
    }
    .ambient-glow-2 {
      position: absolute;
      bottom: -10%;
      right: -10%;
      width: 420px;
      height: 420px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.18) 0%, transparent 60%);
      filter: blur(70px);
    }
    ${settings.blurBackground && effectiveAvatar ? `
    .bg-avatar-blur {
      position: absolute;
      inset: -20px;
      background-image: url('${esc(effectiveAvatar)}');
      background-size: cover;
      background-position: center;
      filter: blur(80px) saturate(180%);
      opacity: 0.18;
      transform: scale(1.2);
    }
    ` : ""}
    @keyframes pulseGlow {
      0% { transform: translateX(-50%) scale(0.9); opacity: 0.8; }
      100% { transform: translateX(-50%) scale(1.15); opacity: 1; }
    }
    /* Main Card */
    .redirect-card {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 440px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border-radius: 28px;
      padding: 36px 28px 30px;
      box-shadow: 0 30px 70px rgba(0, 0, 0, 0.55), 0 0 1px 1px rgba(255, 255, 255, 0.08) inset;
      text-align: center;
      animation: cardAppear 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes cardAppear {
      from { opacity: 0; transform: translateY(18px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    /* Avatar with Instagram-style gradient border */
    .avatar-wrapper {
      position: relative;
      width: 106px;
      height: 106px;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .avatar-ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: var(--ring-gradient);
      padding: 3.5px;
      animation: rotateRing 8s linear infinite;
    }
    @keyframes rotateRing {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .avatar-inner {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: #11141c;
      padding: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
      z-index: 1;
    }
    .avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
    }
    .avatar-fallback {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: linear-gradient(135deg, #374151 0%, #1f2937 100%);
      color: #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 34px;
      font-weight: 700;
    }
    .verified-badge {
      position: absolute;
      bottom: 2px;
      right: 2px;
      width: 26px;
      height: 26px;
      background: #0095f6;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 3px solid #0c0f14;
      z-index: 2;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    }
    .verified-badge svg {
      width: 13px;
      height: 13px;
      fill: currentColor;
    }
    /* Profile Handle */
    .profile-handle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      font-weight: 700;
      color: #e2e8f0;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 5px 12px;
      border-radius: 20px;
      margin-bottom: 14px;
      letter-spacing: -0.2px;
    }
    .profile-handle svg {
      width: 14px;
      height: 14px;
      color: #e1306c;
    }
    /* Headline */
    .headline {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #fff;
      margin-bottom: 12px;
      line-height: 1.3;
    }
    /* Quotation box */
    .quote-card {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 16px 18px;
      margin: 14px 0 22px;
      position: relative;
    }
    .quote-text {
      font-size: 13.5px;
      line-height: 1.55;
      color: #cbd5e1;
      font-weight: 500;
      font-style: italic;
    }
    .quote-author {
      display: block;
      margin-top: 6px;
      font-size: 11px;
      color: var(--muted);
      font-style: normal;
      font-weight: 600;
    }
    /* Countdown Ring & Timer */
    .timer-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 18px 0 22px;
    }
    .timer-ring-wrapper {
      position: relative;
      width: 82px;
      height: 82px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .timer-svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }
    .timer-svg circle {
      fill: none;
      stroke-width: 6;
      stroke-linecap: round;
    }
    .timer-bg-circle {
      stroke: rgba(255, 255, 255, 0.09);
    }
    .timer-progress-circle {
      stroke: url(#timerGradient);
      stroke-dasharray: 226.2;
      stroke-dashoffset: 0;
      will-change: stroke-dashoffset;
    }
    .timer-number {
      position: absolute;
      font-size: 30px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -1px;
      transition: transform 0.2s ease;
    }
    .timer-label {
      font-size: 12px;
      color: var(--muted);
      margin-top: 9px;
      font-weight: 500;
    }
    .timer-label strong {
      color: #f1f5f9;
    }
    /* CTA Button */
    .cta-button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      width: 100%;
      padding: 14px 24px;
      border-radius: 15px;
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      color: white;
      text-decoration: none;
      font-size: 14.5px;
      font-weight: 700;
      letter-spacing: -0.2px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 10px 24px rgba(79, 70, 229, 0.35);
      transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
      cursor: pointer;
    }
    .cta-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 30px rgba(79, 70, 229, 0.45);
      filter: brightness(1.08);
    }
    .cta-button:active {
      transform: translateY(0);
    }
    .destination-hint {
      display: block;
      margin-top: 14px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.45);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <div class="bg-blur-container">
    <div class="ambient-glow-1"></div>
    <div class="ambient-glow-2"></div>
    ${settings.blurBackground && effectiveAvatar ? '<div class="bg-avatar-blur"></div>' : ""}
  </div>

  <main class="redirect-card">
    <div class="avatar-wrapper">
      <div class="avatar-ring"></div>
      <div class="avatar-inner">
        ${avatarMarkup}
      </div>
      <div class="verified-badge" title="Verified Creator" aria-label="Verified">
        <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
      </div>
    </div>

    <div class="profile-handle">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
      </svg>
      <span>${esc(username)}</span>
    </div>

    <h1 class="headline">${esc(settings.headline || "Your link is almost ready...")}</h1>

    ${settings.quotation ? `
    <div class="quote-card">
      <p class="quote-text">“${esc(settings.quotation)}”</p>
      ${settings.author ? `<span class="quote-author">— ${esc(settings.author)}</span>` : ""}
    </div>
    ` : ""}

    <div class="timer-section">
      <div class="timer-ring-wrapper">
        <svg class="timer-svg" viewBox="0 0 80 80">
          <defs>
            <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ec4899"/>
              <stop offset="100%" stop-color="#6366f1"/>
            </linearGradient>
          </defs>
          <circle class="timer-bg-circle" cx="40" cy="40" r="36"/>
          <circle id="timer-progress" class="timer-progress-circle" cx="40" cy="40" r="36"/>
        </svg>
        <span id="countdown-number" class="timer-number">${seconds}</span>
      </div>
      <span class="timer-label">Redirecting in <strong id="countdown-text">${seconds}s</strong></span>
    </div>

    <a id="cta-link" href="${esc(destinationUrl)}" class="cta-button">
      <span>${esc(settings.buttonText || "Open Link Now →")}</span>
    </a>

    <span class="destination-hint" title="${esc(destinationUrl)}">Destination: ${esc(host)}</span>
  </main>

  <script>
    (function() {
      var totalSeconds = ${seconds};
      var totalMs = totalSeconds * 1000;
      var destination = ${JSON.stringify(destinationUrl)};
      var countdownEl = document.getElementById('countdown-number');
      var countdownText = document.getElementById('countdown-text');
      var progressEl = document.getElementById('timer-progress');
      var radius = 36;
      var circumference = 2 * Math.PI * radius; // ~226.19
      var redirected = false;

      progressEl.style.strokeDasharray = circumference;
      progressEl.style.strokeDashoffset = 0;

      function doRedirect() {
        if (redirected) return;
        redirected = true;
        countdownEl.textContent = '✓';
        countdownText.textContent = '0s';
        progressEl.style.strokeDashoffset = circumference;
        try {
          window.location.replace(destination);
        } catch (e) {
          window.location.href = destination;
        }
      }

      var startTime = null;
      var lastDisplayedSec = null;

      function step(now) {
        if (redirected) return;
        if (!startTime) startTime = now;
        var elapsed = now - startTime;

        if (elapsed >= totalMs) {
          doRedirect();
          return;
        }

        // Smooth frame-by-frame depletion from 0 to circumference
        var fraction = Math.min(1, Math.max(0, elapsed / totalMs));
        progressEl.style.strokeDashoffset = (circumference * fraction).toFixed(2);

        // Accurate real-time second display: 3 -> 2 -> 1
        var remainingSec = Math.max(1, Math.ceil((totalMs - elapsed) / 1000));
        if (remainingSec !== lastDisplayedSec) {
          lastDisplayedSec = remainingSec;
          countdownEl.textContent = remainingSec;
          countdownText.textContent = remainingSec + 's';
          countdownEl.style.transform = 'scale(1.18)';
          setTimeout(function() { countdownEl.style.transform = 'scale(1)'; }, 140);
        }

        requestAnimationFrame(step);
      }

      requestAnimationFrame(step);
    })();
  </script>
</body>
</html>`;
}
