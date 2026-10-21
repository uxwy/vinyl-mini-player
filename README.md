# Vinyl Mini Player

A Spicetify extension that replaces Spotify's Mini Player with its own always-on-top window: a spinning vinyl, live synced lyrics, a reorderable queue and three themes.

!\[preview](preview.png)

## Features

* Horizontal bar that turns into a stacked card when the window is square; everything scales with the window size
* Remembers its size and position
* Queue panel: drag to reorder, play now, remove
* Live synced lyrics under the artist, with a karaoke-style fill and long lines that scroll to stay readable
* Lyrics sources: Spicy Lyrics, LRCLIB and Spotify, with an adjustable timing offset
* Themes: Classic, TintedGlass (album-color aura, blur, tint) and Minimal (flat dark)
* Big vinyl, tonearm, 33/45 RPM spin speeds, scroll-to-change-volume, auto-hiding controls, Performance mode

## Install

### Marketplace

Open Spotify, go to Marketplace, then Extensions, search for **Vinyl Mini Player** and click Install.

### Manual

1. Copy `vinyl-mini-player.js` into your Spicetify `Extensions` folder (`%appdata%\\\\spicetify\\\\Extensions` on Windows, `\\\~/.config/spicetify/Extensions` on Linux/macOS).
2. Run:

```
spicetify config extensions vinyl-mini-player.js
spicetify apply
```

## Usage

Click Spotify's own Mini Player button (or profile menu → Vinyl Mini Player → Open / close). Settings are under profile menu → Vinyl Mini Player → Settings, or the gear button in the player bar.

## Lyrics

|Source|Key needed|Notes|
|-|-|-|
|Spicy Lyrics|Yes|Create your own publishable key (`sl\\\_pk\\\_...`) at [developers.spicylyrics.org](https://developers.spicylyrics.org) and paste it in Settings. Never use a secret `sl\\\_sk\\\_` key.|
|LRCLIB|No|Community-sourced synced lyrics from [lrclib.net](https://lrclib.net)|
|Spotify|No|Spotify's own line-synced lyrics, when the track has them|

The source that supplied the lyrics is credited under the lyric line. This project is unofficial and is not affiliated with Spicy Lyrics, LRCLIB or Spotify.

## Notes

* The window is a Document Picture-in-Picture window (Chromium); if it is unavailable a pop-up window is used. The window cannot be truly transparent.
* If a source never loads, open DevTools in Spotify (Ctrl+Shift+I) and check the console for `\\\[vinyl-mini-player]` messages.

