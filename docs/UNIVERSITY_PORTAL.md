# University portal skeleton

UniBridgeAI is an independent university platform with its own accounts, courses, records and database. DU and LMS AITU are design and domain references only. No DU API, Moodle API or AITU Microsoft authentication is used. The intended AI runtime is Ollama; models and agent workflows will be selected after reviewing the project materials. No model requests are currently made.

## Reference inspection — 2026-11-15

- https://du.astanait.edu.kz/ redirected to a public login screen with corporate Microsoft sign-in. The authenticated dashboard was not accessed.
- https://lms.astanait.edu.kz/ showed a Moodle login page with username/password and OpenID Connect. Its authenticated courses were not accessed.
- AITU's public student guide describes course registration, individual study plans, teaching evaluations, thesis/supervisor selection, transcripts and personal profiles. These informed the proposed module structure, not a claim of exact screen parity. Guide: https://moodle.astanait.edu.kz/pluginfile.php/24480/block_html/content/%D0%A1%D0%BF%D1%80%D0%B0%D0%B2%D0%BE%D1%87%D0%BD%D0%B8%D0%BA-%D0%BF%D1%83%D1%82%D0%B5%D0%B2%D0%BE%D0%B4%D0%B8%D1%82%D0%B5%D0%BB%D1%8C_%D1%80%D1%83%D1%81_AITU.pdf?time=1757054164115 (section Digital University, page 14).

The visual design uses a blue/white campus dashboard with original UniBridgeAI branding, not copied university logos or a claim of official university affiliation.

## Implemented versus prepared

| Module                                 | Current behavior                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Dashboard                              | Real own-account course/publication/request counts; navigation and section search                                    |
| Courses                                | Teacher creates courses, enrolls existing students and publishes text materials; students read enrolled courses      |
| Faculty profile/research/forms         | Existing persistent profile, publications and private CSV/JSON snapshots retained                                    |
| Student profile                        | Own preferred name and phone can be saved; institutional enrollment fields are not invented                          |
| Service requests                       | Own-account private drafts saved in PostgreSQL; no messages are sent and no approval is implied                      |
| Timetable                              | Date-range reader scoped to course ownership/enrollment, week navigation; scheduling editor is not implemented       |
| Academic records                       | Teacher sees own-course assessment records; students see only their own published assessments; no grade-entry UI yet |
| Study plan/registration/thesis/library | Navigable empty-state skeletons; no fabricated catalogue, grades or decisions                                        |
| AI workspace                           | Editable task prompt and task suggestions, with explicit disconnected Ollama status; no generated answers            |
| University links                       | Optional external references, not integrations                                                                       |

Migration 003 adds student profiles, timetable events, academic results and private service-request drafts. It does not seed academic data. Existing databases are upgraded without deleting faculty/course data.

## Verification

All six automated tests passed, including the new portal tests for timetable/grade isolation, published-only student results, private drafts, rejected forged statuses and student-profile access. Vite production build passed. Browser checks passed for teacher course creation, student enrollment, material publishing and student read-only access to that material. Existing local faculty records survived the migration. Only clearly labeled synthetic course/material data was added for UI checks.

The running preview still uses persistent local PGlite + pgvector. Docker PostgreSQL, native installers, Ollama model calls and production deployment are not verified by these checks. New changes are local until explicitly pushed.
