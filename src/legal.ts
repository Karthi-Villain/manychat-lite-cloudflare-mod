function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderPrivacyPolicy(accountUsername?: string | null, contactEmail?: string | null): string {
  const username = accountUsername ? `@${accountUsername.replace(/^@/, "")}` : "@creator";
  const email = contactEmail || "support@example.com";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - ManyChatLite-IG</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --border: #334155;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    .container {
      max-width: 800px;
      margin: 40px auto;
      padding: 32px 24px;
      background: var(--card);
      border-radius: 12px;
      border: 1px solid var(--border);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
    }
    h1 {
      color: var(--primary);
      margin-top: 0;
      font-size: 2rem;
    }
    h2 {
      color: #e2e8f0;
      margin-top: 28px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
    }
    p, li {
      color: var(--text-muted);
      font-size: 1rem;
    }
    ul {
      padding-left: 20px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      background: #0369a1;
      color: white;
      border-radius: 4px;
      font-size: 0.8rem;
      margin-bottom: 16px;
    }
    footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.85rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">Last Updated: October 2026</div>
    <h1>Privacy Policy</h1>
    <p>This Privacy Policy explains how <strong>ManyChatLite-IG</strong> ("we", "us", or "our"), operated for the Instagram account <strong>${esc(username)}</strong>, collects, processes, and protects information when interacting with users through the Instagram Graph API and automated messaging features.</p>

    <h2>1. Information We Collect</h2>
    <p>When you comment on our posts or send us direct messages (DMs) on Instagram, we may receive and process standard webhook data provided by Meta Platforms, Inc., including:</p>
    <ul>
      <li>Instagram Public Username and User ID</li>
      <li>Comment contents and comment IDs</li>
      <li>Direct message text, story reply interactions, and timestamp information</li>
    </ul>

    <h2>2. How We Use Information</h2>
    <p>We process this information solely to deliver requested automated replies, such as:</p>
    <ul>
      <li>Replying with resources, links, or guides when specific keywords (e.g., "GUIDE") are commented or messaged.</li>
      <li>Answering automated inquiries and facilitating customer communication.</li>
      <li>Preventing duplicate message processing.</li>
    </ul>
    <p>We do <strong>not</strong> sell, rent, or share personal information with third parties for commercial or advertising purposes.</p>

    <h2>3. Data Storage & Security</h2>
    <p>All data is stored in isolated, secure Cloudflare D1 databases. Instagram authentication tokens are encrypted using AES-GCM standards. We maintain strict access control via token authorization.</p>

    <h2>4. Data Retention and Deletion</h2>
    <p>Comment and message logs are retained temporarily for deduplication and analytics purposes. You may request deletion of any personal data associated with your interactions at any time. For instructions, see our <a href="/data-deletion" style="color: var(--primary);">Data Deletion Instructions</a>.</p>

    <h2>5. Contact Us</h2>
    <p>If you have any questions about this Privacy Policy, please contact us directly via Instagram direct message at <strong>${esc(username)}</strong> or via email at <code>${esc(email)}</code>.</p>

    <footer>
      &copy; 2026 ManyChatLite-IG (${esc(username)}). All rights reserved.
    </footer>
  </div>
</body>
</html>`;
}

export function renderTermsOfService(accountUsername?: string | null, contactEmail?: string | null): string {
  const username = accountUsername ? `@${accountUsername.replace(/^@/, "")}` : "@creator";
  const email = contactEmail || "support@example.com";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Service - ManyChatLite-IG</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --border: #334155;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    .container {
      max-width: 800px;
      margin: 40px auto;
      padding: 32px 24px;
      background: var(--card);
      border-radius: 12px;
      border: 1px solid var(--border);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
    }
    h1 {
      color: var(--primary);
      margin-top: 0;
      font-size: 2rem;
    }
    h2 {
      color: #e2e8f0;
      margin-top: 28px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
    }
    p, li {
      color: var(--text-muted);
      font-size: 1rem;
    }
    footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.85rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Terms of Service</h1>
    <p>By interacting with the automated Instagram services provided by <strong>ManyChatLite-IG</strong> on the account <strong>${esc(username)}</strong>, you agree to these Terms of Service.</p>

    <h2>1. Service Description</h2>
    <p>ManyChatLite-IG provides automated responses to comments and direct messages on Instagram based on creator-defined keywords, conversation starters, and links.</p>

    <h2>2. Acceptable Use</h2>
    <p>Users agree to use messaging features responsibly and adhere to Instagram's Community Guidelines and Terms of Use. Spamming or abusive messaging is strictly prohibited.</p>

    <h2>3. Disclaimer & Limitations</h2>
    <p>The automated messaging service is provided "as is" without warranty of continuous or error-free availability. We reserve the right to modify or terminate automation rules at any time.</p>

    <h2>4. Contact</h2>
    <p>For questions regarding these Terms, contact <code>${esc(email)}</code> or reach out to <strong>${esc(username)}</strong> on Instagram.</p>

    <footer>
      &copy; 2026 ManyChatLite-IG (${esc(username)}). All rights reserved.
    </footer>
  </div>
</body>
</html>`;
}

export function renderDataDeletion(accountUsername?: string | null, contactEmail?: string | null): string {
  const username = accountUsername ? `@${accountUsername.replace(/^@/, "")}` : "@creator";
  const email = contactEmail || "support@example.com";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>User Data Deletion Instructions - ManyChatLite-IG</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --border: #334155;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    .container {
      max-width: 800px;
      margin: 40px auto;
      padding: 32px 24px;
      background: var(--card);
      border-radius: 12px;
      border: 1px solid var(--border);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
    }
    h1 {
      color: var(--primary);
      margin-top: 0;
      font-size: 2rem;
    }
    h2 {
      color: #e2e8f0;
      margin-top: 28px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
    }
    p, li {
      color: var(--text-muted);
      font-size: 1rem;
    }
    ol {
      padding-left: 20px;
    }
    footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.85rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>User Data Deletion Instructions</h1>
    <p>ManyChatLite-IG respects your privacy and complies with Meta Platform's user data deletion policies. If you have interacted with <strong>${esc(username)}</strong> and wish to have your data deleted, follow these instructions:</p>

    <h2>How to Request Data Deletion</h2>
    <ol>
      <li>Send an email to <code>${esc(email)}</code> with the subject line <strong>"Instagram Data Deletion Request"</strong>.</li>
      <li>Include your Instagram username and approximately when you interacted with ${esc(username)}.</li>
      <li>Alternatively, send a Direct Message to <strong>${esc(username)}</strong> on Instagram with the text <code>DELETE MY DATA</code>.</li>
    </ol>
    <p>Upon receiving your request, all logged comment and messaging event records containing your user ID will be permanently removed from our D1 database within 48 hours.</p>

    <footer>
      &copy; 2026 ManyChatLite-IG (${esc(username)}). All rights reserved.
    </footer>
  </div>
</body>
</html>`;
}
