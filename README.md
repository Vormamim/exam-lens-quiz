# Exam Lens

A penalty-scored revision quiz for Year 12 Software Engineering, built as a Progressive Web App. It has 228 multiple-choice questions across the four units, grouped into 40 topics.

## Scoring

- Right answer: **+1**
- Wrong answer: **−1**, and the question goes back in the queue until it is answered correctly
- A run counts as a best score only when every question in it has been solved

## Run locally

The service worker needs a server; opening `index.html` directly will not register it.

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page markup |
| `app.js` | Quiz logic, scoring, saved progress, service worker registration |
| `questions.js` | Question bank. In each entry the **first option is the correct answer**; the app shuffles options on every attempt |
| `styles.css` | Styles, light and dark themes |
| `sw.js` | Service worker for offline use |
| `manifest.webmanifest`, `icons/` | Install metadata and icons |

## Updating questions

Edit `questions.js`, then change `VERSION` in `sw.js` (for example `exam-lens-v1` to `exam-lens-v2`) so installed copies fetch the new files.
