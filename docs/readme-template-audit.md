# Profile README template field and asset map

Source candidates are retained verbatim in `docs/readme-candidates/`. The app
generates a new README from validated form data and never edits these references.

| Candidate | Source profile                                                            | User fields asked in the app                                                                                                      | Template-specific links retained                                                                                                                                          |
| --------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Temp 1    | [Thaiane](https://github.com/Thaiane/Thaiane)                             | Name, headline/role, bio, skills, company, education, interests, architecture, tools, communities, challenge, profile links       | Original Giphy animations, LinkedIn badge style, GitHub follower badge                                                                                                    |
| Temp 2    | [Abhishek Maira](https://github.com/AbhishekMaira10/AbhishekMaira10)      | Name, headline, bio, skills, interests, social links, optional public email, selected public projects                             | Original social icon images, Explore topic icons, Komarev views counter, GitHub Readme Stats cards, CodeChef/LeetCode/HackerRank/Codewars icon assets, Giphy illustration |
| Temp 3    | [Achyut Ghosh](https://github.com/achyutghosh/achyutghosh)                | Name, headline/role, bio, company, education, skills, social links, optional public email                                         | Original Giphy and profile-repository GIFs, Shields contact badges, Devicon C#/.NET/JavaScript/Oracle icons                                                               |
| Temp 4    | [Anirudh Emmadi](https://github.com/aemmadi/aemmadi)                      | Name, headline, bio, education, location, skills, social links, optional public email                                             | Original Giphy, Shields badges, GitHub Readme Stats image and visitor-badge image                                                                                         |
| Temp 5    | [Bhagawat Adhikari](https://github.com/BhagawatAdhikari/bhagawatadhikari) | Name, headline/role, bio, company, location, skills, interests, work areas, focus, challenge, social links, optional public email | Markdown-only design; no icon or counter services                                                                                                                         |

Usernames in follower, stats, pinned-project and visitor-count URLs are generated
from the authenticated GitHub username. Profile/social links come from the
editable shared form; email appears only after the explicit opt-in checkbox.
Public repositories can be selected in Temp 2. Repository languages are not
presented as confirmed skills.

## Reuse and external-service check

- Each source profile/repository was reachable on GitHub when reviewed.
- GitHub's public license endpoint returned 404 for all five profile
  repositories; this means no repository license was confirmed. The app links
  to the source profile on each template card. Source-hosted GIF/icon assets and
  remote stats/visitor services remain third-party dependencies.
- The collected files include older image hosts and services. URLs are retained
  where they are part of that template, so their future availability is not
  guaranteed. The README remains editable if an image or widget stops loading.
- GitHub Readme Stats is a third-party dynamic image service and its current
  maintenance status should be checked before relying on it in a public profile.
- Temp 4's sample requests `count_private=true`; the generated URL keeps this
  option, as in the supplied template. The request includes a public username,
  not the user's OAuth token. The service controls whether it can return the
  requested data.
- Contact email is not read from the account session and is omitted by default.

## Implementation mapping

- `lib/profile-readme-templates.ts` contains the five isolated renderers and
  original per-template asset URLs.
- `app/components/readme-template-picker.tsx` presents the current README card
  first (when one exists), followed by the five collected designs, and asks only
  for fields relevant to the selected design.
- The existing README editor, sanitized preview, browser-tab draft recovery,
  review, conflict detection and GitHub publisher handle the resulting copy.
- Template-specific inputs are stored in the same per-account README draft so
  switching layouts does not erase them.
