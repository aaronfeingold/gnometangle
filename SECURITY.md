# Security policy

## Reporting a vulnerability

Please report security problems privately through
[GitHub's private vulnerability reporting](https://github.com/aaronfeingold/gnometangle/security/advisories/new),
not in a public issue. You should get a reply within a week.

Only the latest release is supported with fixes.

## How releases are protected

- Changes reach `main` only through pull requests that pass CI. Pull requests from anyone other than the
  maintainer need the maintainer's approval.
- Only the maintainer can create `v*` tags, and published releases are immutable.
- Each release is built by GitHub Actions from a tagged commit on `main`, and ships with `SHA256SUMS` and a
  signed build provenance attestation. To check a download:

  ```sh
  sha256sum -c SHA256SUMS
  gh attestation verify gnometangle@aaronfeingold.github.io.shell-extension.zip -R aaronfeingold/gnometangle
  ```
