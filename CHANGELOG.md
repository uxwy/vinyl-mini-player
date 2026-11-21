# Changelog

## 1.2.0 - 2026-11-20

### New

- **Shuffle status indicator:** A small dot below the shuffle button that smoothly fades in when shuffle is active, including when it's already enabled before opening the mini player, and fades out when disabled.
- **Afterimage (Beta):** The previous, current, and next lines displayed as a soft stack. For the best experience, resize the player until it switches to the stacked-card layout. Longer lines may be clipped in the flat layout.
- **Card-flip track change:** The artwork flips like a card while the title and artist glide in. Can be turned off under *Track change animation*.
- **Queue reshuffle:** Added a reshuffle button to the queue panel.
- **Long title scrolling:** Long titles now scroll to the end, pause for three seconds, scroll back, and repeat. Can be turned off.
- **Liquid:** Added a slowly drifting background animation, with its own switch under *Animated background*.

### Changed

- Added a smooth unfold and fade animation when toggling help descriptions in Settings.
- Minimal is now pure AMOLED black.
- Removed the Big vinyl option, which clipped past the card.
- Lyrics now update ten times per second. The fill follows each line's actual duration, or an estimate based on its text, rather than a fixed portion of the gap.

### Fixed

- The shuffle button now updates its active indicator immediately when toggled.
- Right-to-left lyrics, including Arabic, now fill from right to left.
- Fixed a queue row turning black while being dragged.
- Fixed an unwanted window resize after pressing Next.
- Disabled settings can no longer be clicked or focused.
- Performance mode now hides lyrics entirely and stops fetching them.

## 1.1.0 - 2026-10-28

### New

- Added the Liquid theme: cover art displayed as a rippled background behind a clean vinyl, with minimal controls and a springy hover animation.
- Added a background ripple strength setting. Performance mode turns the background off.

### Changed

- Removed the tonearm option.
- Removed the option to control the vinyl speed.

## 1.0.0 - 2026-10-25

First stable release.

- Floating vinyl mini player that opens from Spotify's Mini Player button.
- Themes: Classic, TintedGlass, and Minimal.
- Live synced lyrics from Spicy Lyrics, LRCLIB, and Spotify, with a timing offset.
- Reorderable queue panel.
- Remembers window size and position.
- Performance mode, Big vinyl, tonearm, 33 and 45 RPM, scroll-to-change-volume, and auto-hiding controls.
- The profile menu entry now appears even when Spotify starts slowly.
- Lyrics that fail to load are retried after a few seconds instead of staying blank, and skipping through songs quickly no longer sends a request for every skipped track.
- Dragging a slider or color picker now saves once, when released, instead of repeatedly requesting album colors from Spotify.
- Repeated lyric lines now animate like any other line.
- Hidden controls can no longer be clicked, and they stay visible while paused.
