[![Total Downloads](https://img.shields.io/github/downloads/hitchin999/unifi_allowlist/total.svg?label=Total%20Downloads&style=for-the-badge&color=blue)](https://github.com/hitchin999/unifi_allowlist/releases)
[![Active UniFi Allow List Installs][ual-badge]][ual-analytics]

[ual-badge]: https://img.shields.io/badge/dynamic/json?label=Active%20Installs&url=https%3A%2F%2Fanalytics.home-assistant.io%2Fcustom_integrations.json&query=%24.unifi_allowlist.total&style=for-the-badge&color=blue
[ual-analytics]: https://analytics.home-assistant.io/integration/unifi_allowlist

# UniFi Allow List for Home Assistant

A **MAC allow list for UniFi wireless networks**, with an approve-or-deny workflow.

An unknown device joins your wifi. It gets blocked on the controller, and you get a notification with **Allow** and **Keep blocked** buttons. Tap one. That's the whole idea.

Everything is managed from a sidebar panel — no YAML, no editing files.

---

## Why not just use UniFi's MAC filter?

UniFi's built-in MAC filter enforces fine, but a rejected association barely surfaces as an event, so there is no reliable trigger for a notification. RADIUS MAC authentication solves that properly and is the stronger option if you are willing to run FreeRADIUS.

This integration is the middle path: no extra infrastructure, at the cost of a short window where an unknown device has working internet before the block lands.

---

## Features

- **Approve or deny from your phone** — actionable notifications with a dedicated Android channel and group
- **Sidebar panel** — waiting queue, live clients, allow list, deny list, all searchable by name, MAC or IP
- **SSID scoping** — police your IoT network and leave the guest network alone
- **Catches short visits** — reads recently-seen clients, not just currently connected, so a device that joins for thirty seconds still gets caught
- **Wired devices are never touched** — a client must explicitly report as wireless before anything happens to it
- **Learns device names** from the controller, and lets you override them with your own
- **Shows where** — IP, SSID, access point and radio band, in the panel and in the notification
- **Safety rails** — refuses to enforce if the allow list looks truncated, and stops blocking entirely if an implausible number of unknown devices appear at once
- **Prune** — forget stale offline clients on the controller and drop them from the allow list
- **Import and export** — seed the list from a file, back it up, or copy it to another site

---

## Requirements

- UniFi Network **9.3 or newer** (tested on 10.4)
- An API key: UniFi → **Settings → Integrations → Create API Key**
- Home Assistant **2024.11 or newer**
- The Home Assistant companion app, for approve/deny notifications

---

## Installation

### HACS

1. HACS → Integrations → ⋮ → **Custom repositories**
2. Add `https://github.com/hitchin999/unifi_allowlist`, category **Integration**
3. Install, then restart Home Assistant
4. Settings → Devices & Services → **Add Integration** → **UniFi Allow List**

### Manual

Copy `custom_components/unifi_allowlist/` into your `config/custom_components/` directory and restart.

---

## Setup

The config flow asks for your controller URL and API key, validates them, then shows a dropdown of the sites it found, listed alphabetically. Pick one, choose where notifications should go, and you are running.

**Seed the allow list before enabling enforcement.** A fresh install has an empty list, which means every device on your network is unknown. Two ways:

Turn off `switch.enforcement`, let the **On wifi now** tab fill with the devices you already trust, then press **Allow all** in the panel and turn enforcement back on.

Or import a list you already have:

```yaml
action: unifi_allowlist.import_list
data:
  path: /config/known_macs.json
  target: allowed
```

The importer accepts a JSON array, a JSON object keyed by MAC, or plain text with one MAC per line.

---

## Options

| Option | Default | What it does |
|---|---|---|
| Notification target | — | Which `notify.*` service receives prompts |
| Only police these SSIDs | all | Restrict enforcement to specific networks |
| Block on sight, then ask | on | Off means notify only, never block |
| Check every | 30 s | Poll interval |
| Also catch devices seen within | 600 s | Lookback window for short visits |
| Stop and alert if more than | 10 | Circuit breaker |
| Refuse to enforce if list smaller than | 25 | Truncated-list guard |
| Pause between notifications | 1 s | Stops Android dropping rapid sends |
| Notification channel / group | — | Android grouping and sound |

---

## Entities

| Entity | Purpose |
|---|---|
| `sensor.*_devices_awaiting_approval` | Queue size; full device list in attributes |
| `sensor.*_unknown_devices_seen` | Unknown devices in the current window |
| `sensor.*_allowed_devices` | Allow list size |
| `sensor.*_denied_devices` | Deny list size |
| `sensor.*_devices_on_wifi` | Live wireless clients |
| `switch.*_enforcement` | Master blocking toggle |
| `button.*_unblock_everything` | Panic button — clears all blocks |
| `button.*_resend_pending_prompts` | Re-send notifications for the queue |

---

## Services

| Service | What it does |
|---|---|
| `unifi_allowlist.allow` | Add a MAC to the allow list and unblock it |
| `unifi_allowlist.deny` | Add a MAC to the deny list and block it |
| `unifi_allowlist.forget` | Remove a MAC from every list |
| `unifi_allowlist.set_name` | Give a device your own name |
| `unifi_allowlist.allow_online_unknown` | Approve every unknown device currently on wifi |
| `unifi_allowlist.resend_pending` | Re-notify everything still waiting |
| `unifi_allowlist.unblock_all` | Clear every block on the controller |
| `unifi_allowlist.prune` | Forget stale offline clients |
| `unifi_allowlist.import_list` | Seed a list from a file |
| `unifi_allowlist.export_list` | Write a list out as JSON |

---

## A note on randomized MAC addresses

Modern phones rotate their MAC per network and re-randomize periodically. Every rotation looks like a new device and generates a new approval prompt. On a network with many personal devices this can mean dozens of prompts a day.

Two mitigations: **scope enforcement to SSIDs where devices have static MACs** (IoT, cameras, thermostats), and ask users to disable Private Wi-Fi Address for your network. If neither is workable for your guest or BYOD network, RADIUS MAC authentication is a better fit than this integration.

---

## Caveats

- **Blocking is site-wide.** UniFi has no per-SSID block. You can trigger on one SSID, but a blocked MAC is blocked everywhere on that site.
- **There is a gap.** An unknown device has internet until the next poll.
- **`prune` is destructive.** Forgetting a client deletes its history and stats on the controller. Always run with `dry_run: true` first.
- **Enforcement defaults to on** after a restart. The switch state is not persisted, so a restart never silently leaves a site unpoliced.
- **While Home Assistant is down**, existing blocks stay in place, but new unknown devices connect freely.

---

## Brand images

Icons live in `custom_components/unifi_allowlist/brand/` and are served by Home Assistant itself from **2026.3** onward. Local images take priority over the brands CDN, so there is nothing to submit to the brands repository.

Light and dark variants are included. Note that the HACS dashboard does not yet render local brand images — the Integrations page, device pages and the rest of the frontend do. On Home Assistant older than 2026.3 you simply get a placeholder icon.

---

## License

MIT
