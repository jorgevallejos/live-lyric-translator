
# Live Lyric Translator

<p align="center">
<img src="docs/images/chango-pepper-banner-logo.png" width="600">
</p>

A minimal live subtitle system for concerts.

This application allows a musician to project translated lyrics in real time during a live performance.  
The performer advances each phrase manually (via keyboard or foot pedal), keeping subtitles aligned with the music without needing precise timing.

**Note:** Currently available on **macOS only**.

## ✨ Features

- Manual lyric progression (live-performance friendly)
- Dual-window setup (control + projection)
- Multilingual lyrics
- Setlists and songs library management
- Next-line preview for performer
- Keyboard & foot pedal control
- Timer for concert
- Works fully offline

## 📷 Screenshots

### Control — Setup View
<p align="center">
<img src="docs/images/control-setup.png" width="600">
</p>

### Control — Performing View
<p align="center">
<img src="docs/images/control-performing.png" width="600">
</p>

### Projection — Audience view
<p align="center">
<img src="docs/images/projection-screen.png" width="600">
</p>

## 🚀 Quick Start

- `npm install`
- `npm run dev`

## ⚙️ How it works

Live Lyric Translator is a desktop application with two synchronized windows:

- a **Control window** (performer)
- a **Projection window** (audience)

The performer uses the Control window to prepare and run the performance,  
while the Projection window displays the translated lyrics in real time.

Performances are organized using setlists, which define the sequence of songs.

### Control window

Used by the performer to:

- select a setlist and songs  
- choose languages  
- control the flow of the performance  
- navigate through lyric lines  

### Projection window

Displayed on a projector and visible to the audience.

It shows only the current translated lyric line, without controls or additional information.

## 🎼 Setlists

Songs are organized into setlists.

- Setlists can be created and managed from the Setlist management screen  
- Songs can be added, removed, and reordered within a setlist  
- A performance always starts by selecting a setlist  

Once a setlist is active:
- the **first song is automatically selected** in Setup  
- the performer can select another song manually if needed  
- songs can be played sequentially during performance

## 🎬 Performance workflow

During a performance, the app follows a continuous setlist-based flow.  
The performer arms the concert once, then progresses through songs without returning to setup between each one.

After a song ends, the next song can be started directly from the Performing view, or the performer can return to Setup to make adjustments (song selection, languages, projection).

The first song of a setlist is automatically prepared when the setlist is selected.

### Setup
The performer configures the upcoming song.

- the first song is preselected from the active setlist (can be changed manually)  
- choose the singing language  
- choose the projection (translation) language  
- open / close the projection window  

The system is not ready yet until all required elements are in place  
(e.g. projection open, translation available, phrases loaded).

The control screen groups these actions into: Song, Languages, Projection, and Arm. The UI highlights what is missing to reach **Ready**.

### Ready
All checks pass. The system is ready for performance.  
Press **Arm** to begin.

### Armed
Arming the first song starts the concert timer and begins the concert session.  
The next **Next** reveals the first line and starts the performance.

### Performing
The performance is in progress (at least one phrase shown).  
The concert timer is running continuously across songs.

- **Next / Previous** navigate between phrases  
- **Restart** restarts the current song while staying in **Performing**  
- **Unarm** exits the current run and returns to **Ready**

When the last phrase of a song is reached, it is displayed normally.

Pressing **Next** once more reveals a centered tile for the **next song in the setlist**.  
Tapping this tile immediately starts the next song without returning to Setup.

The performer can still return to Setup at any time to:
- select a specific song  
- change languages  
- adjust projection settings

### State flow

```mermaid
flowchart LR

Setup["Setup\nSelect song, languages, projection"] --> Ready["Ready"]
Ready -->|Arm| Armed["Armed\nStart concert timer"]
Armed -->|First Next| Performing["Performing"]

Performing -->|Next / Previous / Restart| Performing
Performing -->|Next song tile| Performing
Performing -->|Unarm| Ready
Armed -->|Unarm| Ready
```

## ⏱️ Concert timer

- Starts when the **first song is armed**
- Runs continuously across all songs in the setlist
- Can be **paused** or **reset** at any time

## 🎭 Live performance setup (current configuration)

### Hardware

- Mac mini — runs the application  
- Projector — displays translated lyrics  
- iPad — used as a touchscreen control screen via Sidecar  
- Bluetooth pedal — used for Next / Previous  

**Note:** A Mac laptop can replace both the Mac mini and the iPad.

### Connections

Mac mini → HDMI → Projector  
Mac mini → USB-C → iPad (Sidecar)

### Operating systems tested

- macOS 26.1  
- iPadOS 26.3  

Sidecar works over the cable and does not require internet access.

The pedal is paired with the Mac mini and mapped to keyboard arrow keys.

## 🎛 Controls

### Control screen buttons

- Previous  
- Next  
- Restart  
- Open / Close Projection  
- Songs  

### Keyboard shortcuts (compatible with foot pedals)

ArrowRight → Next phrase  
ArrowLeft → Previous phrase  

## 🌍 Language selection

The performer first chooses the singing language, then selects the projection language used to display the translated lyrics for the audience.

When selecting a language:
- the choice is stored locally
- the projection immediately switches to that language
- the setting persists between sessions

The currently selected language is displayed next to the Current song label on the control screen.

If a translation is missing for the selected language, that lyric line simply remains blank on the projection screen.

## 🧪 Single-screen rehearsal mode

Normally the projection window ignores keyboard arrows for safety.

For rehearsal with a single screen run:

- `npm run dev:single`

In this mode the projection window also responds to arrow keys.

## 🎼 Song format

Songs are imported as JSON files and then stored in the app’s persistence layer. 

They can then be managed and organized into a Setlist for live performance.

```json
{
  "title": "Pimiento",
  "notes": "Capo 3, Acordes de DO",
  "lyrics": [
    {
      "es": "Viejo pimiento,\nhoy vuelvo a visitarte",
      "en": "Old pepper tree,\ntoday I come back to see you,",
      "fr": "Vieux pimentier,\naujourd’hui je reviens te voir,",
      "nl": "Oude peperboom,\nvandaag kom ik je weer bezoeken,"
    },
    ...
  ]
}
```

**Fields**
- `title` — song name
- `notes` *(optional)* — performer notes such as capo, key, or reminders
- `lyrics` — ordered list of lyric lines

Each lyric line contains translations indexed by language code, for example:
- `es` — Spanish
- `en` — English
- ...

Missing translations are allowed. In that case, the line remains blank in projection.

## 🧱 Technology stack

This project is built with:

- TypeScript — application logic  
- React — user interface  
- Vite — development and build system  
- Electron — desktop application framework  

Electron is used to open two synchronized windows:

- Control interface  
- Projection display  

## 🏗 Architecture

The application runs as a small desktop system composed of two synchronized windows.

- A control window used by the performer  
- A projection window displayed to the audience  

Both windows share the same song state so they stay synchronized during the performance.

```mermaid
flowchart LR

Performer --> Control[Control Window - React UI]

Control --> State[Song State]

State --> Projection[Projection Window]

Projection --> Audience[Projector / Audience Screen]

Pedal[Bluetooth Pedal] --> Control
```

## 🎵 About the artist

This project is part of the preparation for the live performances of **Chango Pepper**.

Chango Pepper blends Latin American roots, storytelling, and contemporary arrangements. The songs are primarily written in Spanish and performed for international audiences, hence the need for the Live Lyric Translator.

More about the project and the music:

https://sites.google.com/view/changopepper/home
