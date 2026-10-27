# UI-PSY navigation and roles

## Personal space (patients and clinicians)

- Home: recorded statistics and destinations, kept compact.
- Diary: Records, Dynamics, Events. Canonical dynamics URL: `/app?section=diary&view=dynamics`; events use `view=events`. Old `section=statistics` and `section=events` links remain compatible and render the same diary shell.
- Tests: introductory diagnostics, doctor assignments, results/history and questionnaire plots. Technical scale names are shown in the professional workspace, while the patient sees purpose descriptions.
- Support: real connected-doctor chat and a separate disclosed scripted helper; relaxation practices include breathing, lava lamp and non-clinical reflection exercises.
- Settings: compact grouped rows for connections, application preferences, data and clinician access. The profile row opens name editing, account sign-in/sign-out and sharing access; data management opens storage/privacy details and the existing deletion confirmation. Main settings never exposes destructive actions directly.
- Event creation: mobile bottom sheet with date, event kind, note and save; desktop keeps the same editor beside the event timeline. Safety events retain live-help guidance. Saving failures preserve the entered note.
- Devices: two explicit destinations, NeuroPlay neurointerface (Bluetooth/EEG or NeuroPlayPro API) and manual Apple Health XML import. They are separate integrations.

## Professional role

Registration offers personal or doctor/psychologist use. `users.role` persists in SQLite and auth refresh. Existing accounts can activate the professional profile in Settings or the clinician entrance. Self-declaration does not verify professional qualifications or grant access to any patient's data.

Doctors retain every personal section and gain Work (`/doctor`): Patients, Assignments, Profile, professional test catalogue, local consultation cards and consent-based linked patient profiles. Invitations require the professional role. Patient consent and revocation still control each link, plan, shared record and chat.

## Questionnaire policy approved by user

Shared policy: `src/lib/testPolicy.json`.

- PHQ-4 is the introductory self-screening form.
- Latest complete PHQ-4: anxiety items 1–2 sum >=3 opens GAD-7; depressive items 3–4 sum >=3 opens PHQ-9.
- Other self-report forms require an active assignment from a connected doctor.
- Clinician-rated forms cannot be assigned for patient self-completion; they remain in the clinician workspace.
- UI and direct questionnaire URLs enforce this policy. The server also validates new results against actual linked assignments and screening answers.
- Removing a connection removes assignment access. Previously saved results remain readable/deletable, including after revocation.
- Non-clinical reflection exercises are separate from clinical screening and live under relaxation practices.

Empty observation blocks are not rendered. Diary observations appear only when the existing observation logic finds a specific pattern with enough recorded data; missing dates never become invented values.
