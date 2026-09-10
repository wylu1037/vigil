import { MAX_PAUSE_DAYS, SITE_TITLE } from "./config";

export function renderAdmin(nonce: string): string {
  return String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${SITE_TITLE} · Management</title>
<style nonce="${nonce}">
  :root {
    color-scheme: dark;
    --bg: #0d1117; --panel: #151b23; --line: #232c37;
    --fg: #e6edf3; --muted: #8b949e;
    --green: #22c55e; --amber: #f59e0b; --red: #ef4444;
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body {
    margin: 0; padding: 32px 20px; background: var(--bg); color: var(--fg);
    font: 14px/1.6 -apple-system, "Segoe UI", Roboto, "PingFang SC",
          "Microsoft YaHei", sans-serif;
  }
  .wrap { max-width: 960px; margin: 0 auto; }
  header, .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  header { justify-content: space-between; margin-bottom: 24px; }
  h1 { margin: 0; font-size: 22px; letter-spacing: .3px; }
  h2 { margin: 0; font-size: 15px; }
  p { margin: 8px 0; }
  a { color: var(--muted); text-decoration: none; }
  a:hover { color: var(--fg); }
  .sub, .hint { color: var(--muted); font-size: 12px; }
  .panel {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 10px; padding: 20px; margin-bottom: 16px;
  }
  .spread { justify-content: space-between; }
  label { display: block; font-size: 13px; margin-bottom: 6px; }
  input, select, button { font: inherit; border-radius: 7px; }
  input, select {
    min-width: 0; padding: 10px 12px; border: 1px solid var(--line);
    background: var(--bg); color: var(--fg);
  }
  input { width: 100%; }
  .token-row { display: flex; gap: 10px; }
  button {
    padding: 9px 15px; border: 1px solid var(--line); background: var(--bg);
    color: var(--fg); cursor: pointer; white-space: nowrap;
  }
  button:hover:not(:disabled) { border-color: var(--muted); }
  button:disabled { opacity: .45; cursor: not-allowed; }
  :focus-visible { outline: 2px solid var(--green); outline-offset: 3px; }
  .primary { color: var(--bg); background: var(--green); border-color: var(--green); font-weight: 600; }
  .pause-button { background: var(--amber); border-color: var(--amber); }
  .badge { padding: 3px 10px; border-radius: 999px; font-size: 12px; background: #8b949e20; color: var(--muted); }
  .badge.active { background: #22c55e20; color: var(--green); }
  .badge.paused { background: #f59e0b20; color: var(--amber); }
  .status-heading { margin: 16px 0 4px; font-size: 24px; }
  dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 20px 0 12px; }
  dt { color: var(--muted); font-size: 12px; }
  dd { margin: 4px 0 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
  .actions { display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; }
  .actions .panel { margin-bottom: 0; }
  .duration { display: grid; grid-template-columns: 1fr 100px; gap: 10px; }
  .presets { display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0; }
  .presets button { padding: 4px 12px; font-size: 12px; }
  .presets button[aria-pressed="true"] { color: var(--amber); border-color: var(--amber); background: #f59e0b12; }
  .action-button { width: 100%; margin-top: 16px; }
  .feedback { margin-bottom: 16px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 8px; overflow-wrap: anywhere; }
  .feedback[data-tone="success"] { color: var(--green); border-color: #22c55e50; background: #22c55e0d; }
  .feedback[data-tone="error"] { color: var(--red); border-color: #ef444450; background: #ef44440d; }
  @media (max-width: 640px) {
    body { padding: 24px 16px; }
    .actions, dl { grid-template-columns: 1fr; }
    .panel { padding: 16px; }
  }
</style>
</head>
<body>
<main class="wrap" id="admin">
  <header>
    <div><h1>Management</h1><div class="sub">${SITE_TITLE} · Scheduled probe controls</div></div>
    <a href="/">← Status page</a>
  </header>

  <noscript><p class="feedback">This page requires JavaScript. You can also manage probing through the /pause and /resume endpoints.</p></noscript>

  <section class="panel" id="connection">
    <form id="connect-form">
      <label for="token">Admin token</label>
      <div class="token-row">
        <input id="token" type="password" required autocomplete="off" spellcheck="false" placeholder="Enter TRIGGER_TOKEN" aria-describedby="token-hint">
        <button class="primary" id="connect-button" type="submit">Connect</button>
      </div>
      <p class="hint" id="token-hint">Use the TRIGGER_TOKEN configured for this deployment. The token stays in this page's memory, never in the URL or browser storage.</p>
    </form>
  </section>

  <div class="panel row spread" id="session" hidden>
    <span class="badge active">Admin token verified</span>
    <button id="disconnect" type="button">Disconnect</button>
  </div>

  <div class="feedback" id="feedback" role="status" aria-live="polite" hidden></div>

  <section class="panel" aria-labelledby="status-label">
    <div class="row spread">
      <div class="row"><h2 id="status-label">Current status</h2><span class="badge" id="status-badge">Not connected</span></div>
      <button id="refresh" type="button" disabled>Refresh status</button>
    </div>
    <h3 class="status-heading" id="status-heading">Waiting for connection</h3>
    <p class="hint" id="status-description">Enter your admin token to view the pause status.</p>
    <dl>
      <div><dt>Paused since · UTC+8</dt><dd id="pause-since">—</dd></div>
      <div><dt>Resumes at · UTC+8</dt><dd id="pause-until">—</dd></div>
      <div><dt>Time remaining</dt><dd id="pause-left">—</dd></div>
    </dl>
    <div class="hint" id="last-updated">Status not loaded</div>
  </section>

  <fieldset id="controls" disabled aria-label="Pause and resume">
    <div class="actions">
      <section class="panel">
        <h2>Pause automatic probing</h2>
        <p class="hint">Choose how long to pause. Probing resumes automatically when it expires. Pausing again resets the timer.</p>
        <form id="pause-form">
          <label for="duration">Pause duration</label>
          <div class="duration">
            <input id="duration" type="number" value="1" min="1" max="${MAX_PAUSE_DAYS * 24}" step="1" required aria-describedby="duration-hint">
            <select id="unit" aria-label="Duration unit"><option value="m">Minutes</option><option value="h" selected>Hours</option><option value="d">Days</option></select>
          </div>
          <div class="presets" aria-label="Common pause durations">
            <button type="button" data-duration="30" data-unit="m" aria-pressed="false">30 min</button>
            <button type="button" data-duration="1" data-unit="h" aria-pressed="true">1 hour</button>
            <button type="button" data-duration="6" data-unit="h" aria-pressed="false">6 hours</button>
            <button type="button" data-duration="1" data-unit="d" aria-pressed="false">1 day</button>
          </div>
          <p class="hint" id="duration-hint">Positive whole numbers only, up to ${MAX_PAUSE_DAYS} days.</p>
          <p class="hint" id="preview"></p>
          <button class="primary pause-button action-button" type="submit">Pause</button>
        </form>
      </section>
      <section class="panel">
        <h2>Resume automatic probing</h2>
        <p class="hint">End the current pause early and restore the normal schedule.</p>
        <p class="hint">Resuming does not send a probe immediately. Probing starts with the next scheduled block within the operating window.</p>
        <button class="primary action-button" id="resume" type="button" disabled>Resume</button>
      </section>
    </div>
  </fieldset>
</main>
<script nonce="${nonce}">
  const element = (id) => document.getElementById(id);
  const tokenInput = element("token");
  const durationInput = element("duration");
  const unitInput = element("unit");
  const presets = document.querySelectorAll("[data-duration]");
  const unitMs = { m: 60000, h: 3600000, d: 86400000 };
  const maxDurationMs = ${MAX_PAUSE_DAYS} * unitMs.d;
  const dateFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  });
  let token = "";
  let pause = null;
  let updatedAt = null;
  let clockOffset = 0;
  let busy = false;
  let sessionVersion = 0;

  function showMessage(message, tone) {
    const feedback = element("feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
    feedback.hidden = false;
  }

  function remaining(milliseconds) {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor(seconds % 86400 / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    return (days ? days + "d " : "") + (hours ? hours + "h " : "") +
      minutes + "m " + seconds % 60 + "s";
  }

  function renderStatus() {
    const paused = Boolean(token && pause && pause.until > Date.now() + clockOffset);
    element("connection").hidden = Boolean(token);
    element("session").hidden = !token;
    element("controls").disabled = busy || !token;
    element("connect-button").disabled = busy;
    tokenInput.disabled = busy;
    element("disconnect").disabled = busy;
    element("refresh").disabled = busy || !token;
    element("resume").disabled = busy || !paused;
    element("admin").setAttribute("aria-busy", String(busy));
    const badge = element("status-badge");
    badge.className = "badge" + (token ? paused ? " paused" : " active" : "");
    badge.textContent = token ? paused ? "Paused" : "Not paused" : "Not connected";
    element("status-heading").textContent = token ? paused ? "Automatic probing paused" : "Automatic scheduling enabled" : "Waiting for connection";
    element("status-description").textContent = !token ? "Enter your admin token to view the pause status." : paused ?
      "Probing resumes automatically when the pause expires. You can close this page." : "Scheduled probes run at the normal cadence within the operating window.";
    element("pause-since").textContent = paused ? dateFormat.format(pause.since) : "—";
    element("pause-until").textContent = paused ? dateFormat.format(pause.until) : "—";
    element("pause-left").textContent = paused ? remaining(pause.until - Date.now() - clockOffset) : "—";
    element("last-updated").textContent = updatedAt ? "Last checked: " + dateFormat.format(updatedAt) + " UTC+8" : "Status not loaded";
  }

  function updateDuration() {
    const amount = Number(durationInput.value);
    const milliseconds = amount * unitMs[unitInput.value];
    const valid = Number.isSafeInteger(amount) && amount > 0 && milliseconds <= maxDurationMs;
    durationInput.max = String(maxDurationMs / unitMs[unitInput.value]);
    durationInput.setCustomValidity(valid ? "" : "Enter a positive whole number. The pause cannot exceed ${MAX_PAUSE_DAYS} days.");
    element("preview").textContent = valid ?
      "Estimated resume: " + dateFormat.format(Date.now() + clockOffset + milliseconds) + " UTC+8" : "Enter a valid pause duration.";
    presets.forEach((button) => button.setAttribute("aria-pressed", String(
      valid && Number(button.dataset.duration) * unitMs[button.dataset.unit] === milliseconds
    )));
  }

  function disconnect() {
    sessionVersion += 1;
    busy = false;
    token = "";
    tokenInput.value = "";
    pause = null;
    updatedAt = null;
    clockOffset = 0;
    element("feedback").hidden = true;
    renderStatus();
    updateDuration();
  }

  async function perform(path, method, credential, successMessage) {
    if (busy) return;
    const requestVersion = sessionVersion;
    busy = true;
    renderStatus();
    showMessage("Processing, please wait…", "info");
    try {
      const response = await fetch(path, {
        method,
        headers: { Authorization: "Bearer " + credential, Accept: "application/json" },
        cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error",
        signal: AbortSignal.timeout(15000)
      });
      if (requestVersion !== sessionVersion) return;
      if (response.status === 404) {
        disconnect();
        showMessage("Invalid token, or TRIGGER_TOKEN is not configured.", "error");
        tokenInput.focus();
        return;
      }
      if (!response.ok) throw new Error("Operation failed (HTTP " + response.status + "): " + (await response.text()).trim());
      const state = await response.json();
      if (requestVersion !== sessionVersion) return;
      if (!state || !Number.isFinite(state.generatedAt) || (state.pause !== null &&
          (!state.pause || !Number.isFinite(state.pause.since) || !Number.isFinite(state.pause.until)))) {
        throw new Error("Unable to read the server state. Refresh the status to confirm the result.");
      }
      token = credential;
      tokenInput.value = "";
      pause = state.pause;
      updatedAt = state.generatedAt;
      clockOffset = state.generatedAt - Date.now();
      showMessage(successMessage, "success");
    } catch (error) {
      if (requestVersion !== sessionVersion) return;
      showMessage(error instanceof Error && error.name === "Error" ? error.message :
        "The request did not complete; the action may still have taken effect. Refresh the status before trying again.", "error");
    } finally {
      if (requestVersion === sessionVersion) {
        busy = false;
        renderStatus();
        updateDuration();
      }
    }
  }

  element("connect-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const credential = tokenInput.value.trim();
    if (!credential) {
      showMessage("Enter your admin token.", "error");
      tokenInput.focus();
      return;
    }
    void perform("/api/admin/status", "GET", credential, "Connected. Current status loaded.");
  });
  element("disconnect").addEventListener("click", () => {
    disconnect();
    showMessage("Disconnected and token cleared. The probing state is unchanged.", "info");
    tokenInput.focus();
  });
  element("refresh").addEventListener("click", () => {
    void perform("/api/admin/status", "GET", token, "Status refreshed.");
  });
  element("pause-form").addEventListener("submit", (event) => {
    event.preventDefault();
    updateDuration();
    if (!element("pause-form").reportValidity()) return;
    const duration = String(Number(durationInput.value)) + unitInput.value;
    void perform("/pause?for=" + encodeURIComponent(duration), "POST", token, "Pause saved. Probing resumes automatically when it expires.");
  });
  element("resume").addEventListener("click", () => {
    void perform("/resume", "POST", token, "Pause cleared. Scheduled probing will resume at its normal cadence.");
  });
  presets.forEach((button) => button.addEventListener("click", () => {
    durationInput.value = button.dataset.duration;
    unitInput.value = button.dataset.unit;
    updateDuration();
  }));
  durationInput.addEventListener("input", updateDuration);
  unitInput.addEventListener("change", updateDuration);
  window.addEventListener("pagehide", disconnect);
  setInterval(() => { renderStatus(); updateDuration(); }, 1000);
  renderStatus();
  updateDuration();
</script>
</body>
</html>`;
}
