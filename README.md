<p align="center">
  <img src="public/quickboard-logo-1920.png" alt="Quickboard" width="150">
</p>

<h1 align="center">Quickboard</h1>

<p align="center">
  <strong>Save anything. Summon it to your cursor in seconds.</strong>
</p>

<p align="center">
  Quickboard keeps your notes, links, files, and snippets one keystroke away.
  Press Option and Space to call up a launcher over any app, then drop what you
  need right where your cursor is.
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS-1f1f24">
  <img alt="Local first" src="https://img.shields.io/badge/data-local%20first-3f9c6d">
  <img alt="Touch ID" src="https://img.shields.io/badge/secured%20by-Touch%20ID-9a7a2e">
</p>

---

## Overview

Quickboard is a fast, local first command board for macOS. It waits quietly in the
background and answers the instant you need it. Whether you are filling out a form,
replying to a message, or pulling together a design, the things you reach for most
are always a shortcut away.

Everything you save stays on your Mac. Your items are encrypted at rest, and the
sensitive ones stay locked behind Touch ID until you ask for them.

## What it does

### Summon anywhere

Press Option and Space from any application to open the launcher. Find an item,
press Return, and Quickboard pastes it at your cursor. It never steals focus from
the app you are working in, so you stay exactly where you were.

### A board that stays organized

Sort everything into Environments, such as Personal and Work, and into Categories
within them. Search across your board, filter by type, and pin the items you use
the most so they are always on top.

### Every kind of thing

Save notes, links, code snippets, images, and files. Each type gets a clean card
with its own color and icon, so a full board stays readable at a glance.

### The tray

A floating staging area you can fill on the fly. Drop images and files straight
from your browser or from Finder, sort them into lanes such as References, Layouts,
and Elements, then commit a whole lane to your board in one step. A rolling
clipboard history keeps recent copies within reach, and password manager copies
are skipped automatically.

### Built for dragging

Pull any item out of Quickboard and drop it into another app. Photos land in
Figma, an address lands in a text field, several files land in a folder, each with
a polished drag preview that lifts off from where you grabbed it.

### Private by default

Mark any item as Confidential and Quickboard gates every copy, reveal, and drag
behind Touch ID. Clipboard history stays off until you choose to turn it on.

## Keyboard shortcuts

| Shortcut | Action |
| :-- | :-- |
| Option and Space | Summon the launcher over any app |
| Command and K | Open the command palette |
| Command and N | Add a new item |
| Return | Paste the highlighted item at your cursor |
| Tab | Send a highlighted item to the tray |

## Requirements

- macOS on Apple silicon or Intel
- Touch ID is recommended for confidential items

## Getting started

Quickboard is built with Tauri. To run it from source you will need Node.js with
pnpm and the Rust toolchain installed.

```bash
# install dependencies
pnpm install

# run the app in development
pnpm tauri dev

# build a release bundle
pnpm tauri build
```

The packaged application is written to `src-tauri/target/release/bundle`.

## Built with

- Tauri and Rust for a small, fast, and secure native shell
- React, TypeScript, and Vite for the interface
- Tailwind CSS and Framer Motion for the design and the motion

## Privacy

Quickboard is local first. Your items live in an encrypted store on your own Mac,
nothing is sent to a server, confidential items are protected by Touch ID, and
clipboard history is strictly opt in.

## License

Copyright © 2026 Treshnanda. All rights reserved.
