# Keeping the app working without weekly re-installs

Apple makes apps signed with a **free Apple ID expire after 7 days**. That can't be switched off for free. You can, however, make the renewal automatic. Your data is never lost by refreshing; even if the app expires, the data stays and comes back after renewal. Only deleting the app deletes data.

## Options (iOS 26, Nov 2026)

| Option | Cost | Ongoing effort | Notes |
|---|---|---|---|
| **SideStore** (recommended) | Free | None with a daily Shortcuts automation | Renews **on the iPhone itself**. A PC is needed only for the first setup. |
| AltStore + AltServer | Free | Automatic only while your PC is on, AltServer is running and the phone is on the same Wi-Fi | Windows background refresh is sometimes flaky |
| Sideloadly | Free | Manual re-install every week (~1 min) | What the README describes |
| Apple Developer Program | ₹8,700 / year (US$99) | None: 1-year signing, or TestFlight | Most reliable; the only way to remove the limit entirely |

## Recommended: SideStore

SideStore is a free, open-source fork of AltStore that refreshes apps from the phone. It uses a local "VPN" app (**LocalDevVPN**) that only loops traffic back to the phone itself, plus a pairing file that you create once from your PC. These are third-party tools: follow the official guide at **sidestore.io** for current details. The steps below are an outline, not tested by me.

### One-time setup (with your Windows PC, ~20 minutes)
1. On the iPhone, install **LocalDevVPN** from the App Store.
2. On the PC, install iTunes (or Apple Devices). Connect the iPhone by USB and tap **Trust**.
3. Download **iloader** (linked from sidestore.io). It installs SideStore and creates the pairing file. Sign in with your Apple ID **in iloader itself**; I never see it.
   - Tip: many people use a **separate free Apple ID** just for sideloading.
4. On the iPhone: Settings › Privacy & Security › **Developer Mode** → On. Then trust your Apple ID under Settings › General › VPN & Device Management.
5. Open SideStore, connect LocalDevVPN when asked, and sign in.
6. Copy `VoicePlanner-unsigned.ipa` (from the GitHub build) to the iPhone (AirDrop is unavailable on Windows; use iCloud Drive or email to yourself). In SideStore go to **My Apps › +** and pick the `.ipa`.

### Make renewal automatic (no PC needed afterwards)
1. Open **Shortcuts › Automation › + › Time of Day**, for example every day at 9:00 PM (at home on Wi-Fi), and choose **Run Immediately**.
2. Add the SideStore action **Refresh All Apps**.
3. If a refresh ever fails with "not on Wi-Fi / VPN": open **LocalDevVPN**, tap Connect, then refresh again in SideStore.

Signatures last 7 days, so a daily attempt gives six retries before anything expires.

### Safety net inside Voice Planner
- **Settings › App signature** shows exactly when the current install expires.
- A **notification 24 hours before expiry** reminds you to refresh.
- An orange banner on the main screen appears when less than 2 days remain.

### Known SideStore hiccups (reported by users)
- "Not refreshing" after an iOS update: in SideStore choose **Reset pairing file**, reconnect LocalDevVPN, or regenerate the pairing file with iloader on the PC.
- Free Apple IDs still allow **3 sideloaded apps** at once (SideStore counts as one) and 10 new app IDs per 7 days.

## If you'd rather never deal with it
Joining the **Apple Developer Program (₹8,700/year)** removes the weekly limit: the app installs for a year, or updates itself through TestFlight. The project needs no code changes for that; only the signing step changes. Ask me and I'll add a GitHub workflow that signs and uploads to TestFlight.
