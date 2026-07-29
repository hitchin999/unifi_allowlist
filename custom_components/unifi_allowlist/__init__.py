"""UniFi Allow List - MAC allow list with approve/deny workflow."""

from __future__ import annotations

import logging
import os

import voluptuous as vol

from homeassistant.components import frontend
from homeassistant.components.http import HomeAssistantView
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.loader import async_get_integration

from .api import UnifiClient
from .const import (
    ACTION_PREFIX,
    ATTR_DAYS,
    ATTR_DRY_RUN,
    ATTR_MAC,
    ATTR_REBLOCK,
    ATTR_SITE,
    CONF_API_KEY,
    ATTR_NAME,
    ATTR_PATH,
    ATTR_TARGET,
    CONF_HOST,
    CONF_SITE,
    CONF_VERIFY_SSL,
    DOMAIN,
    EVENT_ACTION,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL_PATH,
    PLATFORMS,
    LIST_ALLOWED,
    LIST_DENIED,
    SERVICE_ALLOW,
    SERVICE_ALLOW_ONLINE,
    SERVICE_DENY,
    SERVICE_EXPORT_LIST,
    SERVICE_FORGET,
    SERVICE_FORGET_OFFLINE,
    SERVICE_SYNC,
    SERVICE_IMPORT_LIST,
    SERVICE_SET_NAME,
    SERVICE_PRUNE,
    SERVICE_RESEND,
    SERVICE_UNBLOCK_ALL,
    STATIC_URL,
)
from .coordinator import UnifiAllowlistCoordinator
from .store import DeviceStore

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

SITE_FIELD = {vol.Optional(ATTR_SITE): cv.string}

