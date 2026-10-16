---
consolidation:
  total: 23
  counts:
    exists: 12
    discard: 9
    integrate: 0
    unconfirmed: 2
  percentages:
    exists: 52.17%
    discard: 39.13%
    integrate: 0.00%
    unconfirmed: 8.70%
---
# UI documentation split: screen baselines and reusable design rules

## Recommendation

Keep two explicitly distinct layers. **Screen specifications** are the exact per-screen contract: what is present and in what order, behavior and state transitions, focus/keyboard interaction, and layout at constrained terminal sizes. <!-- consolidation: exists; ref: docs/screens/README.md#screen-specifications; reason: Screen composition and presentation are separately owned with unresolved geometry explicit. --> **Design system** is the reusable visual and interaction vocabulary: color/contrast, text hierarchy, spacing, shared headers/footers, dialogs, component states, and accessibility rules. <!-- consolidation: exists; ref: docs/DESIGN-SYSTEM.md#shared-visual-design; reason: Shared rules have a distinct owner without implying unspecified tokens exist. --> For this TUI, describe rows/columns, terminal dimensions, wrapping/truncation, focus and key input—not CSS breakpoints or web widgets. <!-- consolidation: exists; ref: docs/DESIGN-SYSTEM.md#type-cells-and-spacing; reason: Terminal cell geometry replaces web assumptions. -->

Suggested minimum structure (filenames are a local recommendation, not an industry convention):

```text
docs/
  SPEC.md                         # product-wide behavioral authority
  design-system.md                # reusable visual/accessibility rules
  screens/
    README.md                     # screen index and links
    <screen-name>.md              # one exact screen baseline per screen
```
<!-- consolidation: exists; ref: docs/SPEC.md#authority; reason: The tree item SPEC identifies the adopted behavioral owner. --> <!-- consolidation: exists; ref: docs/DESIGN-SYSTEM.md#shared-visual-design; reason: The tree item design-system identifies the adopted reusable visual owner with uppercase local filename. --> <!-- consolidation: exists; ref: docs/screens/README.md#screen-specifications; reason: The tree items screen index and per-screen pages match the adopted composition ownership. -->
Prefer `screens/` over a top-level `SCREEN-SPECS/` or `SCREENS/`: lowercase and descriptive, consistent with ordinary docs navigation. <!-- consolidation: exists; ref: docs/SPEC.md#feature-index; reason: The adopted screen-specification directory is screens. --> `UI-SPEC` is ambiguous (could mean product behavior, screen details, or visual system); avoid it. <!-- consolidation: discard; ref: none; reason: Rejected alternate filename discussion need not enter core. --> `DESIGN-SYSTEM` is clear but use the repository's lowercase filename style. <!-- consolidation: discard; ref: docs/DESIGN-SYSTEM.md#shared-visual-design; reason: Adopted owner uses uppercase DESIGN-SYSTEM rather than the suggested lowercase filename. --> These naming choices are subjective, not evidenced as a prescribed convention by the sources below. <!-- consolidation: discard; ref: none; reason: Research qualification is retained as context. -->

## Ownership and drift

- `SPEC.md` owns product-wide behavior and invariants. Screen pages own only screen-specific composition, ordering, presentation states, focus/keyboard details, and terminal-size adaptation. Link to SPEC; do not restate product rules. If a screen page needs to change product behavior, update SPEC and link to it. <!-- consolidation: exists; ref: docs/specs/interfaces.md#product-surfaces; reason: Screen composition links to the sole behavioral owner. -->
- `design-system.md` owns shared visual rules and reusable component patterns. Screen pages point to those rules and record only exceptions required by that screen. A component's accessible behavior belongs with its reusable pattern; a screen says how/where it is used. <!-- consolidation: exists; ref: docs/DESIGN-SYSTEM.md#shared-visual-design; reason: Shared rules are distinct from exact screen composition. -->
- Keep one authority per claim. Link to source rules rather than copying them into indexes or screen pages; record the owner's source file when a claim is disputed. <!-- consolidation: exists; ref: docs/SPEC.md#feature-index; reason: Index links to full owners rather than maintaining duplicate summaries. -->
- Screen templates should include purpose, ordered regions, states (including empty/loading/error), key/focus map, narrow/short-terminal behavior, and links to governing SPEC/design-system rules. <!-- consolidation: unconfirmed; ref: docs/screens/README.md#screen-specifications; reason: Adopted pages cover these concerns but a universal exact template is not mandated. --> Design-system templates should include token/value, intent, use/avoid, component states, keyboard/focus and accessibility requirements. <!-- consolidation: unconfirmed; ref: docs/DESIGN-SYSTEM.md#type-cells-and-spacing; reason: Template and global token values remain recommendations with incomplete approved values. -->
- Tests, terminal recordings, and screenshots can detect drift against a documented baseline; they are evidence/verification, never the authority for intended product behavior. Update the owning document first when intent changes. <!-- consolidation: exists; ref: docs/SPEC.md#evidence-and-decisions; reason: Verification cannot amend intent and accepted changes update their owners. -->

## Evidence and applicability

These first-party systems support the *separation of reusable guidance from context-specific composition*, not the proposed filenames or a TUI-specific standard: <!-- consolidation: discard; ref: none; reason: Source applicability limits remain research context. -->

- [GOV.UK Design System components](https://design-system.service.gov.uk/components/) documents reusable components with usage guidance and examples; its [patterns](https://design-system.service.gov.uk/patterns/) describe recurring user journeys. This is evidence for reusable layers, not terminal layout. <!-- consolidation: discard; ref: none; reason: External component and pattern evidence does not establish terminal requirements. -->
- [Carbon Design System](https://carbondesignsystem.com/) distinguishes foundational design tokens, components, and patterns; its [accessibility guidance](https://github.com/carbon-design-system/carbon/wiki/Component-Accessibility-Guidelines) makes accessibility a component-level design concern. Its implementation includes web-specific material; transfer the documentation model, not code or CSS. <!-- consolidation: discard; ref: none; reason: External design-system findings remain supporting research. -->
- [Material Design 3 interaction states](https://m3.material.io/foundations/interaction-states) treats states as shared component behavior; [adaptive layout](https://m3.material.io/foundations/layout/understanding-layout) addresses how composition responds to available space. Translate adaptation to terminal cells and focus, not web breakpoints. <!-- consolidation: discard; ref: none; reason: External source analogy need not be copied into project contracts. -->
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) is a normative web-content accessibility standard, not a TUI specification. Its perceivable/operable principles (notably keyboard access, visible focus, and non-color-only distinctions) are useful checks, but should be adapted and supplemented for terminal/screen-reader behavior rather than claimed as TUI compliance. <!-- consolidation: discard; ref: none; reason: Research explicitly limits web-standard applicability and grants no TUI compliance claim. -->

The product's TUI-first requirement is already established in [SPEC.md](SPEC.md). <!-- consolidation: exists; ref: docs/specs/interfaces.md#product-surfaces; reason: TUI-first setup and configuration are approved. --> The sources establish useful documentation categories and accessibility concerns; the exact split, names, and terminal-specific fields above are recommendations tailored to this repository, not claims that those systems prescribe them. <!-- consolidation: discard; ref: none; reason: Tailoring disclaimer belongs to research provenance. -->
