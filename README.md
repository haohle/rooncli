# Roon CLI

A terminal UI for controlling Roon. Browse your library, manage the queue, and control playback without leaving the keyboard.

<img width="983" height="655" alt="image" src="https://github.com/user-attachments/assets/fd903ac0-8d1c-4064-850a-4bf3da147ada" />


## Requirements

- [Node.js](https://nodejs.org) 18 or later
- A running [Roon Core](https://roon.app) on the same local network

## Install

```sh
git clone <repo-url> rooncli
cd rooncli
npm install
```

Then run it:

```sh
node index.js
# or, after npm install -g . or npm link:
roon
```

**First run:** Roon will prompt you to authorise the extension. Open Roon → Settings → Extensions and approve **Roon CLI**. You only need to do this once — the pairing token is saved to `~/.rooncli-state.json`.

> **Node 21+**: the `postinstall` script (`patch-roon.js`) patches the Roon SDK to use the `ws` package instead of the built-in WebSocket, which is missing methods the SDK requires. This runs automatically on `npm install`.

## Global shortcuts

These work in every mode (except the zone picker).

| Key | Action |
|-----|--------|
| `Space` | Play / pause |
| `K` | Next track |
| `J` | Previous track |
| `[` | Volume down |
| `]` | Volume up |
| `S` | Toggle shuffle |
| `R` | Cycle repeat (off → all → one) |
| `A` | Toggle auto radio |
| `Q` | Toggle queue panel |
| `Ctrl-C` | Quit |

## Shell mode

The default mode. Type a command and press Enter.

| Command | Action |
|---------|--------|
| `browse` / `b` | Open the library browser |
| `search <query>` / `s <query>` | Search your library |
| `zone` / `z` | Pick a zone interactively |
| `zone <n>` / `z <n>` | Switch to zone number n |
| `play` / `pause` / `stop` | Playback control |
| `next` / `prev` | Skip tracks |
| `vol` | Show current volume |
| `vol <n>` | Set volume to n |
| `vol +<n>` / `vol -<n>` | Adjust volume by n |
| `maxvol <n>` | Set a safe volume ceiling for this zone |
| `maxvol off` | Remove the volume ceiling |
| `mute` | Toggle mute |
| `shuffle` | Toggle shuffle |
| `repeat` / `loop` | Cycle repeat mode |
| `radio` | Toggle auto radio |
| `queue` | Toggle queue panel |
| `help` / `?` | Show command list |
| `q` / `quit` / `exit` | Quit |

## Browse mode (`b`)

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate items |
| `Enter` | Play (auto-selects "Play Now" for albums/playlists) |
| `→` | Open item's options menu (Add Next, Queue, etc.) |
| `←` / `Escape` | Go back |
| `1`–`9` | Instantly activate the nth visible item |
| `a`–`z` | Type to filter the current list |
| `Backspace` | Delete filter character |

## Queue mode (`Q`)

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate queue |
| `Enter` | Play from this position |
| `1`–`9` | Play the nth visible item |
| `Escape` / `Q` | Close queue panel |

## Zone picker

Shown automatically when multiple zones are found, or via `zone` / `z`.

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate zones |
| `Enter` | Select zone |

## Persistent files

| Path | Contents |
|------|----------|
| `~/.rooncli-state.json` | Roon pairing token (auto-managed) |
| `~/.rooncli.json` | Your settings (volume ceilings per zone) |
