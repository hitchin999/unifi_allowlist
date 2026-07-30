"""Constants for UniFi Allow List."""

DOMAIN = "unifi_allowlist"

PLATFORMS = ["sensor", "switch", "button"]

CONF_HOST = "host"
CONF_SITE = "site"
CONF_API_KEY = "api_key"
CONF_VERIFY_SSL = "verify_ssl"
CONF_NOTIFY = "notify_service"

CONF_SCAN_INTERVAL = "scan_interval"
CONF_LOOKBACK = "lookback"
CONF_BLOCK_FIRST = "block_first"
CONF_MAX_PER_RUN = "max_per_run"
CONF_CHANNEL = "channel"
CONF_GROUP = "group"
CONF_SSIDS = "enforced_ssids"
CONF_MIN_LIST_GUARD = "min_list_guard"
CONF_ADOPT_BLOCKS = "adopt_blocks"
CONF_FORGET_IN_UNIFI = "forget_in_unifi"
CONF_DENY_NAMES = "deny_names"
CONF_DENY_UNNAMED = "deny_unnamed"
CONF_NOTIFY_GAP = "notify_gap"

DEFAULT_SCAN_INTERVAL = 30
DEFAULT_LOOKBACK = 600
DEFAULT_BLOCK_FIRST = True
DEFAULT_ADOPT_BLOCKS = True
DEFAULT_FORGET_IN_UNIFI = True
DEFAULT_DENY_UNNAMED = False
# Refuse a runaway adoption; a first sync with many manual blocks should go
# through the service, where it can be previewed.
ADOPT_LIMIT = 25
# An allowed device showing as blocked is usually our own unblock not having
# landed yet. Only after this many consecutive polls is it treated as somebody
# deliberately blocking it in the UniFi UI.
ADOPT_ALLOWED_AFTER = 3
DEFAULT_MAX_PER_RUN = 10
# Off by default. The absolute floor is a poor fit for a five-device house and
# the drop guard below catches the failure it was really aimed at.
DEFAULT_MIN_LIST_GUARD = 0
# Refuse to enforce when the allow list has lost this much of its high-water
# mark without the integration having authored the removals.
DROP_GUARD_RATIO = 0.4
# Below this, a list is too small for a ratio to mean anything.
DROP_GUARD_FLOOR = 4
# Ceiling on the in-memory last-seen map before the oldest entries are dropped.
LAST_SEEN_CAP = 6000
LAST_SEEN_KEEP = 4000
DEFAULT_NOTIFY_GAP = 1.0
DEFAULT_CHANNEL = "UniFi Allow List"
DEFAULT_GROUP = "UniFi Allowlist"

PANEL_URL_PATH = "wifi-access"
PANEL_TITLE = "Wifi Access"
PANEL_ICON = "mdi:wifi-lock"
STATIC_URL = "/unifi_allowlist_static"

ACTION_PREFIX = "UAL_"
EVENT_ACTION = "mobile_app_notification_action"

SERVICE_ALLOW = "allow"
SERVICE_DENY = "deny"
SERVICE_FORGET = "forget"
SERVICE_RESEND = "resend_pending"
SERVICE_UNBLOCK_ALL = "unblock_all"
SERVICE_PRUNE = "prune"
SERVICE_IMPORT_LIST = "import_list"
SERVICE_EXPORT_LIST = "export_list"
SERVICE_SET_NAME = "set_name"
SERVICE_ALLOW_ONLINE = "allow_online_unknown"
SERVICE_FORGET_OFFLINE = "forget_offline_pending"
SERVICE_SYNC = "sync_from_unifi"
SERVICE_UNBLOCK_UNTRACKED = "unblock_untracked"
SERVICE_ACCEPT_LIST_SIZE = "accept_list_size"

ATTR_SITE = "site"
ATTR_REBLOCK = "reblock"

ATTR_MAC = "mac"
ATTR_DAYS = "days"
ATTR_DRY_RUN = "dry_run"
ATTR_PATH = "path"
ATTR_TARGET = "target"
ATTR_NAME = "name"

LIST_ALLOWED = "allowed"
LIST_DENIED = "denied"

STORAGE_VERSION = 1
STORAGE_KEY = "unifi_allowlist"

DEVICE_CACHE_SECONDS = 600
FORGET_BATCH_SIZE = 50
PRUNE_BATCH_PAUSE = 1.0
