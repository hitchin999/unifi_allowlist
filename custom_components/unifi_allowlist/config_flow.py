"""Config and options flow."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    BooleanSelector,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .api import UnifiAuthError, UnifiClient, UnifiError
from .const import (
    CONF_API_KEY,
    CONF_BLOCK_FIRST,
    CONF_CHANNEL,
    CONF_GROUP,
    CONF_HOST,
    CONF_LOOKBACK,
    CONF_MIN_LIST_GUARD,
    CONF_MAX_PER_RUN,
    CONF_NOTIFY,
    CONF_NOTIFY_GAP,
    CONF_SCAN_INTERVAL,
    CONF_SITE,
    CONF_SSIDS,
    CONF_VERIFY_SSL,
    DEFAULT_BLOCK_FIRST,
    DEFAULT_CHANNEL,
    DEFAULT_GROUP,
    DEFAULT_LOOKBACK,
    DEFAULT_MAX_PER_RUN,
    DEFAULT_MIN_LIST_GUARD,
    DEFAULT_NOTIFY_GAP,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)


def _notify_services(hass) -> list[str]:
    services = hass.services.async_services().get("notify", {})
    return sorted(s for s in services if s not in ("persistent_notification",))


class UnifiAllowlistConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Set up a UniFi site from the UI."""

    VERSION = 1

    def __init__(self) -> None:
        self._creds: dict[str, Any] = {}
        self._sites: list[dict] = []

    async def async_step_user(self, user_input: dict | None = None):
        errors: dict[str, str] = {}

        if user_input is not None:
            host = user_input[CONF_HOST].strip().rstrip("/")
            if not host.startswith("http"):
                host = f"https://{host}"

            session = async_get_clientsession(
                self.hass, verify_ssl=user_input.get(CONF_VERIFY_SSL, False)
            )
            client = UnifiClient(
                session,
                host,
                "default",
                user_input[CONF_API_KEY],
                user_input.get(CONF_VERIFY_SSL, False),
            )

            try:
                await client.info()
                self._sites = await client.sites()
            except UnifiAuthError:
                errors["base"] = "invalid_auth"
            except UnifiError:
                errors["base"] = "cannot_connect"
            else:
                self._creds = {
                    CONF_HOST: host,
                    CONF_API_KEY: user_input[CONF_API_KEY],
                    CONF_VERIFY_SSL: user_input.get(CONF_VERIFY_SSL, False),
                }
                return await self.async_step_site()

        schema = vol.Schema(
            {
                vol.Required(CONF_HOST, default=""): TextSelector(
                    TextSelectorConfig(type=TextSelectorType.URL)
                ),
                vol.Required(CONF_API_KEY): TextSelector(
                    TextSelectorConfig(type=TextSelectorType.PASSWORD)
                ),
                vol.Optional(CONF_VERIFY_SSL, default=False): BooleanSelector(),
            }
        )
        return self.async_show_form(
            step_id="user", data_schema=schema, errors=errors
        )

    async def async_step_site(self, user_input: dict | None = None):
        if user_input is not None:
            site = user_input[CONF_SITE]
            await self.async_set_unique_id(f"{self._creds[CONF_HOST]}::{site}")
            self._abort_if_unique_id_configured()

            label = next(
                (s.get("desc") or site for s in self._sites if s.get("name") == site),
                site,
            )
            data = {**self._creds, CONF_SITE: site}
            options = {CONF_NOTIFY: user_input.get(CONF_NOTIFY)}
            return self.async_create_entry(title=f"Wifi Access ({label})", data=data, options=options)

        site_options = sorted(
            (
                {
                    "value": s["name"],
                    "label": f"{s.get('desc') or s['name']} ({s['name']})",
                }
                for s in self._sites
                if s.get("name")
            ),
            key=lambda o: o["label"].casefold(),
        ) or [{"value": "default", "label": "default"}]

        notify_options = _notify_services(self.hass)

        schema = vol.Schema(
            {
                vol.Required(CONF_SITE): SelectSelector(
                    SelectSelectorConfig(
                        options=site_options, mode=SelectSelectorMode.DROPDOWN
                    )
                ),
                vol.Optional(CONF_NOTIFY): SelectSelector(
                    SelectSelectorConfig(
                        options=notify_options,
                        mode=SelectSelectorMode.DROPDOWN,
                        custom_value=True,
                    )
                ),
            }
        )
        return self.async_show_form(step_id="site", data_schema=schema)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return UnifiAllowlistOptionsFlow()