MAC_SCHEMA = vol.Schema({vol.Required(ATTR_MAC): cv.string, **SITE_FIELD})
SITE_SCHEMA = vol.Schema(SITE_FIELD)
SYNC_SCHEMA = vol.Schema(
    {
        vol.Optional(ATTR_DRY_RUN, default=True): cv.boolean,
        vol.Optional(ATTR_REBLOCK, default=True): cv.boolean,
        **SITE_FIELD,
    }
)
FILE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_PATH): cv.string,
        vol.Optional(ATTR_TARGET, default=LIST_ALLOWED): vol.In(
            [LIST_ALLOWED, LIST_DENIED]
        ),
        **SITE_FIELD,
    }
)
NAME_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_MAC): cv.string,
        **SITE_FIELD,
        vol.Optional(ATTR_NAME, default=""): cv.string,
    }
)
PRUNE_SCHEMA = vol.Schema(
    {
        vol.Optional(ATTR_DAYS, default=7): vol.Coerce(int),
        vol.Optional(ATTR_DRY_RUN, default=True): cv.boolean,
        **SITE_FIELD,
    }
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up one UniFi site."""
    session = async_get_clientsession(
        hass, verify_ssl=entry.data.get(CONF_VERIFY_SSL, False)
    )
    client = UnifiClient(
        session,
        entry.data[CONF_HOST],
        entry.data[CONF_SITE],
        entry.data[CONF_API_KEY],
        entry.data.get(CONF_VERIFY_SSL, False),
    )

    store = DeviceStore(hass, entry.entry_id)
    await store.async_load()

    coordinator = UnifiAllowlistCoordinator(hass, client, store, entry)
    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {
        "client": client,
        "store": store,
        "coordinator": coordinator,
    }

    await _async_register_frontend(hass)
    _async_register_services(hass)
    _async_register_action_listener(hass, entry)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))

    return True


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    data = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    if data:
        data["coordinator"].apply_options()
        await data["coordinator"].async_request_refresh()


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        if not hass.data[DOMAIN]:
            if hass.data.pop(f"{DOMAIN}_panel", False):
                frontend.async_remove_panel(hass, PANEL_URL_PATH)
            hass.data.pop(DOMAIN, None)
    return unloaded


async def _async_register_frontend(hass: HomeAssistant) -> None:
    """Serve the panel JS and put an item in the sidebar. Idempotent."""
    if hass.data.get(f"{DOMAIN}_panel"):
        return

    # Static paths and views can only be registered once per Home Assistant run
    # — unlike the panel, they are not removed on unload.
    if not hass.data.get(f"{DOMAIN}_static"):
        static_dir = os.path.join(os.path.dirname(__file__), "panel")

        try:
            from homeassistant.components.http import StaticPathConfig

            await hass.http.async_register_static_paths(
                [StaticPathConfig(STATIC_URL, static_dir, False)]
            )
        except ImportError:  # Home Assistant older than 2024.7
            hass.http.register_static_path(STATIC_URL, static_dir, False)

        hass.http.register_view(UnifiAllowlistDataView(hass))
        hass.data[f"{DOMAIN}_static"] = True

    # Cache-bust the panel with the integration's own version. Browsers and the
    # companion app cache this module hard, so a hand-maintained query string
    # drifts and users keep running an old panel after every update.
    try:
        integration = await async_get_integration(hass, DOMAIN)
        version = str(integration.version) if integration.version else "dev"
    except Exception:  # noqa: BLE001
        version = "dev"

    try:
        frontend.async_register_built_in_panel(
            hass,
            component_name="custom",
            sidebar_title=PANEL_TITLE,
            sidebar_icon=PANEL_ICON,
            frontend_url_path=PANEL_URL_PATH,
            require_admin=True,
            config={
                "_panel_custom": {
                    "name": "unifi-allowlist-panel",
                    "module_url": f"{STATIC_URL}/unifi-allowlist-panel.js?v={version}",
                    "embed_iframe": False,
                    "trust_external": False,
                }
            },
        )
    except ValueError:
        # Something else already owns this sidebar path — most likely a stale
        # copy of this integration under its previous domain. Keep setting up
        # rather than failing the whole entry, and leave that panel alone on
        # unload since it isn't ours to remove.
        hass.data[f"{DOMAIN}_panel"] = False
        _LOGGER.warning(
            "sidebar path /%s is already registered by another integration; "
            "skipping panel registration. Remove the older copy and restart.",
            PANEL_URL_PATH,
        )
    else:
        hass.data[f"{DOMAIN}_panel"] = True
        _LOGGER.info(
            "panel registered at /%s serving asset version %s", PANEL_URL_PATH, version
        )


def _first_coordinator(hass: HomeAssistant) -> UnifiAllowlistCoordinator | None:
    for data in (hass.data.get(DOMAIN) or {}).values():
        return data["coordinator"]
    return None


def _all_coordinators(hass: HomeAssistant) -> list[UnifiAllowlistCoordinator]:
    return [d["coordinator"] for d in (hass.data.get(DOMAIN) or {}).values()]


def _coordinator_by_id(
    hass: HomeAssistant, wanted: str
) -> UnifiAllowlistCoordinator | None:
    """Match a site by entry id, UniFi site name, or entry title."""
    wanted = (wanted or "").strip()
    if not wanted:
        return None
    folded = wanted.casefold()
    for coord in _all_coordinators(hass):
        if wanted == coord.entry_id:
            return coord
    for coord in _all_coordinators(hass):
        if folded in (coord.site.casefold(), coord.site_title.casefold()):
            return coord
    return None


def _target(hass: HomeAssistant, call) -> UnifiAllowlistCoordinator | None:
    """Which site a service call is about.

    One site configured: that one, whether or not it was named. Several: the
    call has to say which. Guessing here would silently write a decision to
    the wrong controller, so an unmatched or missing name raises instead.
    """
    coords = _all_coordinators(hass)
    if not coords:
        return None

    wanted = (call.data or {}).get(ATTR_SITE)
    if wanted:
        found = _coordinator_by_id(hass, wanted)
        if found:
            return found
        known = ", ".join(f"{c.site} ({c.site_title})" for c in coords)
        raise ServiceValidationError(
            f"No UniFi Allow List site matches '{wanted}'. Configured: {known}"
        )

    if len(coords) == 1:
        return coords[0]

    known = ", ".join(f"{c.site} ({c.site_title})" for c in coords)
    raise ServiceValidationError(
        "More than one UniFi Allow List site is set up, so this call needs a "
        f"'site' value. Configured: {known}"
    )


def _async_register_services(hass: HomeAssistant) -> None:
    if hass.services.has_service(DOMAIN, SERVICE_ALLOW):
        return

    async def _allow(call):
        if coord := _target(hass, call):
            await coord.async_allow(call.data[ATTR_MAC])

    async def _deny(call):
        if coord := _target(hass, call):
            await coord.async_deny(call.data[ATTR_MAC])

    async def _forget(call):
        if coord := _target(hass, call):
            await coord.async_forget_mac(call.data[ATTR_MAC])

    async def _resend(call):
        if coord := _target(hass, call):
            await coord.async_resend_pending()

    async def _unblock_all(call):
        if coord := _target(hass, call):
            await coord.async_unblock_all()

    async def _prune(call):
        if coord := _target(hass, call):
            await coord.async_prune(
                days=call.data.get(ATTR_DAYS, 7),
                dry_run=call.data.get(ATTR_DRY_RUN, True),
            )

    hass.services.async_register(DOMAIN, SERVICE_ALLOW, _allow, schema=MAC_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_DENY, _deny, schema=MAC_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_FORGET, _forget, schema=MAC_SCHEMA)
    async def _set_name(call):
        if coord := _target(hass, call):
            await coord.async_set_name(call.data[ATTR_MAC], call.data.get(ATTR_NAME, ""))

    async def _allow_online(call):
        if coord := _target(hass, call):
            await coord.async_allow_online_unknown()

    async def _sync(call):
        if coord := _target(hass, call):
            await coord.async_sync_from_unifi(
                dry_run=call.data.get(ATTR_DRY_RUN, True),
                reblock=call.data.get(ATTR_REBLOCK, True),
            )

    async def _forget_offline(call):
        if coord := _target(hass, call):
            await coord.async_forget_offline_pending()

    hass.services.async_register(DOMAIN, SERVICE_RESEND, _resend, schema=SITE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_ALLOW_ONLINE, _allow_online, schema=SITE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_FORGET_OFFLINE, _forget_offline, schema=SITE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_SYNC, _sync, schema=SYNC_SCHEMA)
    hass.services.async_register(
        DOMAIN, SERVICE_SET_NAME, _set_name, schema=NAME_SCHEMA
    )
    hass.services.async_register(DOMAIN, SERVICE_UNBLOCK_ALL, _unblock_all, schema=SITE_SCHEMA)
    async def _import_list(call):
        if coord := _target(hass, call):
            await coord.store.async_import_file(
                hass, call.data[ATTR_PATH], call.data[ATTR_TARGET]
            )
            await coord.async_request_refresh()

    async def _export_list(call):
        if coord := _target(hass, call):
            await coord.store.async_export_file(
                hass, call.data[ATTR_PATH], call.data[ATTR_TARGET]
            )

    hass.services.async_register(DOMAIN, SERVICE_PRUNE, _prune, schema=PRUNE_SCHEMA)
    hass.services.async_register(
        DOMAIN, SERVICE_IMPORT_LIST, _import_list, schema=FILE_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_EXPORT_LIST, _export_list, schema=FILE_SCHEMA
    )


def _async_register_action_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Handle Allow / Keep blocked taps from the phone notification."""

    async def _handle(event) -> None:
        action = str(event.data.get("action", ""))
        if not action.upper().startswith(ACTION_PREFIX):
            return

        rest = action[len(ACTION_PREFIX) :]
        kind, _, tail = rest.partition("_")
        if not tail:
            return

        # Since 1.3.0 the action carries the entry it came from, so a tap
        # lands on the site that asked. Older notifications sent just the MAC
        # and are answered by the first site, as they used to be.
        target_id, _, mac = tail.partition("_")
        if not mac:
            mac = target_id
            coord = _first_coordinator(hass)
            # Every entry hears the event; only one should act on a legacy id.
            if not coord or coord.entry_id != entry.entry_id:
                return
        else:
            if target_id != entry.entry_id:
                return
            coord = (hass.data.get(DOMAIN) or {}).get(entry.entry_id, {}).get(
                "coordinator"
            )

        if not coord:
            return

        if kind.upper() == "OK":
            await coord.async_allow(mac)
        else:
            await coord.async_deny(mac)

    entry.async_on_unload(hass.bus.async_listen(EVENT_ACTION, _handle))


class UnifiAllowlistDataView(HomeAssistantView):
    """Everything the panel needs, in one call."""

    url = "/api/unifi_allowlist/data"
    name = "api:unifi_allowlist:data"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request):
        coords = _all_coordinators(self.hass)
        if not coords:
            return self.json({"error": "not set up"}, status_code=404)

        wanted = request.query.get("entry_id")
        coord = next((c for c in coords if c.entry_id == wanted), None) or coords[0]

        sites = [
            {
                "entry_id": c.entry_id,
                "site": c.site,
                "title": c.site_title,
                "label": c.site_label,
                "controller": c.controller_label,
                "pending": len(c.store.pending),
            }
            for c in coords
        ]

        store = coord.store
        live_macs = {r["mac"] for r in coord.online if r["live"]}
        live_ips = {r["mac"]: r["ip"] for r in coord.online if r.get("ip")}
        live_names = {
            r["mac"]: r["hostname"] for r in coord.online if r.get("hostname")
        }
        live_aps = {r["mac"]: r["ap"] for r in coord.online if r.get("ap")}

        return self.json(
            {
                "online": coord.online,
                "pending": [
                    {
                        "mac": mac,
                        "name": store.name_for(mac) or live_names.get(mac, ""),
                        "label": store.label_for(mac),
                        "hostname": (info or {}).get("name", "")
                        or live_names.get(mac, ""),
                        "ip": (info or {}).get("ip") or live_ips.get(mac, ""),
                        "ap": (info or {}).get("ap") or live_aps.get(mac, ""),
                        "band": (info or {}).get("band", ""),
                        "ssid": (info or {}).get("ssid", ""),
                        "first_seen": (info or {}).get("first_seen"),
                        "live": mac in live_macs,
                    }
                    for mac, info in store.pending.items()
                ],
                "allowed": [
                    {
                        "mac": mac,
                        "name": store.name_for(mac) or live_names.get(mac, ""),
                        "label": store.label_for(mac),
                        "ip": live_ips.get(mac, ""),
                        "ap": live_aps.get(mac, ""),
                    }
                    for mac, info in store.allowed.items()
                ],
                "denied": [
                    {
                        "mac": mac,
                        "name": store.name_for(mac) or live_names.get(mac, ""),
                        "label": store.label_for(mac),
                        "ip": live_ips.get(mac, ""),
                        "ap": live_aps.get(mac, ""),
                    }
                    for mac, info in store.denied.items()
                ],
                "entry_id": coord.entry_id,
                "site": coord.site,
                "title": coord.site_title,
                "label": coord.site_label,
                "controller": coord.controller_label,
                "sites": sites,
                "enforcing": coord.enforcing,
                "ssids": sorted(n for n in coord.wlan_names.values() if n),
                "aps": sorted(set(coord.ap_names.values())),
                "scoped_ssids": coord.enforced_ssids,
                "breaker": bool((coord.data or {}).get("breaker")),
                "error": coord.last_error,
            }
        )
