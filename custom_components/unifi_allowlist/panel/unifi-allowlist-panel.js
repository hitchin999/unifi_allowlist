const REFRESH_MS = 10000;
const MAX_ROWS = 300;

const TABS = ["pending", "online", "allowed", "denied"];
const HASH_PREFIX = "#ual-";

const STATUS_WORD = {
  allowed: "Allowed",
  unknown: "Unknown",
  denied: "Blocked",
  off: "Idle",
};

const STYLES = `
  :host {
    display: block;
    color: var(--primary-text-color);
    font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
  }
  .wrap {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 16px 24px;
    box-sizing: border-box;
  }

  /* header block stays put while the list scrolls under it */
  .sticky {
    position: sticky;
    top: 0;
    z-index: 3;
    padding-top: 16px;
    margin-bottom: 14px;
    background: var(--primary-background-color, var(--card-background-color));
    border-bottom: 1px solid var(--divider-color);
  }

  .head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap; margin-bottom: 12px;
  }
  .head h1 { margin: 0; font-size: 22px; font-weight: 500; }
  .sub { margin-top: 2px; font-size: 13px; color: var(--secondary-text-color); }
  .guard { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--secondary-text-color); }
  .pill { padding: 4px 11px; border-radius: 14px; font-size: 12px; font-weight: 500; border: 1px solid transparent; }
  .pill.on {
    background: color-mix(in srgb, var(--success-color, #3d9970) 16%, transparent);
    color: var(--success-color, #3d9970); border-color: var(--success-color, #3d9970);
  }
  .pill.off {
    background: color-mix(in srgb, var(--warning-color, #e8a33d) 16%, transparent);
    color: var(--warning-color, #e8a33d); border-color: var(--warning-color, #e8a33d);
  }

  .banner { padding: 10px 14px; margin-bottom: 12px; border-radius: 8px; font-size: 14px; color: #fff; }
  .banner.err { background: var(--error-color, #d9534f); }
  .banner.warn { background: var(--warning-color, #e8a33d); color: #1c1c1c; }

  .tabs { display: flex; gap: 4px; overflow-x: auto; }
  .tab {
    appearance: none; border: 0; background: none; font: inherit; font-size: 14px;
    color: var(--secondary-text-color); padding: 10px 14px; cursor: pointer;
    border-bottom: 2px solid transparent; white-space: nowrap;
  }
  .tab:hover { color: var(--primary-text-color); }
  .tab[aria-selected="true"] { color: var(--primary-color); border-bottom-color: var(--primary-color); font-weight: 500; }
  .tab .lbl.short { display: none; }
  .tab .n {
    display: inline-block; min-width: 18px; padding: 0 5px; margin-left: 6px;
    border-radius: 9px; font-size: 12px; line-height: 18px; text-align: center;
    background: var(--secondary-background-color); color: var(--secondary-text-color);
  }
  .tab[aria-selected="true"] .n { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .tab .n.alert { background: var(--error-color, #d9534f); color: #fff; }

  input.search {
    width: 100%; box-sizing: border-box; margin: 12px 0; padding: 10px 12px;
    font: inherit; font-size: 14px; color: var(--primary-text-color);
    background: var(--card-background-color);
    border: 1px solid var(--divider-color); border-radius: 8px;
  }
  input.search:focus { outline: 2px solid var(--primary-color); outline-offset: -1px; }

  .bulk {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap; padding: 10px 14px; margin-bottom: 8px;
    border-radius: 10px; font-size: 13.5px;
    background: color-mix(in srgb, var(--warning-color, #e8a33d) 12%, transparent);
    border: 1px solid var(--warning-color, #e8a33d);
  }
  .bulk button {
    appearance: none; font: inherit; font-size: 13px; font-weight: 500;
    padding: 7px 14px; border-radius: 18px; cursor: pointer;
    border: 1px solid var(--warning-color, #e8a33d);
    background: var(--card-background-color); color: var(--primary-text-color);
  }
  .bulk button:hover { background: var(--secondary-background-color); }
  .bulk button.confirm { background: var(--warning-color, #e8a33d); color: #1c1c1c; border-color: transparent; }
  .bulk button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }

  .row {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 10px 14px; margin-bottom: 8px;
    background: var(--card-background-color);
    border: 1px solid var(--divider-color); border-radius: 10px;
  }
  .dot { flex: 0 0 auto; width: 8px; height: 8px; margin-top: 7px; border-radius: 50%; }
  .dot.allowed { background: var(--success-color, #3d9970); }
  .dot.denied  { background: var(--error-color, #d9534f); }
  .dot.unknown { background: var(--warning-color, #e8a33d); }
  .dot.off     { background: var(--disabled-text-color, #9e9e9e); }

  .meta { flex: 1 1 auto; min-width: 0; }
  .name {
    display: flex; align-items: center; gap: 6px;
    font-size: 15px; font-weight: 500; cursor: text; overflow-wrap: anywhere;
  }
  .name.muted { color: var(--secondary-text-color); font-weight: 400; font-style: italic; }
  .name .pen { flex: 0 0 auto; opacity: 0; font-size: 13px; color: var(--secondary-text-color); }
  .name:hover .pen, .name:focus-visible .pen { opacity: 1; }
  .name:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; border-radius: 4px; }

  /* fields wrap rather than truncate, so nothing is ever unreadable */
  .detail {
    display: flex; flex-wrap: wrap; gap: 2px 12px;
    margin-top: 2px; font-size: 12.5px; color: var(--secondary-text-color);
  }
  .f { overflow-wrap: anywhere; }
  .f.mono { font-family: var(--code-font-family, "Roboto Mono", monospace); }

  input.rename {
    flex: 1 1 auto; min-width: 0; padding: 5px 8px; border-radius: 6px;
    font: inherit; font-size: 15px; font-weight: 500;
    color: var(--primary-text-color); background: var(--secondary-background-color);
    border: 1px solid var(--primary-color);
  }
  input.rename:focus { outline: none; }

  .side { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
  .chip {
    flex: 0 0 auto; padding: 3px 8px; border-radius: 10px;
    font-size: 11px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase;
    background: var(--secondary-background-color); color: var(--secondary-text-color);
  }
  .chip.allowed { color: var(--success-color, #3d9970); }
  .chip.unknown { color: var(--warning-color, #e8a33d); }
  .chip.denied  { color: var(--error-color, #d9534f); }

  .actions { display: flex; gap: 8px; flex: 0 0 auto; }
  button.act {
    appearance: none; font: inherit; font-size: 13px; padding: 7px 14px;
    border-radius: 18px; cursor: pointer; white-space: nowrap;
    border: 1px solid var(--divider-color);
    background: var(--card-background-color); color: var(--primary-text-color);
  }
  button.act:hover { background: var(--secondary-background-color); }
  button.act.allow { border-color: var(--success-color, #3d9970); color: var(--success-color, #3d9970); }
  button.act.deny  { border-color: var(--error-color, #d9534f); color: var(--error-color, #d9534f); }
  button.act:disabled { opacity: .45; cursor: default; }
  button.act:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }

  .empty { padding: 44px 20px; text-align: center; font-size: 14px; color: var(--secondary-text-color); }
  .more { padding: 12px; text-align: center; font-size: 13px; color: var(--secondary-text-color); }

  @media (max-width: 700px) {
    .wrap { padding: 0 12px 20px; }
    .head h1 { font-size: 20px; }
    /* all four tabs visible at once rather than a scrolling strip */
    .tabs { display: grid; grid-template-columns: repeat(4, 1fr); overflow-x: visible; }
    .tab {
      padding: 10px 2px; font-size: 12.5px; min-width: 0;
      display: flex; align-items: center; justify-content: center; gap: 4px;
    }
    .tab .lbl.long { display: none; }
    .tab .lbl.short { display: inline; }
    .tab .n { margin-left: 0; padding: 0 5px; font-size: 11px; }
    .row { padding: 10px 12px; gap: 8px; }
    .name { font-size: 14.5px; }
    .detail { font-size: 12px; gap: 1px 10px; }
    /* chip above the buttons keeps rows compact instead of full width */
    .side { flex-direction: column; align-items: flex-end; gap: 6px; }
    button.act { padding: 6px 12px; }
  }
`;

class UnifiAllowlistPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._data = null;
    this._tab = "pending";
    this._query = "";
    this._busy = {};
    this._loading = true;
    this._error = null;
    this._timer = null;
    this._built = false;
    this._editing = null;
    this._confirmBulk = false;
    this._boundPop = (ev) => this._onPopState(ev);
    this._applyingPop = false;
    this._ignorePop = false;

    const fromHash = UnifiAllowlistPanel._tabFromHash();
    if (fromHash) this._tab = fromHash;
  }

  /* ---- in-panel history: hardware back moves between tabs, not out ---- */

  static _tabFromHash() {
    const h = (typeof window !== "undefined" && window.location.hash) || "";
    const m = new RegExp(`^${HASH_PREFIX}([a-z]+)`).exec(h);
    return m && TABS.includes(m[1]) ? m[1] : null;
  }

  _ensureBaseHist() {
    if (typeof window === "undefined" || !window.history) return;
    const cur = window.history.state || {};
    if (cur.ual) return;
    try {
      window.history.replaceState(
        { ual: true, kind: "tab", tab: this._tab },
        "",
        HASH_PREFIX + this._tab
      );
    } catch (e) {
      /* history unavailable */
    }
  }

  _pushTabHist(tab) {
    if (this._applyingPop || typeof window === "undefined" || !window.history) return;
    const cur = window.history.state || {};
    if (cur.ual && cur.kind === "tab" && cur.tab === tab) return;
    const state = { ual: true, kind: "tab", tab };
    try {
      if (cur.ual) window.history.pushState(state, "", HASH_PREFIX + tab);
      else window.history.replaceState(state, "", HASH_PREFIX + tab);
    } catch (e) {
      /* history unavailable */
    }
  }

  _pushConfirmHist() {
    if (this._applyingPop || typeof window === "undefined" || !window.history) return;
    this._ensureBaseHist();
    try {
      window.history.pushState(
        { ual: true, kind: "confirm", tab: this._tab },
        "",
        `${HASH_PREFIX}${this._tab}-confirm`
      );
    } catch (e) {
      /* history unavailable */
    }
  }

  // Closing the confirm from the UI has to consume the entry it pushed,
  // otherwise back would just reopen it.
  _closeConfirm() {
    this._confirmBulk = false;
    if (this._applyingPop || typeof window === "undefined" || !window.history) return;
    const cur = window.history.state || {};
    if (!(cur.ual && cur.kind === "confirm")) return;
    this._ignorePop = true;
    try {
      window.history.back();
    } catch (e) {
      this._ignorePop = false;
    }
    window.setTimeout(() => {
      this._ignorePop = false;
    }, 350);
  }

  _onPopState(ev) {
    if (this._ignorePop) {
      this._ignorePop = false;
      return;
    }
    const st = (ev && ev.state) || {};
    this._applyingPop = true;

    // a back press abandons an in-progress rename
    this._editing = null;

    if (this._confirmBulk && !(st.ual && st.kind === "confirm")) {
      this._confirmBulk = false;
    }

    if (st.ual && st.kind === "tab" && st.tab && st.tab !== this._tab) {
      this._tab = st.tab;
      this._query = "";
      const box = this.shadowRoot && this.shadowRoot.getElementById("search");
      if (box) box.value = "";
    }

    this._applyingPop = false;
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) {
      this._build();
      this._load();
    }
  }

  connectedCallback() {
    this._timer = setInterval(() => this._load(), REFRESH_MS);
    window.addEventListener("popstate", this._boundPop);
    window.setTimeout(() => this._ensureBaseHist(), 0);
  }

  disconnectedCallback() {
    if (this._timer) clearInterval(this._timer);
    window.removeEventListener("popstate", this._boundPop);
  }

  async _load() {
    if (!this._hass) return;
    try {
      this._data = await this._hass.callApi("GET", "unifi_allowlist/data");
      this._error = this._data.error || null;
    } catch (err) {
      this._error = "Could not load data. Check that the integration is set up.";
    }
    this._loading = false;
    if (!this._editing) this._render();
  }

  async _call(service, payload) {
    try {
      await this._hass.callService("unifi_allowlist", service, payload || {});
      await new Promise((r) => setTimeout(r, 500));
      await this._load();
    } catch (err) {
      this._error = `The ${service} action failed.`;
      this._render();
    }
  }

  async _act(mac, service) {
    this._busy[mac] = true;
    this._render();
    await this._call(service, { mac });
    delete this._busy[mac];
    this._render();
  }

  _build() {
    if (this._built) return;
    this._built = true;

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <div class="wrap">
        <div class="sticky">
          <div class="head">
            <div>
              <h1>Wifi Access</h1>
              <div class="sub" id="sub"></div>
            </div>
            <div class="guard" id="guard"></div>
          </div>
          <div id="banner"></div>
          <div class="tabs" role="tablist" id="tabs"></div>
          <input class="search" id="search" type="search"
                 placeholder="Search by name, MAC or IP" autocomplete="off">
        </div>
        <div id="list"></div>
      </div>
    `;

    const root = this.shadowRoot;

    root.getElementById("search").addEventListener("input", (ev) => {
      this._query = ev.target.value.trim().toLowerCase();
      this._renderList();
    });

    root.getElementById("tabs").addEventListener("click", (ev) => {
      const btn = ev.target.closest("button.tab");
      if (!btn) return;
      if (btn.dataset.tab === this._tab) return;
      this._tab = btn.dataset.tab;
      this._confirmBulk = false;
      this._pushTabHist(this._tab);
      this._render();
    });

    const list = root.getElementById("list");

    list.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button.act");
      if (btn && !btn.disabled) {
        this._act(btn.dataset.mac, btn.dataset.service);
        return;
      }
      if (ev.target.id === "bulkGo") {
        this._confirmBulk = true;
        this._pushConfirmHist();
        this._renderList();
        return;
      }
      if (ev.target.id === "bulkNo") {
        this._closeConfirm();
        this._renderList();
        return;
      }
      if (ev.target.id === "bulkYes") {
        this._closeConfirm();
        this._call("allow_online_unknown", {});
        return;
      }
      const cell = ev.target.closest(".name");
      if (cell && cell.dataset.mac) this._startEdit(cell);
    });

    list.addEventListener("keydown", (ev) => {
      const cell = ev.target.closest(".name");
      if (cell && cell.dataset.mac && (ev.key === "Enter" || ev.key === " ")) {
        ev.preventDefault();
        this._startEdit(cell);
      }
    });
  }

  _startEdit(cell) {
    if (this._editing) return;
    const mac = cell.dataset.mac;
    const current = (this._rowsForTab().find((r) => r.mac === mac) || {}).label || "";
    this._editing = mac;

    const input = document.createElement("input");
    input.className = "rename";
    input.type = "text";
    input.value = current;
    input.placeholder = "Name this device";
    input.setAttribute("aria-label", `Name for ${mac}`);

    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      this._editing = null;
      if (save && value !== current) {
        await this._call("set_name", { mac, name: value });
      } else {
        this._render();
      }
    };

    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") finish(true);
      if (ev.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));

    cell.replaceWith(input);
    input.focus();
    input.select();
  }

  _render() {
    if (!this._built || this._editing) return;

    const root = this.shadowRoot;
    const d = this._data;
    const banner = root.getElementById("banner");
    const sub = root.getElementById("sub");
    const guard = root.getElementById("guard");

    let bannerHtml = "";
    if (this._error) {
      bannerHtml += `<div class="banner err">${this._esc(this._error)}</div>`;
    }
    if (d && d.breaker) {
      bannerHtml +=
        `<div class="banner warn">Too many unknown devices arrived at once, so nothing was blocked. ` +
        `Clear the queue or raise the limit in the integration options.</div>`;
    }
    banner.innerHTML = bannerHtml;

    if (!d) {
      sub.textContent = this._loading ? "Loading" : "";
      guard.innerHTML = "";
      root.getElementById("tabs").innerHTML = "";
      root.getElementById("list").innerHTML = this._loading
        ? '<div class="empty">Loading</div>'
        : "";
      return;
    }

    const live = d.online.filter((r) => r.live).length;
    sub.textContent =
      `${live} on wifi now \u00B7 ${d.allowed.length} allowed \u00B7 ${d.denied.length} denied`;

    const scope =
      d.scoped_ssids && d.scoped_ssids.length ? d.scoped_ssids.join(", ") : "all networks";
    guard.innerHTML =
      `<span class="pill ${d.enforcing ? "on" : "off"}">` +
      `${d.enforcing ? "Blocking on" : "Blocking off"}</span>` +
      `<span>${this._esc(scope)}</span>`;

    const tabs = [
      {
        id: "pending", label: "Waiting on you", short: "Waiting",
        n: d.pending.length, alert: d.pending.length > 0,
      },
      { id: "online", label: "On wifi now", short: "On wifi", n: d.online.length, alert: false },
      { id: "allowed", label: "Allowed", short: "Allowed", n: d.allowed.length, alert: false },
      { id: "denied", label: "Denied", short: "Denied", n: d.denied.length, alert: false },
    ];

    root.getElementById("tabs").innerHTML = tabs
      .map(
        (t) => `<button class="tab" role="tab" data-tab="${t.id}"
                  aria-selected="${this._tab === t.id}"
                  aria-label="${t.label}, ${t.n}">
                  <span class="lbl long">${t.label}</span
                  ><span class="lbl short">${t.short}</span
                  ><span class="n${t.alert ? " alert" : ""}">${t.n}</span></button>`
      )
      .join("");

    this._renderList();
  }

  _rowsForTab() {
    const d = this._data;

    if (this._tab === "online") {
      return d.online.map((r) => ({
        mac: r.mac,
        name: r.name,
        label: r.label,
        ip: r.ip,
        status: r.live ? r.status : "off",
        fields: [
          { v: r.mac, mono: true },
          { v: r.ip, mono: true },
          { v: r.ssid },
          { v: r.ap },
          { v: r.band },
          { v: r.signal != null ? `${r.signal} dBm` : "" },
          { v: r.in_scope ? "" : "not policed" },
        ],
      }));
    }

    if (this._tab === "pending") {
      return d.pending.map((p) => ({
        mac: p.mac,
        name: p.name,
        label: p.label,
        ip: p.ip,
        status: "unknown",
        fields: [
          { v: p.mac, mono: true },
          { v: p.ip, mono: true },
          { v: p.ssid },
          { v: p.ap },
          { v: p.band },
          { v: p.live ? "still connected" : "gone offline" },
        ],
      }));
    }

    const liveMacs = new Set(d.online.filter((r) => r.live).map((r) => r.mac));
    const list = this._tab === "allowed" ? d.allowed : d.denied;
    const state = this._tab === "allowed" ? "allowed" : "denied";

    return list.map((e) => ({
      mac: e.mac,
      name: e.name,
      label: e.label,
      ip: e.ip,
      status: liveMacs.has(e.mac) ? state : "off",
      fields: [
        { v: e.mac, mono: true },
        { v: e.ip, mono: true },
        { v: e.ap },
        { v: liveMacs.has(e.mac) ? "on wifi now" : "" },
      ],
    }));
  }

  _buttonsFor(status) {
    // Only offer an action that would actually change something.
    if (this._tab === "online") {
      return { allow: status !== "allowed", deny: status !== "denied", forget: false };
    }
    if (this._tab === "pending") {
      return { allow: true, deny: true, forget: false };
    }
    return {
      allow: this._tab === "denied",
      deny: this._tab === "allowed",
      forget: true,
    };
  }

  _renderList() {
    if (!this._data) return;
    const list = this.shadowRoot.getElementById("list");
    let rows = this._rowsForTab();

    if (this._query) {
      const q = this._query;
      rows = rows.filter(
        (r) =>
          r.mac.includes(q) ||
          (r.name || "").toLowerCase().includes(q) ||
          (r.fields || []).some((f) => (f.v || "").toLowerCase().includes(q))
      );
    }

    if (!rows.length) {
      list.innerHTML = `<div class="empty">${this._esc(this._emptyText())}</div>`;
      return;
    }

    let bulk = "";
    if (this._tab === "online" && !this._query) {
      const n = rows.filter((r) => r.status === "unknown").length;
      if (n) {
        bulk = this._confirmBulk
          ? `<div class="bulk"><span>Approve all ${n} unknown device${
              n === 1 ? "" : "s"
            } on wifi right now? This cannot be undone in one step.</span>
             <span><button id="bulkNo">Cancel</button>
             <button class="confirm" id="bulkYes">Yes, allow ${n}</button></span></div>`
          : `<div class="bulk"><span>${n} device${
              n === 1 ? " is" : "s are"
            } waiting on a decision.</span>
             <button id="bulkGo">Allow all ${n}</button></div>`;
      }
    }

    const shown = rows.slice(0, MAX_ROWS);

    list.innerHTML =
      bulk +
      shown
        .map((r) => {
          const busy = !!this._busy[r.mac];
          const d = busy ? "disabled" : "";
          const show = this._buttonsFor(r.status);

          const label = r.name || "";
          const name =
            `<div class="name${label ? "" : " muted"}" data-mac="${r.mac}"` +
            ` role="button" tabindex="0" title="Click to rename">` +
            `${this._esc(label || "no name reported")}` +
            `<span class="pen" aria-hidden="true">&#9998;</span></div>`;

          const detail = (r.fields || [])
            .filter((f) => f.v)
            .map((f) => `<span class="f${f.mono ? " mono" : ""}">${this._esc(f.v)}</span>`)
            .join("");

          const chip =
            this._tab === "online"
              ? `<span class="chip ${r.status}">${STATUS_WORD[r.status] || r.status}</span>`
              : "";

          const allow = show.allow
            ? `<button class="act allow" data-mac="${r.mac}" data-service="allow" ${d}>Allow</button>`
            : "";
          const deny = show.deny
            ? `<button class="act deny" data-mac="${r.mac}" data-service="deny" ${d}>Deny</button>`
            : "";
          const forget = show.forget
            ? `<button class="act" data-mac="${r.mac}" data-service="forget" ${d}>Forget</button>`
            : "";

          return `
          <div class="row">
            <span class="dot ${r.status}"></span>
            <div class="meta">
              ${name}
              <div class="detail">${detail}</div>
            </div>
            <div class="side">${chip}<div class="actions">${allow}${deny}${forget}</div></div>
          </div>`;
        })
        .join("") +
      (rows.length > MAX_ROWS
        ? `<div class="more">Showing ${MAX_ROWS} of ${rows.length}. Search to narrow it down.</div>`
        : "");
  }

  _emptyText() {
    if (this._query) return "Nothing matches that search.";
    if (this._tab === "pending") return "Nothing waiting. Every device has been answered.";
    if (this._tab === "denied") return "No devices denied yet.";
    if (this._tab === "online") return "No wireless devices connected.";
    return "The allow list is empty.";
  }

  _esc(str) {
    return String(str == null ? "" : str).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])
    );
  }
}

customElements.define("unifi-allowlist-panel", UnifiAllowlistPanel);
