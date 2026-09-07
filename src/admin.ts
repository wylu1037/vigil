import { MAX_PAUSE_DAYS, SITE_TITLE } from "./config";

export function renderAdmin(nonce: string): string {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${SITE_TITLE} · 管理面板</title>
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
  .sub, .hint, footer { color: var(--muted); font-size: 12px; }
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
  footer { margin-top: 20px; line-height: 1.8; }
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
    <div><h1>管理面板</h1><div class="sub">${SITE_TITLE} · 定时探测控制</div></div>
    <a href="/">← 返回状态页</a>
  </header>

  <noscript><p class="feedback">此页面需要启用 JavaScript。也可通过 /pause 和 /resume 端点管理探测。</p></noscript>

  <section class="panel" id="connection">
    <form id="connect-form">
      <label for="token">管理令牌</label>
      <div class="token-row">
        <input id="token" type="password" required autocomplete="off" spellcheck="false" placeholder="输入 TRIGGER_TOKEN" aria-describedby="token-hint">
        <button class="primary" id="connect-button" type="submit">连接</button>
      </div>
      <p class="hint" id="token-hint">使用部署时配置的 TRIGGER_TOKEN。令牌仅保存在当前页面内存中，不写入地址栏或浏览器存储。</p>
    </form>
  </section>

  <div class="panel row spread" id="session" hidden>
    <span class="badge active">管理令牌已验证</span>
    <button id="disconnect" type="button">断开连接</button>
  </div>

  <div class="feedback" id="feedback" role="status" aria-live="polite" hidden></div>

  <section class="panel" aria-labelledby="status-label">
    <div class="row spread">
      <div class="row"><h2 id="status-label">当前节奏</h2><span class="badge" id="status-badge">未连接</span></div>
      <button id="refresh" type="button" disabled>刷新状态</button>
    </div>
    <h3 class="status-heading" id="status-heading">等待连接</h3>
    <p class="hint" id="status-description">输入管理令牌后查看暂停状态。</p>
    <dl>
      <div><dt>暂停开始 · UTC+8</dt><dd id="pause-since">—</dd></div>
      <div><dt>自动恢复 · UTC+8</dt><dd id="pause-until">—</dd></div>
      <div><dt>剩余暂停时间</dt><dd id="pause-left">—</dd></div>
    </dl>
    <div class="hint" id="last-updated">尚未读取状态</div>
  </section>

  <fieldset id="controls" disabled aria-label="暂停与恢复">
    <div class="actions">
      <section class="panel">
        <h2>暂停自动探测</h2>
        <p class="hint">选择暂停时长，到期自动恢复。再次暂停会重新计时。</p>
        <form id="pause-form">
          <label for="duration">暂停时长</label>
          <div class="duration">
            <input id="duration" type="number" value="1" min="1" max="${MAX_PAUSE_DAYS * 24}" step="1" required aria-describedby="duration-hint">
            <select id="unit" aria-label="时长单位"><option value="m">分钟</option><option value="h" selected>小时</option><option value="d">天</option></select>
          </div>
          <div class="presets" aria-label="常用暂停时长">
            <button type="button" data-duration="30" data-unit="m" aria-pressed="false">30 分钟</button>
            <button type="button" data-duration="1" data-unit="h" aria-pressed="true">1 小时</button>
            <button type="button" data-duration="6" data-unit="h" aria-pressed="false">6 小时</button>
            <button type="button" data-duration="1" data-unit="d" aria-pressed="false">1 天</button>
          </div>
          <p class="hint" id="duration-hint">仅支持正整数，最长 ${MAX_PAUSE_DAYS} 天。</p>
          <p class="hint" id="preview"></p>
          <button class="primary pause-button action-button" type="submit">暂停探测</button>
        </form>
      </section>
      <section class="panel">
        <h2>恢复自动探测</h2>
        <p class="hint">提前结束当前暂停，恢复原有的自动调度。</p>
        <p class="hint">恢复不会立即发送探测；下一个符合运行窗口的定时块才会执行。</p>
        <button class="primary action-button" id="resume" type="button" disabled>恢复探测</button>
      </section>
    </div>
  </fieldset>

  <footer>
    运行窗口：每天 UTC+8 07:00–23:59。暂停不取消已经开始的探测块，也不影响手动 /trigger。<br>
    KV 状态同步可能存在延迟；公开状态页另有 30 秒缓存。可点击「刷新状态」重新确认。
  </footer>
</main>
<script nonce="${nonce}">
  const element = (id) => document.getElementById(id);
  const tokenInput = element("token");
  const durationInput = element("duration");
  const unitInput = element("unit");
  const presets = document.querySelectorAll("[data-duration]");
  const unitMs = { m: 60000, h: 3600000, d: 86400000 };
  const maxDurationMs = ${MAX_PAUSE_DAYS} * unitMs.d;
  const dateFormat = new Intl.DateTimeFormat("zh-CN", {
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
    return (days ? days + " 天 " : "") + (hours ? hours + " 小时 " : "") +
      minutes + " 分 " + seconds % 60 + " 秒";
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
    badge.textContent = token ? paused ? "已暂停" : "未暂停" : "未连接";
    element("status-heading").textContent = token ? paused ? "自动探测已暂停" : "自动调度已启用" : "等待连接";
    element("status-description").textContent = !token ? "输入管理令牌后查看暂停状态。" : paused ?
      "暂停到期后自动恢复，无需保持此页面打开。" : "定时探测将在运行窗口内按原有节奏执行。";
    element("pause-since").textContent = paused ? dateFormat.format(pause.since) : "—";
    element("pause-until").textContent = paused ? dateFormat.format(pause.until) : "—";
    element("pause-left").textContent = paused ? remaining(pause.until - Date.now() - clockOffset) : "—";
    element("last-updated").textContent = updatedAt ? "最近确认：" + dateFormat.format(updatedAt) + " UTC+8" : "尚未读取状态";
  }

  function updateDuration() {
    const amount = Number(durationInput.value);
    const milliseconds = amount * unitMs[unitInput.value];
    const valid = Number.isSafeInteger(amount) && amount > 0 && milliseconds <= maxDurationMs;
    durationInput.max = String(maxDurationMs / unitMs[unitInput.value]);
    durationInput.setCustomValidity(valid ? "" : "请输入正整数，暂停时长不得超过 ${MAX_PAUSE_DAYS} 天。");
    element("preview").textContent = valid ?
      "预计恢复：" + dateFormat.format(Date.now() + clockOffset + milliseconds) + " UTC+8" : "请输入有效的暂停时长。";
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
    showMessage("正在处理，请稍候…", "info");
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
        showMessage("令牌无效，或服务尚未配置 TRIGGER_TOKEN。", "error");
        tokenInput.focus();
        return;
      }
      if (!response.ok) throw new Error("操作失败（HTTP " + response.status + "）：" + (await response.text()).trim());
      const state = await response.json();
      if (requestVersion !== sessionVersion) return;
      if (!state || !Number.isFinite(state.generatedAt) || (state.pause !== null &&
          (!state.pause || !Number.isFinite(state.pause.since) || !Number.isFinite(state.pause.until)))) {
        throw new Error("无法解析服务状态，请刷新状态确认操作结果。");
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
        "请求未完成，操作可能已经生效。请刷新状态确认后再重试。", "error");
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
      showMessage("请输入管理令牌。", "error");
      tokenInput.focus();
      return;
    }
    void perform("/api/admin/status", "GET", credential, "连接成功，已读取当前状态。");
  });
  element("disconnect").addEventListener("click", () => {
    disconnect();
    showMessage("已断开连接并清除令牌，探测状态保持不变。", "info");
    tokenInput.focus();
  });
  element("refresh").addEventListener("click", () => {
    void perform("/api/admin/status", "GET", token, "状态已更新。");
  });
  element("pause-form").addEventListener("submit", (event) => {
    event.preventDefault();
    updateDuration();
    if (!element("pause-form").reportValidity()) return;
    const duration = String(Number(durationInput.value)) + unitInput.value;
    void perform("/pause?for=" + encodeURIComponent(duration), "POST", token, "暂停已保存，到期后自动恢复。");
  });
  element("resume").addEventListener("click", () => {
    void perform("/resume", "POST", token, "暂停已解除，后续定时块将按原有节奏执行。");
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
