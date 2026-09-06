# Writing Guidelines

Write each artifact so its reader can find the result, evidence, and next action
without meeting the same claim twice. Completeness means preserving decisions and
safety constraints, not filling every possible section.

## Artifact ownership

| Artifact              | Owns                                                            | Leaves elsewhere                                      |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| Issue                 | Problem, desired outcome, boundaries, and acceptance criteria   | Implementation sequence and delivered result          |
| Implementation plan   | Decisions and order needed to implement an accepted issue       | Repeated problem statements and later delivery status |
| Pull request          | Delivered result, deviations, verification, and review guidance | Issue background and copied acceptance criteria       |
| Current documentation | Current user tasks, contributor policy, and normative contracts | Delivery history and superseded behavior              |
| Changelog             | Concise user-visible effect grouped by release                  | Implementation detail and verification logs           |

Link to the artifact that owns a fact instead of copying it. Include enough
context for the reader to decide whether to follow the link.

An implementation plan is optional. Write one only when the accepted issue does
not determine significant implementation choices or sequencing. Archive a
completed plan as historical context; do not turn it into current guidance.

## Drafting rules

- Lead with the result or decision the reader needs.
- Give each paragraph one idea. Use lists only for genuinely parallel or
  sequential information.
- Name the actor and action. Prefer concrete verbs, observed behavior, commands,
  and measurements over abstract claims.
- Define one term for each concept and use it consistently.
- Keep safety, compatibility, failure behavior, and verification detail when it
  can change a decision or prevent harm.
- Delete an optional section when it has no new information. Do not paraphrase an
  earlier section to make a template look complete.
- Remove generic openings, narration about the document, repeated conclusions,
  and lists of unchanged behavior unless an exclusion prevents likely scope
  drift.

Do not judge prose by an AI-associated word list or an authorship detector. Do
not rewrite toward a uniform voice. Review whether the text is supported,
specific, necessary, and owned by the right artifact.

## Workflow

1. Name the artifact, its reader, and the decision or action it supports.
2. Inspect the source of truth: behavior, code, issue, plan, diff, or test result.
3. Assign each intended claim to the artifact that owns it. Replace claims owned
   elsewhere with links and minimal routing context.
4. Draft the result first, followed by only the evidence and detail the reader
   needs.
5. Run the deletion pass below.
6. Check required template fields, factual support, links, commands, and safety
   constraints.

Before publishing an issue or pull request body from a file, run:

```sh
just prose-report issue <body-file>
just prose-report pull-request <body-file>
```

Use `document` or `plan` for those artifact types. Pass `-` to read standard
input. The report ignores YAML frontmatter, HTML comments, and fenced code. It
warns above 800 words for issues, 500 for pull requests, 1,500 for plans, or 120
words for any prose paragraph. It also reports normalized exact duplicate
paragraphs of at least 20 words.

Warnings are editing prompts and always exit successfully. They do not require a
suppression or justification. Documents have no total word limit. Never remove
necessary information merely to reduce a metric.

## Deletion pass

For each paragraph or list item, ask:

- Does it change the reader's decision, action, or understanding?
- Is the same claim already present here or owned by another artifact?
- Does it state evidence, or only announce that evidence or detail exists?
- Can a precise verb, command, measurement, or link replace the explanation?
- Would deleting it remove a required constraint, risk, or verification result?

Delete or link the text when the first four questions expose no new value. Keep
it when the last question is true.
