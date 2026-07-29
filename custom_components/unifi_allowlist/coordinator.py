"""Detection and enforcement loop."""

from __future__ import annotations

import asyncio
import fnmatch
import logging
import re
import time
from datetime import timedelta

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import UnifiClient, UnifiError
from .const import (
    ACTION_PREFIX,
    ADOPT_LIMIT,
    CONF_ADOPT_BLOCKS,
    CONF_DENY_NAMES,
    CONF_DENY_UNNAMED,
    CONF_BLOCK_FIRST,
    CONF_FORGET_IN_UNIFI,
    CONF_CHANNEL,
    CONF_GROUP,
    CONF_LOOKBACK,
    CONF_MAX_PER_RUN,
    CONF_NOTIFY,
    CONF_SITE,
    CONF_SCAN_INTERVAL,
    CONF_SSIDS,
    DEFAULT_ADOPT_BLOCKS,
    DEFAULT_DENY_UNNAMED,
    DEFAULT_FORGET_IN_UNIFI,
    DEFAULT_BLOCK_FIRST,
    DEFAULT_CHANNEL,
    DEFAULT_GROUP,
    DEFAULT_LOOKBACK,
    DEFAULT_MAX_PER_RUN,
    CONF_MIN_LIST_GUARD,
    CONF_NOTIFY_GAP,
    DEFAULT_MIN_LIST_GUARD,
    DEFAULT_NOTIFY_GAP,
    DEFAULT_SCAN_INTERVAL,
    DEVICE_CACHE_SECONDS,
    DOMAIN,
    FORGET_BATCH_SIZE,
    PRUNE_BATCH_PAUSE,
)
from .store import DeviceStore

_LOGGER = logging.getLogger(__name__)


