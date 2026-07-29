"""One-tap actions."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]["coordinator"]
    async_add_entities(
        [
            UnblockAllButton(coordinator, entry),
            ResendPendingButton(coordinator, entry),
        ]
    )


class _Base(CoordinatorEntity, ButtonEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator, entry, key, name, icon, category=None) -> None:
        super().__init__(coordinator)
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


class UnblockAllButton(_Base):
    """Panic button. Clears every block on the controller."""

    def __init__(self, coordinator, entry) -> None:
        super().__init__(
            coordinator, entry, "unblock_all", "Unblock everything",
            "mdi:lock-open-variant",
        )

    async def async_press(self) -> None:
        await self.coordinator.async_unblock_all()


class ResendPendingButton(_Base):
    def __init__(self, coordinator, entry) -> None:
        super().__init__(
            coordinator, entry, "resend", "Resend pending prompts", "mdi:bell-ring",
            EntityCategory.DIAGNOSTIC,
        )

    async def async_press(self) -> None:
        await self.coordinator.async_resend_pending()
