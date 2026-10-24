# Start here — Janice extension handoff

Prepared October 14, 2026.

Copy this package's contents into the root of your `janice-extension` folder. Keep the included `docs/` and `data/` subfolders. These are planning/context files and mock data, ready for Codex to read when you start the build.

## Files

| File | Purpose |
| --- | --- |
| `START_HERE.md` | Setup steps and an index of the handoff files |
| `AGENTS.md` | Automatically discoverable project instructions for Codex |
| `docs/PRODUCT_PLAN.md` | What to build, defaults you can change, and what comes later |
| `docs/ACCEPTANCE.md` | Required behavior, useful tests, and validation checklist |
| `docs/CHECKOUT_NOTES.md` | Worksheet for investigating the real Sharper Image checkout |
| `data/mock-coupons.json` | AFF15 candidate coupon and its supplied offer terms |
| `KICKOFF_PROMPT.md` | Prompt to paste into a new Codex chat in this project |

## Start implementation

1. Put all seven files in `janice-extension`, preserving the subfolders.
2. Open or add that folder as a Codex project.
3. Start a chat in the project and paste the contents of `KICKOFF_PROMPT.md`.
4. Codex should implement, test, and document the first version using these files.

The existing repository already has a `package.json`. Keep it; the handoff has no replacement package file. The implementation can add appropriate scripts and dependencies while retaining its project metadata.

If an existing file has the same name, merge its instructions or requirements instead of discarding them.

## Change the plan

Edit the **Editable defaults** section in `docs/PRODUCT_PLAN.md` before kickoff if you want a different name, interface, or final coupon action. The current final-action default is to leave the best verified coupon applied; this was recommended during planning and was not explicitly selected by the user.

The key confirmed scope is real U.S. Sharper Image checkout + local AFF15 data. A real API and more stores can be added later. Live coupon acceptance and checkout compatibility still need to be investigated; the research worksheet records that status.
