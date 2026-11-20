# Synthetic evaluation set (SYNTHETIC — no real people)

Every name, title, DOI, year and page below is invented for testing. `answers.json` is the
answer key: it lists what a correct system must produce. The key must never be given to a
model as input. Records mirror the three checks the course asks for: field mapping, record
extraction and evidence linking.

Files:
- `pages.json` — accepted page snapshots as they would arrive from the in-app browser (text, source URL).
- `answers.json` — for each page: the expected draft records, with the injected error type.
- `field-map.json` — a legacy export's column names and the correct UniBridgeAI field for each.
- `profile.json` — a synthetic teacher profile with a few empty fields and some confirmed values.
