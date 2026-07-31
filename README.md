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

## What kind of device is it

The controller resolves each MAC's manufacturer itself and returns it on the
client record, so the vendor is shown as a chip without any external lookup
service, API key or rate limit — and no MAC ever leaves your network. It is
searchable and filterable under **Made by**.

Bear in mind it identifies the maker of the wifi chipset, not the product, and
a phone using a private wifi address reports no usable vendor at all, because
the address was invented rather than assigned.

## Sorting and filtering

**Sort & filter** beside the search box opens a sheet: sort by name either way,
last seen, IP, access point or MAC, and filter by status, network, access point
or band. Choices within a group are OR'd and groups are AND'd together, so
"Camp + Guest, on wifi now" reads the way you would expect.

Each choice carries a count that ignores its own group, so you can see what
selecting it would bring in. Only groups with more than one value on the
current tab are shown, and the button carries a badge with the number of active
filter groups. Choices persist across visits.

IP sorting is numeric, so `192.168.0.9` comes before `192.168.0.100`.

## Silencing a phone that rotates its MAC

A phone with private Wi-Fi addresses on arrives as a brand new device every
time it rejoins, so denying it once does nothing. **Always block these device
names** in the options takes the name the client reports, case insensitive,
with `*` and `?` wildcards. A match is blocked immediately with no notification
and no waiting-list entry, so the queue stays clean however many addresses the
phone invents.

Names come from the device and can be changed by whoever owns it, so this is
noise control, not access control. Anyone who renames their phone walks
straight past it.

**Always block devices that report no name** is separate, because a device with
no hostname has no text to match. It is a wide net — cameras, intercoms and
plenty of IoT hardware report nothing — so look through the waiting list before
switching it on.

## Denied means blocked

The Denied tab lists everything this integration is holding blocked on the
controller, so its count lines up with UniFi's blocked filter. Devices still
awaiting a verdict appear there too, tagged **awaiting review**, because a
waiting device is a blocked device — it just has no decision attached yet. They
are not stored twice; the waiting queue is the same records, flagged.

From the Denied tab an awaiting-review row offers Allow (let it on and drop the
block), Deny (confirm the block and clear it from the queue) or Forget.

The match is over **wireless clients only**. Wired clients are outside this
integration's scope everywhere else and are never adopted or blocked here, so
UniFi's blocked count includes any wired blocks that this will not touch.

## Polling

Two schedules, because the two calls cost very different amounts. **Check every**
governs how often the connected-client list is read, and that is the only thing
detection needs — so it can be turned down to a few seconds to shorten the
window before an unknown device is blocked. The full client list, which is far
larger and is needed only for the lookback merge and the controller sync, is
refreshed once a minute regardless.

A device still gets a moment of access: it associates and takes an address
before anything can see it, so the window shrinks with the interval but never
reaches zero. Refusing association outright is a job for UniFi's per-WLAN MAC
filter, not for this.

If the big refresh fails but the connected list succeeds, the poll carries on
with the previous copy and logs how old it is, rather than failing outright.

## Protection against a lost allow list

Enforcement blocks whatever is not on the allow list, so a list that comes back
empty or truncated would block the entire network. Two guards, and neither
cares how many devices you have:

**Lost data.** The allow list's high-water mark is kept in its own storage file.
Every removal you make through the integration lowers the mark as it goes, so a
gap between the mark and the list can only mean stored data came back smaller
than it was left. Lose 91 entries and drop to 10 and nothing is blocked; run a
five-device house and remove two and nothing happens. If the smaller list is
genuinely correct — you edited storage by hand, say — call
`unifi_allowlist.accept_list_size` to make it the new normal. Restoring a
backup is the usual answer.

**Too many at once.** Separately, if more unknown devices appear in a single
poll than **Maximum blocks per run** (10 by default), nothing is blocked and you
get a warning. That covers the sudden case, at any size.

**Minimum allow list size** is a third, optional hard floor and is **off** by
default. A fixed number fits a large site far better than a small one, and the
guards above catch what it was aimed at.

Whenever a guard is holding enforcement back the panel shows a red banner naming
the actual numbers, so it is never silently doing nothing.

## Staying in sync with the controller

Blocks made by hand in the UniFi UI are invisible to this integration by
default, and a denial removed there is never re-applied. `sync_from_unifi`
reconciles both:

- **blocked there, not by us** -> moved to Denied. Devices this integration
  blocked are already in the waiting or denied lists and are skipped, so a
  pending approval is never quietly reversed.
- **denied here, not blocked there** -> blocked again.

Nothing is ever unblocked; removing enforcement stays a manual decision.

```yaml
action: unifi_allowlist.sync_from_unifi
data:
  dry_run: true    # counts go to the log, nothing changes
```

Re-applying a block for something already in the denied or waiting lists runs
on every poll and cannot be turned off — that is the invariant. **Adopt blocks
made in UniFi** (on by default) additionally pulls in blocks somebody else
made. It refuses to adopt more than 25 at once and logs
instead, so a controller-side mistake cannot empty your allow list unattended.
Run the service once with `dry_run: true` before enabling it.

## Text message control

With the [Telebroad SMS](https://github.com/hitchin999/telebroad_sms) integration
installed, each waiting device can be texted out to people who have no Home
Assistant account at all:

```
#475 Grzegorz-s-S25-Ultra
Camp Meor Hatorah, 5 GHz, B Basement AP
Reply: 475 allow  or  475 keep
```

The id belongs to that MAC permanently, so unlike a menu position it cannot go
stale while the queue moves. Replies are read straight off the
`telebroad_sms_received` event, in either order and several at a time:
`475 allow 476 keep` answers two prompts in one message. A decided id stays
claimed for a day, so a late reply gets "already handled" rather than landing on
whatever device inherited the number. Ids are allocated across every configured
site, so a bare number is never ambiguous.

Set the recipients per site, so one person can be given the camp and never see
the other controller. Only listed numbers are acted on, and an unlisted sender
gets silence rather than a refusal.

**Caller ID is trivially spoofable.** Anyone who learns the line number and the
id format can reply. Set a PIN in the options if that matters — replies then
read `475 allow 4321`.

## Who did what

Every decision is recorded with the device, who made it and when: a Home
Assistant user by name, `SMS <contact>` resolved against the SMS integration's
contacts, `notification`, or `automatic` for enforcement and sync. The **History**
button in the panel shows the last few hundred, and each one is also fired as a
`unifi_allowlist_decision` event so it lands in the logbook and can be automated
on.

## Multiple sites

Add the integration once per UniFi site. Each site gets its own config entry,
its own allow list, its own enforcement switch and its own polling — they never
share state.

- **Panel** — a site picker appears in the header as soon as a second site is
  configured, showing the waiting count per site. The choice is remembered.
- **Notifications** — the prompt names the site it came from, and Allow / Keep
  blocked act on that site. A device approved on one site stays unknown on the
  others, which is the point.
- **Services** — every service takes an optional `site`. With one site set up it
  is optional and ignored. With several it is required, and a call without it
  fails with a message listing the configured sites rather than guessing.

```yaml
action: unifi_allowlist.allow
data:
  mac: "a4:83:e7:12:34:56"
  site: "01K2ABCDEF..."   # config entry, or the UniFi site name
```

