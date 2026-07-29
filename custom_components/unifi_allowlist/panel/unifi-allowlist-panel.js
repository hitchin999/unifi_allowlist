/**
 * WiFi Access panel for Home Assistant.
 *
 * UniFi-flavoured blue/slate design: glass header, summary tiles that stay put,
 * pill tabs with icons on desktop and a floating tab bar on phones. The tab bar
 * is always visible - it never hides on scroll - and there are no swipe
 * gestures, so a stray drag on a list can never change tabs.
 */

const REFRESH_MS = 10000;
const MAX_ROWS = 300;

const TABS = ["pending", "online", "allowed", "denied"];
const HASH_PREFIX = "#ual-";
// Longest the list may stay frozen for an animation before we force a render.
const RENDER_HOLD_MAX = 4000;

const STATUS_WORD = {
  allowed: "Allowed",
  unknown: "Unknown",
  denied: "Blocked",
  off: "Idle",
};

const TAB_DEFS = [
  {
    id: "pending",
    icon: "mdi:account-clock-outline",
    label: "Waiting on you",
    short: "Waiting",
  },
  { id: "online", icon: "mdi:wifi", label: "On wifi now", short: "On wifi" },
  {
    id: "allowed",
    icon: "mdi:shield-check-outline",
    label: "Allowed",
    short: "Allowed",
  },
  { id: "denied", icon: "mdi:cancel", label: "Blocked", short: "Blocked" },
];

/* Reported hostname -> icon. First match wins, so the specific patterns have to
   come before the generic ones. Purely cosmetic: a wrong guess costs nothing. */
const DEVICE_ICONS = [
  [/(^|[^a-z])(ipad|tablet|tab-?[0-9]|galaxy-?tab|kindle|fire-?hd)/, "mdi:tablet"],
  [/iphone|ipod|pixel|galaxy|oneplus|xiaomi|redmi|huawei|nokia|moto-?[ge]|sm-[ag][0-9]|phone/, "mdi:cellphone"],
  [/macbook|laptop|thinkpad|latitude|elitebook|ideapad|zenbook|xps-?1|surface|chromebook|notebook/, "mdi:laptop"],
  [/imac|mac-?mini|mac-?studio|desktop|workstation|-pc$|^pc-|tower/, "mdi:desktop-tower-monitor"],
  [/apple-?tv|appletv|chromecast|roku|firestick|fire-?tv|shield|bravia|-tv$|^tv-|smart-?tv|hisense|vizio|webos|lgwebos/, "mdi:television"],
  [/printer|laserjet|officejet|deskjet|envy|epson|brother|canon-?mf|scanner/, "mdi:printer"],
  [/echo|alexa|homepod|sonos|nest-?(mini|audio)|speaker|bose|denon|heos|receiver/, "mdi:speaker"],
  [/camera|-cam$|^cam-|webcam|doorbell|ring-|wyze|arlo|reolink|blink|nvr|protect/, "mdi:cctv"],
  [/watch|fitbit|garmin|band-?[0-9]/, "mdi:watch"],
  [/playstation|ps[45]|xbox|nintendo|switch-?[0-9]?$|steamdeck|steam-?deck/, "mdi:gamepad-variant"],
  [/thermostat|ecobee|nest-?(thermostat|learning)|honeywell/, "mdi:thermostat"],
  [/bulb|light|hue|lifx|nanoleaf|wled|govee/, "mdi:lightbulb"],
  [/plug|outlet|kasa|shelly|tasmota|sonoff|switchbot|smartplug/, "mdi:power-plug"],
  [/vacuum|roomba|roborock|deebot|neato/, "mdi:robot-vacuum"],
  [/esp-?[0-9]|esphome|esp32|esp8266|nodemcu|d1-?mini|tuya|zigbee|zwave|z-wave|bridge/, "mdi:chip"],
  [/washer|dryer|fridge|refrigerator|dishwasher|oven|microwave/, "mdi:washing-machine"],
  [/uap|^u6|^u7|nanohd|flexhd|usw|udm|uxg|unifi|access-?point|^ap-|-ap$|gateway|router|repeater|extender|-sw$|switch-?[0-9]/, "mdi:access-point-network"],
  [/nas|synology|qnap|truenas|unraid|server|proxmox|-srv/, "mdi:server"],
  [/pi-?hole|raspberry|rpi|-pi$|^pi-/, "mdi:raspberry-pi"],
  [/solar|inverter|enphase|tesla|powerwall|charger|wallbox|ev-/, "mdi:ev-station"],
  [/sensor|motion|contact|leak|smoke|detector/, "mdi:motion-sensor"],
];

