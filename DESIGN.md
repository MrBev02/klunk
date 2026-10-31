---
name: Klunk
description: Exam papers and marking guides. A drafting table for building examinations.
colors:
  blueprint-blue: "#1f4e79"
  blueprint-wash: "#e8eef4"
  annotation-red: "#a8321c"
  annotation-wash: "#f8e9e5"
  approval-green: "#2f6b4f"
  approval-wash: "#e6f0ea"
  drafting-paper: "#fbf9f4"
  sheet-white: "#ffffff"
  ink: "#1b1917"
  ink-soft: "#4a4540"
  ink-faint: "#6f675e"
  rule: "#ddd6c9"
  rule-strong: "#b9b0a0"
typography:
  display:
    fontFamily: "'Iowan Old Style', 'Palatino Linotype', Palatino, Constantia, Georgia, serif"
    fontSize: "2.1rem"
    lineHeight: 1
    letterSpacing: "0.01em"
  body:
    fontFamily: "'Avenir Next', Corbel, Candara, 'Segoe UI', system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: 1.55
  label:
    fontFamily: "'SF Mono', ui-monospace, Consolas, 'Cascadia Mono', 'Courier New', monospace"
    fontSize: "0.78rem"
    fontWeight: 600
    letterSpacing: "0.15em"
  data:
    fontFamily: "'SF Mono', ui-monospace, Consolas, 'Cascadia Mono', 'Courier New', monospace"
    fontSize: "0.92rem"
    fontWeight: 700
    fontFeature: "tnum"
rounded:
  sm: "3px"
spacing:
  control-height: "2.35rem"
  control-height-small: "1.75rem"
  panel-padding: "1.1rem 1.25rem"
components:
  button:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.42rem 0.85rem"
    height: "{spacing.control-height}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.drafting-paper}"
    rounded: "{rounded.sm}"
    padding: "0.42rem 0.85rem"
    height: "{spacing.control-height}"
  button-primary-hover:
    backgroundColor: "{colors.blueprint-blue}"
    textColor: "{colors.drafting-paper}"
  button-small:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.2rem 0.6rem"
    height: "{spacing.control-height-small}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    padding: "0.2rem 0"
    height: "{spacing.control-height-small}"
  input:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.42rem 0.6rem"
    height: "{spacing.control-height}"
  panel:
    backgroundColor: "{colors.sheet-white}"
    rounded: "{rounded.sm}"
    padding: "{spacing.panel-padding}"
  chip:
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.12rem 0.4rem"
  chip-marks:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.drafting-paper}"
    rounded: "{rounded.sm}"
  chip-flag:
    backgroundColor: "{colors.annotation-wash}"
    textColor: "{colors.annotation-red}"
    rounded: "{rounded.sm}"
---

# Design System: Klunk

## Overview

**Creative North Star: "The Drafting Table"**

Klunk produces formal, ink-on-paper examinations, so its screens read like a
technical document on a drafting table rather than a soft dashboard. Structure
comes from thin ruled lines on warm paper, not from shadows or cards floating
over a background. Ink is near-black and carries almost everything. Colour is
held back for meaning: blueprint blue for what is selected or open, annotation
red for anything a teacher has to look at, approval green for what is settled.

The idea began with a Design and Technology faculty and holds for every
subject. A trial paper in History is as much a formal document as one in D&T,
and the teacher building it is checking a proof, not browsing a feed. Density
is moderate: a question list is meant to be scanned at a glance, with marks in
tabular figures because marks are the number that matters.

The printed paper is a separate system with its own stylesheet, `print.css`,
and shares nothing with this one on purpose. It is black on white A4 and
follows examination conventions whatever the screen is doing. This file governs
the app's screens only.

**Key Characteristics:**

- Warm drafting paper under a faint ruled grid; white sheets for panels.
- Hairline rules (1px) for structure. No drop shadows.
- Near-black ink for text and primary actions.
- Colour only where it means something, and never as the only signal.
- A serif for the masthead, a humanist sans for the interface, monospace for
  labels, data and code.
- System fonts only. The content-security policy loads no web fonts.

## Colors

A warm, near-monochrome paper-and-ink palette with three signal colours, each
paired with a pale wash. Every token has a dark-scheme counterpart under
`prefers-color-scheme: dark`, recorded in `.impeccable/design.json`.

