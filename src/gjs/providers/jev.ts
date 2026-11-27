import Gio from 'gi://Gio';

import { unavailableSnapshot, type UsageSnapshot } from '../../lib/model.js';
import { normalizeJevBilling } from '../../lib/providers/jev/normalize.js';
import { lookupJevCookie, parseJevCookie } from './jevKeyring.js';
import { httpGet } from '../http.js';

const CONSOLE = 'https://console.typesafe.ai';

export async function refreshJev(allowUnofficial: boolean, cancellable: Gio.Cancellable): Promise<UsageSnapshot> {
    const unavailable = (reason: string) => unavailableSnapshot('jev', 'Jev', 'unofficial', reason);
    if (!allowUnofficial)
        return unavailable('Enable the unofficial usage source for Jev in Services');

    let rawCookie: string | null;
    try {
        rawCookie = await lookupJevCookie(cancellable);
    } catch {
        return unavailable('Could not access the GNOME keyring. Check that it is installed and unlocked');
    }
    if (rawCookie === null)
        return unavailable('Save a TypeSafe console cookie in Services');

    const cookie = parseJevCookie(rawCookie);
    if (!cookie)
        return unavailable('Save the full TypeSafe Cookie request header value in Services');

    try {
        const response = await httpGet({
            url: `${CONSOLE}/api/billing/overview`,
            noRedirect: true,
            headers: {
                Accept: 'application/json',
                Cookie: cookie,
                Origin: CONSOLE,
                Referer: `${CONSOLE}/billing`,
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Dest': 'empty',
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
            },
            cancellable,
            timeoutSec: 25,
        });
        if (response.status === 401 || (response.status >= 300 && response.status < 400)
            || (response.status === 200 && response.contentType === 'text/html'))
            return unavailable('Sign in to the TypeSafe console again and save the new cookie in Services');
        if (response.status !== 200)
            return unavailable(`TypeSafe billing request failed (HTTP ${response.status})`);

        return normalizeJevBilling(JSON.parse(response.body), Date.now())
            ?? unavailable('TypeSafe billing response did not contain an available credit balance');
    } catch {
        return unavailable('Could not read the TypeSafe billing response');
    }
}
