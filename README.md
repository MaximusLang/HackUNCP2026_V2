# FocusAgenda — HackUNCP

Minimal static prototype for the HackUNCP FocusAgenda UI. Contains:

- AI Checklist (mocked)
- Canvas week calendar for study blocks
- Assistant chat UI (mocked)
- Leaderboard using `localStorage`
- Settings modal to edit name and points

How to run

1. Open `/c/Users/trt012/focusagenda/index.html` in your browser.
2. Use the left-side "AI Checklist" and "Leaderboard".
3. Use the chat box on the right to ask questions; try typing `add CS101 2` and press Ctrl+Enter to add a study block.

Notes

- This is a front-end-only prototype. Replace the mock assistant with a real API for AI features.
- Persisted state is stored in `localStorage`.
