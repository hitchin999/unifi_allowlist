"""Act on SMS replies to the waiting-device prompts.

Prompts go out as ``#475 Some Phone ... Reply: 475 allow`` and the answer comes
back through the Telebroad integration's ``telebroad_sms_received`` event. The
id belongs to one MAC for good, so unlike a menu position it cannot go stale
while the queue moves underneath it.

Only messages that match the id-and-verb shape are touched, so ordinary SMS
Commander keywords fall through to it untouched.
"""

from __future__ import annotations

import logging
import re

from homeassistant.core import HomeAssistant

from .const import DOMAIN, SMS_ENABLED, SMS_EVENT, SMS_ID_MAX, SMS_ID_MIN

_LOGGER = logging.getLogger(__name__)

ALLOW_WORDS = {"allow", "ok", "yes", "y", "approve", "a"}
BLOCK_WORDS = {"keep", "no", "n", "block", "deny", "d", "reject"}

_VERBS = "|".join(sorted(ALLOW_WORDS | BLOCK_WORDS, key=len, reverse=True))
# "475 allow", "allow 475", either order, optional trailing PIN.
_ID = r"(?<!\d)\d{3}(?!\d)"
_PAIR = re.compile(
    rf"(?:(?P<id1>{_ID})\s*(?P<v1>{_VERBS})|(?P<v2>{_VERBS})\s*(?P<id2>{_ID}))"
    # A trailing number is only a PIN if no verb follows it, or "475 allow 476
    # keep" would eat 476 as the PIN and drop the second decision entirely.
    rf"(?:\s+(?P<pin>(?<!\d)\d{{2,8}}(?!\d))(?!\s*(?:{_VERBS})))?",
    re.IGNORECASE,
)


def parse(message: str) -> list[tuple[str, str, str]]:
    """Pull every (id, verb, pin) out of a message.

    Several decisions in one text are fine - "475 allow 476 keep" answers two
    prompts at once, which is the whole point of handing out ids.
    """
    out: list[tuple[str, str, str]] = []
    for m in _PAIR.finditer(message or ""):
        sms_id = m.group("id1") or m.group("id2") or ""
        verb = (m.group("v1") or m.group("v2") or "").lower()
        if not sms_id or not verb:
            continue
        if not SMS_ID_MIN <= int(sms_id) <= SMS_ID_MAX:
            continue
        out.append((sms_id, verb, m.group("pin") or ""))
    return out


def _coordinators(hass: HomeAssistant) -> list:
    return [d["coordinator"] for d in (hass.data.get(DOMAIN) or {}).values()]


def _contact_name(hass: HomeAssistant, number: str) -> str:
    """Ask the SMS integration who this number belongs to, if it knows."""
    digits = "".join(c for c in str(number or "") if c.isdigit())
    for data in (hass.data.get("telebroad_sms") or {}).values():
        store = None
        if isinstance(data, dict):
            store = data.get("store") or data.get("commander_store")
        contacts = getattr(store, "contacts", None)
        if not contacts:
            continue
        for c in contacts:
            cn = "".join(ch for ch in str(c.get("number", "")) if ch.isdigit())
            if cn and cn == digits and c.get("name"):
                return str(c["name"])
    return ""


async def async_handle_event(hass: HomeAssistant, event) -> None:
    message = str(event.data.get("message") or "")
    sender = str(event.data.get("fromNumber") or "")
    decisions = parse(message)
    if not decisions or not sender:
        return

    # Only sites that both use SMS and trust this sender. Anything else stays
    # silent rather than confirming that the number does something.
    sites = [c for c in _coordinators(hass) if c.sms_authorised(sender)]
    if not sites:
        _LOGGER.debug("ignoring SMS decision from unauthorised %s", sender)
        return

    who = _contact_name(hass, sender) or sender
    replies: list[str] = []

    for sms_id, verb, pin in decisions:
        target = None
        for coord in sites:
            if coord.store.mac_for_id(sms_id):
                target = coord
                break
        if target is None:
            replies.append(f"{sms_id}: unknown, it may have expired")
            continue

        needed = target.sms_pin
        if needed and pin != needed:
            replies.append(f"{sms_id}: PIN required")
            _LOGGER.warning("SMS decision for %s rejected: bad PIN", sms_id)
            continue

        mac, done = target.store.mac_for_id(sms_id)
        label = target.store.name_for(mac) or target.store.label_for(mac) or mac
        if done:
            replies.append(f"{sms_id}: already handled")
            continue

        if verb in ALLOW_WORDS:
            await target.async_allow(mac, actor=f"SMS {who}")
            replies.append(f"{sms_id} {label}: allowed")
        else:
            await target.async_deny(mac, actor=f"SMS {who}")
            replies.append(f"{sms_id} {label}: kept blocked")

    if replies:
        await sites[0].async_send_sms("\n".join(replies), to=[sender])


def async_register(hass: HomeAssistant) -> None:
    """Listen once, however many sites are configured.

    Does nothing at all unless SMS_ENABLED is switched on in const.py, so an
    install without the Telebroad integration never subscribes to an event that
    will not arrive.
    """
    if not SMS_ENABLED:
        return
    key = f"{DOMAIN}_sms_listener"
    if hass.data.get(key):
        return

    async def _handle(event) -> None:
        try:
            await async_handle_event(hass, event)
        except Exception as err:  # noqa: BLE001
            _LOGGER.exception("failed handling SMS reply: %s", err)

    hass.data[key] = hass.bus.async_listen(SMS_EVENT, _handle)


def async_unregister(hass: HomeAssistant) -> None:
    key = f"{DOMAIN}_sms_listener"
    unsub = hass.data.pop(key, None)
    if unsub:
        unsub()
