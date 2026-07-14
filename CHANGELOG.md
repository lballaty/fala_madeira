# Changelog

**File:** `CHANGELOG.md`
**Description:** Release changelog for fala_madeira. Entries grouped by CalVer `YYYY.MM.DD.N`.
**Author:** Libor Ballaty <libor@arionetworks.com>
**Created:** 2026-07-14
**Last Updated:** 2026-07-14
**Last Updated By:** claude-opus-4-8 (versioning-rollout plan)

Versioning follows CalVer `YYYY.MM.DD.N` per the normative Versioning spec
(`~/.ai-dev-dotfiles/repo-specs/release-engineering/CLAUDE.md` §1). The `VERSION`
file is the sole source of truth; embedded literals are declared in
`.versionbump.yaml` and patched by `version-bump.py`.

---

## 2026.07.14.1

- Adopt CalVer versioning: add `VERSION`, `.versionbump.yaml` (declares the
  `package.json` version literal), and this changelog. Aligns `package.json`
  version to the `VERSION` source of truth (was `1.0.0`). Part of the global
  versioning rollout (TODO #122 §1).