const STYLES = `
  :host {
    /* UniFi Network blue over cool slate greys. */
    --ua-blue: #006fff;
    --ua-blue-d: #0559c9;
    --ua-blue-soft: #e9f2ff;
    --ua-bg: #f3f6fa;
    --ua-card: #ffffff;
    --ua-line: #e4eaf2;
    --ua-text: #16202e;
    --ua-muted: #64748b;
    --ua-off: #94a3b8;
    --ua-ok: #16a34a;   --ua-ok-bg: #e7f7ed;
    --ua-warn: #b45309; --ua-warn-bg: #fdf2e3;
    --ua-bad: #dc2626;  --ua-bad-bg: #fdeaea;

    --ua-glass-bg: linear-gradient(135deg, rgba(255,255,255,.92), rgba(255,255,255,.68));
    --ua-glass-border: rgba(255,255,255,.82);
    --ua-glass-shadow: 0 10px 30px rgba(12,26,48,.10), inset 0 1px 0 rgba(255,255,255,.9);
    --ua-shadow-sm: 0 1px 2px rgba(12,26,48,.05);
    --ua-pop-shadow: 0 18px 46px rgba(12,26,48,.20);
    --ua-overlay: rgba(12,26,48,.36);

    display: block;
    height: 100%;
    color: var(--ua-text);
  }

  :host-context(.dark) {
    --ua-blue: #3b8cff;
    --ua-blue-d: #2f7ae8;
    --ua-blue-soft: rgba(59,140,255,.16);
    --ua-bg: var(--primary-background-color, #101722);
    --ua-card: var(--card-background-color, #18212e);
    --ua-line: var(--divider-color, #2c3949);
    --ua-text: var(--primary-text-color, #eef2f8);
    --ua-muted: var(--secondary-text-color, #9aa7ba);
    --ua-off: #74839a;
    --ua-ok-bg: rgba(22,163,74,.18);
    --ua-warn-bg: rgba(180,83,9,.20);
    --ua-bad-bg: rgba(220,38,38,.18);
    --ua-glass-bg: linear-gradient(135deg, rgba(40,52,70,.80), rgba(16,23,35,.62));
    --ua-glass-border: rgba(255,255,255,.13);
    --ua-glass-shadow: 0 12px 34px rgba(0,0,0,.44), inset 0 1px 0 rgba(255,255,255,.10);
    --ua-pop-shadow: 0 18px 52px rgba(0,0,0,.55);
    --ua-overlay: rgba(0,0,0,.54);
  }

  /* Home Assistant switches theme through CSS variables, not the OS setting,
     so the palette follows an attribute we set from hass.themes.darkMode. The
     OS preference is only a fallback for the first paint. */
  :host([dark]) {
      --ua-blue: #3b8cff;
      --ua-blue-d: #2f7ae8;
      --ua-blue-soft: rgba(59,140,255,.16);
      --ua-bg: var(--primary-background-color, #101722);
      --ua-card: var(--card-background-color, #18212e);
      --ua-line: var(--divider-color, #2c3949);
      --ua-text: var(--primary-text-color, #eef2f8);
      --ua-muted: var(--secondary-text-color, #9aa7ba);
      --ua-off: #74839a;
      --ua-ok-bg: rgba(22,163,74,.18);
      --ua-warn-bg: rgba(180,83,9,.20);
      --ua-bad-bg: rgba(220,38,38,.18);
      --ua-glass-bg: linear-gradient(135deg, rgba(40,52,70,.80), rgba(16,23,35,.62));
      --ua-glass-border: rgba(255,255,255,.13);
      --ua-glass-shadow: 0 12px 34px rgba(0,0,0,.44), inset 0 1px 0 rgba(255,255,255,.10);
      --ua-pop-shadow: 0 18px 52px rgba(0,0,0,.55);
      --ua-overlay: rgba(0,0,0,.54);
  }

  * { box-sizing: border-box; }

  .wrap {
    position: relative;
    height: 100%;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--ua-bg);
    font-family: Inter, Roboto, -apple-system, "Segoe UI", sans-serif;
  }
  ha-icon { --mdc-icon-size: 20px; }

  /* ---------- header ---------- */

  /* every control on the header row shares one height, which is most of what
     makes a toolbar read as designed rather than assembled */
  :host { --ua-ctl: 36px; }

  .topbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 18px;
    background: var(--ua-card);
    border-bottom: 1px solid var(--ua-line);
    box-shadow: 0 1px 0 rgba(12,26,48,.03), 0 6px 18px -14px rgba(12,26,48,.28);
    z-index: 6;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
    margin-inline-end: auto;
  }
  .brand-ico {
    position: relative;
    flex: 0 0 auto;
    width: var(--ua-ctl); height: var(--ua-ctl);
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    background: var(--ua-blue-soft);
    color: var(--ua-blue);
    box-shadow: inset 0 0 0 1px rgba(0,111,255,.16);
  }
  .brand-ico ha-icon { --mdc-icon-size: 21px; }
  .brand-txt { min-width: 0; }
  .brand-txt h1 {
    margin: 0;
    font-size: 17px;
    font-weight: 750;
    letter-spacing: -.35px;
    line-height: 1.25;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .brand-txt .sub {
    font-size: 11.5px;
    color: var(--ua-muted);
    font-weight: 600;
    letter-spacing: .01em;
    line-height: 1.3;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .icon-btn {
    flex: 0 0 auto;
    appearance: none; border: none; background: transparent;
    color: var(--ua-muted); cursor: pointer;
    padding: 8px; border-radius: 11px;
    display: inline-flex; align-items: center; justify-content: center;
    transition: background .15s, color .15s;
  }
  .icon-btn:hover { background: var(--ua-bg); color: var(--ua-blue); }
  .icon-btn:focus-visible { outline: 2px solid var(--ua-blue); outline-offset: 1px; }
  .menu-btn { display: none; margin-inline-start: -6px; }
  :host([narrow]) .menu-btn { display: inline-flex; }
  .topbar .icon-btn {
    width: var(--ua-ctl); height: var(--ua-ctl);
    border: 1px solid transparent;
  }
  .topbar .icon-btn:hover { border-color: var(--ua-line); }

  /* ---------- enforcement status ---------- */

  #guard { display: flex; align-items: center; flex: 0 0 auto; min-width: 0; }
  .status {
    display: inline-flex; align-items: center;
    height: var(--ua-ctl);
    padding: 0 13px 0 11px;
    gap: 9px;
    border-radius: 999px;
    font-size: 12.5px; font-weight: 700;
    white-space: nowrap;
    border: 1px solid transparent;
    min-width: 0;
  }
  .status.on {
    background: var(--ua-ok-bg); color: var(--ua-ok);
    border-color: rgba(22,163,74,.26);
  }
  .status.off {
    background: var(--ua-warn-bg); color: var(--ua-warn);
    border-color: rgba(180,83,9,.26);
  }
  .beacon {
    position: relative;
    flex: 0 0 auto;
    width: 9px; height: 9px; border-radius: 50%;
    background: currentColor;
  }
  /* a slow halo says "live" without a spinner shouting it */
  .status.on .beacon::after {
    content: "";
    position: absolute; inset: -4px;
    border-radius: 50%;
    background: currentColor;
    opacity: .3;
    animation: beacon 2.4s ease-out infinite;
  }
  .status-txt { flex: 0 0 auto; letter-spacing: -.1px; }
  .status-scope {
    flex: 0 1 auto; min-width: 0;
    padding-inline-start: 9px;
    border-inline-start: 1px solid currentColor;
    font-size: 11.5px; font-weight: 650;
    opacity: .72;
    overflow: hidden; text-overflow: ellipsis;
    max-width: 190px;
  }

  /* ---------- site picker ---------- */

  .sitepick { position: relative; flex: 0 1 auto; min-width: 0; }
  .site-btn {
    display: inline-flex; align-items: center; gap: 7px;
    max-width: 260px; height: var(--ua-ctl);
    padding: 0 11px;
    font: inherit; font-size: 13px; font-weight: 650;
    color: var(--ua-text);
    background: var(--ua-bg);
    border: 1px solid var(--ua-line);
    border-radius: 999px;
    cursor: pointer;
  }
  .site-btn:hover { border-color: var(--ua-blue); }
  .site-btn:focus-visible { outline: 2px solid var(--ua-blue); outline-offset: 1px; }
  .site-btn ha-icon { --mdc-icon-size: 18px; color: var(--ua-muted); flex: 0 0 auto; }
  .site-btn .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .site-btn .badge {
    flex: 0 0 auto;
    background: var(--ua-warn-bg); color: var(--ua-warn);
    border-radius: 999px; font-size: 11px; font-weight: 800; padding: 1px 7px;
  }
  .sitepick.open .caret { transform: rotate(180deg); }
  .caret { transition: transform .18s ease; }

  .site-panel {
    position: absolute;
    top: calc(100% + 6px);
    inset-inline-end: 0;
    z-index: 30;
    min-width: 250px;
    max-width: min(92vw, 340px);
    max-height: 60vh; overflow-y: auto;
    padding: 6px;
    background: var(--ua-card);
    border: 1px solid var(--ua-line);
    border-radius: 14px;
    box-shadow: var(--ua-pop-shadow);
    animation: popIn .18s cubic-bezier(.2,.9,.2,1) both;
    overscroll-behavior: contain;
  }
  .site-opt {
    display: flex; align-items: center; gap: 9px;
    width: 100%; padding: 10px 11px;
    appearance: none; border: none; background: transparent;
    font: inherit; font-size: 13.5px; font-weight: 600; text-align: start;
    color: var(--ua-text); cursor: pointer; border-radius: 10px;
  }
  .site-opt:hover { background: var(--ua-bg); }
  .site-opt.sel { background: var(--ua-blue-soft); color: var(--ua-blue); }
  .site-opt ha-icon { --mdc-icon-size: 18px; flex: 0 0 auto; }
  .site-opt .nm { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
  .site-opt .badge {
    background: var(--ua-warn-bg); color: var(--ua-warn);
    border-radius: 999px; font-size: 11px; font-weight: 800; padding: 1px 7px;
  }

  /* ---------- summary tiles ---------- */

  .head-area {
    flex: 0 0 auto;
    background: var(--ua-card);
    border-bottom: 1px solid var(--ua-line);
    padding: 14px 18px 12px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .stat {
    display: flex; align-items: center; gap: 11px;
    padding: 12px 13px;
    text-align: start;
    appearance: none;
    font: inherit;
    background: var(--ua-bg);
    border: 1px solid var(--ua-line);
    border-radius: 15px;
    box-shadow: var(--ua-shadow-sm);
    color: var(--ua-text);
    cursor: pointer;
    transition: border-color .15s, box-shadow .18s, transform .18s;
  }
  .stat:hover { transform: translateY(-1px); border-color: var(--ua-blue); box-shadow: 0 6px 18px rgba(0,111,255,.12); }
  .stat:focus-visible { outline: 2px solid var(--ua-blue); outline-offset: 2px; }
  .stat[aria-current="true"] {
    background: var(--ua-card);
    border-color: currentColor;
    box-shadow: 0 6px 18px rgba(12,26,48,.10);
  }
  .stat-ico {
    flex: 0 0 auto;
    width: 40px; height: 40px;
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    background: var(--ua-blue-soft); color: var(--ua-blue);
  }
  .stat-ico ha-icon { --mdc-icon-size: 22px; }
  .stat.warn  { color: var(--ua-warn); } .stat.warn  .stat-ico { background: var(--ua-warn-bg); color: var(--ua-warn); }
  .stat.ok    { color: var(--ua-ok); }   .stat.ok    .stat-ico { background: var(--ua-ok-bg);   color: var(--ua-ok); }
  .stat.bad   { color: var(--ua-bad); }  .stat.bad   .stat-ico { background: var(--ua-bad-bg);  color: var(--ua-bad); }
  .stat.info  { color: var(--ua-blue); }
  .stat-body { min-width: 0; }
  .stat-val {
    display: block;
    font-size: 21px; font-weight: 800; letter-spacing: -.5px;
    line-height: 1.1;
    color: var(--ua-text);
  }
  .stat-t {
    display: block;
    font-size: 12px; font-weight: 700; color: var(--ua-muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .stat-s {
    display: block;
    font-size: 11px; font-weight: 600; color: var(--ua-off);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* ---------- banners ---------- */

  .banner {
    display: flex; align-items: flex-start; gap: 9px;
    padding: 11px 13px; margin-top: 12px;
    border-radius: 13px; font-size: 13.5px; font-weight: 600;
    border: 1px solid transparent;
  }
  .banner ha-icon { flex: 0 0 auto; --mdc-icon-size: 19px; margin-top: 1px; }
  .banner.err  { background: var(--ua-bad-bg);  color: var(--ua-bad);  border-color: rgba(220,38,38,.28); }
  .banner.warn { background: var(--ua-warn-bg); color: var(--ua-warn); border-color: rgba(180,83,9,.28); }

  /* ---------- tabs ---------- */

  .tabs {
    flex: 0 0 auto;
    display: flex; gap: 5px;
    padding: 10px 18px;
    background: var(--ua-card);
    border-bottom: 1px solid var(--ua-line);
    overflow-x: auto;
  }
  .tab {
    display: inline-flex; align-items: center; gap: 7px;
    appearance: none; border: none; background: transparent;
    font: inherit; font-size: 13.5px; font-weight: 650;
    color: var(--ua-muted);
    padding: 9px 14px; border-radius: 999px;
    cursor: pointer; white-space: nowrap;
    transition: background .15s, color .15s;
  }
  .tab ha-icon { --mdc-icon-size: 18px; }
  .tab:hover { background: var(--ua-bg); color: var(--ua-text); }
  .tab:focus-visible { outline: 2px solid var(--ua-blue); outline-offset: 2px; }
  .tab[aria-selected="true"] { background: var(--ua-blue); color: #fff; }
  .tab[aria-selected="true"] ha-icon { color: #fff; }
  .tab .lbl.short { display: none; }
  .tab .n {
    min-width: 20px; padding: 0 6px;
    border-radius: 999px;
    font-size: 11.5px; line-height: 19px; font-weight: 800; text-align: center;
    background: var(--ua-bg); color: var(--ua-muted);
  }
  .tab[aria-selected="true"] .n { background: rgba(255,255,255,.24); color: #fff; }
  .tab .n.alert { background: var(--ua-bad); color: #fff; }
  .tab[aria-selected="true"] .n.alert { background: #fff; color: var(--ua-bad); }

  /* ---------- toolbar ---------- */

  .tools {
    flex: 0 0 auto;
    padding: 12px 18px 0;
  }
  .search {
    display: flex; align-items: center; gap: 9px;
    height: 46px; padding: 0 14px;
    border-radius: 16px;
    background: var(--ua-glass-bg);
    border: 1px solid var(--ua-glass-border);
    box-shadow: var(--ua-glass-shadow);
    backdrop-filter: blur(16px) saturate(1.35);
    -webkit-backdrop-filter: blur(16px) saturate(1.35);
  }
  .search:focus-within { border-color: var(--ua-blue); }
  .search > ha-icon { color: var(--ua-muted); flex: 0 0 auto; }
  .search input {
    flex: 1 1 auto; min-width: 0;
    appearance: none; -webkit-appearance: none;
    border: none; background: transparent; outline: none;
    font: inherit; font-size: 14.5px; font-weight: 550;
    color: var(--ua-text);
  }
  .search input::placeholder { color: var(--ua-off); font-weight: 500; }
  /* the native search widgets duplicate our own clear button */
  .search input::-webkit-search-decoration,
  .search input::-webkit-search-cancel-button,
  .search input::-webkit-search-results-button { -webkit-appearance: none; display: none; }
  .clear-btn {
    appearance: none; border: none; background: transparent;
    color: var(--ua-off); cursor: pointer; padding: 3px;
    display: none; align-items: center; border-radius: 8px;
  }
  .clear-btn ha-icon { --mdc-icon-size: 18px; }
  .search.has-text .clear-btn { display: inline-flex; }
  .clear-btn:hover { color: var(--ua-bad); }

  /* ---------- list ---------- */

  .list-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 18px 22px;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }

  .bulk {
    display: flex; align-items: center; gap: 11px; flex-wrap: wrap;
    padding: 12px 14px; margin-bottom: 10px;
    border-radius: 15px;
    font-size: 13.5px; font-weight: 600;
    background: var(--ua-warn-bg);
    border: 1px solid rgba(180,83,9,.30);
    color: var(--ua-warn);
  }
  .bulk > ha-icon { flex: 0 0 auto; --mdc-icon-size: 20px; }
  .bulk .txt { flex: 1 1 200px; min-width: 0; }
  .bulk .btns { display: flex; gap: 8px; flex: 0 0 auto; }
  .bulk button {
    appearance: none; font: inherit; font-size: 13px; font-weight: 700;
    padding: 8px 14px; border-radius: 11px; cursor: pointer;
    border: 1px solid rgba(180,83,9,.35);
    background: var(--ua-card); color: var(--ua-warn);
  }
  .bulk button:hover { background: var(--ua-bg); }
  .bulk button.confirm { background: var(--ua-warn); color: #fff; border-color: transparent; }
  .bulk button:focus-visible { outline: 2px solid var(--ua-blue); outline-offset: 2px; }

  .row {
    display: flex; align-items: center; gap: 12px;
    padding: 11px 14px; margin-bottom: 9px;
    background: var(--ua-card);
    border: 1px solid var(--ua-line);
    border-radius: 16px;
    box-shadow: var(--ua-shadow-sm);
    transition: border-color .15s, box-shadow .18s;
  }
  .row:hover { border-color: rgba(0,111,255,.35); box-shadow: 0 4px 14px rgba(12,26,48,.07); }

  .ava {
    position: relative;
    flex: 0 0 auto;
    width: 42px; height: 42px;
    border-radius: 13px;
    display: flex; align-items: center; justify-content: center;
    background: var(--ua-blue-soft); color: var(--ua-blue);
  }
  .ava ha-icon { --mdc-icon-size: 22px; }
  .ava .dot {
    position: absolute;
    inset-inline-end: -2px; bottom: -2px;
    width: 13px; height: 13px;
    border-radius: 50%;
    border: 2.5px solid var(--ua-card);
  }
  .dot.allowed { background: var(--ua-ok); }
  .dot.denied  { background: var(--ua-bad); }
  .dot.unknown { background: var(--ua-warn); }
  .dot.off     { background: var(--ua-off); }
  .ava.allowed { background: var(--ua-ok-bg);   color: var(--ua-ok); }
  .ava.denied  { background: var(--ua-bad-bg);  color: var(--ua-bad); }
  .ava.unknown { background: var(--ua-warn-bg); color: var(--ua-warn); }
  .ava.off     { background: var(--ua-bg);      color: var(--ua-off); }

  .meta { flex: 1 1 auto; min-width: 0; }
  .name {
    display: inline-flex; align-items: center; gap: 6px;
    max-width: 100%;
    font-size: 15px; font-weight: 700; letter-spacing: -.1px;
    cursor: text; overflow-wrap: anywhere;
    border-radius: 6px;
  }
  .name.muted { color: var(--ua-muted); font-weight: 550; font-style: italic; }
  .name .pen { flex: 0 0 auto; opacity: 0; --mdc-icon-size: 15px; color: var(--ua-muted); transition: opacity .15s; }
  .name:hover .pen, .name:focus-visible .pen { opacity: 1; }
  .name:focus-visible { outline: 2px solid var(--ua-blue); outline-offset: 2px; }

  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
  .chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px; border-radius: 999px;
    font-size: 11px; font-weight: 750; letter-spacing: .01em;
    background: var(--ua-bg); color: var(--ua-muted);
    white-space: nowrap;
  }
  .chip ha-icon { --mdc-icon-size: 13px; }
  .chip.allowed { background: var(--ua-ok-bg);   color: var(--ua-ok); }
  .chip.unknown { background: var(--ua-warn-bg); color: var(--ua-warn); }
  .chip.denied  { background: var(--ua-bad-bg);  color: var(--ua-bad); }
  .chip.off     { background: var(--ua-bg);      color: var(--ua-off); }
  .chip.review  { background: var(--ua-warn-bg); color: var(--ua-warn); }
  .chip.net     { background: var(--ua-blue-soft); color: var(--ua-blue); }

  .detail {
    display: flex; flex-wrap: wrap; gap: 2px 12px;
    margin-top: 4px;
    font-size: 12.5px; font-weight: 550; color: var(--ua-muted);
  }
  .f { display: inline-flex; align-items: center; gap: 4px; overflow-wrap: anywhere; }
  .f ha-icon { --mdc-icon-size: 14px; color: var(--ua-off); flex: 0 0 auto; }
  .f.mono { font-family: var(--code-font-family, "Roboto Mono", ui-monospace, monospace); font-size: 12px; }

  input.rename {
    flex: 1 1 auto; min-width: 0; width: 100%;
    padding: 8px 11px; border-radius: 11px;
    font: inherit; font-size: 15px; font-weight: 650;
    color: var(--ua-text); background: var(--ua-bg);
    border: 1px solid var(--ua-blue);
  }
  input.rename:focus { outline: none; box-shadow: 0 0 0 3px var(--ua-blue-soft); }

  .side { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
  .actions { display: flex; gap: 7px; flex: 0 0 auto; }
  button.act {
    position: relative; overflow: hidden;
    appearance: none; font: inherit; font-size: 12.5px; font-weight: 700;
    padding: 8px 14px; border-radius: 11px; min-width: 84px;
    cursor: pointer; white-space: nowrap;
    display: inline-flex; align-items: center; justify-content: center; gap: 5px;
    border: 1px solid var(--ua-line);
    background: var(--ua-card); color: var(--ua-text);
    transition: background .15s, border-color .15s, color .15s;
  }
  button.act ha-icon { --mdc-icon-size: 16px; }
  button.act:hover { background: var(--ua-bg); }
  button.act.allow  { --fx: var(--ua-ok);  border-color: rgba(22,163,74,.42);  color: var(--ua-ok); }
  button.act.allow:hover  { background: var(--ua-ok-bg); }
  button.act.deny   { --fx: var(--ua-bad); border-color: rgba(220,38,38,.42);  color: var(--ua-bad); }
  button.act.deny:hover   { background: var(--ua-bad-bg); }
  button.act.forget { --fx: #4b5563; color: var(--ua-muted); }
  button.act:disabled { opacity: .45; cursor: default; }
  button.act:focus-visible { outline: 2px solid var(--ua-blue); outline-offset: 2px; }

  /* ---------- action confirmation ---------- */

  /* The verdict animates in place: the button floods with its own colour and
     draws the matching glyph, so the click has an answer before the controller
     has even replied. */
  button.act.firing {
    border-color: transparent;
    background: var(--ua-card);
    box-shadow: 0 4px 14px -4px var(--fx);
    transform: scale(1.02);
    transition: transform .2s cubic-bezier(.22,1,.36,1);
  }
  button.act.firing:disabled { opacity: 1; }
  button.act .flood {
    position: absolute;
    inset: -70%;
    border-radius: 50%;
    background: var(--fx);
    transform: scale(0);
    z-index: 0;
  }
  button.act.firing .flood { animation: flood .30s cubic-bezier(.3,.9,.35,1) forwards; }
  button.act .act-lbl {
    position: relative; z-index: 2;
    display: inline-flex; align-items: center; gap: 5px;
    transition: opacity .16s ease, transform .22s cubic-bezier(.22,1,.36,1);
  }
  button.act.firing .act-lbl { opacity: 0; transform: scale(.7); }
  .fx {
    position: absolute; inset: 0; z-index: 3;
    display: flex; align-items: center; justify-content: center;
    color: #fff;
    pointer-events: none;
  }
  .fx svg { width: 22px; height: 22px; display: block; overflow: visible; }
  .fx .fx-pop { animation: fxPop .34s cubic-bezier(.2,1.3,.3,1) .16s both; }

  /* tick */
  .fx-tick { stroke-dasharray: 27; stroke-dashoffset: 27; animation: draw .30s ease-out .20s forwards; }
  /* circle-slash */
  .fx-ring  { stroke-dasharray: 53; stroke-dashoffset: 53; animation: draw .34s ease-out .16s forwards; }
  .fx-slash { stroke-dasharray: 18; stroke-dashoffset: 18; animation: draw .22s ease-out .40s forwards; }
  /* bin */
  .fx-lid   { transform-box: view-box; transform-origin: 5px 7px; animation: lid .44s cubic-bezier(.3,1.5,.4,1) .18s both; }
  .fx-can   { stroke-dasharray: 34; stroke-dashoffset: 34; animation: draw .30s ease-out .20s forwards; }
  .fx-bars  { stroke-dasharray: 13; stroke-dashoffset: 13; animation: draw .22s ease-out .40s forwards; }

  /* the row echoes the verdict, then the forgotten one drops out of the list */
  .row.fired-allow  { border-color: rgba(22,163,74,.5);  background: var(--ua-ok-bg);  }
  .row.fired-deny   { border-color: rgba(220,38,38,.5);  background: var(--ua-bad-bg); }
  .row.fired-allow, .row.fired-deny { transition: background .3s ease, border-color .3s ease; }
  .row.fired-forget { animation: dropOut .34s ease-in .30s both; }
  /* on phones the sheet fires the action, so the avatar carries the glyph */
  .ava .fx { border-radius: inherit; background: var(--fx, #4b5563); }
  .ava.firing .fx-in { animation: fxPop .34s cubic-bezier(.2,1.3,.3,1) both; }

  .kebab { display: none; }
  .kebab ha-icon { --mdc-icon-size: 22px; }

  .empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 10px; padding: 56px 20px;
    font-size: 14px; font-weight: 600; color: var(--ua-muted); text-align: center;
  }
  .empty ha-icon { --mdc-icon-size: 40px; color: var(--ua-off); }
  .more { padding: 14px; text-align: center; font-size: 13px; font-weight: 600; color: var(--ua-muted); }
  .spin { animation: spin 1s linear infinite; }

  /* ---------- mobile action sheet ---------- */

  .row-menu {
    position: absolute; inset: 0;
    z-index: 46;
    background: var(--ua-overlay);
    display: none; align-items: flex-end;
  }
  .row-menu.show { display: flex; animation: fadeIn .16s ease-out both; }
  .row-menu.show .rm-sheet { animation: sheetIn .22s cubic-bezier(.2,.9,.2,1) both; }
  .row-menu.closing { display: flex; animation: fadeOut .18s ease-in both; }
  .row-menu.closing .rm-sheet { animation: sheetOut .18s cubic-bezier(.4,0,.8,.3) both; }
  .rm-sheet {
    width: 100%; max-width: 560px; margin: 0 auto;
    max-height: 84%; overflow-y: auto;
    padding: 8px 8px 16px;
    background: var(--ua-card);
    border-radius: 20px 20px 0 0;
    box-shadow: var(--ua-pop-shadow);
    overscroll-behavior: contain;
  }
  .rm-title { padding: 14px 12px 4px; font-size: 15.5px; font-weight: 750; overflow-wrap: anywhere; }
  .rm-sub { padding: 0 12px 10px; font-size: 12.5px; font-weight: 600; color: var(--ua-muted); overflow-wrap: anywhere; }
  .rm-act {
    display: flex; align-items: center; gap: 13px;
    width: 100%; padding: 15px 14px;
    appearance: none; border: none; background: transparent;
    font: inherit; font-size: 15px; font-weight: 650; text-align: start;
    color: var(--ua-text); cursor: pointer; border-radius: 13px;
  }
  .rm-act:hover { background: var(--ua-bg); }
  .rm-act ha-icon { --mdc-icon-size: 22px; color: var(--ua-blue); flex: 0 0 auto; }
  .rm-act.ok ha-icon { color: var(--ua-ok); }
  .rm-act.danger, .rm-act.danger ha-icon { color: var(--ua-bad); }
  .rm-cancel {
    width: 100%; padding: 14px; margin-top: 6px;
    appearance: none; border: none; border-radius: 13px;
    background: var(--ua-bg); color: var(--ua-muted);
    font: inherit; font-size: 15px; font-weight: 750; cursor: pointer;
  }

  /* ---------- toast ---------- */

  .toast {
    position: absolute;
    bottom: 22px; left: 50%;
    transform: translateX(-50%) translateY(16px);
    opacity: 0;
    z-index: 50;
    max-width: min(92%, 460px);
    padding: 11px 17px;
    border-radius: 13px;
    background: #16202e; color: #fff;
    font-size: 13.5px; font-weight: 650; text-align: center;
    box-shadow: 0 10px 32px rgba(0,0,0,.28);
    pointer-events: none;
    transition: opacity .22s, transform .22s;
  }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  .toast.ok  { background: var(--ua-ok); }
  .toast.err { background: var(--ua-bad); }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes beacon {
    0%   { transform: scale(.7); opacity: .38; }
    70%  { transform: scale(1.9); opacity: 0; }
    100% { transform: scale(1.9); opacity: 0; }
  }
  @keyframes flood { to { transform: scale(1); } }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @keyframes lid {
    0%   { transform: rotate(-34deg) translateY(-1px); }
    100% { transform: rotate(0) translateY(0); }
  }
  @keyframes fxPop {
    0%   { transform: scale(.55); opacity: 0; }
    60%  { transform: scale(1.06); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes dropOut {
    0%   { opacity: 1; transform: translateY(0) scale(1); }
    100% { opacity: 0; transform: translateY(-6px) scale(.97); }
  }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes fadeOut { from { opacity: 1 } to { opacity: 0 } }
  @keyframes popIn {
    0% { opacity: 0; transform: translateY(-6px) scale(.96); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes sheetIn {
    0% { opacity: .3; transform: translateY(26px) scale(.97); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes sheetOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: .3; transform: translateY(30px); }
  }

  /* ---------- phones ---------- */

  /* the scope is the first thing to go when the header gets tight */
  @media (max-width: 1040px) {
    .status-scope { display: none; }
    .status { padding: 0 13px; }
  }

  @media (max-width: 700px) {
    :host { --ua-ctl: 33px; }
    .topbar { padding: 9px 12px; gap: 8px; }
    .brand-ico { width: 30px; height: 30px; border-radius: 9px; }
    .brand-ico ha-icon { --mdc-icon-size: 19px; }
    .brand-txt h1 { font-size: 15.5px; }
    .brand-txt .sub { display: none; }
    /* the pill shrinks to just the beacon - the scope is still in its tooltip */
    .status-scope, .status-txt { display: none; }
    .status { padding: 0 10px; }
    .site-btn { max-width: 148px; padding: 0 9px; font-size: 12.5px; }

    .head-area { padding: 10px 12px; }
    /* four compact tiles in one row rather than a 2x2 block that eats the screen */
    .stats { gap: 7px; }
    .stat {
      flex-direction: column; align-items: center; gap: 3px;
      padding: 9px 4px; border-radius: 14px;
    }
    .stat-ico { width: 26px; height: 26px; border-radius: 8px; }
    .stat-ico ha-icon { --mdc-icon-size: 16px; }
    .stat-body { text-align: center; width: 100%; }
    .stat-val { font-size: 17px; }
    .stat-t { font-size: 10.5px; }
    .stat-s { display: none; }
    .banner { font-size: 13px; padding: 10px 12px; }

    .tools { padding: 10px 12px 0; }
    .search { height: 44px; border-radius: 15px; }
    .list-scroll { padding: 10px 12px 96px; }

    /* floating glass tab bar, pinned and always visible */
    .tabs {
      position: absolute;
      left: 10px; right: 10px; bottom: 12px;
      z-index: 37;
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 2px; padding: 6px;
      border: 1px solid var(--ua-glass-border);
      border-radius: 999px;
      background: var(--ua-glass-bg);
      box-shadow: var(--ua-glass-shadow);
      backdrop-filter: blur(24px) saturate(1.8);
      -webkit-backdrop-filter: blur(24px) saturate(1.8);
      overflow: visible;
    }
    .tab {
      position: relative;
      flex-direction: column; gap: 2px;
      padding: 7px 2px; min-width: 0;
      font-size: 10px; border-radius: 999px;
    }
    .tab ha-icon { --mdc-icon-size: 21px; }
    .tab .lbl.long { display: none; }
    .tab .lbl.short {
      display: block; font-size: 9.5px; font-weight: 700;
      max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .tab .n {
      position: absolute;
      top: 1px; inset-inline-end: 6px;
      min-width: 17px; padding: 0 4px;
      font-size: 10px; line-height: 16px;
      background: var(--ua-blue); color: #fff;
    }
    .tab[aria-selected="true"] { background: var(--ua-blue); color: #fff; }
    .tab[aria-selected="true"] .n { background: #fff; color: var(--ua-blue); }
    .tab .n.zero { display: none; }

    .row { padding: 10px 12px; gap: 10px; border-radius: 15px; }
    .ava { width: 38px; height: 38px; border-radius: 12px; }
    .ava ha-icon { --mdc-icon-size: 20px; }
    .name { font-size: 14.5px; }
    .name .pen { display: none; }
    .detail { font-size: 12px; gap: 1px 10px; }
    /* one kebab instead of a row of buttons that never fits */
    .actions { display: none; }
    .kebab { display: inline-flex; }
    .bulk { padding: 11px 12px; border-radius: 14px; }
    .bulk .btns { flex: 1 1 100%; }
    .bulk .btns button { flex: 1 1 auto; }
    .toast { bottom: 92px; }
  }

  @media (max-width: 380px) {
    .stat-t { font-size: 9.5px; }
    .stat-val { font-size: 15.5px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .stat, .row, .toast, .caret { transition: none; }
    .row-menu.show .rm-sheet, .row-menu.show, .site-panel { animation: none; }
    .status.on .beacon::after, .row.fired-forget { animation: none; }
    /* the verdict still lands, it just arrives without the theatre */
    button.act.firing .flood, .fx .fx-pop, .ava.firing .fx-in { animation: none; transform: scale(1); opacity: 1; }
    .fx-tick, .fx-ring, .fx-slash, .fx-can, .fx-bars { animation: none; stroke-dashoffset: 0; }
    .fx-lid { animation: none; }
    button.act.firing { transform: none; }
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
    this._siteOpen = false;
    this._rowMenu = null;
    this._rowMenuCloseToken = null;
    this._toast = null;
    this._toastTimer = null;
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

  // Overlays (bulk confirm, row sheet) each own a history entry so the hardware
  // back button dismisses them instead of leaving the panel.
  _pushOverlayHist(kind) {
    if (this._applyingPop || typeof window === "undefined" || !window.history) return;
    this._ensureBaseHist();
    try {
      window.history.pushState(
        { ual: true, kind, tab: this._tab },
        "",
        `${HASH_PREFIX}${this._tab}-${kind}`
      );
    } catch (e) {
      /* history unavailable */
    }
  }

  // Closing from the UI has to consume the entry it pushed, otherwise back
  // would just reopen it.
  _popOverlayHist(kind) {
    if (this._applyingPop || typeof window === "undefined" || !window.history) return;
    const cur = window.history.state || {};
    if (!(cur.ual && cur.kind === kind)) return;
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

  _closeConfirm() {
    const was = this._confirmBulk;
    this._confirmBulk = false;
    if (was) this._popOverlayHist("confirm");
  }

  _onPopState(ev) {
    if (this._ignorePop) {
      this._ignorePop = false;
      return;
    }
    const st = (ev && ev.state) || {};
    this._applyingPop = true;

    // a back press abandons an in-progress rename and any open overlay
    this._editing = null;
    this._siteOpen = false;

    if (this._rowMenu && !(st.ual && st.kind === "sheet")) {
      this._rowMenu = null;
      this._renderRowMenu();
    }
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

  set narrow(value) {
    this._narrow = Boolean(value);
    this.toggleAttribute("narrow", this._narrow);
  }

  get narrow() {
    return this._narrow === true;
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._syncTheme();
    if (first) {
      this._build();
      this._load();
    }
  }

  _syncTheme() {
    let dark = this._hass && this._hass.themes && this._hass.themes.darkMode;
    if (dark === undefined || dark === null) {
      try {
        dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      } catch (err) {
        dark = false;
      }
    }
    this.toggleAttribute("dark", Boolean(dark));
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this._timer = setInterval(() => this._load(), REFRESH_MS);
    window.addEventListener("popstate", this._boundPop);
    window.setTimeout(() => this._ensureBaseHist(), 0);
  }

  disconnectedCallback() {
    if (this._timer) clearInterval(this._timer);
    if (this._toastTimer) clearTimeout(this._toastTimer);
    window.removeEventListener("popstate", this._boundPop);
  }

  static _savedSite() {
    try {
      return window.localStorage.getItem("ual_site") || "";
    } catch (err) {
      return "";
    }
  }

  static _saveSite(id) {
    try {
      window.localStorage.setItem("ual_site", id || "");
    } catch (err) {
      /* private mode, or storage disabled - the picker still works */
    }
  }

  /* ---- data ---- */

  async _load() {
    if (!this._hass) return;
    if (this._entryId === undefined) this._entryId = UnifiAllowlistPanel._savedSite();
    try {
      const qs = this._entryId ? `?entry_id=${encodeURIComponent(this._entryId)}` : "";
      this._data = await this._hass.callApi("GET", `unifi_allowlist/data${qs}`);
      this._error = this._data.error || null;
      // The server falls back to the first site if the saved one is gone.
      if (this._data.entry_id) this._entryId = this._data.entry_id;
    } catch (err) {
      this._error = "Could not load data. Check that the integration is set up.";
    }
    this._loading = false;
    if (!this._editing) this._render();
  }

  async _call(service, payload) {
    try {
      const body = { ...(payload || {}) };
      if (this._entryId) body.site = this._entryId;
      await this._hass.callService("unifi_allowlist", service, body);
      await new Promise((r) => setTimeout(r, 500));
      await this._load();
      return true;
    } catch (err) {
      this._error = `The ${service} action failed.`;
      this._notify(`The ${service} action failed.`, "err");
      this._render();
      return false;
    }
  }

  /* Suppresses list re-rendering while a verdict animation plays, because a
     re-render would throw away the button being animated. Returns the release,
     which is idempotent and also fires on a watchdog: a counter that never
     comes back down would freeze the list until a page reload, which is a far
     worse outcome than a clipped animation. */
  _holdRender() {
    this._animating = (this._animating || 0) + 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this._animating = Math.max(0, (this._animating || 0) - 1);
    };
    window.setTimeout(() => {
      if (released) return;
      release();
      this._render();
    }, RENDER_HOLD_MAX);
    return release;
  }

  async _act(mac, service, btn) {
    if (this._busy[mac]) return;
    this._busy[mac] = true;
    const release = this._holdRender();
    let ok = false;
    try {
      // Play the confirmation in place while the call is in flight.
      const played = this._playAction(mac, service, btn);
      [ok] = await Promise.all([this._call(service, { mac }), played]);
    } finally {
      delete this._busy[mac];
      release();
    }
    if (ok) {
      const word =
        service === "allow" ? "Allowed" : service === "deny" ? "Blocked" : "Forgotten";
      this._notify(`${word} ${mac}`, service === "deny" ? "err" : "ok");
    }
    this._render();
  }

  /* Fills the pressed button with its verdict colour and draws the glyph: a
     tick for allow, a circle-slash for block, a tipping bin for forget. When
     the action came from the phone action sheet there is no button on screen,
     so the avatar carries the glyph instead. */
  _playAction(mac, service, btn) {
    const DUR = 760;

    let row = null;
    try {
      row = btn
        ? btn.closest(".row")
        : this.shadowRoot.querySelector(`.row[data-mac="${mac}"]`);
    } catch (e) {
      row = null;
    }

    if (btn) {
      btn.insertAdjacentHTML(
        "afterbegin",
        `<span class="flood"></span>${UnifiAllowlistPanel._fxSvg(service, "fx-pop")}`
      );
      btn.classList.add("firing");
      // the siblings must not accept a second verdict for the same device
      if (row) {
        row.querySelectorAll("button.act").forEach((b) => {
          b.disabled = true;
        });
      }
    } else if (row) {
      const ava = row.querySelector(".ava");
      if (ava) {
        ava.style.setProperty(
          "--fx",
          service === "allow"
            ? "var(--ua-ok)"
            : service === "deny"
            ? "var(--ua-bad)"
            : "#4b5563"
        );
        ava.insertAdjacentHTML("beforeend", UnifiAllowlistPanel._fxSvg(service, "fx-in"));
        ava.classList.add("firing");
      }
    }

    if (row) row.classList.add(`fired-${service}`);

    return new Promise((resolve) => setTimeout(resolve, DUR));
  }

  static _fxSvg(service, cls) {
    const open = `<span class="fx"><svg viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"
      class="${cls}">`;
    const close = `</svg></span>`;

    if (service === "allow") {
      return `${open}<path class="fx-tick" stroke-width="2.9"
        d="M4.6 12.9 L9.7 17.9 L19.5 6.7"/>${close}`;
    }
    if (service === "deny") {
      return `${open}<circle class="fx-ring" stroke-width="2.4" cx="12" cy="12" r="8.4"/>
        <path class="fx-slash" stroke-width="2.4" d="M6.1 6.1 L17.9 17.9"/>${close}`;
    }
    return `${open}<g class="fx-lid" stroke-width="2.2">
        <path d="M4.4 7.1 H19.6"/><path d="M9.5 7.1 V4.9 H14.5 V7.1"/></g>
      <path class="fx-can" stroke-width="2.2"
        d="M6.5 7.7 L7.4 19.1 A1.6 1.6 0 0 0 9 20.5 H15 A1.6 1.6 0 0 0 16.6 19.1 L17.5 7.7"/>
      <path class="fx-bars" stroke-width="2" d="M10.4 11.2 V17 M13.6 11.2 V17"/>${close}`;
  }

  /* ---- toast ---- */

  _notify(msg, kind) {
    this._toast = { msg, kind: kind || "" };
    this._renderToast();
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this._toast = null;
      this._renderToast();
    }, 3600);
  }

  _renderToast() {
    const el = this.shadowRoot && this.shadowRoot.getElementById("toast");
    if (!el) return;
    if (!this._toast) {
      el.className = "toast";
      return;
    }
    el.textContent = this._toast.msg;
    el.className = `toast show ${this._toast.kind}`;
  }

  /* ---- shell ---- */

  _build() {
    if (this._built) return;
    this._built = true;

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <div class="wrap">
        <header class="topbar">
          <button class="icon-btn menu-btn" id="menu" aria-label="Open sidebar" title="Menu">
            <ha-icon icon="mdi:menu"></ha-icon>
          </button>
          <div class="brand">
            <div class="brand-ico"><ha-icon icon="mdi:wifi-lock"></ha-icon></div>
            <div class="brand-txt">
              <h1 id="title">WiFi Access</h1>
              <div class="sub" id="sub"></div>
            </div>
          </div>
          <div class="sitepick" id="sitepick" hidden>
            <button class="site-btn" id="site-btn" aria-haspopup="listbox" aria-expanded="false">
              <ha-icon icon="mdi:router-network"></ha-icon>
              <span class="nm" id="site-name"></span>
              <span class="badge" id="site-badge" hidden></span>
              <ha-icon icon="mdi:chevron-down" class="caret"></ha-icon>
            </button>
            <div id="site-panel"></div>
          </div>
          <div id="guard"></div>
          <button class="icon-btn" id="refresh" aria-label="Refresh" title="Refresh">
            <ha-icon icon="mdi:refresh"></ha-icon>
          </button>
        </header>

        <div class="head-area">
          <div class="stats" id="stats"></div>
          <div id="banner"></div>
        </div>

        <nav class="tabs" role="tablist" id="tabs"></nav>

        <div class="tools">
          <div class="search" id="searchbox">
            <ha-icon icon="mdi:magnify"></ha-icon>
            <input id="search" type="search" autocomplete="off" spellcheck="false"
                   aria-label="Search devices"
                   placeholder="Search name, MAC, IP, SSID or AP">
            <button class="clear-btn" id="clear" aria-label="Clear search" title="Clear">
              <ha-icon icon="mdi:close-circle"></ha-icon>
            </button>
          </div>
        </div>

        <div class="list-scroll" id="list"></div>

        <div class="row-menu" id="row-menu"></div>
        <div class="toast" id="toast"></div>
      </div>
    `;

    const root = this.shadowRoot;

    root.getElementById("menu").addEventListener("click", () => {
      // Handled by <home-assistant> up in the light DOM.
      this.dispatchEvent(
        new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true })
      );
    });

    root.getElementById("refresh").addEventListener("click", (ev) => {
      const ico = ev.currentTarget.querySelector("ha-icon");
      if (ico) {
        ico.classList.add("spin");
        setTimeout(() => ico.classList.remove("spin"), 900);
      }
      this._load();
    });

    root.getElementById("site-btn").addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._siteOpen = !this._siteOpen;
      this._renderSitePicker();
    });

    root.getElementById("site-panel").addEventListener("click", (ev) => {
      ev.stopPropagation();
      const opt = ev.target.closest(".site-opt");
      if (!opt) return;
      this._siteOpen = false;
      this._pickSite(opt.dataset.entry);
    });

    // any click that is not on the picker closes it
    root.addEventListener("click", () => {
      if (this._siteOpen) {
        this._siteOpen = false;
        this._renderSitePicker();
      }
    });

    const search = root.getElementById("search");
    search.addEventListener("input", (ev) => {
      this._query = ev.target.value.trim().toLowerCase();
      root.getElementById("searchbox").classList.toggle("has-text", !!ev.target.value);
      this._renderList();
    });
    root.getElementById("clear").addEventListener("click", () => {
      search.value = "";
      this._query = "";
      root.getElementById("searchbox").classList.remove("has-text");
      search.focus();
      this._renderList();
    });

    root.getElementById("stats").addEventListener("click", (ev) => {
      const card = ev.target.closest(".stat");
      if (card && card.dataset.tab) this._goTab(card.dataset.tab);
    });

    root.getElementById("tabs").addEventListener("click", (ev) => {
      const btn = ev.target.closest("button.tab");
      if (btn) this._goTab(btn.dataset.tab);
    });

    const list = root.getElementById("list");

    list.addEventListener("click", (ev) => {
      const kebab = ev.target.closest("button.kebab");
      if (kebab) {
        this._openRowMenu(kebab.dataset.mac);
        return;
      }
      const btn = ev.target.closest("button.act");
      if (btn && !btn.disabled) {
        this._act(btn.dataset.mac, btn.dataset.service, btn);
        return;
      }
      const bulkBtn = ev.target.closest("button[data-bulk]");
      if (bulkBtn) {
        this._onBulk(bulkBtn.dataset.bulk);
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

  _goTab(tab) {
    if (!TABS.includes(tab) || tab === this._tab) return;
    this._tab = tab;
    this._confirmBulk = false;
    this._pushTabHist(tab);
    this._render();
    const list = this.shadowRoot.getElementById("list");
    if (list) list.scrollTop = 0;
  }

  _onBulk(which) {
    if (which === "go") {
      this._confirmBulk = true;
      this._pushOverlayHist("confirm");
      this._renderList();
      return;
    }
    if (which === "no") {
      this._closeConfirm();
      this._renderList();
      return;
    }
    if (which === "yes") {
      const pending = this._tab === "pending";
      this._closeConfirm();
      this._call(pending ? "forget_offline_pending" : "allow_online_unknown", {}).then(
        (ok) => {
          if (ok) this._notify(pending ? "Queue cleared" : "Devices allowed", "ok");
        }
      );
    }
  }

  _pickSite(id) {
    if (!id || id === this._entryId) {
      this._renderSitePicker();
      return;
    }
    this._entryId = id;
    UnifiAllowlistPanel._saveSite(id);
    // Anything half-finished belongs to the site we just left.
    this._editing = null;
    this._busy = {};
    this._rowMenu = null;
    this._renderRowMenu();
    this._closeConfirm();
    this._query = "";
    const search = this.shadowRoot.getElementById("search");
    if (search) {
      search.value = "";
      this.shadowRoot.getElementById("searchbox").classList.remove("has-text");
    }
    this._loading = true;
    this._render();
    this._load();
  }

  /* ---- rename ---- */

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
        const ok = await this._call("set_name", { mac, name: value });
        if (ok) this._notify(value ? `Renamed to ${value}` : "Name cleared", "ok");
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

  /* ---- mobile action sheet ---- */

  _openRowMenu(mac) {
    const row = this._rowsForTab().find((r) => r.mac === mac);
    if (!row) return;
    this._rowMenuCloseToken = null;
    this._rowMenu = row;
    this._pushOverlayHist("sheet");
    this._renderRowMenu();
  }

  _closeRowMenu(fromHistory) {
    const el = this.shadowRoot && this.shadowRoot.getElementById("row-menu");
    if (!fromHistory) this._popOverlayHist("sheet");
    if (!this._rowMenu || !el || !el.classList.contains("show")) {
      this._rowMenu = null;
      this._renderRowMenu();
      return;
    }
    const token = Date.now();
    this._rowMenuCloseToken = token;
    el.classList.add("closing");
    setTimeout(() => {
      if (this._rowMenuCloseToken !== token) return;
      this._rowMenu = null;
      this._rowMenuCloseToken = null;
      this._renderRowMenu();
    }, 200);
  }

  _renderRowMenu() {
    const el = this.shadowRoot && this.shadowRoot.getElementById("row-menu");
    if (!el) return;
    if (!this._rowMenu) {
      el.className = "row-menu";
      el.innerHTML = "";
      return;
    }

    const r = this._rowMenu;
    const show = this._buttonsFor(r);
    const act = (id, icon, label, cls) =>
      `<button class="rm-act ${cls || ""}" data-rm="${id}">
         <ha-icon icon="${icon}"></ha-icon>${label}</button>`;

    el.innerHTML = `
      <div class="rm-sheet">
        <div class="rm-title">${this._esc(r.name || "Unnamed device")}</div>
        <div class="rm-sub">${this._esc(
          [r.mac, r.ip, STATUS_WORD[r.status] || r.status].filter(Boolean).join("  ·  ")
        )}</div>
        ${act("rename", "mdi:pencil-outline", "Rename")}
        ${show.allow ? act("allow", "mdi:check-circle-outline", "Allow", "ok") : ""}
        ${show.deny ? act("deny", "mdi:cancel", "Block", "danger") : ""}
        ${show.forget ? act("forget", "mdi:delete-outline", "Forget", "danger") : ""}
        <button class="rm-cancel" data-rm="close">Cancel</button>
      </div>
    `;
    el.className = "row-menu show";

    el.onclick = (ev) => {
      if (ev.target === el) {
        this._closeRowMenu();
        return;
      }
      const btn = ev.target.closest("[data-rm]");
      if (!btn) return;
      const action = btn.dataset.rm;
      const mac = r.mac;
      this._closeRowMenu();
      if (action === "close") return;
      if (action === "rename") {
        // let the sheet finish closing before focusing the inline input
        setTimeout(() => {
          const cell = this.shadowRoot.querySelector(`.name[data-mac="${mac}"]`);
          if (cell) this._startEdit(cell);
        }, 220);
        return;
      }
      this._act(mac, action);
    };
  }

  /* ---- render ---- */

  _render() {
    if (!this._built || this._editing) return;

    const root = this.shadowRoot;
    const d = this._data;

    this._renderSitePicker();

    const multi = d && (d.sites || []).length > 1;
    const named = multi ? UnifiAllowlistPanel._siteName(d) : "";
    const sub = root.getElementById("sub");
    const guard = root.getElementById("guard");

    let bannerHtml = "";
    if (this._error) {
      bannerHtml +=
        `<div class="banner err"><ha-icon icon="mdi:alert-circle-outline"></ha-icon>` +
        `<span>${this._esc(this._error)}</span></div>`;
    }
    if (d && d.breaker) {
      bannerHtml +=
        `<div class="banner warn"><ha-icon icon="mdi:shield-alert-outline"></ha-icon>` +
        `<span>Too many unknown devices arrived at once, so nothing was blocked. ` +
        `Clear the queue or raise the limit in the integration options.</span></div>`;
    }
    root.getElementById("banner").innerHTML = bannerHtml;

    if (!d) {
      sub.textContent = this._loading ? "Connecting…" : "";
      guard.innerHTML = "";
      root.getElementById("stats").innerHTML = "";
      root.getElementById("tabs").innerHTML = "";
      root.getElementById("list").innerHTML = this._loading
        ? `<div class="empty"><ha-icon icon="mdi:loading" class="spin"></ha-icon>
             <span>Loading devices…</span></div>`
        : "";
      return;
    }

    const live = d.online.filter((r) => r.live);
    const liveMacs = new Set(live.map((r) => r.mac));
    const unknownLive = live.filter((r) => r.status === "unknown").length;
    const allowedLive = d.allowed.filter((e) => liveMacs.has(e.mac)).length;
    const deniedLive = d.denied.filter((e) => liveMacs.has(e.mac)).length;
    const offlinePending = d.pending.filter((p) => !p.live).length;

    const scope =
      d.scoped_ssids && d.scoped_ssids.length ? d.scoped_ssids.join(", ") : "all networks";

    // The scope lives in the status pill now, so the subtitle carries what is
    // not shown anywhere else. The site name is only repeated here when there
    // is no picker to show it.
    const nets = (d.ssids || []).length;
    const aps = (d.aps || []).length;
    const facts = [
      `${nets} network${nets === 1 ? "" : "s"}`,
      `${aps} access point${aps === 1 ? "" : "s"}`,
    ];
    sub.textContent = (named ? [named, ...facts] : facts).join(" · ");

    guard.innerHTML =
      `<span class="status ${d.enforcing ? "on" : "off"}" title="${this._esc(
        d.enforcing ? `Enforcing on: ${scope}` : "Nothing is being blocked"
      )}">` +
      `<span class="beacon"></span>` +
      `<span class="status-txt">${d.enforcing ? "Blocking on" : "Blocking off"}</span>` +
      `<span class="status-scope">${this._esc(scope)}</span></span>`;

    const stats = [
      {
        tab: "pending",
        cls: d.pending.length ? "warn" : "ok",
        icon: d.pending.length ? "mdi:account-clock" : "mdi:check-all",
        val: d.pending.length,
        title: "Waiting",
        sub: d.pending.length
          ? offlinePending
            ? `${offlinePending} gone offline`
            : "all still connected"
          : "nothing to answer",
      },
      {
        tab: "online",
        cls: "info",
        icon: "mdi:wifi",
        val: live.length,
        title: "On wifi",
        sub: unknownLive ? `${unknownLive} unknown` : "all known",
      },
      {
        tab: "allowed",
        cls: "ok",
        icon: "mdi:shield-check-outline",
        val: d.allowed.length,
        title: "Allowed",
        sub: `${allowedLive} on wifi`,
      },
      {
        tab: "denied",
        cls: d.denied.length ? "bad" : "",
        icon: "mdi:cancel",
        val: d.denied.length,
        title: "Blocked",
        sub: `${deniedLive} on wifi`,
      },
    ];

    root.getElementById("stats").innerHTML = stats
      .map(
        (s) => `<button class="stat ${s.cls}" data-tab="${s.tab}"
                  aria-current="${this._tab === s.tab}"
                  aria-label="${this._esc(`${s.title}: ${s.val}, ${s.sub}`)}">
                  <span class="stat-ico"><ha-icon icon="${s.icon}"></ha-icon></span>
                  <span class="stat-body">
                    <span class="stat-val">${s.val}</span>
                    <span class="stat-t">${s.title}</span>
                    <span class="stat-s">${this._esc(s.sub)}</span>
                  </span></button>`
      )
      .join("");

    const counts = {
      pending: d.pending.length,
      online: d.online.length,
      allowed: d.allowed.length,
      denied: d.denied.length,
    };

    root.getElementById("tabs").innerHTML = TAB_DEFS.map((t) => {
      const n = counts[t.id];
      const alert = t.id === "pending" && n > 0;
      return `<button class="tab" role="tab" data-tab="${t.id}"
                aria-selected="${this._tab === t.id}"
                aria-label="${t.label}, ${n}">
                <ha-icon icon="${t.icon}"></ha-icon
                ><span class="lbl long">${t.label}</span
                ><span class="lbl short">${t.short}</span
                ><span class="n${alert ? " alert" : ""}${n ? "" : " zero"}">${n}</span></button>`;
    }).join("");

    this._renderList();
    this._renderToast();
  }

  _renderSitePicker() {
    const root = this.shadowRoot;
    const wrap = root.getElementById("sitepick");
    if (!wrap) return;
    const d = this._data;
    const sites = (d && d.sites) || [];

    // Only worth showing when there is a choice to make.
    if (sites.length < 2) {
      wrap.hidden = true;
      wrap.classList.remove("open");
      root.getElementById("site-panel").innerHTML = "";
      return;
    }
    wrap.hidden = false;

    const current = this._entryId || (d && d.entry_id) || sites[0].entry_id;
    const cur = sites.find((s) => s.entry_id === current) || sites[0];

    root.getElementById("site-name").textContent = UnifiAllowlistPanel._siteName(cur);
    const badge = root.getElementById("site-badge");
    const otherWaiting = sites
      .filter((s) => s.entry_id !== current)
      .reduce((n, s) => n + (s.pending || 0), 0);
    badge.textContent = String(otherWaiting);
    badge.hidden = !otherWaiting;
    badge.title = `${otherWaiting} waiting on other sites`;

    const btn = root.getElementById("site-btn");
    btn.setAttribute("aria-expanded", String(this._siteOpen));
    wrap.classList.toggle("open", this._siteOpen);

    const panel = root.getElementById("site-panel");
    if (!this._siteOpen) {
      panel.className = "";
      panel.innerHTML = "";
      return;
    }
    panel.className = "site-panel";
    panel.setAttribute("role", "listbox");
    panel.innerHTML = sites
      .map((s) => {
        const sel = s.entry_id === current;
        return `<button class="site-opt${sel ? " sel" : ""}" role="option"
                  aria-selected="${sel}" data-entry="${this._esc(s.entry_id)}">
                  <ha-icon icon="${sel ? "mdi:check-circle" : "mdi:router-network"}"></ha-icon>
                  <span class="nm">${this._esc(UnifiAllowlistPanel._siteName(s))}</span>
                  ${s.pending ? `<span class="badge">${s.pending}</span>` : ""}
                </button>`;
      })
      .join("");
  }

  /* ---- rows ---- */

  _rowsForTab() {
    const d = this._data;
    if (!d) return [];

    if (this._tab === "online") {
      return d.online.map((r) => ({
        mac: r.mac,
        name: r.name,
        label: r.label,
        ip: r.ip,
        live: r.live,
        status: r.live ? r.status : "off",
        chips: [
          r.band ? { v: r.band, cls: "net", icon: "mdi:access-point" } : null,
          r.ssid ? { v: r.ssid, cls: "net", icon: "mdi:wifi" } : null,
          r.in_scope ? null : { v: "not policed", cls: "off", icon: "mdi:shield-off-outline" },
        ],
        fields: [
          { v: r.mac, mono: true, icon: "mdi:identifier" },
          { v: r.ip, mono: true, icon: "mdi:ip-network-outline" },
          { v: r.ap, icon: "mdi:router-wireless" },
          {
            v: r.signal != null ? `${r.signal} dBm` : "",
            icon: UnifiAllowlistPanel._signalIcon(r.signal),
          },
        ],
      }));
    }

    if (this._tab === "pending") {
      return d.pending.map((p) => ({
        mac: p.mac,
        name: p.name,
        label: p.label,
        ip: p.ip,
        live: p.live,
        status: "unknown",
        chips: [
          p.band ? { v: p.band, cls: "net", icon: "mdi:access-point" } : null,
          p.ssid ? { v: p.ssid, cls: "net", icon: "mdi:wifi" } : null,
          p.live
            ? { v: "still connected", cls: "unknown", icon: "mdi:lan-connect" }
            : { v: "gone offline", cls: "off", icon: "mdi:lan-disconnect" },
        ],
        fields: [
          { v: p.mac, mono: true, icon: "mdi:identifier" },
          { v: p.ip, mono: true, icon: "mdi:ip-network-outline" },
          { v: p.ap, icon: "mdi:router-wireless" },
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
      live: liveMacs.has(e.mac),
      review: e.review === true,
      status: liveMacs.has(e.mac) ? state : "off",
      // the verdict is a fact about the list, not about being connected
      verdict: state,
      chips: [
        liveMacs.has(e.mac)
          ? { v: "on wifi now", cls: "net", icon: "mdi:wifi" }
          : { v: "not connected", cls: "off", icon: "mdi:wifi-off" },
      ],
      fields: [
        { v: e.mac, mono: true, icon: "mdi:identifier" },
        { v: e.ip, mono: true, icon: "mdi:ip-network-outline" },
        { v: e.ap, icon: "mdi:router-wireless" },
      ],
    }));
  }

  _buttonsFor(r) {
    const status = typeof r === "string" ? r : r.status;
    const review = typeof r === "object" && r !== null && r.review === true;
    // Only offer an action that would actually change something.
    if (this._tab === "online") {
      return { allow: status !== "allowed", deny: status !== "denied", forget: false };
    }
    if (this._tab === "denied" && review) {
      // Blocked, but no verdict yet. Deny here means "confirm it".
      return { allow: true, deny: true, forget: true };
    }
    if (this._tab === "pending") {
      // Forget is not a verdict - it just drops the row. Randomised MACs make
      // the queue fill with entries that are never coming back.
      return { allow: true, deny: true, forget: true };
    }
    return {
      allow: this._tab === "denied",
      deny: this._tab === "allowed",
      forget: true,
    };
  }

  _renderList() {
    if (!this._data) return;
    // a verdict animation owns the list until it finishes
    if (this._animating) return;
    const list = this.shadowRoot.getElementById("list");
    let rows = this._rowsForTab();

    if (this._query) {
      const q = this._query;
      rows = rows.filter(
        (r) =>
          r.mac.includes(q) ||
          (r.name || "").toLowerCase().includes(q) ||
          (r.fields || []).some((f) => (f.v || "").toLowerCase().includes(q)) ||
          (r.chips || []).some((c) => c && (c.v || "").toLowerCase().includes(q))
      );
    }

    if (!rows.length) {
      list.innerHTML =
        `<div class="empty"><ha-icon icon="${this._emptyIcon()}"></ha-icon>` +
        `<span>${this._esc(this._emptyText())}</span></div>`;
      return;
    }

    const shown = rows.slice(0, MAX_ROWS);

    list.innerHTML =
      this._bulkHtml(rows) +
      shown.map((r) => this._rowHtml(r)).join("") +
      (rows.length > MAX_ROWS
        ? `<div class="more">Showing ${MAX_ROWS} of ${rows.length}. Search to narrow it down.</div>`
        : "");
  }

  _bulkHtml(rows) {
    if (this._query) return "";

    let n = 0;
    let text = "";
    let confirmText = "";
    let cta = "";
    let yes = "";

    if (this._tab === "pending") {
      n = rows.filter((r) => !r.live).length;
      if (!n) return "";
      text = `${n} waiting device${n === 1 ? " is" : "s are"} no longer on the wifi.`;
      confirmText =
        `Forget all ${n} waiting device${n === 1 ? "" : "s"} that ` +
        `${n === 1 ? "is" : "are"} not on the wifi now? They are not allowed or ` +
        `denied - they just leave the queue.`;
      cta = `Forget all ${n}`;
      yes = `Yes, forget ${n}`;
    } else if (this._tab === "online") {
      n = rows.filter((r) => r.status === "unknown").length;
      if (!n) return "";
      text = `${n} device${n === 1 ? " is" : "s are"} waiting on a decision.`;
      confirmText =
        `Approve all ${n} unknown device${n === 1 ? "" : "s"} on wifi right now? ` +
        `This cannot be undone in one step.`;
      cta = `Allow all ${n}`;
      yes = `Yes, allow ${n}`;
    } else {
      return "";
    }

    if (this._confirmBulk) {
      return `<div class="bulk">
          <ha-icon icon="mdi:help-circle-outline"></ha-icon>
          <span class="txt">${this._esc(confirmText)}</span>
          <span class="btns">
            <button data-bulk="no">Cancel</button>
            <button class="confirm" data-bulk="yes">${this._esc(yes)}</button>
          </span></div>`;
    }
    return `<div class="bulk">
        <ha-icon icon="mdi:broom"></ha-icon>
        <span class="txt">${this._esc(text)}</span>
        <span class="btns"><button data-bulk="go">${this._esc(cta)}</button></span>
      </div>`;
  }

  _rowHtml(r) {
    const busy = !!this._busy[r.mac];
    const dis = busy ? "disabled" : "";
    const show = this._buttonsFor(r);
    const label = r.name || "";

    const name =
      `<div class="name${label ? "" : " muted"}" data-mac="${r.mac}"` +
      ` role="button" tabindex="0" title="Click to rename">` +
      `<span>${this._esc(label || "no name reported")}</span>` +
      `<ha-icon class="pen" icon="mdi:pencil-outline"></ha-icon></div>`;

    const verdict = r.verdict || r.status;
    const statusChip = `<span class="chip ${verdict}">${
      STATUS_WORD[verdict] || verdict
    }</span>`;

    const reviewChip =
      this._tab === "denied" && r.review
        ? `<span class="chip review"><ha-icon icon="mdi:clock-alert-outline"></ha-icon>awaiting review</span>`
        : "";

    const chips =
      `<div class="chips">${statusChip}${reviewChip}${(r.chips || [])
        .filter(Boolean)
        .map(
          (c) =>
            `<span class="chip ${c.cls || ""}">${
              c.icon ? `<ha-icon icon="${c.icon}"></ha-icon>` : ""
            }${this._esc(c.v)}</span>`
        )
        .join("")}</div>`;

    const detail = (r.fields || [])
      .filter((f) => f.v)
      .map(
        (f) =>
          `<span class="f${f.mono ? " mono" : ""}">${
            f.icon ? `<ha-icon icon="${f.icon}"></ha-icon>` : ""
          }${this._esc(f.v)}</span>`
      )
      .join("");

    const btn = (svc, cls, icon, text) =>
      `<button class="act ${cls}" data-mac="${r.mac}" data-service="${svc}" ${dis}>
         <span class="act-lbl"><ha-icon icon="${icon}"></ha-icon>${text}</span></button>`;

    const actions =
      (show.allow ? btn("allow", "allow", "mdi:check", "Allow") : "") +
      (show.deny ? btn("deny", "deny", "mdi:cancel", "Block") : "") +
      (show.forget ? btn("forget", "forget", "mdi:delete-outline", "Forget") : "");

    return `
      <div class="row" data-mac="${r.mac}">
        <span class="ava ${r.status}">
          <ha-icon icon="${UnifiAllowlistPanel._deviceIcon(r.name || r.mac)}"></ha-icon>
          <span class="dot ${r.status}"></span>
        </span>
        <div class="meta">
          ${name}
          ${chips}
          <div class="detail">${detail}</div>
        </div>
        <div class="side">
          <div class="actions">${actions}</div>
          <button class="icon-btn kebab" data-mac="${r.mac}"
                  aria-label="Actions for ${this._esc(r.name || r.mac)}" ${dis}>
            <ha-icon icon="mdi:dots-vertical"></ha-icon>
          </button>
        </div>
      </div>`;
  }

  /* ---- helpers ---- */

  static _deviceIcon(name) {
    const n = String(name || "").toLowerCase();
    if (!n) return "mdi:help-network-outline";
    for (const [re, icon] of DEVICE_ICONS) {
      if (re.test(n)) return icon;
    }
    return "mdi:lan-connect";
  }

  static _signalIcon(dbm) {
    if (dbm == null) return "";
    if (dbm >= -55) return "mdi:wifi-strength-4";
    if (dbm >= -65) return "mdi:wifi-strength-3";
    if (dbm >= -72) return "mdi:wifi-strength-2";
    return "mdi:wifi-strength-1";
  }

  static _siteName(s) {
    const site = s.label || s.title || s.site || "";
    const controller = s.controller || "";
    if (controller && site) return `${controller} • ${site}`;
    return controller || site;
  }

  _emptyIcon() {
    if (this._query) return "mdi:magnify-close";
    if (this._tab === "pending") return "mdi:check-decagram-outline";
    if (this._tab === "denied") return "mdi:cancel";
    if (this._tab === "online") return "mdi:wifi-off";
    return "mdi:shield-outline";
  }

  _emptyText() {
    if (this._query) return "Nothing matches that search.";
    if (this._tab === "pending") return "Nothing waiting. Every device has been answered.";
    if (this._tab === "denied") return "Nothing is being blocked.";
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
