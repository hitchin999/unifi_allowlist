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
CONF_NOTIFY_GAP = "notify_gap"

DEFAULT_SCAN_INTERVAL = 30
DEFAULT_LOOKBACK = 600
DEFAULT_BLOCK_FIRST = True
DEFAULT_MAX_PER_RUN = 10
DEFAULT_MIN_LIST_GUARD = 25
DEFAULT_NOTIFY_GAP = 1.0
DEFAULT_CHANNEL = "UniFi Allow List"
DEFAULT_GROUP = "unifi_allowlist"

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

ATTR_SITE = "site"

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
