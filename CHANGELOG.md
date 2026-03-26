# Changelog

## Unreleased

### Added

- `agentura run --locked` now fails when any eval dataset fingerprint changes relative to the saved baseline, which is intended for regulated CI environments that require fixed, auditable datasets.
- `.agentura/manifest.json` is now written after every run with the run timestamp, git commit, CLI version, and per-suite dataset, strategy, score, and pass/fail metadata for audit trails.
- Local baselines now record per-suite dataset hashes, paths, and case counts, and the CLI warns when a current run is being compared against a baseline produced from a different dataset revision.
