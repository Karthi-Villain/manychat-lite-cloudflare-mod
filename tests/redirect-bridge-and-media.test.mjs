import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildWorker, commentPayload, createHarness } from "./worker-harness.mjs";

let built;
before(async () => {
  built = await buildWorker();
});
after(async () => {
  await built?.dispose();
});

async function fixture(t, overrides) {
  const harness = await createHarness(built.worker, overrides);
  t.after(() => harness.dispose());
  return harness;
}

test("bridge preview route (/r/preview) renders the waiting page with countdown and animations", async (t) => {
  const h = await fixture(t);
  const response = await h.request("/r/preview");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  const html = await response.text();
  assert.match(html, /Your link is almost ready/);
  assert.match(html, /countdown-number/);
  assert.match(html, /timer-progress/);
  assert.match(html, /ambient-glow/);
});

test("media assets can be uploaded via /admin/assets and served publicly at /assets/:id.webp", async (t) => {
  const h = await fixture(t);
  const cookie = await h.login();

  // Fake base64 WebP image payload (valid base64 string)
  const sampleBase64 = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";

  // Upload asset via admin API
  const uploadRes = await h.request("/admin/assets", {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      filename: "test_banner.webp",
      mime_type: "image/webp",
      data_base64: sampleBase64
    })
  });

  assert.equal(uploadRes.status, 200);
  const data = await uploadRes.json();
  assert.equal(data.ok, true);
  assert.ok(data.id.startsWith("asset_"));
  assert.equal(data.url, `/assets/${data.id}.webp`);

  // Verify asset is stored in D1 database
  const row = h.query("SELECT * FROM media_assets WHERE id = ?", data.id);
  assert.ok(row);
  assert.equal(row.mime_type, "image/webp");
  assert.equal(row.data_base64, sampleBase64);

  // Serve asset publicly via /assets/:id.webp
  const serveRes = await h.request(`/assets/${data.id}.webp`);
  assert.equal(serveRes.status, 200);
  assert.equal(serveRes.headers.get("content-type"), "image/webp");
  assert.match(serveRes.headers.get("cache-control"), /immutable/);
  const buffer = await serveRes.arrayBuffer();
  assert.ok(buffer.byteLength > 0);
});

test("bridge settings can be updated via /admin/bridge-settings and reflected on redirect page", async (t) => {
  const h = await fixture(t);
  const cookie = await h.login();

  // Save new bridge settings
  const saveRes = await h.request("/admin/bridge-settings", {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      enabled: true,
      headline: "Special Exclusive Gift",
      quotation: "Opportunities multiply as they are seized.",
      author: "Sun Tzu",
      countdownSeconds: 5,
      buttonText: "Claim Gift →",
      blurBackground: true
    })
  });

  assert.equal(saveRes.status, 200);
  const resData = await saveRes.json();
  assert.equal(resData.ok, true);
  assert.equal(resData.settings.headline, "Special Exclusive Gift");
  assert.equal(resData.settings.countdownSeconds, 5);

  // Verify preview shows updated settings
  const preview = await (await h.request("/r/preview")).text();
  assert.match(preview, /Special Exclusive Gift/);
  assert.match(preview, /Opportunities multiply as they are seized/);
  assert.match(preview, /Sun Tzu/);
  assert.match(preview, /Claim Gift →/);
});

test("rules with image attachment and bridge enabled send DM with generic template and bridge link", async (t) => {
  const h = await fixture(t);
  const cookie = await h.login();

  // 1. Upload an image asset
  const sampleBase64 = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
  const assetRes = await (await h.request("/admin/assets", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ filename: "product.webp", mime_type: "image/webp", data_base64: sampleBase64 })
  })).json();
  assert.ok(assetRes.id);

  // 2. Create rule with image_asset_id and use_bridge
  const createRes = await h.postForm("/admin/rules", {
    label: "VIP Promotion",
    keywords: "VIP, deal",
    reply_text: "Here is your VIP pass with exclusive access!",
    link_url: "https://example.com/vip-offer",
    link_button_label: "Open VIP Pass",
    image_asset_id: assetRes.id,
    use_bridge: "on",
    active: "on"
  }, cookie);
  assert.equal(createRes.status, 303);

  const rule = h.query("SELECT * FROM rules WHERE label = 'VIP Promotion'");
  assert.ok(rule);
  assert.equal(rule.image_asset_id, assetRes.id);
  assert.equal(rule.use_bridge, 1);

  // 3. Trigger comment event that matches rule
  const payload = commentPayload("comment-vip-1", "Send me the VIP pass please!");
  const webhookRes = await h.webhook(payload);
  assert.equal(webhookRes.status, 200);

  // 4. Verify message payload sent to Instagram Graph API
  const msgCalls = h.calls.filter((call) => call.url.pathname.endsWith("/messages"));
  assert.equal(msgCalls.length, 1);
  const msg = msgCalls[0].body.message;
  assert.equal(msg.attachment.type, "template");
  assert.equal(msg.attachment.payload.template_type, "generic");

  const element = msg.attachment.payload.elements[0];
  assert.equal(element.image_url, `https://dashboard.example.test/assets/${assetRes.id}.webp`);
  assert.equal(element.buttons[0].title, "Open VIP Pass");
  assert.equal(element.buttons[0].url, `https://dashboard.example.test/r/${rule.id}`);

  // 5. Test accessing the bridge URL /r/:ruleId
  const bridgeRes = await h.request(`/r/${rule.id}`);
  assert.equal(bridgeRes.status, 200);
  const pageHtml = await bridgeRes.text();
  assert.match(pageHtml, /https:\/\/example\.com\/vip-offer/);
  assert.match(pageHtml, /countdown-number/);
});

test("when bridge is disabled, visiting /r/:id redirects directly via 302 to destination URL", async (t) => {
  const h = await fixture(t);
  const cookie = await h.login();

  // Create a rule with use_bridge = 0 (disabled)
  await h.postForm("/admin/rules", {
    label: "Direct Link Rule",
    keywords: "DIRECT",
    reply_text: "Direct reply",
    link_url: "https://example.com/direct-destination",
    link_button_label: "Visit site",
    active: "on"
  }, cookie);

  const rule = h.query("SELECT id FROM rules WHERE label = 'Direct Link Rule'");
  assert.ok(rule);

  const response = await h.request(`/r/${rule.id}`);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://example.com/direct-destination");
});

test("bridge waiting page uses frame-accurate requestAnimationFrame timer with noscript fallback", async (t) => {
  const h = await fixture(t);
  const response = await h.request("/r/preview");
  assert.equal(response.status, 200);
  const html = await response.text();

  // Verify meta refresh is safely enclosed in <noscript> so JavaScript isn't prematurely interrupted at 2 seconds
  assert.match(html, /<noscript>\s*<meta http-equiv="refresh"/);
  // Verify requestAnimationFrame step loop is used for 60fps frame-accurate countdown
  assert.match(html, /requestAnimationFrame\(step\)/);
  // Verify numeric countdown element and SVG circle are present
  assert.match(html, /id="countdown-number"/);
  assert.match(html, /id="timer-progress"/);
});

test("admin media endpoint returns post items with thumbnails and support for browsing posts", async (t) => {
  const h = await fixture(t);
  const cookie = await h.login();

  const response = await h.request("/admin/media", { headers: { cookie } });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.ok(Array.isArray(data.media));
  assert.ok(data.media.length > 0);
  assert.ok("id" in data.media[0]);
  assert.ok("thumbnailUrl" in data.media[0]);
  assert.ok("caption" in data.media[0]);
});

