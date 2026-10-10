import Adw from 'gi://Adw';

function newPreferencesTab(
    title: string,
    stackName: string,
    iconName: string,
): Adw.PreferencesPage {
    const page = new Adw.PreferencesPage({ title });
    page.name = stackName;
    page.set_icon_name(iconName);
    return page;
}

export function newGeneralTab(): Adw.PreferencesPage {
    return newPreferencesTab('General', 'general', 'view-dual-symbolic');
}

export function newServicesTab(): Adw.PreferencesPage {
    return newPreferencesTab('Services', 'services', 'view-app-grid-symbolic');
}

export function newLogTab(): Adw.PreferencesPage {
    return newPreferencesTab('Log', 'log', 'view-list-symbolic');
}
