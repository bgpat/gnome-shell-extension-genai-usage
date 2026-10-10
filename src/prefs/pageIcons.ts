/**
 * Preferences tab `icon_name` values (Adwaita / system theme only).
 * Do not ship `icons/` in the extension or call `IconTheme.add_search_path` for prefs tabs.
 * Use `symbolic/actions/view-*` names (same family as Log’s view-list-symbolic).
 */
export const PREFS_GENERAL_ICON = 'view-dual-symbolic';
export const PREFS_SERVICES_ICON = 'view-app-grid-symbolic';
export const PREFS_LOG_ICON = 'view-list-symbolic';

/** Stable stack names for AdwViewStack (required for tab icons in PreferencesWindow). */
export const PREFS_GENERAL_NAME = 'general';
export const PREFS_SERVICES_NAME = 'services';
export const PREFS_LOG_NAME = 'log';
