# UniBridgeAI Page Import extension

This optional Chromium extension provides a file-based alternative to the desktop app's embedded browser. It runs only on the listed DU, LMS, MyDU, LinkedIn, Scopus, ResearchGate and ORCID HTTPS pages.

1. In Chrome or Edge, open `chrome://extensions` or `edge://extensions`.
2. Turn on Developer mode and choose **Load unpacked**.
3. Select this `browser-extension` folder.
4. Open a supported page, choose **Export page to UniBridgeAI**, review and edit the visible text, and save the JSON snapshot.
5. Sign in to UniBridgeAI, open **Import through your browser → Use the optional browser extension**, and choose the downloaded file.
6. Review the pending snapshot in UniBridgeAI and explicitly accept it before asking AI to use it.

The extension does not read passwords, cookies, or browser storage; it does not send page data to a remote service. It reads visible text only after the user presses its button, and saves a file only after the user reviews and confirms. The JSON file contains the selected text, supported source URL without query parameters, and capture time. Treat it as personal data and delete the downloaded file when it is no longer needed.
