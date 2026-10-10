import Adw from 'gi://Adw';

export function newPreferencesTab(
    title: string,
    stackName: string,
    iconName: string,
): Adw.PreferencesPage {
    const page = new Adw.PreferencesPage({ title });
    page.name = stackName;
    page.set_icon_name(iconName);
    return page;
}
