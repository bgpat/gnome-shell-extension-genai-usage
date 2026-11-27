# Set up Jev

1. Sign in to the [TypeSafe console](https://console.typesafe.ai/billing) and select your organization.
2. Open your browser’s Network panel and reload Billing. Find the `/api/billing/overview` request and copy the value of its request `Cookie` header.
3. In **Services**, turn on **Allow unofficial usage source** for Jev. Paste the Cookie value into the dialog and choose **Validate**. The switch turns on after validation and GNOME Keyring saves the cookie (`gir1.2-secret-1` and `gnome-keyring` on Ubuntu). Turning it off removes the cookie from the keyring.
4. Jev is shown in the top bar by default. Use **Show in top bar** to change its visibility.

If you used an earlier build with a `genai-usage/jev-cookie` file under your config directory, save the value in the keyring first. Once the balance appears, you can delete the old file. A nested Shell started with `bun run dev` uses a separate session bus and keyring. Open **Preferences** inside that Shell to configure it there. The test cookie is kept only for the lifetime of that nested session.

Jev shows the percentage of unexpired credits remaining or used in the top bar, dropdown menu, and General preview. The menu also shows the **Available credits** balance in USD. **Show billing** controls spending, purchased and free credits, payment and recharge status, billing contact details, and the credit and payment history returned by the overview. The percentage is available when the credit grants account for the full balance. The extension sends the session cookie only to the TypeSafe billing overview endpoint. The Jev inference API key cannot read this balance.
