# UI-PSY: approved screen concepts and individual assets

The implementation uses native HTML controls, SVG contour fields, native MoodBloom stars, and separate transparent PNG illustrations. Generated screen concepts are visual references, never screenshots embedded as interactive UI. Questionnaire answers/scoring, account data and clinician permissions retain their original logic.

## Delivered illustrations

All files are in `public/illustrations/`, preserve PNG alpha, and are decorative (`alt=""`).

| File | Subject | Source generation |
| --- | --- | --- |
| journal.png | Open journal with blue/lavender leaves | exec-54382be4-b35a-48ef-8383-4620925c6c3b.png |
| calendar.png | Calendar with leaves and ribbon | exec-d7e3e737-b31b-4b56-988b-761bd3225281.png |
| sleep.png | Crescent moon with ribbon | exec-e029f346-6ffb-4c3a-927e-5c208381cdc0.png |
| wellbeing.png | Blue/lavender sprig on a glass pebble | exec-1b78c4e5-1d6b-460e-aae8-fc812d536e92.png |
| rain-cloud.png | Cloud, four raindrops, blue/lavender leaves | exec-aa81c5fc-0c41-4a77-8a58-5714af104a64.png |
| anxiety-waves.png | Three glass wave ribbons, lavender stars, leaves | exec-9e41a650-c93c-4a37-b3f4-6d3e93b3171b.png |

Existing `my-plan.png` and `time-for-self.png` are reused from the accepted home screen (see `home-illustrations.md`). Source images remain in `/Users/alexganyak/.codex/generated_images/01a14b31-1aff-7040-8377-b5355d6ab079/`.

## Prompts used

Journal/calendar (reference: diary concept, style only):

> Use case: compositing. Reference image provides style only. Generate ONE separate UI illustration asset: [open blue journal with heart and leaves / blank calendar with binding rings, leaves and ribbon]. Refined translucent blue clay/glass material, muted periwinkle and icy-blue palette, soft lighting, clear silhouette at 100px display size, composition centered occupying 80% of square canvas. Genuine transparent background and transparent empty spaces. No UI, no card rectangle, no backdrop, no floor, no border, no external glow cloud, no watermark. Do not copy screenshot/text; render only requested isolated object.

Sleep/wellbeing:

> A single isolated decorative UI illustration: [crescent moon, ribbon and leaves / three blue leaves and a lavender leaf on a glass pebble]. Refined softly dimensional blue glass/clay style for calm emotional-wellbeing app. Muted periwinkle, icy-blue, navy leaf accents. Centered composition occupying 80% of square canvas, all elements fully visible, actual transparent background. No background, backdrop, floor, card, text, numerals, logo or watermark. Crisp readable silhouette at 100px. No external glow cloud.

Cloud/waves (reference: test catalogue concept, style only):

> Use case: compositing. Create ONE separate decorative UI illustration, using the supplied UI concept only as a style reference. Subject: [A soft blue rain cloud with four suspended glass raindrops above a small arrangement of slender blue and lavender leaves. Match the depression test illustration in the reference, no rectangular backing. / Three delicate flowing blue glass wave ribbons, a small luminous four-point lavender star above, with a few blue leaves at the bottom. Match the anxiety test illustration in the reference, no rectangular backing.] Translucent dimensional blue glass/clay, cyan highlights, deep blue shadow edges. Square centered composition, fully visible objects occupying 85% of canvas. Actual transparent background with alpha including spaces between objects. No interface, no card, no text, no floor, no external glow cloud, no watermark. Readable at 110px.

## Layout implementation

- Diary: compact header, three section tabs, search/date/filter controls, mobile new-entry action below filters, seven-day strip, grouped entries, expanded metric tiles, desktop summary based on recorded entries.
- Diary dynamics: responsive gap-preserving plot, real period mean and metric cards. Questionnaire charts and results are in Tests. Missing measurements are not fabricated.
- Tests: purpose first, formal title below, distinct illustrations, patient self-screening/assignments/results; professional catalogue in Work. Questionnaire introduction/questions/results.
- Events: real timeline; desktop editor beside timeline, mobile editor in a keyboard-accessible portal dialog.
- Care/practices/chat: shared surfaces, blue controls, transparent art, native contour decoration. Existing scheduling, consent, messaging and storage remain functional.
- Profile: compact identity; overview, entries, tests, plan, events, device sections. Print retains all sections.
- Navigation: full-width mobile bar tracks `visualViewport`, including browser chrome changes.

Mockup-only names, scores, messages, online indicators and dates are not application defaults. Empty/account-disconnected states therefore differ from populated concepts intentionally.

## Doctor Work concept

Generated reference: `exec-e8a10b79-6584-4c7d-99d0-030687667cbc.png` in the same source generation directory.

Prompt: Russian UI-PSY doctor Work dashboard, desktop and phone side by side, matching the accepted deep navy/blue app. Personal navigation plus Work; patients/assignments/profile tabs; QR invitation and new-card actions; search; dated clinical measures and separate signals for review. Compact readable native web layout, cyan action buttons without glow, thin borders, no stethoscope. Fictional names and scores belong to the concept only.

Implementation: `WorkDashboard.tsx`, `WorkShell.tsx` and shared `DoctorConnections`. Patient rows, assignments, QR links and profile are backed by stored account data. Empty states contain no concept sample patients.