class UnifiAllowlistCoordinator(DataUpdateCoordinator):
    """Polls the controller, decides what is unknown, and acts on it."""

    def __init__(
        self,
        hass: HomeAssistant,
        client: UnifiClient,
        store: DeviceStore,
        entry,
    ) -> None:
        self.client = client
        self.store = store
        self.entry = entry
        self.enforcing = True
        self.last_error: str | None = None
        self.wlan_names: dict[str, str] = {}
        self.ap_names: dict[str, str] = {}
        self._devices_stamp = 0.0
        self.online: list[dict] = []
        self._breaker_tripped = False
        self._controller_name: str | None = None
        self.suppressed_last_run = 0

        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=self._opt(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)),
        )

    # --- identity ----------------------------------------------------------

    @property
    def entry_id(self) -> str:
        return self.entry.entry_id

    @property
    def site(self) -> str:
        """UniFi site name, e.g. 'jyltil67'."""
        return str(self._opt(CONF_SITE, "") or "")

    @property
    def site_title(self) -> str:
        """What the user called this entry, e.g. 'Wifi Access (Camp X)'."""
        return self.entry.title or self.site or "UniFi"

    # --- name based suppression -------------------------------------------

    @property
    def deny_name_patterns(self) -> list[str]:
        raw = self._opt(CONF_DENY_NAMES, None) or []
        if isinstance(raw, str):
            raw = [raw]
        return [str(p).strip().casefold() for p in raw if str(p).strip()]

    def _denied_by_name(self, rec: dict) -> str | None:
        """Which rule, if any, says to suppress this device.

        Matching is on the name the client reports, case-insensitively, with
        * and ? wildcards. A device reporting no name at all is only caught by
        the separate 'unnamed' option, since there is no text to match.
        """
        reported = str(rec.get("hostname") or rec.get("name") or "").strip()
        if not reported:
            if bool(self._opt(CONF_DENY_UNNAMED, DEFAULT_DENY_UNNAMED)):
                return "(no name)"
            return None
        folded = reported.casefold()
        for pattern in self.deny_name_patterns:
            if pattern == folded or fnmatch.fnmatch(folded, pattern):
                return pattern
            if "*" not in pattern and "?" not in pattern and pattern in folded:
                return pattern
        return None

    async def _refresh_controller_name(self) -> None:
        """Ask the console what it calls itself. Cosmetic, so failure is fine."""
        info = await self.client.sysinfo()
        self._controller_name = str(
            info.get("name") or info.get("hostname") or ""
        ).strip()

    @property
    def controller_label(self) -> str:
        """Console name, falling back to the host you typed in."""
        if self._controller_name:
            return self._controller_name
        host = re.sub(r"^https?://", "", self.client.host or "")
        return host.split("/")[0].split(":")[0] or "UniFi"

    @property
    def site_label(self) -> str:
        """Short name for the site, without the 'Wifi Access (...)' wrapper.

        Entry titles are built as 'Wifi Access (Camp X)'. Repeating that next
        to a heading that already says Wifi Access reads badly, so pull the
        inside out when it matches and fall back to whatever we have.
        """
        title = (self.entry.title or "").strip()
        match = re.fullmatch(r"Wifi Access \((.+)\)", title)
        if match:
            return match.group(1).strip()
        return title or self.site or "UniFi"

    @property
    def _multi_site(self) -> bool:
        """True when more than one config entry is loaded."""
        return len(self.hass.data.get(DOMAIN, {})) > 1

    # --- options helpers ---------------------------------------------------

    def _opt(self, key: str, default):
        return self.entry.options.get(key, self.entry.data.get(key, default))

    @property
    def notify_targets(self) -> list[str]:
        """Every notify service that should receive prompts.

        Stored as a list since 1.1.0; a bare string from an older config entry
        still works and is treated as a one-item list.
        """
        raw = self._opt(CONF_NOTIFY, None)
        if not raw:
            return []
        if isinstance(raw, str):
            return [raw]
        return [t for t in raw if t]

    @property
    def notify_service(self) -> str | None:
        """First target. Kept for anything still expecting a single service."""
        targets = self.notify_targets
        return targets[0] if targets else None

    async def _async_send(self, payload: dict) -> None:
        """Fan a notify payload out to every configured target."""
        for target in self.notify_targets:
            try:
                await self.hass.services.async_call(
                    "notify", target, payload, blocking=False
                )
            except Exception as err:  # noqa: BLE001
                _LOGGER.warning("notify to %s failed: %s", target, err)

    @property
    def enforced_ssids(self) -> list[str]:
        return self._opt(CONF_SSIDS, []) or []

    def apply_options(self) -> None:
        self.update_interval = timedelta(
            seconds=self._opt(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
        )

    # --- main loop ---------------------------------------------------------

    async def _async_update_data(self) -> dict:
        try:
            active, known = await asyncio.gather(
                self.client.active_clients(), self.client.known_clients()
            )
        except UnifiError as err:
            self.last_error = str(err)
            raise UpdateFailed(str(err)) from err

        self.last_error = None

        if self._controller_name is None:
            await self._refresh_controller_name()

        await self._auto_sync()

        if not self.wlan_names:
            await self._refresh_wlans()

        if time.time() - self._devices_stamp > DEVICE_CACHE_SECONDS:
            await self._refresh_devices()

        await self._backfill_names(known)

        lookback = int(self._opt(CONF_LOOKBACK, DEFAULT_LOOKBACK))
        cutoff = int(time.time()) - lookback

        # Devices seen recently, including ones that already disconnected.
        # is_wired must be explicitly False - never risk touching wired gear.
        seen: dict[str, dict] = {}
        for rec in known:
            if rec.get("is_wired") is not False:
                continue
            mac = str(rec.get("mac", "")).lower()
            if not mac:
                continue
            if int(rec.get("last_seen") or 0) < cutoff:
                continue
            seen[mac] = dict(rec)

        # Live clients carry essid and signal, so overlay them last.
        live: set[str] = set()
        online: list[dict] = []
        for rec in active:
            if rec.get("is_wired"):
                continue
            mac = str(rec.get("mac", "")).lower()
            if not mac:
                continue
            merged = seen.get(mac, {})
            merged.update(rec)
            seen[mac] = merged
            live.add(mac)
            online.append(self._describe(merged, True))

        self.online = sorted(
            online, key=lambda r: (r["status"] != "unknown", (r["name"] or "zzz").lower())
        )

        unknown = [m for m in seen if not self.store.is_allowed(m)]
        in_scope = [m for m in unknown if self._in_scope(seen[m])]

        if self.enforcing:
            await self._enforce(seen, in_scope, live)

        return {
            "online": len(online),
            "recent": len(seen),
            "live": len(live),
            "unknown": len(in_scope),
            "allowed": len(self.store.allowed),
            "denied": len(self.store.denied),
            "pending": len(self.store.pending),
            "breaker": self._breaker_tripped,
        }

    async def _backfill_names(self, known: list[dict]) -> None:
        """Fill in names the controller knows for MACs already on a list.

        Lists seeded by import are just bare MAC addresses. The controller has
        hostnames for most of them, so learn those once and keep them - that way
        a device still shows a name when it is offline and no longer in the
        client list. A name you set yourself is never touched.
        """
        by_mac = {}
        for rec in known:
            mac = str(rec.get("mac", "")).lower()
            host = rec.get("hostname") or rec.get("name") or ""
            if mac and host:
                by_mac[mac] = host

        if not by_mac:
            return

        changed = 0
        for table in (self.store.allowed, self.store.denied, self.store.pending):
            for mac, entry in table.items():
                if not isinstance(entry, dict):
                    continue
                host = by_mac.get(mac)
                if host and entry.get("name") != host and not entry.get("name"):
                    entry["name"] = host
                    changed += 1

        if changed:
            await self.store.async_save()
            _LOGGER.info("learned %s device name(s) from the controller", changed)

    async def _refresh_devices(self) -> None:
        """Map AP MAC to the name you gave it in UniFi."""
        self._devices_stamp = time.time()
        try:
            devices = await self.client.devices()
        except UnifiError as err:
            _LOGGER.debug("could not read device list: %s", err)
            return

        names = {}
        for dev in devices:
            mac = str(dev.get("mac", "")).lower()
            if not mac:
                continue
            names[mac] = dev.get("name") or dev.get("model") or mac
        if names:
            self.ap_names = names

    def _ap_of(self, rec: dict) -> str:
        """Live records give the AP MAC. Lookback records give its name."""
        ap_mac = str(rec.get("ap_mac") or rec.get("last_uplink_mac") or "").lower()
        if ap_mac and ap_mac in self.ap_names:
            return self.ap_names[ap_mac]
        return rec.get("last_uplink_name") or ap_mac or ""

    @staticmethod
    def _band_of(rec: dict) -> str:
        radio = rec.get("radio") or rec.get("last_radio") or ""
        return {"na": "5 GHz", "ng": "2.4 GHz", "6e": "6 GHz", "ax": "6 GHz"}.get(
            radio, ""
        )

    async def _refresh_wlans(self) -> None:
        try:
            wlans = await self.client.wlans()
        except UnifiError as err:
            _LOGGER.debug("could not read wlanconf: %s", err)
            return
        self.wlan_names = {
            w["_id"]: w.get("name", "") for w in wlans if w.get("_id")
        }

    def _ssid_of(self, rec: dict) -> str:
        """Live records carry essid. Lookback records only have wlanconf_id."""
        return rec.get("essid") or self.wlan_names.get(rec.get("wlanconf_id", ""), "")

    def _in_scope(self, rec: dict) -> bool:
        scope = self.enforced_ssids
        if not scope:
            return True
        return self._ssid_of(rec) in scope

    def _describe(self, rec: dict, is_live: bool) -> dict:
        mac = str(rec.get("mac", "")).lower()
        if self.store.is_allowed(mac):
            status = "allowed"
        elif self.store.is_denied(mac):
            status = "denied"
        else:
            status = "unknown"

        label = self.store.label_for(mac)
        reported = rec.get("hostname") or rec.get("name") or ""

        return {
            "mac": mac,
            "name": label or reported,
            "label": label,
            "hostname": reported,
            "ip": rec.get("ip") or rec.get("last_ip") or "",
            "ssid": self._ssid_of(rec),
            "signal": rec.get("signal"),
            "ap": self._ap_of(rec),
            "band": self._band_of(rec),
            "blocked": bool(rec.get("blocked")),
            "live": is_live,
            "in_scope": self._in_scope(rec),
            "status": status,
        }

    async def _enforce(
        self, seen: dict[str, dict], unknown: list[str], live: set[str]
    ) -> None:
        guard = int(self._opt(CONF_MIN_LIST_GUARD, DEFAULT_MIN_LIST_GUARD))
        if guard and len(self.store.allowed) < guard:
            _LOGGER.error(
                "allow list has only %s entries (minimum %s) - refusing to enforce",
                len(self.store.allowed),
                guard,
            )
            return

        # Previously denied: re-block, but only while actually connected.
        for mac in [m for m in unknown if self.store.is_denied(m) and m in live]:
            await self._safe_block(mac)

        fresh = [
            m
            for m in unknown
            if not self.store.is_denied(m) and not self.store.is_pending(m)
        ]
        if not fresh:
            self._breaker_tripped = False
            return

        max_per_run = int(self._opt(CONF_MAX_PER_RUN, DEFAULT_MAX_PER_RUN))
        if len(fresh) > max_per_run:
            self._breaker_tripped = True
            _LOGGER.error(
                "%s unknown devices at once (limit %s) - blocking nothing",
                len(fresh),
                max_per_run,
            )
            await self._notify_plain(
                "Wifi access: too many unknown devices",
                f"{len(fresh)} unknown devices appeared at once. "
                "Nothing was blocked. Check the network.",
                icon="mdi:alert",
                color="#d9534f",
            )
            return

        self._breaker_tripped = False
        block_first = bool(self._opt(CONF_BLOCK_FIRST, DEFAULT_BLOCK_FIRST))

        suppressed = 0
        for mac in fresh:
            rec = seen[mac]

            if rule := self._denied_by_name(rec):
                # Blocked, but no queue entry and no notification. A phone with
                # MAC randomisation would otherwise prompt again on every new
                # address it invents.
                await self._safe_block(mac)
                suppressed += 1
                _LOGGER.debug("suppressed %s by name rule %r", mac, rule)
                continue

            name = (
                self.store.label_for(mac) or rec.get("hostname") or "no name"
            )
            ssid = self._ssid_of(rec) or "?"
            ip = rec.get("ip") or rec.get("last_ip") or ""
            ap = self._ap_of(rec)

            if block_first:
                await self._safe_block(mac)

            await self.store.async_add_pending(
                mac, name, ssid, ap=ap, ip=ip, band=self._band_of(rec)
            )
            await self._notify_device(
                mac,
                name,
                ssid,
                rec.get("signal", "?"),
                "on wifi now" if mac in live else "already disconnected",
                blocked=block_first,
                ip=ip,
                ap=ap,
            )
            await asyncio.sleep(float(self._opt(CONF_NOTIFY_GAP, DEFAULT_NOTIFY_GAP)))

        self.suppressed_last_run = suppressed
        if suppressed:
            _LOGGER.info(
                "blocked %d device(s) silently by name rule this run", suppressed
            )

    async def _safe_block(self, mac: str) -> None:
        try:
            await self.client.block(mac)
        except UnifiError as err:
            _LOGGER.warning("block failed for %s: %s", mac, err)

    async def _safe_unblock(self, mac: str) -> None:
        try:
            await self.client.unblock(mac)
        except UnifiError as err:
            _LOGGER.warning("unblock failed for %s: %s", mac, err)

    # --- notifications -----------------------------------------------------

    def _base_data(self) -> dict:
        return {
            "channel": self._opt(CONF_CHANNEL, DEFAULT_CHANNEL),
            "group": self._opt(CONF_GROUP, DEFAULT_GROUP),
        }

    async def _notify_plain(
        self, title: str, message: str, icon: str = "mdi:wifi", color: str | None = None
    ) -> None:
        if not self.notify_targets:
            return
        data = self._base_data()
        data["importance"] = "high"
        data["notification_icon"] = icon
        if color:
            data["color"] = color
        await self._async_send({"title": title, "message": message, "data": data})

    async def _notify_device(
        self,
        mac: str,
        name: str,
        ssid: str,
        signal,
        where: str,
        blocked: bool,
        ip: str = "",
        ap: str = "",
    ) -> None:
        if not self.notify_targets:
            return

        data = self._base_data()
        data.update(
            {
                "tag": f"ual_{mac}",
                "importance": "high",
                "notification_icon": "mdi:wifi-alert",
                "color": "#e8a33d",
                "sticky": "true",
                "actions": [
                    {
                        "action": f"{ACTION_PREFIX}OK_{self.entry_id}_{mac}",
                        "title": "Allow",
                    },
                    {
                        "action": f"{ACTION_PREFIX}NO_{self.entry_id}_{mac}",
                        "title": "Keep blocked",
                    },
                ],
            }
        )

        title = "Blocked a new device" if blocked else "New device on wifi"
        if self._multi_site:
            title = f"{title} - {self.site_title}"
        lines = [name, mac]
        if ip:
            lines.append(f"IP: {ip}")
        lines.append(f"SSID: {ssid}   signal: {signal}")
        if ap:
            lines.append(f"AP: {ap}")
        lines.append(where)
        message = "\n".join(lines)

        await self._async_send({"title": title, "message": message, "data": data})

    async def async_clear_notification(self, mac: str) -> None:
        """Pull the prompt for this MAC off every device that got it.

        Whoever answers first wins; the card disappears for everyone else.
        """
        await self._async_send(
            {"message": "clear_notification", "data": {"tag": f"ual_{mac}"}}
        )

    async def async_resend_pending(self) -> int:
        for mac, info in list(self.store.pending.items()):
            await self._notify_device(
                mac,
                (info or {}).get("name", "no name"),
                (info or {}).get("ssid", "?"),
                "?",
                "waiting for you",
                blocked=True,
            )
            await asyncio.sleep(float(self._opt(CONF_NOTIFY_GAP, DEFAULT_NOTIFY_GAP)))

        return len(self.store.pending)

    # --- actions -----------------------------------------------------------

    async def async_allow(self, mac: str) -> None:
        mac = mac.strip().lower()
        rec = self.store.pending.get(mac) or {}
        await self.store.async_allow(mac, rec.get("name", ""), rec.get("ssid", ""))
        await self._safe_unblock(mac)
        await self.async_clear_notification(mac)
        _LOGGER.info("allowed %s", mac)
        await self.async_request_refresh()

    async def async_deny(self, mac: str) -> None:
        mac = mac.strip().lower()
        rec = self.store.pending.get(mac) or {}
        await self.store.async_deny(mac, rec.get("name", ""), rec.get("ssid", ""))
        await self._safe_block(mac)
        await self.async_clear_notification(mac)
        _LOGGER.info("denied %s", mac)
        await self.async_request_refresh()

    async def async_allow_online_unknown(self) -> int:
        """Approve every unknown device currently on wifi, in one pass."""
        macs = [
            r["mac"] for r in self.online if r["live"] and r["status"] == "unknown"
        ]
        if not macs:
            return 0

        moved = await self.store.async_allow_many(macs)
        for mac in macs:
            await self._safe_unblock(mac)
            await self.async_clear_notification(mac)

        _LOGGER.warning("bulk allowed %s device(s) currently on wifi", moved)
        await self.async_request_refresh()
        return moved

    async def async_set_name(self, mac: str, name: str) -> None:
        await self.store.async_set_label(mac, name)
        await self.async_request_refresh()

    async def _async_remove_from_controller(self, macs: list[str]) -> dict:
        """Delete these clients from UniFi, the way Forget does in its UI.

        forget-sta wipes the client record outright - alias, fixed IP
        reservation, usage history, the lot, with no undo. That is right for a
        randomised MAC that is never coming back, and wrong for a device
        somebody has deliberately labelled or given a static lease. Those are
        merely unblocked instead, so nothing an admin set up is destroyed.
        """
        macs = [m for m in {str(m).strip().lower() for m in macs} if m]
        if not macs:
            return {"forgotten": 0, "unblocked": 0}

        try:
            known = await self.client.known_clients()
        except UnifiError as err:
            _LOGGER.warning("could not read clients before forgetting: %s", err)
            for mac in macs:
                await self._safe_unblock(mac)
            return {"forgotten": 0, "unblocked": len(macs)}

        protected: set[str] = set()
        for rec in known or []:
            mac = str(rec.get("mac") or "").lower()
            if mac not in macs:
                continue
            if str(rec.get("name") or "").strip() or rec.get("use_fixedip"):
                protected.add(mac)

        doomed = [m for m in macs if m not in protected]

        for i in range(0, len(doomed), FORGET_BATCH_SIZE):
            chunk = doomed[i : i + FORGET_BATCH_SIZE]
            try:
                await self.client.forget(chunk)
            except UnifiError as err:
                _LOGGER.error("forget-sta failed, unblocking instead: %s", err)
                for mac in chunk:
                    await self._safe_unblock(mac)
            if len(doomed) > FORGET_BATCH_SIZE:
                await asyncio.sleep(PRUNE_BATCH_PAUSE)

        for mac in protected:
            await self._safe_unblock(mac)

        if protected:
            _LOGGER.warning(
                "kept %d client record(s) in UniFi because they have a name or a "
                "fixed IP; unblocked them instead of forgetting",
                len(protected),
            )
        return {"forgotten": len(doomed), "unblocked": len(protected)}

    async def async_forget_mac(self, mac: str) -> None:
        mac = mac.strip().lower()
        await self.store.async_forget(mac)
        # "As if never seen" has to include the controller, or our lists and
        # UniFi drift apart and a later sync adopts it straight back.
        if bool(self._opt(CONF_FORGET_IN_UNIFI, DEFAULT_FORGET_IN_UNIFI)):
            await self._async_remove_from_controller([mac])
        # Pull any outstanding prompt for it off every phone.
        await self.async_clear_notification(mac)
        await self.async_request_refresh()

    async def async_forget_offline_pending(self) -> int:
        """Clear waiting devices that are not on the wifi right now.

        Randomised MAC addresses mean one phone can leave a trail of dead
        entries in the queue. These are gone; forgetting them is not a
        decision about the device, just housekeeping. If it comes back it
        will be treated as new again.
        """
        live = {r["mac"] for r in self.online if r.get("live")}
        macs = [m for m in list(self.store.pending) if m not in live]
        if not macs:
            return 0
        gone = await self.store.async_forget_many(macs)
        if bool(self._opt(CONF_FORGET_IN_UNIFI, DEFAULT_FORGET_IN_UNIFI)):
            await self._async_remove_from_controller(macs)
        for mac in macs:
            await self.async_clear_notification(mac)
        await self.async_request_refresh()
        _LOGGER.info("forgot %d offline waiting device(s)", gone)
        return gone

    async def async_sync_from_unifi(
        self,
        dry_run: bool = True,
        reblock: bool = True,
        limit: int | None = None,
        refresh: bool = True,
    ) -> dict:
        """Reconcile our lists against what the controller actually enforces.

        Drift happens whenever somebody blocks or unblocks a client in the
        UniFi UI. Two directions:

        adopt   - blocked on the controller but not by us. Somebody made that
                  decision by hand, so it becomes a denial here. Devices we
                  blocked ourselves sit in pending or denied already and are
                  skipped, so approving from a notification is never undone.
        reblock - denied here but not blocked there. Our denial was quietly
                  reversed; put it back.

        Nothing is unblocked. Removing enforcement is never done implicitly.
        """
        try:
            known = await self.client.known_clients()
        except UnifiError as err:
            _LOGGER.error("sync failed: %s", err)
            return {"error": str(err), "adopted": 0, "reblocked": 0}

        names: dict[str, str] = {}
        on_controller: set[str] = set()
        for rec in known or []:
            mac = str(rec.get("mac") or "").lower()
            if not mac:
                continue
            if rec.get("blocked"):
                on_controller.add(mac)
            names[mac] = rec.get("name") or rec.get("hostname") or ""

        ours = set(self.store.denied) | set(self.store.pending)
        adopt = sorted(on_controller - ours)
        # Denied here, free there. Only chase ones the controller knows about.
        drifted = sorted((set(self.store.denied) & set(names)) - on_controller)

        from_allowed = [m for m in adopt if m in self.store.allowed]
        result = {
            "adopted": len(adopt),
            "from_allowed": len(from_allowed),
            "reblocked": len(drifted) if reblock else 0,
            "dry_run": dry_run,
            "macs": adopt[:50],
        }

        if limit is not None and len(adopt) > limit:
            _LOGGER.error(
                "sync: %d blocks to adopt exceeds the limit of %d, skipping. "
                "Run the sync_from_unifi service to review and apply them.",
                len(adopt),
                limit,
            )
            result["skipped"] = True
            return result

        if dry_run:
            _LOGGER.warning(
                "sync preview: would deny %d device(s) blocked in UniFi "
                "(%d currently allowed here), and re-block %d denied device(s) "
                "that are no longer blocked there",
                len(adopt),
                len(from_allowed),
                len(drifted) if reblock else 0,
            )
            return result

        if adopt:
            await self.store.async_deny_many(adopt, source="unifi")
            _LOGGER.warning(
                "sync: adopted %d block(s) from UniFi, %d of which were allowed here",
                len(adopt),
                len(from_allowed),
            )

        if reblock and drifted:
            for mac in drifted:
                await self._safe_block(mac)
            _LOGGER.warning("sync: re-blocked %d denied device(s)", len(drifted))

        if adopt or (reblock and drifted):
            if refresh:
                await self.async_request_refresh()
            await self._notify_plain(
                "Wifi access",
                f"Synced with UniFi: {len(adopt)} newly denied, "
                f"{len(drifted) if reblock else 0} re-blocked",
                icon="mdi:sync",
            )
        return result

    async def _auto_sync(self) -> None:
        """The same reconcile, run each poll when the option is on."""
        if not bool(self._opt(CONF_ADOPT_BLOCKS, DEFAULT_ADOPT_BLOCKS)):
            return
        # Already inside a poll, so no refresh request from here.
        await self.async_sync_from_unifi(
            dry_run=False, limit=ADOPT_LIMIT, refresh=False
        )

    async def async_unblock_untracked(self) -> int:
        """Unblock devices the controller blocks but we have no record of.

        This is the cleanup for blocks left stranded by an earlier forget, or
        adopted and then removed. Anything in denied or waiting is left alone,
        so it will not hand access to something you meant to keep out.
        """
        try:
            known = await self.client.known_clients()
        except UnifiError as err:
            _LOGGER.error("unblock_untracked failed: %s", err)
            return 0

        ours = set(self.store.denied) | set(self.store.pending)
        stranded = [
            mac
            for u in known or []
            if u.get("blocked")
            and (mac := str(u.get("mac") or "").lower())
            and mac not in ours
        ]
        for mac in stranded:
            await self._safe_unblock(mac)

        _LOGGER.warning("unblocked %d stranded block(s)", len(stranded))
        if stranded:
            await self._notify_plain(
                "Wifi access",
                f"Unblocked {len(stranded)} device(s) with no record here",
                icon="mdi:wifi-check",
            )
            await self.async_request_refresh()
        return len(stranded)

    async def async_unblock_all(self) -> int:
        try:
            known = await self.client.known_clients()
        except UnifiError as err:
            _LOGGER.error("unblock_all failed: %s", err)
            return 0

        blocked = [
            str(u["mac"]).lower() for u in known if u.get("blocked") and u.get("mac")
        ]
        for mac in blocked:
            await self._safe_unblock(mac)

        _LOGGER.warning("unblocked %s client(s)", len(blocked))
        await self._notify_plain(
            "Wifi access", f"Unblocked {len(blocked)} device(s)", icon="mdi:wifi-check"
        )
        await self.async_request_refresh()
        return len(blocked)

    async def async_prune(self, days: int = 7, dry_run: bool = True) -> dict:
        """Forget stale offline wireless clients, in UniFi and in the allow list."""
        try:
            active, known = await asyncio.gather(
                self.client.active_clients(), self.client.known_clients()
            )
        except UnifiError as err:
            _LOGGER.error("prune failed: %s", err)
            return {"error": str(err)}

        online = {str(c.get("mac", "")).lower() for c in active}
        cutoff = int(time.time()) - int(days) * 86400

        doomed = []
        for rec in known:
            if rec.get("is_wired") is not False:
                continue
            mac = str(rec.get("mac", "")).lower()
            if not mac or mac in online:
                continue
            if self.store.is_denied(mac) or self.store.is_pending(mac):
                continue
            if int(rec.get("last_seen") or 0) > cutoff:
                continue
            doomed.append(mac)

        result = {"candidates": len(doomed), "days": days, "dry_run": dry_run}

        if dry_run or not doomed:
            await self._notify_plain(
                "Wifi cleanup preview",
                f"Would forget {len(doomed)} offline devices not seen in {days}+ days. "
                "Nothing changed.",
                icon="mdi:broom",
            )
            return result

        for i in range(0, len(doomed), FORGET_BATCH_SIZE):
            chunk = doomed[i : i + FORGET_BATCH_SIZE]
            try:
                await self.client.forget(chunk)
            except UnifiError as err:
                _LOGGER.error("forget batch failed: %s", err)
            await asyncio.sleep(PRUNE_BATCH_PAUSE)

        removed = await self.store.async_bulk_remove_allowed(doomed)
        result["removed_from_allow_list"] = removed

        _LOGGER.warning("pruned %s clients, allow list -%s", len(doomed), removed)
        await self._notify_plain(
            "Wifi cleanup done",
            f"Forgot {len(doomed)} devices. Allow list shrank by {removed}.",
            icon="mdi:broom",
        )
        await self.async_request_refresh()
        return result
