# Drishti AI Connected v1 — installable Android web app

This package is a static Progressive Web App (PWA). It is designed to be hosted over HTTPS and added to the Android home screen from Chrome. It is not an APK and this package cannot publish itself to the internet; it needs hosting under an account you control.

## Features that work without API keys once hosted on HTTPS
- Accessible, high-contrast, screen-reader-friendly interface.
- Spoken responses using browser text-to-speech; browser speech recognition when supported.
- Phone location permission and location sharing through Android's share sheet / clipboard.
- Route handoff to Google Maps for walking, transit, or driving with the current GPS location when available.
- Nearby mapped metro/rail stations, bus stops, hospitals, pharmacies, ATMs, and toilets via public OpenStreetMap Overpass endpoints.
- Photo text reading using Tesseract.js English + Hindi OCR, loaded from a CDN on first use.
- Locally saved home address and trusted phone number.
- Manual emergency call handoff to India's 112 dialer.
- Offline app shell caching; live maps/nearby lookup/OCR downloads need internet.

## Not implemented / not guaranteed
- This app does not provide an AI scene-description model or reliable obstacle detection.
- It does not provide official live bus/metro arrivals, platform changes, service disruption alerts, or transit operator feeds.
- It does not automatically send SOS messages or continuously share a family member's location.
- Google Maps takes over route navigation; Drishti does not independently speak route steps or confirm safe road crossings.
- Public map services can be down, rate-limited, or have incomplete/outdated information.
- Browser voice recognition and OCR accuracy vary by Android phone, browser, language model and network.

## Deploy it (HTTPS is required for geolocation, microphone and installable PWA behavior)
1. Create a new public GitHub repository named `drishti-ai` (only this static source is included; do not add personal addresses or phone numbers to it).
2. Upload `index.html`, `app.js`, `manifest.json`, `service-worker.js`, `README.md`, and the `icons/` directory to the repository root.
3. In GitHub, open **Settings → Pages**. Select **Deploy from a branch**, choose the `main` branch and `/(root)`, and save.
4. Wait until GitHub Pages displays the published HTTPS website address.
5. Open the published URL in Chrome on the sister's Android phone. In Chrome's menu, choose **Install app** or **Add to Home screen**.
6. Allow location and microphone only if she agrees. Keep TalkBack on. Test every feature first while accompanied.

## First-use test checklist
- [ ] Set Hindi or English and test spoken output.
- [ ] Test voice recognition while stationary and verify what the app heard.
- [ ] Save a home address and verify the Maps destination is correct.
- [ ] Test location sharing with a trusted family member.
- [ ] Search for a nearby hospital and metro station; cross-check results in Maps.
- [ ] Test OCR on non-sensitive text before attempting important labels.
- [ ] Confirm the emergency button opens the expected phone dialer but does not place a call without confirmation.
- [ ] Test loss of internet; don't rely on live routing or nearby lookup offline.

## Online services and privacy
- Google Maps URLs open an external Google Maps page/app for route calculation.
- Nearby services use public community-maintained OpenStreetMap data through Overpass services. Requests include the approximate current location in the query; the service may log requests. Use a dedicated contracted provider or self-hosted service for production scale.
- OCR code and language data download from jsDelivr on first use. The selected photo is passed to the in-browser OCR worker; the application does not intentionally upload the photo to an AI API.
- Home and trusted contact are stored in localStorage on this device/browser. Clearing browser data may remove them. Do not use a shared phone.
- No API keys, phone numbers or personal addresses are embedded in this package.

## Important safety note
This is an initial assistive technology prototype, not certified mobility equipment. Keep using the white cane, guide dog, mobility training and safe crossing habits. Never cross a road only because an app or camera says it is clear. Test with the sister and a sighted companion, ideally with an orientation-and-mobility specialist, before outdoor use.
