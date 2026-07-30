"""Persistence for the three device lists.

Lives in .storage rather than loose files in /config, so it survives config
changes and is backed up with the rest of Home Assistant. The one-time import
picks up the JSON files from the earlier pyscript version.
"""

from __future__ import annotations

import json
import logging
import time

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import (
    DROP_GUARD_FLOOR,
    DROP_GUARD_RATIO,
    STORAGE_KEY,
    STORAGE_VERSION,
)

_LOGGER = logging.getLogger(__name__)


def _norm(mac: str) -> str:
    return str(mac).strip().lower()


class DeviceStore:
    """Allowed / denied / pending, keyed by MAC."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store = Store(hass, STORAGE_VERSION, f"{STORAGE_KEY}.{entry_id}")
        # Deliberately a separate file: if the device list is lost or rolled
        # back, the mark has to survive to prove the loss happened.
        self._mark_store = Store(
            hass, STORAGE_VERSION, f"{STORAGE_KEY}.mark.{entry_id}"
        )
        self.high_water = 0
        self.allowed: dict[str, dict] = {}
        self.denied: dict[str, dict] = {}
        self.pending: dict[str, dict] = {}
        self.labels: dict[str, str] = {}
        self._loaded = False

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self.allowed = {_norm(k): v for k, v in (data.get("allowed") or {}).items()}
        self.denied = {_norm(k): v for k, v in (data.get("denied") or {}).items()}
        self.pending = {_norm(k): v for k, v in (data.get("pending") or {}).items()}
        self.labels = {
            _norm(k): v for k, v in (data.get("labels") or {}).items() if v
        }
        mark = await self._mark_store.async_load() or {}
        self.high_water = int(mark.get("high_water") or 0)
        if self.high_water < len(self.allowed):
            # First run, or the list has grown since we last looked.
            self.high_water = len(self.allowed)
            await self._save_mark()

        self._loaded = True

    async def async_save(self) -> None:
        await self._store.async_save(
            {
                "allowed": self.allowed,
                "denied": self.denied,
                "pending": self.pending,
                "labels": self.labels,
            }
        )

    async def _save_mark(self) -> None:
        await self._mark_store.async_save({"high_water": self.high_water})

    async def async_lower_mark(self) -> None:
        """We authored a removal, so the smaller list is the new normal.

        Only called from methods that deliberately take entries out of the
        allow list. A save from anywhere else must never move the mark, or a
        lost list would erase the very evidence the guard depends on.
        """
        if len(self.allowed) < self.high_water:
            self.high_water = len(self.allowed)
            await self._save_mark()

    async def async_raise_mark(self) -> None:
        """Track growth. Called after anything that can add to the allow list."""
        if len(self.allowed) > self.high_water:
            self.high_water = len(self.allowed)
            await self._save_mark()

    async def async_accept_size(self) -> int:
        """Take the current size as the new normal, clearing the drop guard."""
        self.high_water = len(self.allowed)
        await self._save_mark()
        return self.high_water

    @property
    def dropped(self) -> bool:
        """True when the allow list shrank without us authoring the removals.

        Every legitimate removal lowers the mark as it goes, so a gap between
        the mark and the list can only mean the stored list came back smaller
        than we left it.
        """
        if self.high_water < DROP_GUARD_FLOOR:
            return False
        return len(self.allowed) < self.high_water * DROP_GUARD_RATIO

    # --- queries -----------------------------------------------------------

    def is_allowed(self, mac: str) -> bool:
        return _norm(mac) in self.allowed

    def is_denied(self, mac: str) -> bool:
        return _norm(mac) in self.denied

    def is_pending(self, mac: str) -> bool:
        return _norm(mac) in self.pending

    def label_for(self, mac: str) -> str:
        """The name you typed in, if you typed one."""
        return self.labels.get(_norm(mac), "")

    async def async_set_label(self, mac: str, label: str) -> None:
        mac = _norm(mac)
        label = (label or "").strip()
        if label:
            self.labels[mac] = label
        else:
            self.labels.pop(mac, None)
        await self.async_save()

    def name_for(self, mac: str) -> str:
        mac = _norm(mac)
        if label := self.labels.get(mac):
            return label
        for table in (self.allowed, self.denied, self.pending):
            rec = table.get(mac)
            if rec and rec.get("name"):
                return rec["name"]
        return ""

    # --- mutations ---------------------------------------------------------

    async def async_allow(self, mac: str, name: str = "", ssid: str = "") -> None:
        mac = _norm(mac)
        rec = self.pending.pop(mac, None) or self.denied.pop(mac, None) or {}
        self.allowed[mac] = {
            "name": name or rec.get("name", ""),
            "ssid": ssid or rec.get("ssid", ""),
            "added": int(time.time()),
        }
        await self.async_save()
        await self.async_raise_mark()

    async def async_deny(self, mac: str, name: str = "", ssid: str = "") -> None:
        mac = _norm(mac)
        rec = self.pending.pop(mac, None) or self.allowed.pop(mac, None) or {}
        self.denied[mac] = {
            "name": name or rec.get("name", ""),
            "ssid": ssid or rec.get("ssid", ""),
            "added": int(time.time()),
        }
        await self.async_save()
        await self.async_lower_mark()

    async def async_forget(self, mac: str) -> None:
        """Drop a MAC from every list, as if it had never been seen."""
        mac = _norm(mac)
        self.allowed.pop(mac, None)
        self.denied.pop(mac, None)
        self.pending.pop(mac, None)
        await self.async_save()
        await self.async_lower_mark()

    async def async_forget_many(self, macs: list[str]) -> int:
        """Drop several MACs from every list, writing storage only once."""
        gone = 0
        for mac in macs:
            mac = _norm(mac)
            hit = False
            for bucket in (self.allowed, self.denied, self.pending):
                hit = bucket.pop(mac, None) is not None or hit
            gone += 1 if hit else 0
        if gone:
            await self.async_save()
            await self.async_lower_mark()
        return gone

    async def async_add_pending(
        self,
        mac: str,
        name: str,
        ssid: str,
        ap: str = "",
        ip: str = "",
        band: str = "",
    ) -> None:
        """Snapshot where and when the device turned up.

        The device is usually gone by the time you look at the queue, so this
        has to be captured now - it cannot be looked up later.
        """
        mac = _norm(mac)
        if mac in self.pending:
            return
        self.pending[mac] = {
            "name": name,
            "ssid": ssid,
            "ap": ap,
            "ip": ip,
            "band": band,
            "first_seen": int(time.time()),
        }
        await self.async_save()

    async def async_allow_many(self, macs: list[str]) -> int:
        """Approve several at once, moving each out of pending or denied."""
        moved = 0
        now = int(time.time())
        for mac in macs:
            mac = _norm(mac)
            if not mac or mac in self.allowed:
                continue
            rec = self.pending.pop(mac, None) or self.denied.pop(mac, None) or {}
            self.allowed[mac] = {
                "name": rec.get("name", ""),
                "ssid": rec.get("ssid", ""),
                "added": now,
            }
            moved += 1
        if moved:
            await self.async_save()
            await self.async_raise_mark()
        return moved

    async def async_deny_many(self, macs: list[str], source: str = "") -> int:
        """Deny several at once, moving each out of pending or allowed."""
        moved = 0
        now = int(time.time())
        for mac in macs:
            mac = _norm(mac)
            if not mac or mac in self.denied:
                continue
            rec = self.pending.pop(mac, None) or self.allowed.pop(mac, None) or {}
            self.denied[mac] = {
                "name": rec.get("name", ""),
                "ssid": rec.get("ssid", ""),
                "added": now,
                "source": source or "unifi",
            }
            moved += 1
        if moved:
            await self.async_save()
            await self.async_lower_mark()
        return moved

    async def async_bulk_allow(self, macs: list[str]) -> int:
        added = 0
        now = int(time.time())
        for mac in macs:
            mac = _norm(mac)
            if mac and mac not in self.allowed:
                self.allowed[mac] = {"name": "", "ssid": "", "added": now}
                added += 1
        if added:
            await self.async_save()
            await self.async_raise_mark()
        return added

    async def async_bulk_remove_allowed(self, macs: list[str]) -> int:
        removed = 0
        for mac in macs:
            if self.allowed.pop(_norm(mac), None) is not None:
                removed += 1
        if removed:
            await self.async_save()
            await self.async_lower_mark()
        return removed

    # --- bulk file IO ------------------------------------------------------

    @staticmethod
    def parse_mac_payload(raw: str) -> list[str]:
        """Accept a JSON array, a JSON object keyed by MAC, or plain lines/CSV."""
        raw = raw.strip()
        if not raw:
            return []

        if raw[0] in "[{":
            try:
                data = json.loads(raw)
            except ValueError:
                data = None
            if isinstance(data, list):
                return [_norm(m) for m in data if str(m).strip()]
            if isinstance(data, dict):
                return [_norm(m) for m in data if str(m).strip()]

        out: list[str] = []
        for line in raw.replace(",", "\n").splitlines():
            token = line.strip().strip('"').strip("'")
            if token and not token.startswith(("#", "//", "[", "]", "{", "}")):
                out.append(_norm(token))
        return out

    async def async_import_file(
        self, hass: HomeAssistant, path: str, target: str
    ) -> int:
        """Seed a list from any file of MAC addresses."""

        def _read() -> str:
            with open(path, "r", encoding="utf-8") as handle:
                return handle.read()

        try:
            raw = await hass.async_add_executor_job(_read)
        except FileNotFoundError:
            _LOGGER.error("import: no such file %s", path)
            return 0
        except Exception as err:  # noqa: BLE001
            _LOGGER.error("import: could not read %s: %s", path, err)
            return 0

        macs = self.parse_mac_payload(raw)
        table = self.allowed if target == "allowed" else self.denied
        now = int(time.time())
        added = 0

        for mac in macs:
            if mac and mac not in table:
                table[mac] = {"name": "", "ssid": "", "added": now}
                added += 1

        if added:
            await self.async_save()
            await self.async_raise_mark()
        _LOGGER.info("import: %s of %s MACs added to %s", added, len(macs), target)
        return added

    async def async_export_file(
        self, hass: HomeAssistant, path: str, target: str
    ) -> int:
        """Write a list out as a JSON array, for backup or moving between sites."""
        table = self.allowed if target == "allowed" else self.denied
        payload = json.dumps(sorted(table.keys()), indent=2)

        def _write() -> None:
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(payload)

        try:
            await hass.async_add_executor_job(_write)
        except Exception as err:  # noqa: BLE001
            _LOGGER.error("export: could not write %s: %s", path, err)
            return 0

        _LOGGER.info("export: wrote %s MACs to %s", len(table), path)
        return len(table)
