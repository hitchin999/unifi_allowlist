/**
 * WiFi Access panel for Home Assistant.
 *
 * UniFi-flavoured blue/slate design: glass header, summary tiles that stay put,
 * pill tabs with icons on desktop and a floating tab bar on phones. The tab bar
 * is always visible - it never hides on scroll - and there are no swipe
 * gestures, so a stray drag on a list can never change tabs.
 */

const REFRESH_MS = 10000;
// Bumped whenever this file changes, so the loaded build can be identified
// from devtools: inspect the panel element and read data-panel-version.
const PANEL_VERSION = "1.11.6";
const MAX_ROWS = 300;
// Each row carries seven <ha-icon> custom elements, and every one of those is a
// element upgrade with its own shadow root. That is the whole cost of drawing
// this list, so the first paint is deliberately small - about a screen - and
// the rest is appended as the list is scrolled.
const FIRST_ROWS = 14;
const PAGE_ROWS = 24;

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
    /* Footprint of the floating tab bar: its own height plus the gap beneath
       it. Measured at runtime in _watchTabBar; this is only the value used
       before that first measurement lands. */
    --ua-tabbar: 84px;
  }

  * { box-sizing: border-box; }

  .wrap {
    position: relative;
    height: 100%;
    /* A mobile browser sizes our container to the viewport as it would be with
       the address bar hidden, so the foot of the panel - and the floating tab
       bar pinned to it - ends up below what you can actually see. dvh tracks
       the height that is visible right now. The offset is however far down the
       page we start, measured at runtime, and is 0 in the app and on desktop
       where 100% is already right and this clamp does nothing.
       min-height is deliberately not set: CSS lets it win over max-height,
       which would defeat the whole thing. */
    max-height: calc(100dvh - var(--ua-offset, 0px));
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
    display: inline-flex; align-items: center; gap: 2px;
    /* Outlined, not filled, because this counts the sites you are NOT looking
       at. The filled pills in the dropdown belong to a specific site. */
    background: transparent; color: var(--ua-warn);
    border: 1px solid var(--ua-warn);
    border-radius: 999px; font-size: 11px; font-weight: 800; padding: 0 6px;
  }
  .site-btn .badge ha-icon {
    --mdc-icon-size: 12px; width: 12px; height: 12px;
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

  /* Banners only now, and they take no room when there are none. */
  .head-area { flex: 0 0 auto; }
  #banner:not(:empty) {
    background: var(--ua-card);
    border-bottom: 1px solid var(--ua-line);
    padding: 12px 18px;
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

  /* Inside the scroller, pinned to its top. The stat cards above simply scroll
     away - native, so there is nothing to animate and nothing to catch up. The
     negative side margins let the background bleed over the scroller's own
     padding, or rows would show through in the gutters. */
  .tools {
    position: sticky; top: 0; z-index: 4;
    margin: 0 -18px 2px; padding: 10px 18px;
    display: flex; align-items: center; gap: 10px;
    background: var(--ua-bg);
  }
  .stats { padding: 14px 0 0; }
  .tools .search { flex: 1 1 auto; min-width: 0; }
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

  .sentinel {
    display: grid; place-items: center; padding: 18px 0 26px;
    color: var(--ua-dim);
  }
  .sentinel ha-icon { --mdc-icon-size: 22px; width: 22px; height: 22px; }
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
  /* Same mark as the brand PNGs: lock under the arcs, never across them. */
  .brand-ico .mark { width: 68%; height: 68%; display: block; color: inherit; }

  /* ---- filter button + sheet ---- */
  .filter-btn {
    flex: 0 0 auto; position: relative;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 46px; padding: 0 14px; cursor: pointer;
    border-radius: 16px;
    background: var(--ua-glass-bg);
    border: 1px solid var(--ua-glass-border);
    box-shadow: var(--ua-glass-shadow);
    backdrop-filter: blur(16px) saturate(1.35);
    -webkit-backdrop-filter: blur(16px) saturate(1.35);
    color: var(--ua-text);
    font: inherit; font-size: 14px; font-weight: 600;
  }
  .filter-btn:hover { border-color: var(--ua-blue); }
  .filter-btn .dot {
    position: absolute; top: 7px; right: 8px;
    min-width: 16px; height: 16px; padding: 0 4px;
    border-radius: 999px; background: var(--ua-blue); color: #fff;
    font-size: 10px; font-weight: 800; line-height: 16px; text-align: center;
  }
  .filter-btn .lbl { display: none; }
  @media (min-width: 720px) { .filter-btn .lbl { display: inline; } }

  .sheet-bd {
    position: fixed; inset: 0; z-index: 40;
    background: var(--ua-overlay); opacity: 0;
    pointer-events: none; transition: opacity .18s ease;
  }
  .sheet-bd.open { opacity: 1; pointer-events: auto; }

  .sheet {
    position: fixed; z-index: 41;
    left: 0; right: 0; bottom: 0; max-height: 82vh;
    display: flex; flex-direction: column;
    background: var(--ua-card); color: var(--ua-text);
    border-top-left-radius: 20px; border-top-right-radius: 20px;
    box-shadow: var(--ua-pop-shadow);
    transform: translateY(101%); transition: transform .22s cubic-bezier(.2,.7,.3,1);
  }
  .sheet.open { transform: none; }
  @media (min-width: 720px) {
    .sheet {
      left: auto; top: 0; bottom: 0; width: 380px; max-height: none;
      border-radius: 0; transform: translateX(101%);
    }
    /* History carries a name, a MAC and who did it on one line, so it needs
       noticeably more room than a list of filter checkboxes. */
    #hist { width: min(620px, 46vw); }
  }
  .sheet-hd {
    flex: 0 0 auto;
    display: flex; align-items: center; gap: 10px;
    padding: 14px 16px; border-bottom: 1px solid var(--ua-line);
  }
  .sheet-hd h2 { margin: 0; font-size: 17px; font-weight: 700; flex: 1 1 auto; }
  /* flex: 1 with min-height: 0 is what lets this shrink and scroll. Without
     the min-height a column flex child refuses to go below its content height,
     so on a phone - where the sheet is capped at 82vh - a long filter list
     pushed the footer, and the Reset button with it, off the bottom of the
     screen. */
  .sheet-body {
    flex: 1 1 auto; min-height: 0;
    overflow: auto; padding: 8px 12px 16px; -webkit-overflow-scrolling: touch;
  }
  .sheet-sec { margin-top: 14px; }
  .sheet-sec:first-child { margin-top: 4px; }
  .sheet-sec > h3 {
    margin: 0 4px 6px; font-size: 12px; font-weight: 700; letter-spacing: .04em;
    text-transform: uppercase; color: var(--ua-dim);
  }
  .sheet-group { border: 1px solid var(--ua-line); border-radius: 14px; overflow: hidden; }
  .opt {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 13px 14px; cursor: pointer; font: inherit; font-size: 15px;
    background: transparent; color: var(--ua-text); border: 0; text-align: left;
    border-top: 1px solid var(--ua-line);
  }
  .opt:first-child { border-top: 0; }
  .opt:hover { background: var(--ua-bg); }
  .opt .nm { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .opt .n { color: var(--ua-dim); font-size: 13px; font-variant-numeric: tabular-nums; }
  .opt .box {
    flex: 0 0 auto; width: 22px; height: 22px; border-radius: 6px;
    border: 2px solid var(--ua-line); display: grid; place-items: center;
  }
  .opt[aria-checked="true"] .box { background: var(--ua-blue); border-color: var(--ua-blue); }
  .opt[aria-checked="true"] .box ha-icon { color: #fff; --mdc-icon-size: 16px; width: 16px; height: 16px; }
  .opt[aria-checked="false"] .box ha-icon { display: none; }
  .opt.radio .box { border-radius: 50%; }
  .cfgrow {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 14px; border-top: 1px solid var(--ua-line); font-size: 15px;
  }
  .cfgrow:first-child { border-top: 0; }
  .cfgrow .txt { flex: 1 1 auto; min-width: 0; }
  .cfgrow .txt small {
    display: block; margin-top: 2px; font-size: 12px; color: var(--ua-dim);
    white-space: normal;
  }
  .cfgrow input[type="number"] {
    flex: 0 0 auto; width: 92px; text-align: right;
    font: inherit; font-size: 15px; padding: 8px 10px;
    border-radius: 10px; border: 1px solid var(--ua-line);
    background: var(--ua-bg); color: var(--ua-text);
  }
  .cfgrow .sw {
    flex: 0 0 auto; width: 46px; height: 28px; border-radius: 999px;
    border: 0; cursor: pointer; padding: 0; position: relative;
    background: var(--ua-line); transition: background .15s ease;
  }
  .cfgrow .sw::after {
    content: ""; position: absolute; top: 3px; left: 3px;
    width: 22px; height: 22px; border-radius: 50%; background: #fff;
    transition: transform .15s ease;
  }
  .cfgrow .sw[aria-checked="true"] { background: var(--ua-blue); }
  .cfgrow .sw[aria-checked="true"]::after { transform: translateX(18px); }
  .cfg-note { font-size: 12.5px; color: var(--ua-dim); }
  .namebox { padding: 12px 14px; }
  .namechips { display: flex; flex-wrap: wrap; gap: 7px; }
  .namechip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 6px 5px 11px; border-radius: 999px;
    background: var(--ua-blue-soft); color: var(--ua-blue);
    font-size: 13.5px; font-weight: 650; max-width: 100%;
  }
  .namechip span {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .namechip button {
    flex: 0 0 auto; display: grid; place-items: center;
    width: 20px; height: 20px; padding: 0; cursor: pointer;
    border: 0; border-radius: 50%; background: transparent; color: inherit;
  }
  .namechip button:hover { background: rgba(0,0,0,.14); }
  .namechip ha-icon { --mdc-icon-size: 15px; width: 15px; height: 15px; }
  .nameadd { display: flex; gap: 8px; margin-top: 10px; }
  .nameadd input {
    flex: 1 1 auto; min-width: 0;
    font: inherit; font-size: 14.5px; padding: 9px 12px;
    border-radius: 10px; border: 1px solid var(--ua-line);
    background: var(--ua-bg); color: var(--ua-text);
  }
  .nameadd input:focus-visible { outline: 2px solid var(--ua-blue); outline-offset: 1px; }
  .nameadd button {
    flex: 0 0 auto; padding: 0 16px; cursor: pointer;
    font: inherit; font-size: 14.5px; font-weight: 700;
    border-radius: 10px; border: 0;
    background: var(--ua-blue); color: #fff;
  }
  .nameempty { font-size: 13.5px; color: var(--ua-dim); }
  .logrow {
    display: flex; gap: 10px; align-items: baseline;
    padding: 11px 14px; border-top: 1px solid var(--ua-line); font-size: 14px;
  }
  .logrow:first-child { border-top: 0; }
  .logrow .act { flex: 0 0 auto; font-weight: 700; }
  .logrow .act.allowed { color: var(--ua-ok); }
  .logrow .act.blocked { color: var(--ua-bad); }
  .logrow .act.forgot  { color: var(--ua-dim); }
  .logrow .who { flex: 1 1 auto; min-width: 0; overflow: hidden;
                 text-overflow: ellipsis; white-space: nowrap; }
  .logrow .when { flex: 0 0 auto; color: var(--ua-dim); font-size: 12px; }
  .logrow .mac { display: block; color: var(--ua-dim); font-size: 12px;
                 font-family: ui-monospace, Menlo, Consolas, monospace; }
  .sheet-ft {
    flex: 0 0 auto;
    display: flex; gap: 10px; padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--ua-line);
    background: var(--ua-card);
  }
  .sheet-ft button {
    flex: 1 1 0; height: 44px; border-radius: var(--ua-r); cursor: pointer;
    font: inherit; font-size: 15px; font-weight: 700; border: 1px solid var(--ua-line);
    background: transparent; color: var(--ua-text);
  }
  .sheet-ft button.primary { background: var(--ua-blue); border-color: var(--ua-blue); color: #fff; }


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
  button.f {
    font: inherit; color: inherit; background: none; border: 0;
    padding: 1px 5px; margin: -1px -1px -1px -5px;
    border-radius: 7px; cursor: pointer; text-align: left;
    -webkit-tap-highlight-color: transparent;
  }
  button.f:hover { background: var(--ua-line); }
  button.f:active { background: var(--ua-blue-soft); color: var(--ua-blue); }
  button.f.copied { background: var(--ua-ok-bg); color: var(--ua-ok); }
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

    /* The stat cards are shortcuts to the same four tabs the bottom bar
       already carries, counts and all, so they are the first thing worth
       giving up for reading space. Only the cards: any banner below them is a
       warning about enforcement and has to stay put. Height is measured rather
       than guessed. */

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

    .tools { margin: 0 -12px 2px; padding: 8px 12px; }
    .stats { padding: 10px 0 0; }
    .search { height: 44px; border-radius: 15px; }
    .filter-btn { height: 44px; border-radius: 15px; padding: 0 12px; }
    .sentinel {
    display: grid; place-items: center; padding: 18px 0 26px;
    color: var(--ua-dim);
  }
  .sentinel ha-icon { --mdc-icon-size: 22px; width: 22px; height: 22px; }
    /* Bottom padding was not enough: it let the last row be scrolled clear,
       but every row still slid under the bar on the way past. Shortening the
       scroll area instead means the list simply stops above it, and nothing is
       ever behind the glass. env() covers the gesture bar. */
    .list-scroll {
      padding: 0 12px 12px;
      margin-bottom: calc(var(--ua-tabbar, 84px) + env(safe-area-inset-bottom));
    }

    /* floating glass tab bar, pinned and always visible */
    .tabs {
      position: absolute;
      left: 10px; right: 10px;
      bottom: calc(12px + env(safe-area-inset-bottom));
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

  _loadPrefs() {
    if (this._sort !== undefined) return;
    this._sort = "name";
    this._filters = { conn: [], ssid: [], ap: [], band: [], vendor: [] };
    try {
      const raw = window.localStorage.getItem("ual_view");
      if (raw) {
        const saved = JSON.parse(raw) || {};
        if (typeof saved.sort === "string") this._sort = saved.sort;
        if (saved.filters && typeof saved.filters === "object") {
          for (const k of ["conn", "ssid", "ap", "band", "vendor"]) {
            if (Array.isArray(saved.filters[k])) this._filters[k] = saved.filters[k];
          }
        }
      }
    } catch (err) {
      /* storage unavailable, defaults are fine */
    }
  }

  _savePrefs() {
    try {
      window.localStorage.setItem(
        "ual_view",
        JSON.stringify({ sort: this._sort, filters: this._filters })
      );
    } catch (err) {
      /* nothing to do */
    }
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
      this._loadPrefs();
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

  /* The bar is floating, so the list has to reserve room for it. Guessing that
     height in CSS meant a visible dead strip whenever the guess was generous.
     Measuring it keeps the list ending just above the bar on any device. */
  /* How far below the top of the viewport the panel begins. Only ever nonzero
     when something is rendered above us. */
  _measureOffset() {
    const wrap = this.shadowRoot && this.shadowRoot.querySelector(".wrap");
    if (!wrap) return;
    const top = Math.max(0, Math.round(wrap.getBoundingClientRect().top));
    if (top !== this._offset) {
      this._offset = top;
      this.style.setProperty("--ua-offset", `${top}px`);
    }
  }

  _watchViewport() {
    if (this._boundViewport) return;
    // Showing or hiding the address bar fires on visualViewport, not window.
    this._boundViewport = () => this._measureOffset();
    window.addEventListener("resize", this._boundViewport);
    window.addEventListener("orientationchange", this._boundViewport);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", this._boundViewport);
    }
  }

  _watchTabBar() {
    const tabs = this.shadowRoot && this.shadowRoot.getElementById("tabs");
    if (!tabs || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const h = tabs.getBoundingClientRect().height;
      // Bar height + its 12px offset from the bottom + a small breathing gap.
      if (h > 0) this.style.setProperty("--ua-tabbar", `${Math.round(h + 18)}px`);
    };
    if (this._tabRo) this._tabRo.disconnect();
    this._tabRo = new ResizeObserver(apply);
    this._tabRo.observe(tabs);
    apply();
    this._measureOffset();
    this._watchViewport();
  }

  connectedCallback() {
    this.dataset.panelVersion = PANEL_VERSION;
    this._timer = setInterval(() => this._load(), REFRESH_MS);
    window.addEventListener("popstate", this._boundPop);
    // Mobile browsers suspend timers in the background, so returning to the
    // app can otherwise show data from whenever it was last foregrounded.
    this._boundWake =
      this._boundWake ||
      (() => {
        if (document.visibilityState === "visible") this._load();
      });
    document.addEventListener("visibilitychange", this._boundWake);
    window.addEventListener("focus", this._boundWake);
    window.setTimeout(() => this._ensureBaseHist(), 0);
  }

  disconnectedCallback() {
    if (this._tabRo) this._tabRo.disconnect();
    if (this._boundViewport) {
      window.removeEventListener("resize", this._boundViewport);
      window.removeEventListener("orientationchange", this._boundViewport);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", this._boundViewport);
      }
      this._boundViewport = null;
    }
    if (this._timer) clearInterval(this._timer);
    if (this._toastTimer) clearTimeout(this._toastTimer);
    window.removeEventListener("popstate", this._boundPop);
    if (this._boundWake) {
      document.removeEventListener("visibilitychange", this._boundWake);
      window.removeEventListener("focus", this._boundWake);
    }
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

  /* The backend refresh is debounced and the panel polls on its own clock, so
     without this the row it just acted on sits there, or leaves a gap, until
     the next fetch lands. Drop it locally and let the fetch reconcile. */
  _dropRowLocally(mac, service) {
    const d = this._data;
    if (!d || !mac) return;
    const without = (list) => (list || []).filter((e) => e.mac !== mac);
    if (service === "forget") {
      d.pending = without(d.pending);
      d.allowed = without(d.allowed);
      d.denied = without(d.denied);
    } else if (service === "allow") {
      d.pending = without(d.pending);
      d.denied = without(d.denied);
    } else if (service === "deny") {
      d.pending = without(d.pending);
      d.allowed = without(d.allowed);
    }
    (d.online || []).forEach((r) => {
      if (r.mac !== mac) return;
      if (service === "allow") r.status = "allowed";
      if (service === "deny") r.status = "denied";
      if (service === "forget") r.status = "unknown";
    });
  }

  async _act(mac, service, btn) {
    if (this._busy[mac]) return;
    this._busy[mac] = true;
    const release = this._holdRender();

    // Two clocks, and they are nothing alike. The animation is a predictable
    // ~760ms; the service call can take seconds when the controller is remote.
    // Waiting for the call before redrawing left the finished animation on
    // screen as a blank gap, so the row goes as soon as the animation ends and
    // the call is reconciled afterwards.
    const played = this._playAction(mac, service, btn);
    const called = this._call(service, { mac });

    try {
      await played;
    } finally {
      release();
    }

    this._dropRowLocally(mac, service);
    const word =
      service === "allow" ? "Allowed" : service === "deny" ? "Blocked" : "Forgotten";
    this._notify(`${word} ${mac}`, service === "deny" ? "err" : "ok");
    this._render();

    const ok = await called;
    delete this._busy[mac];
    if (!ok) {
      // The optimistic removal was wrong - go and find out what is really there.
      await this._load();
      return;
    }
    window.clearTimeout(this._settleTimer);
    this._settleTimer = window.setTimeout(() => this._load(), 1200);
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

  async _copy(text, btn) {
    let ok = false;
    try {
      // Only available in a secure context, which plain http://192.168.x.x
      // is not - hence the fallback below.
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (err) {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
        this.shadowRoot.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch (err) {
        ok = false;
      }
    }
    if (ok && btn) {
      btn.classList.add("copied");
      window.setTimeout(() => btn.classList.remove("copied"), 900);
    }
    this._notify(ok ? `Copied ${text}` : "Could not copy", ok ? "ok" : "err");
  }

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
            <div class="brand-ico"><svg class="mark" viewBox="0 0 256 256" aria-hidden="true"><mask id="ualcut"><rect width="256" height="256" fill="white"/><g fill="black" stroke="black" stroke-width="7" stroke-linejoin="round"><path d="M 115 166 V 152 a 13 13 0 0 1 26 0 V 166" fill="none" stroke-linecap="round"/><rect x="102" y="166" width="52" height="40" rx="10"/></g></mask><g mask="url(#ualcut)" fill="none" stroke="currentColor" stroke-width="15.0" stroke-linecap="round"><path d="M 54.5 96.3 A 96.0 96.0 0 0 1 201.5 96.3"/><path d="M 75.9 114.3 A 68.0 68.0 0 0 1 180.1 114.3"/><path d="M 97.4 132.3 A 40.0 40.0 0 0 1 158.6 132.3"/></g><path d="M 115 166 V 152 a 13 13 0 0 1 26 0 V 166" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round"/><g fill="currentColor"><rect x="102" y="166" width="52" height="40" rx="10"/></g></svg></div>
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
          <div id="banner"></div>
        </div>

        <nav class="tabs" role="tablist" id="tabs"></nav>

        <div class="list-scroll" id="list">
          <div class="stats" id="stats"></div>
          <div class="tools">
            <div class="search" id="searchbox">
              <ha-icon icon="mdi:magnify"></ha-icon>
              <input id="search" type="search" autocomplete="off" spellcheck="false"
                     aria-label="Search devices"
                     placeholder="Search name, MAC, IP, SSID, AP or maker">
              <button class="clear-btn" id="clear" aria-label="Clear search" title="Clear">
                <ha-icon icon="mdi:close-circle"></ha-icon>
              </button>
            </div>
            <button class="filter-btn" id="cfg-btn" aria-haspopup="dialog"
                    aria-label="Settings" title="Settings">
              <ha-icon icon="mdi:cog-outline"></ha-icon>
            </button>
            <button class="filter-btn" id="hist-btn" aria-haspopup="dialog"
                    aria-label="History" title="History">
              <ha-icon icon="mdi:history"></ha-icon>
            </button>
            <button class="filter-btn" id="filter-btn" aria-haspopup="dialog"
                    aria-expanded="false" aria-label="Sort and filter">
              <ha-icon icon="mdi:tune-variant"></ha-icon>
              <span class="lbl">Sort &amp; filter</span>
              <span class="dot" id="filter-dot" hidden></span>
            </button>
          </div>
          <div id="rows"></div>
        </div>

        <div class="sheet-bd" id="sheet-bd"></div>
        <aside class="sheet" id="sheet" role="dialog" aria-modal="true"
               aria-label="Sort and filter" hidden>
          <div class="sheet-hd">
            <ha-icon icon="mdi:tune-variant"></ha-icon>
            <h2>Sort &amp; filter</h2>
            <button class="icon-btn" id="sheet-x" aria-label="Close">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="sheet-body" id="sheet-body"></div>
          <div class="sheet-ft">
            <button id="sheet-clear" hidden>Reset</button>
            <button class="primary" id="sheet-done">Done</button>
          </div>
        </aside>

        <div class="sheet-bd" id="cfg-bd"></div>
        <aside class="sheet" id="cfg" role="dialog" aria-modal="true"
               aria-label="Settings" hidden>
          <div class="sheet-hd">
            <ha-icon icon="mdi:cog-outline"></ha-icon>
            <h2>Settings</h2>
            <button class="icon-btn" id="cfg-x" aria-label="Close">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="sheet-body" id="cfg-body"></div>
          <div class="sheet-ft">
            <span class="cfg-note" id="cfg-note"></span>
          </div>
        </aside>

        <div class="sheet-bd" id="hist-bd"></div>
        <aside class="sheet" id="hist" role="dialog" aria-modal="true"
               aria-label="History" hidden>
          <div class="sheet-hd">
            <ha-icon icon="mdi:history"></ha-icon>
            <h2>History</h2>
            <button class="icon-btn" id="hist-x" aria-label="Close">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="sheet-body" id="hist-body"></div>
        </aside>

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

    root.getElementById("cfg-btn").addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._openCfg(!this._cfgOpen);
    });
    root.getElementById("cfg-bd").addEventListener("click", () => this._openCfg(false));
    root.getElementById("cfg-x").addEventListener("click", () => this._openCfg(false));
    root.getElementById("cfg").addEventListener("click", (ev) => {
      ev.stopPropagation();
      const sw = ev.target.closest && ev.target.closest(".sw");
      if (sw) {
        const on = sw.getAttribute("aria-checked") !== "true";
        sw.setAttribute("aria-checked", String(on));
        this._saveCfg(sw.dataset.key, on);
        return;
      }
      const rm = ev.target.closest && ev.target.closest(".namechip button");
      if (rm) {
        this._removeName(Number(rm.dataset.idx));
        return;
      }
      if (ev.target.closest && ev.target.closest("#preadd")) {
        this._preApprove();
        return;
      }
      if (ev.target.closest && ev.target.closest("#nameadd")) {
        const input = root.getElementById("nameinput");
        this._addName(input && input.value);
      }
    });
    root.getElementById("cfg").addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      const input = ev.target;
      if (!input) return;
      if (input.id === "premac" || input.id === "prename") {
        ev.preventDefault();
        this._preApprove();
        return;
      }
      if (input.id !== "nameinput") return;
      ev.preventDefault();
      this._addName(input.value);
    });
    root.getElementById("cfg").addEventListener("change", (ev) => {
      const input = ev.target;
      if (!input || input.tagName !== "INPUT") return;
      const num = Number(input.value);
      if (!Number.isFinite(num)) return;
      this._saveCfg(input.dataset.key, num);
    });

    root.getElementById("hist-btn").addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._openHist(!this._histOpen);
    });
    root.getElementById("hist-bd").addEventListener("click", () => this._openHist(false));
    root.getElementById("hist-x").addEventListener("click", () => this._openHist(false));
    root.getElementById("hist").addEventListener("click", (ev) => ev.stopPropagation());

    root.getElementById("filter-btn").addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._openSheet(!this._sheetOpen);
    });
    root.getElementById("sheet-bd").addEventListener("click", () => this._openSheet(false));
    root.getElementById("sheet-x").addEventListener("click", () => this._openSheet(false));
    root.getElementById("sheet-done").addEventListener("click", () => this._openSheet(false));
    root.getElementById("sheet-clear").addEventListener("click", () => {
      this._filters = { conn: [], ssid: [], ap: [], band: [], vendor: [] };
      this._sort = "name";
      this._resetPaging();
      this._savePrefs();
      this._renderSheet();
      this._renderList();
    });
    root.getElementById("sheet").addEventListener("click", (ev) => {
      ev.stopPropagation();
      const btn = ev.target.closest && ev.target.closest(".opt");
      if (!btn) return;
      const group = btn.dataset.group;
      const value = btn.dataset.value;
      if (group === "sort") this._sort = value;
      else this._toggleFilter(group, value);
      this._resetPaging();
      this._savePrefs();
      this._renderSheet();
      this._renderList();
    });
    window.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      if (this._sheetOpen) this._openSheet(false);
      if (this._histOpen) this._openHist(false);
      if (this._cfgOpen) this._openCfg(false);
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
      this._resetPaging();
      root.getElementById("searchbox").classList.toggle("has-text", !!ev.target.value);
      this._renderList();
    });
    root.getElementById("clear").addEventListener("click", () => {
      search.value = "";
      this._query = "";
      this._resetPaging();
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
      const copy = ev.target.closest("button[data-copy]");
      if (copy) {
        this._copy(copy.dataset.copy, copy);
        return;
      }
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
    this._resetPaging();

    // Mark the tab and empty the list, then hand control back to the browser
    // so it can actually paint that. Doing the render in the same task means
    // one paint at the end - which is why setting these attributes on its own
    // changed nothing perceptible.
    const root = this.shadowRoot;
    const tabsEl = root.getElementById("tabs");
    if (tabsEl) {
      for (const btn of tabsEl.querySelectorAll(".tab")) {
        btn.setAttribute("aria-selected", String(btn.dataset.tab === tab));
      }
    }
    const rowsEl = root.getElementById("rows");
    if (rowsEl) rowsEl.innerHTML = "";
    const scroller = root.getElementById("list");
    if (scroller) scroller.scrollTop = 0;

    this._pushTabHist(tab);

    // rAF fires before paint, so a second one is needed to land after it.
    // The token means a quick double tap renders once, for the tab that won.
    const token = (this._tabToken = (this._tabToken || 0) + 1);
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        if (token !== this._tabToken) return;
        this._render();
      })
    );
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
    this._resetPaging();
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
    if (d && (d.notify_broken || []).length) {
      bannerHtml +=
        `<div class="banner err"><ha-icon icon="mdi:bell-off-outline"></ha-icon>` +
        `<span>No alerts are being delivered: notification target ` +
        `<b>${this._esc(d.notify_broken.join(", "))}</b> does not exist. ` +
        `Fix it in the integration options.</span></div>`;
    }
    if (d && d.drop_blocked) {
      bannerHtml +=
        `<div class="banner err"><ha-icon icon="mdi:database-alert-outline"></ha-icon>` +
        `<span>Not blocking anything: the allow list holds ${d.allowed.length} ` +
        `device${d.allowed.length === 1 ? "" : "s"} but ${d.high_water} were ` +
        `saved, so data looks to have been lost. Restore a backup, or call ` +
        `<b>unifi_allowlist.accept_list_size</b> if the smaller list is right.` +
        `</span></div>`;
    }
    if (d && d.guard_blocked) {
      bannerHtml +=
        `<div class="banner err"><ha-icon icon="mdi:shield-off-outline"></ha-icon>` +
        `<span>Not blocking anything: the allow list has ${d.allowed.length} ` +
        `device${d.allowed.length === 1 ? "" : "s"} and the safety minimum is ` +
        `${d.guard_min}. Approve more devices, or lower the minimum in the ` +
        `integration options.</span></div>`;
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
      root.getElementById("rows").innerHTML = this._loading
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

    // Rebuilding this wholesale on every tab tap threw away the very button
    // that was pressed, dropped its ripple, and re-upgraded four <ha-icon>
    // elements before anything else could happen - which is what made tapping
    // feel slow. Build once, then only touch what actually changed.
    const tabsEl = root.getElementById("tabs");
    if (!tabsEl.firstElementChild) {
      this._needTabMeasure = true;
      tabsEl.innerHTML = TAB_DEFS.map(
        (t) => `<button class="tab" role="tab" data-tab="${t.id}">
                <ha-icon icon="${t.icon}"></ha-icon
                ><span class="lbl long">${t.label}</span
                ><span class="lbl short">${t.short}</span
                ><span class="n"></span></button>`
      ).join("");
    }
    if (this._needTabMeasure) {
      this._needTabMeasure = false;
      window.requestAnimationFrame(() => this._watchTabBar());
    }
    for (const t of TAB_DEFS) {
      const btn = tabsEl.querySelector(`[data-tab="${t.id}"]`);
      if (!btn) continue;
      const n = counts[t.id];
      const alert = t.id === "pending" && n > 0;
      const selected = String(this._tab === t.id);
      if (btn.getAttribute("aria-selected") !== selected) {
        btn.setAttribute("aria-selected", selected);
      }
      const label = `${t.label}, ${n}`;
      if (btn.getAttribute("aria-label") !== label) {
        btn.setAttribute("aria-label", label);
      }
      const badge = btn.lastElementChild;
      const cls = `n${alert ? " alert" : ""}${n ? "" : " zero"}`;
      if (badge.className !== cls) badge.className = cls;
      const text = String(n);
      if (badge.textContent !== text) badge.textContent = text;
    }

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
    const elsewhere = `${otherWaiting} waiting on ${
      sites.length > 2 ? "other sites" : "the other site"
    }`;
    badge.innerHTML =
      `<ha-icon icon="mdi:arrow-right-top"></ha-icon>${otherWaiting}`;
    badge.hidden = !otherWaiting;
    badge.title = elsewhere;
    badge.setAttribute("aria-label", elsewhere);

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

  /* ---- sorting and filtering ---- */

  _sortKey() {
    return this._sort || "name";
  }

  _sortRows(rows) {
    const key = this._sortKey();
    const byName = (a, b) =>
      (a.name || "\uffff").localeCompare(b.name || "\uffff", undefined, {
        sensitivity: "base",
      });
    const copy = rows.slice();
    if (key === "seen") {
      // Most recently around first; never-seen sinks to the bottom.
      copy.sort((a, b) => (b.last_seen || 0) - (a.last_seen || 0) || byName(a, b));
    } else if (key === "ip") {
      copy.sort((a, b) => UnifiAllowlistPanel._ipKey(a.ip) - UnifiAllowlistPanel._ipKey(b.ip) || byName(a, b));
    } else if (key === "ap") {
      copy.sort(
        (a, b) => (a.ap || "\uffff").localeCompare(b.ap || "\uffff") || byName(a, b)
      );
    } else if (key === "vendor") {
      // Randomised MACs report no vendor, so they collect at the end rather
      // than at the top where they would bury everything identifiable.
      copy.sort(
        (a, b) =>
          (a.vendor || "\uffff").localeCompare(b.vendor || "\uffff", undefined, {
            sensitivity: "base",
          }) || byName(a, b)
      );
    } else if (key === "mac") {
      copy.sort((a, b) => (a.mac || "").localeCompare(b.mac || ""));
    } else if (key === "name_desc") {
      copy.sort((a, b) => byName(b, a));
    } else {
      copy.sort(byName);
    }
    return copy;
  }

  /* Sorts 192.168.0.9 before 192.168.0.10, which a string sort does not. */
  static _ipKey(ip) {
    const parts = String(ip || "").split(".");
    if (parts.length !== 4) return Number.MAX_SAFE_INTEGER;
    let n = 0;
    for (const p of parts) {
      const v = Number(p);
      if (!Number.isInteger(v) || v < 0 || v > 255) return Number.MAX_SAFE_INTEGER;
      n = n * 256 + v;
    }
    return n;
  }

  /* Within a group the choices are OR'd, across groups they are AND'd -
     the same way the UniFi client filters behave. */
  _matches(r, f, skip) {
    const on = (g) => (f[g] || []).length && g !== skip;
    if (on("conn")) {
      const want = f.conn;
      const state = r.live ? "on" : "off";
      if (!want.includes(state)) return false;
    }
    if (on("ssid") && !f.ssid.includes(r.ssid)) return false;
    if (on("ap") && !f.ap.includes(r.ap)) return false;
    if (on("band") && !f.band.includes(r.band)) return false;
    if (on("vendor") && !f.vendor.includes(r.vendor)) return false;
    return true;
  }

  _applyFilters(rows) {
    const f = this._filters || {};
    return rows.filter((r) => this._matches(r, f, null));
  }

  _activeCount() {
    const f = this._filters || {};
    return ["conn", "ssid", "ap", "band", "vendor"].reduce(
      (n, g) => n + ((f[g] || []).length ? 1 : 0),
      0
    );
  }

  _filtersActive() {
    return this._activeCount() > 0;
  }

  _toggleFilter(group, value) {
    const cur = (this._filters[group] || []).slice();
    const i = cur.indexOf(value);
    if (i >= 0) cur.splice(i, 1);
    else cur.push(value);
    this._filters[group] = cur;
  }

  /* ---- sort & filter sheet ---- */

  _openSheet(open) {
    const root = this.shadowRoot;
    const sheet = root.getElementById("sheet");
    const bd = root.getElementById("sheet-bd");
    if (!sheet || !bd) return;
    this._sheetOpen = Boolean(open);
    if (this._sheetOpen) {
      sheet.hidden = false;
      this._renderSheet();
      // Next frame, so the transition has a start state to animate from.
      window.requestAnimationFrame(() => {
        sheet.classList.add("open");
        bd.classList.add("open");
      });
    } else {
      sheet.classList.remove("open");
      bd.classList.remove("open");
      window.setTimeout(() => {
        if (!this._sheetOpen) sheet.hidden = true;
      }, 240);
    }
    const btn = root.getElementById("filter-btn");
    if (btn) btn.setAttribute("aria-expanded", String(this._sheetOpen));
  }

  _sortOptions() {
    return [
      ["name", "Name (A to Z)", "mdi:sort-alphabetical-ascending"],
      ["name_desc", "Name (Z to A)", "mdi:sort-alphabetical-descending"],
      ["seen", "Last seen", "mdi:clock-outline"],
      ["ip", "IP address", "mdi:ip-network-outline"],
      ["ap", "Access point", "mdi:router-wireless"],
      ["vendor", "Made by", "mdi:factory"],
      ["mac", "MAC address", "mdi:identifier"],
    ];
  }

  _renderSheet() {
    const root = this.shadowRoot;
    const body = root.getElementById("sheet-body");
    if (!body) return;
    const f = this._filters;
    const all = this._rowsForTab();

    const opt = (group, value, label, checked, count, radio) =>
      `<button class="opt${radio ? " radio" : ""}" role="${
        radio ? "radio" : "checkbox"
      }" aria-checked="${checked}" data-group="${this._esc(group)}"
        data-value="${this._esc(value)}">
         <span class="box"><ha-icon icon="mdi:check"></ha-icon></span>
         <span class="nm">${this._esc(label)}</span>
         ${count === null ? "" : `<span class="n">${count}</span>`}
       </button>`;

    // Counts ignore their own group, so you can see what each choice would add.
    const countFor = (group, value) =>
      all.filter((r) => {
        if (!this._matches(r, f, group)) return false;
        if (group === "conn") return (r.live ? "on" : "off") === value;
        return r[group] === value;
      }).length;

    const section = (title, html) =>
      html ? `<div class="sheet-sec"><h3>${title}</h3><div class="sheet-group">${html}</div></div>` : "";

    const uniq = (key) =>
      Array.from(new Set(all.map((r) => r[key]).filter(Boolean))).sort();

    const sortHtml = this._sortOptions()
      .map(([v, label]) => opt("sort", v, label, this._sortKey() === v, null, true))
      .join("");

    const connHtml = [
      ["on", "On wifi now"],
      ["off", "Not connected"],
    ]
      .map(([v, label]) =>
        opt("conn", v, label, (f.conn || []).includes(v), countFor("conn", v))
      )
      .join("");

    const listFor = (group) =>
      uniq(group)
        .map((v) =>
          opt(group, v, v, (f[group] || []).includes(v), countFor(group, v))
        )
        .join("");

    body.innerHTML =
      section("Sort by", sortHtml) +
      section("Status", connHtml) +
      section("Network", uniq("ssid").length > 1 ? listFor("ssid") : "") +
      section("Access point", uniq("ap").length > 1 ? listFor("ap") : "") +
      section("Band", uniq("band").length > 1 ? listFor("band") : "") +
      section("Made by", uniq("vendor").length > 1 ? listFor("vendor") : "");

    const dot = root.getElementById("filter-dot");
    if (dot) {
      const n = this._activeCount();
      dot.textContent = String(n);
      dot.hidden = !n;
    }
    // Nothing to reset means no button, rather than one that appears dead.
    const reset = root.getElementById("sheet-clear");
    if (reset) reset.hidden = !this._activeCount() && this._sortKey() === "name";
  }

  _openCfg(open) {
    const root = this.shadowRoot;
    const sheet = root.getElementById("cfg");
    const bd = root.getElementById("cfg-bd");
    if (!sheet || !bd) return;
    this._cfgOpen = Boolean(open);
    if (this._cfgOpen) {
      sheet.hidden = false;
      this._renderCfg();
      window.requestAnimationFrame(() => {
        sheet.classList.add("open");
        bd.classList.add("open");
      });
    } else {
      sheet.classList.remove("open");
      bd.classList.remove("open");
      window.setTimeout(() => {
        if (!this._cfgOpen) sheet.hidden = true;
      }, 240);
    }
  }

  _cfgDefs() {
    return [
      ["block_first", "toggle", "Block on sight, then ask",
       "Off means an unknown device is reported but left connected."],
      ["scan_interval", "number", "Check every",
       "Seconds between reads of the connected device list. Lower is quicker to block; below 15 a busy run can overlap the next check."],
      ["max_per_run", "number", "Stop if more than this arrive at once",
       "A safety brake. If more unknown devices appear in one check, nothing is blocked and you get a warning."],
      ["notify_gap", "number", "Pause between alerts",
       "Seconds. Lower it if you shorten the check interval."],
      ["adopt_blocks", "toggle", "Adopt blocks made in UniFi",
       "Move devices blocked in the UniFi UI into Blocked here."],
      ["forget_in_unifi", "toggle", "Remove the client from UniFi when forgetting",
       "Clients with an alias or a fixed IP are only unblocked."],
      ["deny_unnamed", "toggle", "Always block devices that report no name",
       "Catches cameras and IoT gear too. Check the waiting list first."],
    ];
  }

  _renderCfg(force) {
    const body = this.shadowRoot.getElementById("cfg-body");
    if (!body) return;
    // A background refresh must not wipe a half typed name or number. Our own
    // edits pass force, because after those the field is stale anyway.
    const active = this.shadowRoot.activeElement;
    if (!force && active && active.tagName === "INPUT" && body.contains(active)) {
      return;
    }
    const o = (this._data && this._data.options) || {};
    const rows = this._cfgDefs()
      .map(([key, kind, label, hint]) => {
        const control =
          kind === "toggle"
            ? `<button class="sw" role="switch" data-key="${key}"
                 aria-checked="${o[key] ? "true" : "false"}"
                 aria-label="${this._esc(label)}"></button>`
            : `<input type="number" data-key="${key}" value="${
                o[key] === undefined ? "" : o[key]
              }" step="${key === "notify_gap" ? "0.5" : "1"}" min="0"
                 aria-label="${this._esc(label)}">`;
        return `<div class="cfgrow"><span class="txt">${this._esc(label)}
                  <small>${this._esc(hint)}</small></span>${control}</div>`;
      })
      .join("");
    const names = (o.deny_names || []).slice();
    const nameHtml = names.length
      ? names
          .map(
            (n, i) => `<span class="namechip"><span>${this._esc(n)}</span>
              <button data-idx="${i}" aria-label="Remove ${this._esc(n)}">
                <ha-icon icon="mdi:close"></ha-icon></button></span>`
          )
          .join("")
      : `<span class="nameempty">Nothing is blocked by name.</span>`;

    body.innerHTML =
      `<div class="sheet-sec"><h3>This site</h3>` +
      `<div class="sheet-group">${rows}</div></div>` +
      `<div class="sheet-sec"><h3>Allow a device before it arrives</h3>
        <div class="sheet-group"><div class="namebox">
          <div class="nameadd">
            <input id="premac" type="text" placeholder="MAC, e.g. a4:83:e7:12:34:56"
                   autocomplete="off" spellcheck="false" inputmode="text"
                   enterkeyhint="done">
          </div>
          <div class="nameadd">
            <input id="prename" type="text" placeholder="Name (optional)"
                   autocomplete="off" enterkeyhint="done">
            <button id="preadd">Allow</button>
          </div>
          <div class="cfgrow" style="padding:10px 0 0;border:0">
            <span class="txt"><small>Adds the MAC to the allow list now, so the
            device is let straight on instead of being blocked and queued the
            first time it appears. Separators are optional — a4:83:e7:12:34:56,
            A4-83-E7-12-34-56 and a483e7123456 are all accepted.</small></span>
          </div>
        </div></div></div>` +
      `<div class="sheet-sec"><h3>Always block these names</h3>
        <div class="sheet-group"><div class="namebox">
          <div class="namechips" id="namechips">${nameHtml}</div>
          <div class="nameadd">
            <input id="nameinput" type="text" placeholder="Device name, * and ? allowed"
                   autocomplete="off" spellcheck="false" enterkeyhint="done">
            <button id="nameadd">Add</button>
          </div>
          <div class="cfgrow" style="padding:10px 0 0;border:0">
            <span class="txt"><small>Case insensitive. A plain word also matches
            anywhere in the name. Matches are blocked silently, with no alert and
            no entry in the waiting list. Names come from the device and can be
            changed, so this is noise control rather than security.</small></span>
          </div>
        </div></div></div>` +
      `<div class="sheet-sec"><h3>Elsewhere</h3><div class="sheet-group">` +
      `<div class="cfgrow"><span class="txt">Controller, site, networks and alerts
        <small>Settings &gt; Devices &amp; services &gt; UniFi Allow List &gt; Configure.
        Kept there because a wrong value locks the integration out.</small></span></div>` +
      `</div></div>`;
    const note = this.shadowRoot.getElementById("cfg-note");
    if (note) note.textContent = "Changes save as you make them.";
  }

  /* Accepts colons, dashes, dots or nothing at all, and rejects anything that
     is not exactly twelve hex digits. */
  static _normMac(value) {
    const hex = String(value || "").toLowerCase().replace(/[^0-9a-f]/g, "");
    if (hex.length !== 12) return "";
    return hex.match(/.{2}/g).join(":");
  }

  async _preApprove() {
    const root = this.shadowRoot;
    const macEl = root.getElementById("premac");
    const nameEl = root.getElementById("prename");
    const mac = UnifiAllowlistPanel._normMac(macEl && macEl.value);
    if (!mac) {
      this._notify("That does not look like a MAC address.", "err");
      if (macEl) macEl.focus();
      return;
    }
    const name = String((nameEl && nameEl.value) || "").trim();
    const ok = await this._call("allow", { mac });
    if (!ok) return;
    if (name) await this._call("set_name", { mac, name });
    if (macEl) macEl.value = "";
    if (nameEl) nameEl.value = "";
    this._notify(`${name || mac} added to the allow list`, "ok");
    if (macEl) macEl.focus();
    await this._load();
    this._renderCfg(true);
  }

  _currentNames() {
    return (((this._data || {}).options || {}).deny_names || []).slice();
  }

  async _addName(raw) {
    const value = String(raw || "").trim();
    if (!value) return;
    const names = this._currentNames();
    // Case insensitive at match time, so it would be a no-op stored twice.
    if (names.some((n) => n.toLowerCase() === value.toLowerCase())) {
      const input = this.shadowRoot.getElementById("nameinput");
      if (input) input.value = "";
      return;
    }
    names.push(value);
    await this._saveCfg("deny_names", names);
    this._renderCfg(true);
    // Straight on to the next one without reaching for the field again.
    const next = this.shadowRoot.getElementById("nameinput");
    if (next) next.focus();
  }

  async _removeName(index) {
    const names = this._currentNames();
    if (index < 0 || index >= names.length) return;
    names.splice(index, 1);
    await this._saveCfg("deny_names", names);
    this._renderCfg(true);
  }

  async _saveCfg(key, value) {
    const entry = (this._data && this._data.entry_id) || this._entryId;
    if (!entry) return;
    const note = this.shadowRoot.getElementById("cfg-note");
    try {
      await this._hass.callApi("POST", "unifi_allowlist/options", {
        entry_id: entry,
        [key]: value,
      });
      if (this._data && this._data.options) this._data.options[key] = value;
      if (note) note.textContent = "Saved.";
      // Reloads the entry, so give it a moment before trusting the numbers.
      window.clearTimeout(this._cfgTimer);
      this._cfgTimer = window.setTimeout(() => this._load(), 1500);
    } catch (err) {
      if (note) note.textContent = "Could not save that.";
      this._renderCfg();
    }
  }

  _openHist(open) {
    const root = this.shadowRoot;
    const sheet = root.getElementById("hist");
    const bd = root.getElementById("hist-bd");
    if (!sheet || !bd) return;
    this._histOpen = Boolean(open);
    if (this._histOpen) {
      sheet.hidden = false;
      this._renderHist();
      window.requestAnimationFrame(() => {
        sheet.classList.add("open");
        bd.classList.add("open");
      });
    } else {
      sheet.classList.remove("open");
      bd.classList.remove("open");
      window.setTimeout(() => {
        if (!this._histOpen) sheet.hidden = true;
      }, 240);
    }
  }

  _renderHist() {
    const body = this.shadowRoot.getElementById("hist-body");
    if (!body) return;
    const log = (this._data && this._data.audit) || [];
    if (!log.length) {
      body.innerHTML =
        `<div class="empty"><ha-icon icon="mdi:history"></ha-icon>` +
        `<span>Nothing decided yet on this site.</span></div>`;
      return;
    }
    const word = { allowed: "Allowed", blocked: "Blocked", forgot: "Forgot" };
    body.innerHTML =
      `<div class="sheet-sec"><div class="sheet-group">` +
      log
        .map((e) => {
          const act = this._esc(e.action || "");
          return `<div class="logrow">
            <span class="act ${act}">${this._esc(word[e.action] || e.action || "")}</span>
            <span class="who">${this._esc(e.name || e.mac || "")}
              <span class="mac">${this._esc(e.mac || "")} &middot; ${this._esc(
                e.actor || "automatic"
              )}</span>
            </span>
            <span class="when">${this._esc(UnifiAllowlistPanel._ago(e.ts))}</span>
          </div>`;
        })
        .join("") +
      `</div></div>`;
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
        ap: r.ap || "",
        vendor: r.vendor || "",
        ssid: r.ssid || "",
        band: r.band || "",
        last_seen: r.last_seen || 0,
        live: r.live,
        status: r.live ? r.status : "off",
        chips: [
          r.band ? { v: r.band, cls: "net", icon: "mdi:access-point" } : null,
          r.ssid ? { v: r.ssid, cls: "net", icon: "mdi:wifi" } : null,
          r.in_scope ? null : { v: "not policed", cls: "off", icon: "mdi:shield-off-outline" },
          r.live ? null : UnifiAllowlistPanel._lastSeenChip(r.last_seen),
          r.vendor ? { v: r.vendor, cls: "off", icon: "mdi:factory" } : null,
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
        ap: p.ap || "",
        vendor: p.vendor || "",
        ssid: p.ssid || "",
        band: p.band || "",
        last_seen: p.last_seen || 0,
        live: p.live,
        status: "unknown",
        chips: [
          p.band ? { v: p.band, cls: "net", icon: "mdi:access-point" } : null,
          p.ssid ? { v: p.ssid, cls: "net", icon: "mdi:wifi" } : null,
          p.live
            ? { v: "still connected", cls: "unknown", icon: "mdi:lan-connect" }
            : { v: "gone offline", cls: "off", icon: "mdi:lan-disconnect" },
          p.live ? null : UnifiAllowlistPanel._lastSeenChip(p.last_seen),
          p.vendor ? { v: p.vendor, cls: "off", icon: "mdi:factory" } : null,
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
      ap: e.ap || "",
      vendor: e.vendor || "",
      ssid: "",
      band: "",
      last_seen: e.last_seen || 0,
      live: liveMacs.has(e.mac),
      known: e.known !== false,
      review: e.review === true,
      status: liveMacs.has(e.mac) ? state : "off",
      // the verdict is a fact about the list, not about being connected
      verdict: state,
      chips: [
        liveMacs.has(e.mac)
          ? { v: "on wifi now", cls: "net", icon: "mdi:wifi" }
          : { v: "not connected", cls: "off", icon: "mdi:wifi-off" },
        liveMacs.has(e.mac)
          ? null
          : e.known === false
          ? // Allowed ahead of time and still never seen. Worth marking, or it
            // is indistinguishable from a device that is merely switched off.
            { v: "never seen here", cls: "off", icon: "mdi:help-circle-outline" }
          : UnifiAllowlistPanel._lastSeenChip(e.last_seen),
        e.vendor ? { v: e.vendor, cls: "off", icon: "mdi:factory" } : null,
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

  /* True while text is selected inside the panel. Redrawing then throws the
     selection away mid-drag, which is what made copying a MAC by hand so
     miserable. Tap to copy is the real answer, but leaving a selection alone
     costs nothing. */
  _hasSelection() {
    try {
      const sel =
        (this.shadowRoot.getSelection && this.shadowRoot.getSelection()) ||
        window.getSelection();
      return Boolean(sel && !sel.isCollapsed && String(sel).trim());
    } catch (err) {
      return false;
    }
  }

  _renderList() {
    if (!this._data) return;
    // a verdict animation owns the list until it finishes
    if (this._animating) return;
    if (this._hasSelection()) return;
    // Rows render into #rows, not the scroller itself: the stat cards and the
    // pinned search row live in there too and must not be wiped.
    const list = this.shadowRoot.getElementById("rows");
    let rows = this._rowsForTab();
    const allRows = rows;
    const total = rows.length;

    rows = this._applyFilters(rows);
    rows = this._sortRows(rows);

    if (this._query) {
      const q = this._query;
      rows = rows.filter(
        (r) =>
          r.mac.includes(q) ||
          (r.name || "").toLowerCase().includes(q) ||
          (r.vendor || "").toLowerCase().includes(q) ||
          (r.ap || "").toLowerCase().includes(q) ||
          (r.fields || []).some((f) => (f.v || "").toLowerCase().includes(q)) ||
          (r.chips || []).some((c) => c && (c.v || "").toLowerCase().includes(q))
      );
    }

    const dot = this.shadowRoot.getElementById("filter-dot");
    if (dot) {
      const active = this._activeCount();
      dot.textContent = String(active);
      dot.hidden = !active;
    }
    if (this._sheetOpen) this._renderSheet();
    if (this._histOpen) this._renderHist();
    if (this._cfgOpen) this._renderCfg();

    if (!rows.length) {
      list.innerHTML =
        `<div class="empty"><ha-icon icon="${this._emptyIcon()}"></ha-icon>` +
        `<span>${this._esc(this._emptyText())}</span></div>`;
      return;
    }

    const cap = Math.min(rows.length, MAX_ROWS);
    // Keep whatever was already on screen, so a background refresh cannot
    // yank the list back to the top of a long scroll.
    this._page = Math.min(Math.max(this._page || FIRST_ROWS, FIRST_ROWS), cap);
    const shown = rows.slice(0, this._page);
    this._pageRows = rows;

    list.innerHTML =
      this._bulkHtml(rows) +
      shown.map((r) => this._rowHtml(r)).join("") +
      (this._page < cap
        ? `<div class="sentinel" id="sentinel"><ha-icon icon="mdi:loading" class="spin"></ha-icon></div>`
        : rows.length > MAX_ROWS
        ? `<div class="more">Showing ${MAX_ROWS} of ${rows.length}. Search to narrow it down.</div>`
        : "");

    this._watchSentinel();
  }

  /* Extends the list as its foot comes into view. An observer rather than a
     scroll handler, so nothing runs while the list sits still. */
  _watchSentinel() {
    const root = this.shadowRoot;
    const sentinel = root.getElementById("sentinel");
    if (this._io) this._io.disconnect();
    if (!sentinel) return;
    const scroller = root.getElementById("list");
    this._io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        this._growList();
      },
      { root: scroller, rootMargin: "400px 0px" }
    );
    this._io.observe(sentinel);
  }

  /* Extending the list used to call _renderList, which rewrites innerHTML for
     every row from the top. Growing 14 -> 300 that way builds ~1400 rows and
     ten thousand icons, destroying and recreating everything already on screen
     each time. Appending only the new slice builds each row exactly once. */
  _growList() {
    const rows = this._pageRows || [];
    const cap = Math.min(rows.length, MAX_ROWS);
    if (this._page >= cap) return;

    const list = this.shadowRoot.getElementById("list");
    const sentinel = this.shadowRoot.getElementById("sentinel");
    if (!list || !sentinel) return;

    const from = this._page;
    this._page = Math.min(this._page + PAGE_ROWS, cap);
    const html = rows
      .slice(from, this._page)
      .map((r) => this._rowHtml(r))
      .join("");
    sentinel.insertAdjacentHTML("beforebegin", html);

    if (this._page >= cap) {
      if (this._io) this._io.disconnect();
      sentinel.outerHTML =
        rows.length > MAX_ROWS
          ? `<div class="more">Showing ${MAX_ROWS} of ${rows.length}. Search to narrow it down.</div>`
          : "";
    }
  }

  /* Anything that changes what the list contains starts it from the top. */
  _resetPaging() {
    this._page = FIRST_ROWS;
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
      .map((f) => {
        const inner = `${
          f.icon ? `<ha-icon icon="${f.icon}"></ha-icon>` : ""
        }${this._esc(f.v)}`;
        // Selecting a MAC by dragging is hopeless when the list redraws under
        // you, so the monospaced identifiers are a tap to copy instead.
        return f.mono
          ? `<button class="f mono copyable" data-copy="${this._esc(f.v)}"
               title="Copy" aria-label="Copy ${this._esc(f.v)}">${inner}</button>`
          : `<span class="f">${inner}</span>`;
      })
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

  /* Epoch seconds -> "3h ago". Falls back to a date past a week, because
     "just under 400 hours ago" tells you nothing useful. */
  static _ago(stamp) {
    const ts = Number(stamp) || 0;
    if (!ts) return "";
    const secs = Math.floor(Date.now() / 1000) - ts;
    if (secs < 0) return "just now";
    if (secs < 90) return "just now";
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(secs / 3600);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(secs / 86400);
    if (days <= 7) return `${days}d ago`;
    try {
      const then = new Date(ts * 1000);
      const opts = { day: "numeric", month: "short" };
      // A bare "May 13" on a two-year-old record reads as this year.
      if (then.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
      return then.toLocaleDateString(undefined, opts);
    } catch (err) {
      return `${days}d ago`;
    }
  }

  static _lastSeenChip(stamp) {
    const ago = UnifiAllowlistPanel._ago(stamp);
    return ago
      ? { v: `last seen ${ago}`, cls: "off", icon: "mdi:clock-outline" }
      : null;
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
