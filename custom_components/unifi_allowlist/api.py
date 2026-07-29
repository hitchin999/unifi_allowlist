"""Thin async client for the UniFi Network controller.

Uses API-key auth against the classic /proxy/network/api paths, which is the
only place client block/unblock/forget is exposed. Verified against Network
10.4.x, where an API key is accepted without a session cookie or CSRF token.
"""

from __future__ import annotations

import logging
from typing import Any

import aiohttp

_LOGGER = logging.getLogger(__name__)

TIMEOUT = aiohttp.ClientTimeout(total=30)


class UnifiError(Exception):
    """Any failure talking to the controller."""


class UnifiAuthError(UnifiError):
    """The API key was rejected."""


class UnifiClient:
    """Talks to one UniFi site."""

    def __init__(
        self,
        session: aiohttp.ClientSession,
        host: str,
        site: str,
        api_key: str,
        verify_ssl: bool = False,
    ) -> None:
        self._session = session
        self._host = host.rstrip("/")
        self._site = site
        self._key = api_key
        self._ssl = verify_ssl if verify_ssl else False

    @property
    def site(self) -> str:
        return self._site

    def _headers(self) -> dict[str, str]:
        return {"X-API-KEY": self._key, "Accept": "application/json"}

    async def _request(self, method: str, path: str, payload: Any = None) -> Any:
        url = f"{self._host}{path}"
        try:
            async with self._session.request(
                method,
                url,
                headers=self._headers(),
                json=payload,
                ssl=self._ssl,
                timeout=TIMEOUT,
            ) as resp:
                if resp.status in (401, 403):
                    raise UnifiAuthError(f"{resp.status} from {path}")
                body = await resp.json(content_type=None)
        except UnifiError:
            raise
        except aiohttp.ClientError as err:
            raise UnifiError(f"connection failed: {err}") from err
        except Exception as err:  # noqa: BLE001
            raise UnifiError(f"request failed: {err}") from err

        if isinstance(body, dict):
            meta = body.get("meta") or {}
            if meta.get("rc") == "error":
                raise UnifiError(meta.get("msg", "unknown controller error"))
            return body.get("data", body)
        return body

    # --- reads -------------------------------------------------------------

    async def info(self) -> dict:
        """Version probe. Also the cheapest way to validate a key."""
        return await self._request(
            "GET", "/proxy/network/integration/v1/info"
        )

    async def sysinfo(self) -> dict:
        """Controller identity. Returns {} rather than raising - cosmetic only."""
        try:
            rows = await self._request(
                "GET", f"/proxy/network/api/s/{self._site}/stat/sysinfo"
            )
        except UnifiError:
            return {}
        if isinstance(rows, list):
            return rows[0] if rows else {}
        return rows if isinstance(rows, dict) else {}

    @property
    def host(self) -> str:
        return self._host

    async def sites(self) -> list[dict]:
        return await self._request("GET", "/proxy/network/api/self/sites")

    async def active_clients(self) -> list[dict]:
        return await self._request(
            "GET", f"/proxy/network/api/s/{self._site}/stat/sta"
        )

    async def known_clients(self) -> list[dict]:
        return await self._request(
            "GET", f"/proxy/network/api/s/{self._site}/rest/user"
        )

    async def devices(self) -> list[dict]:
        """APs, switches and gateways. The -basic variant is far cheaper."""
        return await self._request(
            "GET", f"/proxy/network/api/s/{self._site}/stat/device-basic"
        )

    async def wlans(self) -> list[dict]:
        return await self._request(
            "GET", f"/proxy/network/api/s/{self._site}/rest/wlanconf"
        )

    # --- writes ------------------------------------------------------------

    async def _stamgr(self, payload: dict) -> Any:
        return await self._request(
            "POST", f"/proxy/network/api/s/{self._site}/cmd/stamgr", payload
        )

    async def block(self, mac: str) -> None:
        await self._stamgr({"cmd": "block-sta", "mac": mac})

    async def unblock(self, mac: str) -> None:
        await self._stamgr({"cmd": "unblock-sta", "mac": mac})

    async def forget(self, macs: list[str]) -> None:
        """Permanently remove clients and their history. No undo."""
        if macs:
            await self._stamgr({"cmd": "forget-sta", "macs": macs})