### Primary

- **Blueprint Blue** (`blueprint-blue`): what is selected, open or hovered. The
  primary button's hover, the focus outline on fields, the type chip, an open
  question row. Its wash, **Blueprint Wash** (`blueprint-wash`), fills a
  hovered row and the chosen-document block.

### Secondary

- **Annotation Red** (`annotation-red`): anything that needs a teacher's eye. An
  error, a problem a check found, a tag that names nothing, the active tab's
  underline. Its wash, **Annotation Wash** (`annotation-wash`), fills an alert
  panel and a flagged chip.

### Tertiary

- **Approval Green** (`approval-green`): settled and correct. A check that
  passed, a draft ready to save. Its wash is **Approval Wash**
  (`approval-wash`).

### Neutral

- **Drafting Paper** (`drafting-paper`): the page ground, under the grid.
- **Sheet White** (`sheet-white`): panels, fields, buttons and code: anything
  that sits on the table as a sheet.
- **Ink** (`ink`): body text, headings, the primary button, the marks chip.
- **Soft Ink** (`ink-soft`) and **Faint Ink** (`ink-faint`): secondary text,
  then labels, placeholders and anything that is not content.
- **Rule** (`rule`) and **Strong Rule** (`rule-strong`): hairlines between
  things, then the borders of controls a teacher can click or type into.
- **Grid**: the ruled ground, Blueprint Blue at 5% opacity.

### Named Rules

**The Annotation Rule.** Red marks only what a teacher must look at. If nothing
needs checking, nothing on the screen is red, apart from the active tab's
underline.

**The Never Colour Alone Rule.** Every colour that carries meaning is paired
with words or form. A dead tag is struck through and dashed as well as red; a
status block says in its own words what it is reporting. This is WCAG 2.2 AA
1.4.1, and it is a floor, not a preference.

## Typography

**Display Font:** Iowan Old Style (with Palatino Linotype, Palatino, Constantia
and Georgia)
**Body Font:** Avenir Next (with Corbel, Candara, Segoe UI and system-ui)
**Label/Mono Font:** SF Mono (with ui-monospace, Consolas, Cascadia Mono and
Courier New)

**Character:** A bookish serif names the tool once, a clear humanist sans does
the work, and monospace marks what is measured, labelled or literal. Every
stack is built from faces that ship on school Macs and Windows machines.

### Hierarchy

- **Display** (2.1rem, line-height 1): the masthead title only.
- **Body** (16px, line-height 1.55): all interface text, and the tabs.
- **Control** (600, 0.92rem): the text of every button, whatever its variant.
  A variant says how much an action matters by its fill, border and height,
  never by a smaller size of text.
- **Label** (600, 0.78rem, 0.15em tracking, uppercase): panel titles and the
  masthead strapline. A label names a region; it never carries a sentence.
- **Data** (700, tabular figures): marks, counts and anything a teacher adds up.

### Named Rules

**The Monospace Means Literal Rule.** Monospace is for labels, numbers, file
paths and program code. It is never decoration for looking technical.

## Layout

A single centred column up to 82rem, with 1.5rem side padding and generous space
at the foot. A masthead closed by a 2px ink rule, then tabs with a 1px rule
under them, then the working surface. Lists are ruled rows rather than cards.
Two breakpoints narrow the layout, at 60rem and 52rem.

The page ground is a ruled grid of 24px squares drawn in Blueprint Blue at 5%.
It echoes the graph paper that drawing questions print on, and it stays.

Every control a teacher can click or type into is one height, 2.35rem, so a row
of mixed fields and buttons lines up exactly. The small, icon and letter buttons
share one shorter height, 1.75rem, because they sit inside rows and beside
chips; it is above the 24px minimum target on purpose. A row of buttons centres
its children rather than stretching them.

## Elevation & Depth

Flat. There are no drop shadows. Depth is a sheet lying on the table: a white
surface with a hairline border on warm paper. Emphasis comes from ink weight,
rules and the three signal washes, never from lifting something off the page.

### Named Rules

**The Flat Table Rule.** Nothing casts a shadow. A surface that needs to stand
out gets a rule or a wash.

## Shapes