class UnifiAllowlistOptionsFlow(config_entries.OptionsFlow):
    """Tune behaviour without re-adding the integration."""

    async def async_step_init(self, user_input: dict | None = None):
        entry = self.config_entry

        if user_input is not None:
            merged = {**entry.options, **user_input}
            merged[CONF_SCAN_INTERVAL] = int(merged[CONF_SCAN_INTERVAL])
            merged[CONF_LOOKBACK] = int(merged[CONF_LOOKBACK])
            merged[CONF_MAX_PER_RUN] = int(merged[CONF_MAX_PER_RUN])
            merged[CONF_MIN_LIST_GUARD] = int(merged[CONF_MIN_LIST_GUARD])
            merged[CONF_NOTIFY_GAP] = float(merged[CONF_NOTIFY_GAP])
            return self.async_create_entry(title="", data=merged)

        ssid_choices: list[str] = []
        data = self.hass.data.get(DOMAIN, {}).get(entry.entry_id)
        if data:
            ssid_choices = sorted(
                n for n in data["coordinator"].wlan_names.values() if n
            )

        current = entry.options

        schema = vol.Schema(
            {
                vol.Optional(
                    CONF_NOTIFY, default=current.get(CONF_NOTIFY, "")
                ): SelectSelector(
                    SelectSelectorConfig(
                        options=_notify_services(self.hass),
                        mode=SelectSelectorMode.DROPDOWN,
                        custom_value=True,
                    )
                ),
                vol.Optional(
                    CONF_SSIDS, default=current.get(CONF_SSIDS, [])
                ): SelectSelector(
                    SelectSelectorConfig(
                        options=ssid_choices,
                        multiple=True,
                        mode=SelectSelectorMode.LIST,
                        custom_value=True,
                    )
                ),
                vol.Optional(
                    CONF_BLOCK_FIRST,
                    default=current.get(CONF_BLOCK_FIRST, DEFAULT_BLOCK_FIRST),
                ): BooleanSelector(),
                vol.Optional(
                    CONF_SCAN_INTERVAL,
                    default=current.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
                ): NumberSelector(
                    NumberSelectorConfig(
                        min=10, max=600, step=5, mode=NumberSelectorMode.BOX,
                        unit_of_measurement="s",
                    )
                ),
                vol.Optional(
                    CONF_LOOKBACK, default=current.get(CONF_LOOKBACK, DEFAULT_LOOKBACK)
                ): NumberSelector(
                    NumberSelectorConfig(
                        min=0, max=3600, step=30, mode=NumberSelectorMode.BOX,
                        unit_of_measurement="s",
                    )
                ),
                vol.Optional(
                    CONF_MAX_PER_RUN,
                    default=current.get(CONF_MAX_PER_RUN, DEFAULT_MAX_PER_RUN),
                ): NumberSelector(
                    NumberSelectorConfig(
                        min=1, max=100, step=1, mode=NumberSelectorMode.BOX
                    )
                ),
                vol.Optional(
                    CONF_MIN_LIST_GUARD,
                    default=current.get(CONF_MIN_LIST_GUARD, DEFAULT_MIN_LIST_GUARD),
                ): NumberSelector(
                    NumberSelectorConfig(
                        min=0, max=10000, step=1, mode=NumberSelectorMode.BOX
                    )
                ),
                vol.Optional(
                    CONF_NOTIFY_GAP,
                    default=current.get(CONF_NOTIFY_GAP, DEFAULT_NOTIFY_GAP),
                ): NumberSelector(
                    NumberSelectorConfig(
                        min=0, max=10, step=0.5, mode=NumberSelectorMode.BOX,
                        unit_of_measurement="s",
                    )
                ),
                vol.Optional(
                    CONF_CHANNEL, default=current.get(CONF_CHANNEL, DEFAULT_CHANNEL)
                ): TextSelector(),
                vol.Optional(
                    CONF_GROUP, default=current.get(CONF_GROUP, DEFAULT_GROUP)
                ): TextSelector(),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
