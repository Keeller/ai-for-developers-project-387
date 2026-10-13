# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all
operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a
  heredoc for multi-line bodies.
- **Read an issue**:
  `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**:
  `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`
  with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**:
  `gh issue create --parent <parent> ...`, or
  `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+).
  Older `gh`:
  `gh api --method POST repos/Keeller/ai-for-developers-project-387/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`.
  Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or
  `--remove-label "..."`.
- **Close**: `gh issue close <number> --comment "..."`.

The repository is `Keeller/ai-for-developers-project-387`; `gh` also infers it
from `git remote -v` when run inside this clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** External pull requests are not included in
the issue-triage queue.

GitHub shares one number space across issues and pull requests. Resolve an
ambiguous `#42` with `gh pr view 42`, then fall back to `gh issue view 42`.

## Skill operations

- When a skill says **publish to the issue tracker**, create a GitHub issue.
- When a skill says **fetch the relevant ticket**, read the GitHub issue.

## Wayfinding operations

Used by `/wayfinder`. A map is one issue with child issues as tickets.

- **Map**: label it `wayfinder:map` and keep Notes, Decisions-so-far, and Fog in
  its body.
- **Child ticket**: link it as a GitHub sub-issue. If sub-issues are unavailable,
  add it to the map's task list and put `Part of #<map>` in the child. Use a
  `wayfinder:<type>` label: `research`, `prototype`, `grilling`, or `task`.
- **Blocking**: use GitHub native issue dependencies. Add an edge with
  `gh api --method POST repos/Keeller/ai-for-developers-project-387/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`,
  where the database ID comes from
  `gh api repos/Keeller/ai-for-developers-project-387/issues/<n> --jq .id`.
  If dependencies are unavailable, use a `Blocked by: #<n>` line.
- **Frontier**: choose the first open, unassigned child with no open blocker.
- **Claim**: `gh issue edit <n> --add-assignee @me`.
- **Resolve**: comment with the answer, close the child, then add its context
  pointer to the map's Decisions-so-far.