Nearly square corners (3px) on every sheet, control and chip. Borders are
hairlines (1px), in Rule for structure and Strong Rule for controls. Two rules
are heavier on purpose: the 2px ink rule closing the masthead, and the 2px red
underline under the active tab.

### Named Rules

**The Margin Mark Rule.** A 3px bar down the left edge of a block is a margin
mark, and it carries a status: Annotation Red for a fault or a doubt, Blueprint
Blue for a note or the thing chosen, Approval Green for settled, Strong Rule for
pending. It is always paired with words that say what the status is. A block
with no status has no bar. It gets the hairline border every sheet has.

## Components

### Buttons

Plain sheets with a hairline edge. They darken their border on hover and press
down a pixel when clicked.

- **Shape:** nearly square (3px), one control height (2.35rem).
- **Default:** Sheet White with a Strong Rule border and Ink text, 600 weight.
- **Primary:** solid Ink with Drafting Paper text; turns Blueprint Blue on hover.
- **Hover:** border goes to Ink.
- **Focus:** a 2px Blueprint Blue ring outside the edge, on buttons and tabs.
- **Small, icon and letter:** the compact height, for real actions inside rows
  and beside chips: add an option, attach an image, remove, move up.
- **Quiet:** no fill and no border, Soft Ink text with an underline in Strong
  Rule that goes to Ink on hover. For what is not the work itself: showing or
  hiding more of the page (Cover, More settings, Edit section wording, Show the
  whole question) and the masthead's folder chores. A toggle carries
  `aria-expanded`. The underline is what tells a teacher it can be pressed.
- **Which one:** the action a screen exists for is Primary; other actions that
  finish or leave a screen (Preview, Close, Cancel) are Default; actions on one
  row are Small or Icon; disclosure and housekeeping is Quiet.
- **Disabled:** 45% opacity, no pointer.

### Chips

Small ruled tags in monospace.

- **Style:** Strong Rule border, Soft Ink text, 3px corners.
- **Marks:** solid Ink, Drafting Paper text, bold tabular figures.
- **Flag:** Annotation Wash with an Annotation Red border and text.
- **Type:** Blueprint Wash with Blueprint Blue text and no border.
- **Dead:** dashed red border, red text, struck through.
- **Out:** dashed border, Faint Ink, dimmed: off, not wrong.

### Cards / Containers

Klunk has panels, not cards: a white sheet on the table.

- **Corner Style:** 3px.
- **Background:** Sheet White.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px Rule. A panel reporting a status adds a margin mark under the
  Margin Mark Rule: alert, note or ok.
- **Internal Padding:** 1.1rem by 1.25rem.

### Inputs / Fields

- **Style:** Sheet White, Strong Rule hairline, 3px corners, one control height.
- **Focus:** 2px Blueprint Blue outline, inset by a pixel.
- **Placeholder:** Faint Ink and italic, so an example never passes for an
  answer.
- **Code:** a program box uses monospace, keeps every space and does not wrap.

### Navigation

Text tabs over a 1px rule. A tab is Faint Ink, darkens on hover, and when active
turns Ink with a 2px Annotation Red underline. A count sits beside each label in
monospace.

### Question Row

The signature list. A ruled row with the marks right-aligned in bold tabular
figures, the stem beside them, and chips at the end. Rows rise into place on
first paint (0.18s), except under reduced motion. A hovered row takes Blueprint
Wash; an opened row reveals its detail on a white sheet beneath.

## Do's and Don'ts

### Do:

- **Do** structure a screen with hairline rules and white sheets on the
  drafting paper.
- **Do** keep every clickable or typeable control at 2.35rem, apart from the
  small in-row variants.
- **Do** give every signal colour a partner in words or form.
- **Do** put marks and counts in tabular figures.
- **Do** keep the grid as the page ground.
- **Do** use a margin mark only on a block that reports a status, and pair it
  with its words.

### Don't:

- **Don't** use drop shadows, floating cards or nested containers.
- **Don't** use a left bar as decoration. A block with nothing to report gets
  the hairline border every sheet has.
- **Don't** use red for anything that does not need a teacher's eye.
- **Don't** use monospace to look technical. It is for labels, data and code.
- **Don't** load a web font or any other network resource. The CSP forbids it.
- **Don't** carry these screen styles onto the printed paper, which follows
  examination conventions in `print.css`.
