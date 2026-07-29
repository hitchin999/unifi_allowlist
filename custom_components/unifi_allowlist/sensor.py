"""Counters for the dashboard."""

from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

SENSORS = (
    ("pending", "Devices awaiting approval", "mdi:account-clock", None),
    ("unknown", "Unknown devices seen", "mdi:help-network", None),
    ("allowed", "Allowed devices", "mdi:check-network", EntityCategory.DIAGNOSTIC),
    ("denied", "Denied devices", "mdi:close-network", EntityCategory.DIAGNOSTIC),
    ("live", "Devices on wifi", "mdi:wifi", EntityCategory.DIAGNOSTIC),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]["coordinator"]
    async_add_entities(
        UnifiAllowlistSensor(coordinator, entry, key, name, icon, cat)
        for key, name, icon, cat in SENSORS
    )


class UnifiAllowlistSensor(CoordinatorEntity, SensorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator, entry, key, name, icon, category) -> None:
        super().__init__(coordinator)
        self._key = key
        self._attr_name = name
        self._attr_icon = icon
        self._attr_entity_category = category
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": entry.title,
            "manufacturer": "Ubiquiti",
            "model": "UniFi Allow List",
        }

    @property
    def native_value(self):
        return (self.coordinator.data or {}).get(self._key)

    @property
    def extra_state_attributes(self):
        if self._key != "pending":
            return None
        return {
            "devices": [
                {
                    "mac": mac,
                    "name": (info or {}).get("name", ""),
                    "ssid": (info or {}).get("ssid", ""),
                    "ap": (info or {}).get("ap", ""),
                    "ip": (info or {}).get("ip", ""),
                }
                for mac, info in self.coordinator.store.pending.items()
            ]
        }
