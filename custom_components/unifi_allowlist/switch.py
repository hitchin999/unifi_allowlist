"""Master enforcement toggle."""

from __future__ import annotations

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]["coordinator"]
    async_add_entities([EnforcementSwitch(coordinator, entry)])


class EnforcementSwitch(CoordinatorEntity, SwitchEntity):
    """Off means detect and notify but never block. Survives nothing - defaults on."""

    _attr_has_entity_name = True
    _attr_name = "Enforcement"
    _attr_icon = "mdi:shield-lock"

    def __init__(self, coordinator, entry) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_enforcing"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": entry.title,
            "manufacturer": "Ubiquiti",
            "model": "UniFi Allow List",
        }

    @property
    def is_on(self) -> bool:
        return self.coordinator.enforcing

    async def async_turn_on(self, **kwargs) -> None:
        self.coordinator.enforcing = True
        self.async_write_ha_state()
        await self.coordinator.async_request_refresh()

    async def async_turn_off(self, **kwargs) -> None:
        self.coordinator.enforcing = False
        self.async_write_ha_state()
