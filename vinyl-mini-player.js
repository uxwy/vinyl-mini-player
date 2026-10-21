(function vinylMiniPlayer() {
  "use strict";

  if (window.__vmp && typeof window.__vmp.cleanup === "function") window.__vmp.cleanup();

  function waitForSpicetify() {
    if (!window.Spicetify || !Spicetify.Player || !Spicetify.Menu || !Spicetify.LocalStorage) {
      return setTimeout(waitForSpicetify, 300);
    }
    init();
  }

  function init() {
    const SETTINGS_KEY = "vinyl-mini-player:settings";
    let saved = {};
    try { saved = JSON.parse(Spicetify.LocalStorage.get(SETTINGS_KEY) || "{}"); } catch (_) {}
    const settings = { performance: false, replaceNative: true, theme: "classic", bigVinyl: false, rpm: "slow",
      tonearm: false, scrollStep: 5, queueSize: 10, blur: 35, tintMode: "auto", tintColor: "#6a7cff", tintStrength: 60, lyrics: true, lyricsSource: "auto", lyricOffset: 0, spicyKey: "", autoHide: true, ...saved };
    const WIN_KEY = "vinyl-mini-player:window";
    let winState = null;
    try { winState = JSON.parse(Spicetify.LocalStorage.get(WIN_KEY) || "null"); } catch (_) {}
    const saveSettings = () => Spicetify.LocalStorage.set(SETTINGS_KEY, JSON.stringify(settings));

    const BAR_W = 480;
    const BAR_H = 76;
    const QUEUE_H = 320;
    const STACK_W = 320;
    const STACK_H = 400;

    const cleanups = [];
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      cleanups.push(() => target.removeEventListener(type, fn, opts));
    };

    const ICONS = {
      prev: '<path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>',
      next: '<path d="M16 6h2v12h-2zM6 18V6l8.5 6z"/>',
      play: '<path d="M8 5v14l11-7z"/>',
      pause: '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>',
      queue: '<path d="M3 6h14v2H3zm0 5h14v2H3zm0 5h9v2H3zm12-1v-7l5 3.5z"/>',
      shuffle: '<path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>',
      likeOn: '<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7.5 12.3l3 3 6-6.3" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
      likeOff: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      close: '<path d="M6.4 5L5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/>',
      grip: '<path d="M9 5h2v2H9zm4 0h2v2h-2zM9 11h2v2H9zm4 0h2v2h-2zM9 17h2v2H9zm4 0h2v2h-2z"/>',
      up: '<path d="M12 5l7 8h-4.5v6h-5v-6H5z"/>'
    };
    const svg = (name, size) => `<svg viewBox="0 0 24 24"${size ? ` width="${size}" height="${size}"` : ""}>${ICONS[name]}</svg>`;

    const CSS = `
*{box-sizing:border-box}
html,body{margin:0;height:100%}
.vmp-root{position:fixed;inset:0;display:flex;flex-direction:column;justify-content:center;
  background:var(--spice-main,#121212);color:var(--spice-text,#fff);font-family:inherit;overflow:hidden;user-select:none}
.vmp-root.has-queue{justify-content:flex-start}
.vmp-bar{position:relative;flex:none;height:var(--bar-h,100%);display:flex;align-items:center;gap:1.2rem;padding:0 .8rem 0 1rem;cursor:grab}

.vmp-disc{position:relative;flex:none;width:5.6rem;height:5.6rem}
.vmp-vinyl{position:absolute;inset:0;border-radius:50%;overflow:hidden;background:#111;
  box-shadow:0 0 0 1px #000,0 .3rem 1rem rgba(0,0,0,.45);will-change:transform}
.vmp-cover{display:block;width:100%;height:100%;object-fit:cover;transition:opacity .25s ease}
.vmp-grooves{position:absolute;inset:0;border-radius:50%;pointer-events:none;
  background:repeating-radial-gradient(circle,transparent 0 .2rem,rgba(0,0,0,.22) .26rem .3rem)}
.vmp-shine{position:absolute;inset:0;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.28),transparent 55%)}
.vmp-hole{position:absolute;left:50%;top:50%;width:9%;height:9%;transform:translate(-50%,-50%);
  border-radius:50%;background:var(--spice-main,#121212);box-shadow:0 0 0 .15rem #1b1b1b;pointer-events:none}

.vmp-meta{flex:1 1 0;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:.3rem}
.vmp-title{font-size:1.4rem;font-weight:600;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vmp-artist{font-size:1.1rem;letter-spacing:.05em;text-transform:uppercase;color:var(--spice-subtext,#b3b3b3);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

@property --p{syntax:"<percentage>";inherits:false;initial-value:0%}
.vmp-lyric{--lt:var(--spice-text,#fff);--ld:rgba(255,255,255,.4);--ld:color-mix(in srgb,var(--spice-text,#fff) 40%,transparent);
  display:block;max-height:0;margin-top:-.3rem;opacity:0;font-size:1.2rem;line-height:1.3;font-weight:600;letter-spacing:-.005em;
  white-space:nowrap;overflow:hidden;color:var(--lt);--ml:0px;--mr:0px;
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 var(--ml),#000 calc(100% - var(--mr)),transparent 100%);
  mask-image:linear-gradient(90deg,transparent 0,#000 var(--ml),#000 calc(100% - var(--mr)),transparent 100%);
  transition:max-height .5s cubic-bezier(.22,.61,.36,1),margin-top .5s cubic-bezier(.22,.61,.36,1),opacity .5s ease}
.vmp-root.has-lyrics .vmp-lyric{max-height:1.8rem;margin-top:0;opacity:1}
.vmp-lyric span{display:inline-block;transform:translateX(var(--sx,0px));background:linear-gradient(90deg,var(--lt) 0%,var(--lt) calc(var(--p) - 5%),var(--ld) calc(var(--p) + 5%),var(--ld) 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;transition:--p .3s linear,transform .3s linear}
.vmp-root.is-perf .vmp-lyric span{background:none;-webkit-text-fill-color:currentColor}
.vmp-credit{display:block;max-height:0;opacity:0;font-size:.85rem;line-height:1.3;letter-spacing:.02em;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;color:var(--spice-subtext,#b3b3b3);transition:max-height .5s ease,opacity .5s ease}
.vmp-root.has-lyrics .vmp-credit.on{max-height:1.2rem;opacity:.6}
.vmp-credit a{color:inherit;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.25)}
.vmp-credit a:hover{color:var(--spice-text,#fff)}
.vmp-root.stack .vmp-lyric{font-size:1.4rem;max-width:100%}
.vmp-root.stack.has-lyrics .vmp-lyric{max-height:2rem}

.vmp-ctrls{flex:none;display:flex;align-items:center;gap:.4rem;transition:opacity .35s ease}
.vmp-root.autohide .vmp-ctrls{opacity:0}
.vmp-root.autohide.hover .vmp-ctrls,.vmp-root.autohide.peek .vmp-ctrls,.vmp-root.autohide.q-open .vmp-ctrls,.vmp-root.autohide:focus-within .vmp-ctrls{opacity:1}
.vmp-btn{appearance:none;background:none;border:none;outline:none;padding:0;margin:0;color:var(--spice-subtext,#b3b3b3);
  cursor:pointer;width:3.2rem;height:3.2rem;display:grid;place-items:center;border-radius:50%;
  transition:transform .25s cubic-bezier(.25,1,.5,1),color .3s ease,background-color .3s ease}
.vmp-btn svg{width:2rem;height:2rem;fill:currentColor;display:block}
.vmp-btn:hover{color:var(--spice-text,#fff);transform:scale(1.06)}
.vmp-btn:active{transform:scale(.94)}
.vmp-btn:focus-visible{box-shadow:0 0 0 .2rem var(--spice-button,#1db954)}
.vmp-btn.vmp-active{color:var(--spice-button,#1ed760)}
.vmp-btn.vmp-like:hover{color:var(--spice-button,#1ed760)}
.vmp-btn.vmp-play{position:relative;width:4rem;height:4rem;margin:0 .2rem;background:#fff;color:#000}
.vmp-btn.vmp-play:hover{transform:scale(1.04);color:#000}
.vmp-btn.vmp-play svg{position:absolute;inset:0;margin:auto;width:2.2rem;height:2.2rem;opacity:0;transform:scale(.88);
  transition:opacity .32s ease,transform .32s ease;pointer-events:none}
.vmp-root:not(.is-playing) .vmp-play .vmp-ic-play,.vmp-root.is-playing .vmp-play .vmp-ic-pause{opacity:1;transform:none}
.vmp-btn.vmp-close{width:2.6rem;height:2.6rem;opacity:0;pointer-events:none;
  transition:opacity .2s ease,transform .2s ease-in-out,background-color .2s ease-in-out}
.vmp-btn.vmp-close svg{width:1.6rem;height:1.6rem}
.vmp-root.hover .vmp-close,.vmp-btn.vmp-close:focus-visible{opacity:1;pointer-events:auto}
.vmp-btn.vmp-close:hover{background:rgba(128,128,128,.25);transform:rotate(90deg)}
.vmp-root.dragging-win,.vmp-root.dragging-win *{cursor:grabbing!important}

.vmp-root.no-shuffle .vmp-shuffle{display:none}
.vmp-root.no-like .vmp-like{display:none}
.vmp-root.no-skip .vmp-prev,.vmp-root.no-skip .vmp-next{display:none}

.vmp-progress{position:absolute;left:0;right:0;bottom:0;height:max(3px,.4rem);cursor:pointer;background:rgba(128,128,128,.2);
  transition:height .15s ease}
.vmp-progress:hover{height:max(5px,.7rem)}
.vmp-bar-fill{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--spice-button,#1ed760)}

.vmp-queue{flex:1 1 auto;min-height:0;display:none;flex-direction:column;border-top:1px solid rgba(128,128,128,.25);
  opacity:0;transform:translateY(-.8rem);transition:opacity .3s ease,transform .3s ease}
.vmp-root.has-queue .vmp-queue{display:flex}
.vmp-root.q-open .vmp-queue{opacity:1;transform:none}
.vmp-qhead{flex:none;display:flex;align-items:center;justify-content:space-between;padding:.8rem 1.4rem .4rem;
  font-size:1.2rem;font-weight:700;color:var(--spice-subtext,#b3b3b3);letter-spacing:.04em;text-transform:uppercase}
.vmp-qhint{font-weight:400;text-transform:none;letter-spacing:0;opacity:.8}
.vmp-qlist{position:relative;flex:1 1 auto;min-height:0;overflow-y:auto;padding:.4rem .6rem .8rem;scrollbar-width:thin}
.vmp-qrow{position:relative;display:flex;align-items:center;gap:1rem;padding:.5rem .8rem;border-radius:.8rem;cursor:pointer;
  transition:background-color .15s ease,box-shadow .2s ease}
.vmp-qrow:hover{background:rgba(128,128,128,.18)}
.vmp-qrow.enter{animation:vmp-in .4s cubic-bezier(.22,.61,.36,1) backwards;animation-delay:calc(var(--i,0) * 28ms)}
@keyframes vmp-in{from{opacity:0;transform:translateY(.8rem)}to{opacity:1;transform:none}}
.vmp-qlist.sorting,.vmp-qlist.sorting *{cursor:grabbing!important}
.vmp-qlist.sorting .vmp-qrow{transition:transform .32s cubic-bezier(.25,.8,.25,1),background-color .15s ease;will-change:transform}
.vmp-qlist.sorting .vmp-qrow:hover{background:none}
.vmp-qlist.sorting .vmp-qrow.is-drag{z-index:3;background:var(--spice-card,#2a2a2a);
  box-shadow:0 .8rem 2.2rem rgba(0,0,0,.5),0 0 0 1px rgba(128,128,128,.25);
  transition:box-shadow .2s ease,background-color .2s ease}
.vmp-qlist.sorting .vmp-qrow.is-drag.settle{transition:transform .26s cubic-bezier(.25,.8,.25,1),box-shadow .26s ease,background-color .26s ease}
.vmp-grip{flex:none;width:1.6rem;height:1.6rem;fill:var(--spice-subtext,#b3b3b3);opacity:.5;cursor:grab;transition:opacity .15s ease}
.vmp-qrow:hover .vmp-grip,.vmp-qrow.is-drag .vmp-grip{opacity:1}
.vmp-qrow img{flex:none;width:3.6rem;height:3.6rem;border-radius:.4rem;object-fit:cover;background:rgba(128,128,128,.25)}
.vmp-qtext{flex:1 1 0;min-width:0;display:flex;flex-direction:column}
.vmp-qname{font-size:1.3rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vmp-qartist{font-size:1.1rem;color:var(--spice-subtext,#b3b3b3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vmp-qact{flex:none;display:flex;gap:.2rem;opacity:0;transition:opacity .15s ease}
.vmp-qrow:hover .vmp-qact{opacity:1}
.vmp-qlist.sorting .vmp-qact{opacity:0}
.vmp-qact .vmp-btn{width:2.6rem;height:2.6rem}
.vmp-qact .vmp-btn svg{width:1.5rem;height:1.5rem}
.vmp-qempty{padding:1.8rem 1.4rem;font-size:1.3rem;color:var(--spice-subtext,#b3b3b3);text-align:center}

.vmp-toast{position:absolute;top:.6rem;left:50%;transform:translateX(-50%);z-index:6;padding:.3rem 1.2rem;border-radius:99px;
  background:rgba(0,0,0,.75);color:#fff;font-size:1.1rem;white-space:nowrap;opacity:0;transition:opacity .2s ease;pointer-events:none}
.vmp-toast.show{opacity:1}

.vmp-root.card{padding:1rem}
.vmp-root.card .vmp-bar{border-radius:1.8rem;background:rgba(128,128,128,.12);border:1px solid rgba(128,128,128,.28)}
.vmp-root.card .vmp-disc{width:4.4rem;height:4.4rem}
.vmp-root.card.big .vmp-disc{width:7.4rem;height:7.4rem;margin:-1.5rem 0 -1.5rem -1.7rem}
.vmp-root.card .vmp-progress{left:1.8rem;right:1.8rem;bottom:.6rem;border-radius:99px;overflow:hidden}
.vmp-disc{z-index:1}
.vmp-root.card.big:not(.stack) .vmp-progress{left:6.6rem}
.vmp-root.card .vmp-queue{margin-top:.8rem;border:1px solid rgba(128,128,128,.28);border-radius:1.8rem;overflow:hidden;background:rgba(128,128,128,.12)}

.vmp-root.stack .vmp-bar{flex-direction:column;justify-content:center;gap:1.2rem;padding:2.4rem 2rem 2.8rem;text-align:center}
.vmp-root.stack .vmp-disc,.vmp-root.stack.card .vmp-disc,.vmp-root.stack.card.big .vmp-disc{width:19rem;height:19rem;margin:0}
.vmp-root.stack .vmp-meta{flex:none;width:100%;align-items:center}
.vmp-root.stack .vmp-title{font-size:1.8rem;max-width:100%}
.vmp-root.stack .vmp-artist{font-size:1.2rem;max-width:100%}
.vmp-root.stack .vmp-ctrls{gap:.2rem}
.vmp-root.stack .vmp-btn.vmp-close{position:absolute;top:.6rem;right:.6rem;margin:0}
.vmp-root.stack.card .vmp-progress{left:2.4rem;right:2.4rem;bottom:1.2rem}

.vmp-arm{display:none;position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:2}
.vmp-root.has-arm .vmp-arm{display:block}
.vmp-arm-g{transform-origin:108px 8px;transform:rotate(-35deg);transition:transform 1s cubic-bezier(.34,1.3,.64,1)}
.vmp-root.is-playing .vmp-arm-g{transform:rotate(0deg)}

@property --aura-a{syntax:"<color>";inherits:true;initial-value:rgb(44,50,84)}
@property --aura-b{syntax:"<color>";inherits:true;initial-value:rgb(24,26,42)}
.vmp-aura{display:none;position:absolute;inset:0;pointer-events:none;opacity:var(--tint,.6);
  background:radial-gradient(120% 170% at 0% 0%,var(--aura-a) 0%,transparent 64%),radial-gradient(120% 170% at 100% 100%,var(--aura-b) 0%,transparent 64%);
  transition:--aura-a 1.4s ease,--aura-b 1.4s ease,opacity .4s ease}
.vmp-rim{display:none;position:absolute;inset:0;pointer-events:none;z-index:4;border-radius:0;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.12),inset 0 1px 1px rgba(255,255,255,.25)}
.vmp-root.theme-glass{padding:0;border-radius:0;background:#0b0b0f;--spice-text:#fff;--spice-subtext:rgba(255,255,255,.65);
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",var(--vmp-font,sans-serif)}
.vmp-root.theme-glass .vmp-aura,.vmp-root.theme-glass .vmp-rim{display:block}
.vmp-root.theme-glass .vmp-bar{background:rgba(255,255,255,.03);border:none;border-radius:0;box-shadow:none;
  backdrop-filter:blur(var(--blur,35px)) saturate(190%);-webkit-backdrop-filter:blur(var(--blur,35px)) saturate(190%)}
.vmp-root.theme-glass .vmp-title{font-weight:700;letter-spacing:-.01em}
.vmp-root.theme-glass .vmp-artist{letter-spacing:.06em}
.vmp-root.theme-glass .vmp-hole{background:#14141a}
.vmp-root.theme-glass:not(.stack) .vmp-disc{width:5.6rem;height:5.6rem;margin:0}
.vmp-root.theme-glass.big:not(.stack) .vmp-disc{width:7.6rem;height:7.6rem;margin:0 0 0 -1.8rem}
.vmp-root.theme-glass:not(.stack) .vmp-progress{left:0;right:0;bottom:0;border-radius:0}
.vmp-root.theme-glass.big:not(.stack) .vmp-progress{left:7rem}
.vmp-root.stack.theme-glass .vmp-progress{left:0;right:0;bottom:0;border-radius:0}
.vmp-root.theme-glass .vmp-queue{margin:.2rem .8rem .8rem;border:none;border-radius:2.2rem;overflow:hidden;
  background:rgba(255,255,255,.07);
  backdrop-filter:blur(var(--blur,35px)) saturate(190%);-webkit-backdrop-filter:blur(var(--blur,35px)) saturate(190%);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),inset 0 1px 1px rgba(255,255,255,.25),0 20px 40px rgba(0,0,0,.35)}
.vmp-root.is-perf.theme-glass{background:rgba(20,20,25,.92)}
.vmp-root.is-perf.theme-glass .vmp-aura{display:none}
.vmp-root.is-perf.theme-glass .vmp-bar{background:none;backdrop-filter:none;-webkit-backdrop-filter:none}
.vmp-root.is-perf.theme-glass .vmp-queue{background:rgba(32,32,38,.92);backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none}

.vmp-root.theme-mini{background:#0a0a0b;--spice-text:#f4f4f5;--spice-subtext:#85858b;--spice-button:#f4f4f5;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI",var(--vmp-font,sans-serif)}
.vmp-root.theme-mini .vmp-aura{display:none}
.vmp-root.theme-mini .vmp-rim{box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
.vmp-root.theme-mini .vmp-bar{background:none;backdrop-filter:none;-webkit-backdrop-filter:none}
.vmp-root.theme-mini .vmp-title{font-weight:600;letter-spacing:-.005em}
.vmp-root.theme-mini .vmp-artist{font-size:1rem;letter-spacing:.12em}
.vmp-root.theme-mini .vmp-hole{background:#0a0a0b}
.vmp-root.theme-mini .vmp-btn:hover{background:rgba(255,255,255,.07)}
.vmp-root.theme-mini .vmp-btn.vmp-play{background:#f4f4f5;color:#0a0a0b}
.vmp-root.theme-mini .vmp-progress{height:max(2px,.2rem);background:rgba(255,255,255,.07)}
.vmp-root.theme-mini .vmp-progress:hover{height:max(4px,.5rem)}
.vmp-root.theme-mini .vmp-lyric{--ld:rgba(255,255,255,.26)}
.vmp-root.theme-mini .vmp-queue{margin:.2rem .8rem .8rem;border-radius:1.2rem;background:#121214;backdrop-filter:none;-webkit-backdrop-filter:none;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.vmp-root.is-perf.theme-mini{background:#0a0a0b}
.vmp-root.is-perf.theme-mini .vmp-queue{background:#121214}

.vmp-root.is-perf .vmp-vinyl{animation:none;box-shadow:none}
.vmp-root.is-perf .vmp-grooves,.vmp-root.is-perf .vmp-shine{display:none}
.vmp-root.is-perf *{transition:none!important;animation:none!important}
`;

    const TEMPLATE = `
<div class="vmp-aura"></div>
<div class="vmp-rim"></div>
<div class="vmp-bar">
  <div class="vmp-disc">
    <div class="vmp-vinyl"><img class="vmp-cover" alt=""><div class="vmp-grooves"></div></div>
    <div class="vmp-shine"></div>
    <div class="vmp-hole"></div>
    <svg class="vmp-arm" viewBox="0 0 100 100" aria-hidden="true"><g class="vmp-arm-g">
      <line x1="108" y1="8" x2="70" y2="50" stroke="#e2e2e2" stroke-width="3.2" stroke-linecap="round"/>
      <rect x="64" y="47" width="12" height="6" rx="2" fill="#cfcfcf" transform="rotate(132 70 50)"/>
      <circle cx="108" cy="8" r="7" fill="#9a9a9a" stroke="#222" stroke-width="1.5"/>
    </g></svg>
  </div>
  <div class="vmp-meta">
    <div class="vmp-title"><span></span></div>
    <div class="vmp-artist"><span></span></div>
    <div class="vmp-lyric"><span></span></div>
    <div class="vmp-credit"></div>
  </div>
  <div class="vmp-ctrls">
    <button class="vmp-btn vmp-like" data-act="like" aria-label="Save to Liked Songs"></button>
    <button class="vmp-btn" data-act="queue" aria-label="Queue">${svg("queue")}</button>
    <button class="vmp-btn vmp-prev" data-act="prev" aria-label="Previous">${svg("prev")}</button>
    <button class="vmp-btn vmp-play" data-act="play" aria-label="Play"><svg class="vmp-ic-play" viewBox="0 0 24 24">${ICONS.play}</svg><svg class="vmp-ic-pause" viewBox="0 0 24 24">${ICONS.pause}</svg></button>
    <button class="vmp-btn vmp-next" data-act="next" aria-label="Next">${svg("next")}</button>
    <button class="vmp-btn vmp-shuffle" data-act="shuffle" aria-label="Shuffle">${svg("shuffle")}</button>
    <button class="vmp-btn vmp-close" data-act="close" aria-label="Close mini player">${svg("close")}</button>
  </div>
  <div class="vmp-progress"><div class="vmp-bar-fill"></div></div>
</div>
<div class="vmp-queue">
  <div class="vmp-qhead"><span>Next up</span><span class="vmp-qhint">Drag to reorder · click to play now</span></div>
  <div class="vmp-qlist"></div>
</div>
<div class="vmp-toast"></div>`;

    let win = null, doc = null, root = null, els = null;
    let tick = null, toastTimer = null, opening = false;
    let qOpen = false, qExtra = 0, qTracks = [], qBusy = false, qDragFrom = -1, qFirstPaint = false;
    let lastKey = null, lastHeart = null, lastShuffle = null;
    let scale = 1, baseBarH = BAR_H, holdUntil = 0;
    let qHome = null, qShift = null, winDragging = false;
    let skipDir = 1, skipTimer = null;
    let sort = null, suppressClick = false;
    let curStack = false, layoutSig = null;
    let lastPlaying = null, spinAnim = null, spinRate = 0, spinTarget = 0, spinRaf = 0, spinLast = 0;
    let auraToken = 0, auraKey = "", tickWin = null;
    let metaHover = false, lyr = null, lyrIdx = -1, lyrToken = 0, lyricTimer = null, marqueeAnims = [];
    let lyrAnim = null, lyrSwapping = false;
    const lyricCache = new Map();

    const $ = sel => root.querySelector(sel);
    const mk = (tag, cls, text) => {
      const n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };
    const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const fadeIn = (node, dir = 0) => {
      if (settings.performance || !node || !node.animate) return;
      const from = dir ? `translateX(${dir * 1}rem)` : "translateY(.5rem)";
      node.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: "none" }],
        { duration: 480, easing: "cubic-bezier(.22,.61,.36,1)" });
    };

    function layout() {
      if (!win || !root) return;
      const w = win.innerWidth || BAR_W;
      const h = win.innerHeight || BAR_H;
      const holding = Date.now() < holdUntil;
      if (!qOpen && !holding) baseBarH = h;
      const aspect = w / baseBarH;
      const stack = curStack ? aspect < 1.85 : aspect < 1.5;
      const mini = settings.theme === "minimal";
      const glass = settings.theme === "tinted" || mini;
      const big = !!settings.bigVinyl;
      const card = glass || big;
      const sig = [stack, glass, mini, big].join();
      const animate = layoutSig !== null && sig !== layoutSig && !settings.performance;
      const targets = animate ? [els.disc, els.meta, els.ctrls] : [];
      const first = targets.map(t => t.getBoundingClientRect());

      curStack = stack;
      layoutSig = sig;
      scale = stack
        ? Math.max(0.7, Math.min(4, w / STACK_W, baseBarH / STACK_H))
        : Math.max(0.7, Math.min(4, w / BAR_W, baseBarH / BAR_H));
      doc.documentElement.style.fontSize = (10 * scale).toFixed(2) + "px";
      root.classList.toggle("stack", stack);
      root.classList.toggle("theme-glass", glass);
      root.classList.toggle("theme-mini", mini);
      root.classList.toggle("big", big);
      root.classList.toggle("card", card);
      const pad = card && !glass ? 10 * scale : 0;
      root.style.setProperty("--bar-h", qOpen || holding ? Math.max(40, baseBarH - 2 * pad) + "px" : "100%");
      const lw = w / scale;
      root.classList.toggle("no-shuffle", !stack && lw < 430);
      root.classList.toggle("no-like", !stack && lw < 370);
      root.classList.toggle("no-skip", !stack && lw < 330);

      targets.forEach((t, i) => {
        const r1 = first[i], r2 = t.getBoundingClientRect();
        if (!r2.width || !r2.height) return;
        const dx = r1.left - r2.left, dy = r1.top - r2.top;
        const k = t === els.disc ? r1.width / r2.width : 1;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(k - 1) < 0.01) return;
        t.animate([
          { transformOrigin: "0 0", transform: `translate(${dx}px,${dy}px) scale(${k})` },
          { transformOrigin: "0 0", transform: "none" }
        ], { duration: 600, easing: "cubic-bezier(.25,.8,.25,1)" });
      });
    }

    function pop(btn) {
      const act = btn.dataset.act;
      if (settings.performance || !els || act === "play" || act === "prev" || act === "next") return;
      const swell = (node, to, ms) => {
        if (node && node.animate) node.animate([{ scale: "1" }, { scale: String(to) }, { scale: "1" }],
          { duration: ms, easing: "cubic-bezier(.25,.8,.25,1)" });
      };
      swell(btn, 1.16, 520);
      swell(els.disc, 1.04, 560);
      swell(els.bar, 1.01, 480);
    }

    const SPIN = { slow: 8, "33": 60 / 33.33, "45": 60 / 45 };

    function applySettings() {
      if (!root) return;
      root.classList.toggle("is-perf", !!settings.performance);
      root.classList.toggle("has-arm", !!settings.tonearm);
      root.style.setProperty("--blur", (Number(settings.blur) || 0) + "px");
      root.style.setProperty("--tint", (Math.max(0, Math.min(100, Number(settings.tintStrength))) / 100 || 0).toFixed(2));
      root.classList.toggle("autohide", !!settings.autoHide);
      layout();
      auraKey = "";
      updateAura().catch(() => {});
      spinWant(!!lastPlaying);
      const uri = Spicetify.Player.data?.item?.uri || "";
      if (settings.lyrics && (!lyr || lyr.uri !== uri)) loadLyrics(uri);
      else updateLyric();
    }

    function toast(msg) {
      if (!els) return;
      els.toast.textContent = msg;
      els.toast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => els && els.toast.classList.remove("show"), 900);
    }

    function updateProgress() {
      const dur = Spicetify.Player.getDuration() || 0;
      const pos = Spicetify.Player.getProgress() || 0;
      els.fill.style.width = dur ? Math.min(100, (pos / dur) * 100).toFixed(2) + "%" : "0%";
    }

    const toImg = u => (u && u.startsWith("spotify:image:") ? "https://i.scdn.co/image/" + u.slice(14) : u || "");

    function normalize(t) {
      const ct = t.contextTrack || t;
      const md = ct.metadata || {};
      return {
        uri: ct.uri,
        uid: ct.uid,
        name: md.title || ct.name || "Unknown",
        artist: md.artist_name || (ct.artists || []).map(a => a.name).join(", "),
        img: toImg(md.image_small_url || md.image_url || "")
      };
    }

    const readQueue = () => ((Spicetify.Queue && Spicetify.Queue.nextTracks) || []).slice(0, Number(settings.queueSize) || 10).map(normalize).filter(t => t.uri);
    const sigOf = list => list.map(t => (t.uid || "") + t.uri).join("|");

    function paintQueue(list) {
      qTracks = list;
      els.qlist.dataset.sig = sigOf(list);
      els.qlist.replaceChildren();
      if (!list.length) {
        els.qlist.appendChild(mk("div", "vmp-qempty", "Nothing queued"));
        return;
      }
      list.forEach((t, i) => {
        const row = mk("div", "vmp-qrow" + (qFirstPaint ? " enter" : ""));
        row.dataset.i = i;
        row.style.setProperty("--i", i);
        const grip = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
        grip.setAttribute("viewBox", "0 0 24 24");
        grip.setAttribute("class", "vmp-grip");
        grip.innerHTML = ICONS.grip;
        const img = mk("img");
        img.alt = "";
        img.draggable = false;
        img.src = t.img;
        const text = mk("div", "vmp-qtext");
        text.append(mk("div", "vmp-qname", t.name), mk("div", "vmp-qartist", t.artist));
        const actions = mk("div", "vmp-qact");
        const nextBtn = mk("button", "vmp-btn");
        nextBtn.dataset.qact = "top";
        nextBtn.title = "Play next";
        nextBtn.innerHTML = svg("up");
        const rmBtn = mk("button", "vmp-btn");
        rmBtn.dataset.qact = "remove";
        rmBtn.title = "Remove from queue";
        rmBtn.innerHTML = svg("close");
        actions.append(nextBtn, rmBtn);
        row.append(grip, img, text, actions);
        els.qlist.appendChild(row);
      });
      qFirstPaint = false;
    }

    function renderQueue(force) {
      if (!els || !qOpen || qBusy || qDragFrom >= 0) return;
      const list = readQueue();
      if (!force && els.qlist.dataset.sig === sigOf(list)) return;
      paintQueue(list);
    }

    const ref = t => ({ uri: t.uri, uid: t.uid });

    async function moveTrack(from, to) {
      if (from === to || from < 0 || to < 0 || from >= qTracks.length || to >= qTracks.length) return;
      qBusy = true;
      const list = qTracks.slice();
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      paintQueue(list);
      const expected = list.map(t => t.uri).join("|");
      try {
        const api = Spicetify.Platform && Spicetify.Platform.PlayerAPI;
        if (api && typeof api.reorderQueue === "function") {
          const before = list[to + 1];
          const after = list[to - 1];
          await api.reorderQueue([ref(item)], before ? { before: ref(before) } : { after: ref(after) });
        }
      } catch (err) {
        console.warn("[vinyl-mini-player] reorderQueue failed", err);
      }
      await sleep(350);
      let actual = readQueue().map(t => t.uri).join("|");
      if (actual !== expected) {
        try {
          await Spicetify.removeFromQueue(list.map(ref));
          await Spicetify.addToQueue(list.map(t => ({ uri: t.uri })));
          await sleep(350);
        } catch (err) {
          console.warn("[vinyl-mini-player] queue rebuild failed", err);
        }
      }
      qBusy = false;
      renderQueue(true);
    }

    async function removeTrack(i) {
      const t = qTracks[i];
      if (!t) return;
      qBusy = true;
      const list = qTracks.slice();
      list.splice(i, 1);
      paintQueue(list);
      try { await Spicetify.removeFromQueue([ref(t)]); } catch (err) { console.warn("[vinyl-mini-player] remove failed", err); }
      await sleep(250);
      qBusy = false;
      renderQueue(true);
    }

    async function playNow(i) {
      if (i > 0) await moveTrack(i, 0);
      Spicetify.Player.next();
    }

    function setQueueOpen(open) {
      if (!els || open === qOpen) return;
      qOpen = open;
      els.queueBtn.classList.toggle("vmp-active", open);
      if (open) {
        qHome = { x: win.screenX, y: win.screenY };
        qShift = null;
        baseBarH = win.innerHeight || BAR_H;
        holdUntil = 0;
        root.classList.add("has-queue");
        layout();
        qExtra = Math.round(QUEUE_H * scale);
        try { win.resizeBy(0, qExtra); } catch (_) { qExtra = 0; }
        qFirstPaint = true;
        els.qlist.dataset.sig = "";
        renderQueue(true);
        win.requestAnimationFrame(() => win.requestAnimationFrame(() => root && root.classList.add("q-open")));
        const w = win;
        setTimeout(() => {
          if (win === w && qOpen && qHome) qShift = { x: w.screenX - qHome.x, y: w.screenY - qHome.y };
        }, 250);
      } else {
        root.classList.remove("q-open");
        const w = win;
        const shift = qShift || (qHome ? { x: w.screenX - qHome.x, y: w.screenY - qHome.y } : null);
        const tx = shift ? w.screenX - shift.x : null;
        const ty = shift ? w.screenY - shift.y : null;
        holdUntil = Date.now() + 450;
        layout();
        if (qExtra) { try { w.resizeBy(0, -qExtra); } catch (_) {} qExtra = 0; }
        if (shift) {
          const back = () => {
            if (win === w && !qOpen && !winDragging) { try { w.moveTo(tx, ty); } catch (_) {} }
          };
          back();
          setTimeout(back, 120);
          setTimeout(back, 350);
        }
        setTimeout(() => { if (win === w) layout(); }, 480);
        setTimeout(() => { if (root && !qOpen) root.classList.remove("has-queue"); }, 240);
      }
    }

    function marqueeOn() {
      if (!els || settings.performance) return;
      [els.titleBox, els.artistBox].forEach(box => {
        const span = box && box.firstElementChild;
        if (!span || !span.animate || !box.offsetWidth) return;
        box.style.textOverflow = "clip";
        span.style.display = "inline-block";
        const ov = span.offsetWidth - box.clientWidth;
        if (ov > 2) {
          marqueeAnims.push(span.animate([
            { transform: "translateX(0)" },
            { transform: "translateX(0)", offset: 0.15 },
            { transform: `translateX(${-ov}px)`, offset: 0.85 },
            { transform: `translateX(${-ov}px)` }
          ], { duration: Math.max(3600, ov * 45 + 2600), iterations: Infinity, direction: "alternate", easing: "ease-in-out" }));
        } else {
          box.style.textOverflow = "";
          span.style.display = "";
        }
      });
    }

    function marqueeOff() {
      marqueeAnims.forEach(a => { try { a.cancel(); } catch (_) {} });
      marqueeAnims = [];
      if (!els) return;
      [els.titleBox, els.artistBox].forEach(box => {
        if (!box) return;
        box.style.textOverflow = "";
        if (box.firstElementChild) box.firstElementChild.style.display = "";
      });
    }

    async function fetchSpicy(id) {
      const key = String(settings.spicyKey || "").trim();
      if (!key) return null;
      if (/^sl_sk_/.test(key)) { console.warn("[vinyl-mini-player] secret Spicy Lyrics keys (sl_sk_) must not be used in a client; use a publishable sl_pk_ key"); return null; }
      const res = await fetch(`https://api.spicylyrics.org/v1/lyrics/${id}`, { headers: { Authorization: "Bearer " + key } });
      if (!res.ok) { console.info("[vinyl-mini-player] Spicy Lyrics answered", res.status); return null; }
      const data = await res.json();
      const body = (data && data.Body) || data;
      if (!body || !Array.isArray(body.Content)) return null;
      const lines = [];
      if (body.Type === "Line") {
        body.Content.forEach(c => { if (c && c.Text != null) lines.push({ t: Math.round((Number(c.StartTime) || 0) * 1000), w: String(c.Text).trim() }); });
      } else if (body.Type === "Syllable") {
        body.Content.forEach(c => {
          const lead = c && c.Lead;
          if (!lead || !Array.isArray(lead.Syllables)) return;
          let text = "";
          lead.Syllables.forEach(sy => { text += String(sy.Text || "") + (sy.IsPartOfWord ? "" : " "); });
          lines.push({ t: Math.round((Number(lead.StartTime) || 0) * 1000), w: text.replace(/\s+/g, " ").trim() });
        });
      } else return null;
      if (!lines.length) return null;
      lines.sort((x, y) => x.t - y.t);
      const credit = { name: "Spicy Lyrics", via: [] };
      const src = body.source;
      if (src === "spicy_lyrics" && body.UploadAttribution) {
        const ua = body.UploadAttribution;
        if (ua.Uploader) credit.via.push({ label: "·", n: ua.Uploader.username, url: ua.Uploader.url });
        if (ua.Maker) credit.via.push({ label: "&", n: ua.Maker.username, url: ua.Maker.url });
      } else {
        const names = { apple_music: "Apple Music", spotify: "Spotify" };
        credit.from = names[src] || "unknown source";
      }
      return { lines, credit };
    }

    async function fetchSpotifyLyrics(id) {
      const body = await Spicetify.CosmosAsync.get(`https://spclient.wg.spotify.com/color-lyrics/v2/track/${id}?format=json&vocalRemoval=false&market=from_token`);
      const l = body && body.lyrics;
      if (l && l.syncType === "LINE_SYNCED" && Array.isArray(l.lines)) {
        return { lines: l.lines.map(x => ({ t: Number(x.startTimeMs) || 0, w: String(x.words || "").trim() })), credit: { name: "Spotify", via: [] } };
      }
      return null;
    }

    function parseLrc(text) {
      const out = [];
      String(text || "").split(/\r?\n/).forEach(row => {
        const stamps = [...row.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
        if (!stamps.length) return;
        const w = row.slice(row.lastIndexOf("]") + 1).trim();
        stamps.forEach(m => out.push({ t: Math.round((Number(m[1]) * 60 + Number(m[2])) * 1000), w }));
      });
      return out.sort((x, y) => x.t - y.t);
    }

    async function fetchLrclib(item) {
      const meta = item.metadata || {};
      const name = item.name || meta.title || "";
      const artist = ((item.artists || [])[0] || {}).name || meta.artist_name || "";
      if (!name) return null;
      const album = (item.album && item.album.name) || meta.album_title || "";
      const dur = Math.round(((item.duration && item.duration.milliseconds) || Number(meta.duration) || 0) / 1000);
      const q = new URLSearchParams({ track_name: name, artist_name: artist });
      if (album) q.set("album_name", album);
      if (dur) q.set("duration", dur);
      const res = await fetch("https://lrclib.net/api/get?" + q);
      let data = res.ok ? await res.json() : null;
      if (!data || !data.syncedLyrics) {
        q.delete("album_name");
        q.delete("duration");
        const r = await fetch("https://lrclib.net/api/search?" + q);
        const list = r.ok ? await r.json() : [];
        data = (Array.isArray(list) ? list : [])
          .filter(x => x.syncedLyrics && (!dur || Math.abs((x.duration || 0) - dur) <= 4))
          .sort((x, y) => Math.abs((x.duration || 0) - dur) - Math.abs((y.duration || 0) - dur))[0] || null;
      }
      const lines = data && data.syncedLyrics ? parseLrc(data.syncedLyrics) : [];
      return lines.length ? { lines, credit: { name: "LRCLIB", via: [] } } : null;
    }

    async function loadLyrics(uri) {
      lyr = null;
      lyrIdx = -1;
      const token = ++lyrToken;
      if (!settings.lyrics || !uri || !uri.startsWith("spotify:track:")) { updateLyric(); return; }
      const ck = `${uri}|${settings.lyricsSource}|${settings.spicyKey ? 1 : 0}`;
      if (lyricCache.has(ck)) { lyr = lyricCache.get(ck); updateLyric(); return; }
      const item = (Spicetify.Player.data && Spicetify.Player.data.item) || {};
      const id = uri.split(":")[2];
      const sources = { spicy: () => fetchSpicy(id), lrclib: () => fetchLrclib(item), spotify: () => fetchSpotifyLyrics(id) };
      const order = ["spicy", "lrclib", "spotify"];
      const first = order.indexOf(settings.lyricsSource);
      if (first > 0) order.unshift(order.splice(first, 1)[0]);
      let res = null;
      for (const name of order) {
        try { res = await sources[name](); } catch (err) { console.info(`[vinyl-mini-player] ${name} lyrics failed`, err); }
        if (res || token !== lyrToken) break;
      }
      if (token !== lyrToken) return;
      const entry = { uri, lines: res ? res.lines : [], credit: res ? res.credit : null };
      lyricCache.set(ck, entry);
      if (lyricCache.size > 30) lyricCache.delete(lyricCache.keys().next().value);
      lyr = entry;
      lyrIdx = -1;
      updateLyric();
    }

    function setCredit(c) {
      if (!els || !els.credit) return;
      const key = c ? JSON.stringify(c) : "";
      if (els.credit.dataset.k === key) return;
      els.credit.dataset.k = key;
      els.credit.textContent = "";
      els.credit.classList.toggle("on", !!c);
      if (!c) return;
      const add = t => els.credit.appendChild(document.createTextNode(t));
      add(c.name);
      if (c.from) add(" · " + c.from);
      c.via.forEach(v => {
        add(" " + v.label + " ");
        if (v.url && /^https:\/\//.test(v.url)) {
          const a = document.createElement("a");
          a.href = v.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = v.n || "user";
          els.credit.appendChild(a);
        } else add(v.n || "user");
      });
    }

    function setLyricText(text) {
      if (!els || els.lyric.dataset.t === text) return;
      els.lyric.dataset.t = text;
      const box = els.lyricBox, span = els.lyric;
      if (lyrAnim) { try { lyrAnim.cancel(); } catch (_) {} lyrAnim = null; }
      const commit = () => {
        if (lyrAnim) { try { lyrAnim.cancel(); } catch (_) {} lyrAnim = null; }
        lyrSwapping = false;
        if (!els) return;
        span.textContent = text;
        span.style.transition = "none";
        span.style.setProperty("--p", "0%");
        span.style.setProperty("--sx", "0px");
        box.style.setProperty("--ml", "0px");
        box.style.setProperty("--mr", "0px");
        void span.offsetWidth;
        span.style.transition = "";
        if (!text || settings.performance || !box.animate) return;
        lyrAnim = box.animate([
          { opacity: 0, transform: "translateY(.7rem)", filter: "blur(.5rem)" },
          { opacity: 1, transform: "none", filter: "blur(0)" }
        ], { duration: 560, easing: "cubic-bezier(.22,.61,.36,1)" });
      };
      if (!span.textContent || settings.performance || !box.animate) { commit(); return; }
      lyrSwapping = true;
      lyrAnim = box.animate([
        { opacity: 1, transform: "none", filter: "blur(0)" },
        { opacity: 0, transform: "translateY(-.6rem)", filter: "blur(.45rem)" }
      ], { duration: 220, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
      lyrAnim.onfinish = commit;
    }

    function updateLyric() {
      if (!els || !root) return;
      const uri = Spicetify.Player.data?.item?.uri || "";
      const show = !!(settings.lyrics && lyr && lyr.uri === uri && lyr.lines.length);
      root.classList.toggle("has-lyrics", show);
      setCredit(show ? lyr.credit : null);
      if (!show) { setLyricText(""); lyrIdx = -1; return; }
      const lines = lyr.lines;
      const pos = (Spicetify.Player.getProgress() || 0) + 150 + (Number(settings.lyricOffset) || 0);
      let i = lyrIdx;
      if (i < 0 || i >= lines.length || lines[i].t > pos) i = -1;
      while (i + 1 < lines.length && lines[i + 1].t <= pos) i++;
      if (i !== lyrIdx) {
        lyrIdx = i;
        setLyricText(i >= 0 ? (lines[i].w || "♪") : "");
      }
      if (i >= 0 && !lyrSwapping) {
        const t0 = lines[i].t;
        const t1 = i + 1 < lines.length ? lines[i + 1].t : t0 + 5000;
        const span = Math.max(800, Math.min(t1 - t0, 9000)) * 0.9;
        const real = Math.max(0, Math.min(1, (pos - t0) / span));
        const p = settings.performance ? 1 : real;
        els.lyric.style.setProperty("--p", (p * 100).toFixed(1) + "%");
        const bw = els.lyricBox.clientWidth, tw = els.lyric.offsetWidth, ov = tw - bw;
        let sx = 0;
        if (ov > 2) sx = Math.min(ov, Math.max(0, real * tw - bw * 0.55));
        const fade = Math.min(bw * 0.12, 16);
        els.lyric.style.setProperty("--sx", (-sx).toFixed(1) + "px");
        els.lyricBox.style.setProperty("--ml", (ov > 2 && sx > 1 ? fade : 0).toFixed(1) + "px");
        els.lyricBox.style.setProperty("--mr", (ov > 2 && sx < ov - 1 ? fade : 0).toFixed(1) + "px");
      }
    }

    function spinInit() {
      if (!els || !els.vinyl.animate) return;
      spinAnim = els.vinyl.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 8000, iterations: Infinity });
      spinAnim.pause();
      spinRate = 0;
    }

    function spinStep(ts) {
      spinRaf = 0;
      if (!spinAnim || !win) return;
      const dt = spinLast ? Math.min(0.1, Math.max(0.001, (ts - spinLast) / 1000)) : 0.016;
      spinLast = ts;
      spinRate += (spinTarget - spinRate) * (1 - Math.exp(-dt / 0.22));
      if (Math.abs(spinTarget - spinRate) < 0.004) spinRate = spinTarget;
      if (spinRate > 0) {
        if (spinAnim.playState !== "running") spinAnim.play();
        spinAnim.playbackRate = spinRate;
      } else if (spinAnim.playState === "running") {
        spinAnim.pause();
      }
      if (spinRate !== spinTarget) spinRaf = win.requestAnimationFrame(spinStep);
    }

    function spinWant(on) {
      if (!els || !win) return;
      if (!spinAnim || spinAnim.playState === "idle") spinInit();
      if (!spinAnim) return;
      if (settings.performance) {
        spinTarget = 0;
        spinRate = 0;
        if (spinAnim.playState === "running") spinAnim.pause();
        return;
      }
      spinTarget = on ? 8 / (SPIN[settings.rpm] || 8) : 0;
      if (!spinRaf && spinRate !== spinTarget) {
        spinLast = 0;
        spinRaf = win.requestAnimationFrame(spinStep);
      }
    }

    const hexToRgb = h => {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(h || "").trim());
      if (!m) return null;
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const shade = (c, f) => c.map(v => Math.max(0, Math.min(255, Math.round(v * f))));
    const rgbCss = c => `rgb(${c[0]},${c[1]},${c[2]})`;

    function sampleCover(src) {
      return new Promise(resolve => {
        if (!src) return resolve(null);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try {
            const c = document.createElement("canvas");
            c.width = c.height = 16;
            const g = c.getContext("2d", { willReadFrequently: true });
            g.drawImage(img, 0, 0, 16, 16);
            const d = g.getImageData(0, 0, 16, 16).data;
            const buckets = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
            for (let i = 0; i < d.length; i += 4) {
              const r = d[i], gg = d[i + 1], b = d[i + 2];
              const max = Math.max(r, gg, b), min = Math.min(r, gg, b);
              const sat = max ? (max - min) / max : 0;
              const w = sat * (max / 255) + 0.02;
              let hue = 0;
              if (max !== min) {
                if (max === r) hue = ((gg - b) / (max - min) + 6) % 6;
                else if (max === gg) hue = (b - r) / (max - min) + 2;
                else hue = (r - gg) / (max - min) + 4;
              }
              const k = buckets[Math.floor(hue * 2) % 12];
              k.w += w; k.r += r * w; k.g += gg * w; k.b += b * w;
            }
            const top = buckets.filter(k => k.w > 0).sort((x, y) => y.w - x.w).map(k => [k.r / k.w, k.g / k.w, k.b / k.w].map(Math.round));
            resolve(top.length ? [top[0], top[1] || shade(top[0], 0.6)] : null);
          } catch (_) { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = src;
      });
    }

    async function updateAura() {
      if (!root || settings.performance || settings.theme !== "tinted") return;
      const setAura = (a, b) => {
        root.style.setProperty("--aura-a", rgbCss(a));
        root.style.setProperty("--aura-b", rgbCss(b));
      };
      if (settings.tintMode === "custom") {
        const c = hexToRgb(settings.tintColor) || [106, 124, 255];
        auraKey = "custom:" + settings.tintColor;
        setAura(shade(c, 0.85), shade(c, 0.4));
        return;
      }
      const item = Spicetify.Player.data?.item || {};
      const uri = item.uri || "";
      const key = "auto:" + uri;
      if (key === auraKey) return;
      auraKey = key;
      const token = ++auraToken;
      let a = null, b = null;
      try {
        if (uri && Spicetify.colorExtractor) {
          const pal = await Spicetify.colorExtractor(uri);
          if (pal) {
            a = hexToRgb(pal.VIBRANT || pal.PROMINENT || pal.LIGHT_VIBRANT || pal.MUTED);
            b = hexToRgb(pal.DARK_VIBRANT || pal.DARK_MUTED || pal.DESATURATED || pal.PROMINENT);
          }
        }
      } catch (_) {}
      if (!a) {
        const meta = item.metadata || {};
        const pair = await sampleCover(toImg(meta.image_large_url || meta.image_url || ""));
        if (pair) [a, b] = pair;
      }
      if (token !== auraToken || !root) return;
      a = a || [70, 80, 120];
      b = b || shade(a, 0.5);
      setAura(shade(a, 0.72), shade(b, 0.55));
    }

    function syncPlaying(playing) {
      root.classList.toggle("is-playing", playing);
      const plabel = playing ? "Pause" : "Play";
      if (els.play.getAttribute("aria-label") !== plabel) els.play.setAttribute("aria-label", plabel);
      lastPlaying = playing;
      spinWant(playing);
    }

    function render() {
      if (!root || !els) return;
      let playing = false;
      try { playing = !!Spicetify.Player.isPlaying(); } catch (_) {}
      try { syncPlaying(playing); } catch (err) { console.warn("[vinyl-mini-player] spin sync failed", err); }
      try { renderTrack(); } catch (err) { console.warn("[vinyl-mini-player] render failed", err); }
    }

    function renderTrack() {
      const item = Spicetify.Player.data?.item || {};
      const meta = item.metadata || {};
      const title = item.name || meta.title || "Nothing playing";
      const artist = (item.artists || []).map(a => a.name).join(", ") || meta.artist_name || "";
      const cover = meta.image_xlarge_url || meta.image_large_url || meta.image_url || item.album?.images?.[0]?.url || "";
      const key = (item.uri || "") + "|" + title;

      const textChanged = els.title.textContent !== title || els.artist.textContent !== artist;
      setText(els.title, title);
      setText(els.artist, artist);
      if (textChanged && metaHover) { marqueeOff(); marqueeOn(); }
      if (els.cover.dataset.src !== cover) {
        els.cover.dataset.src = cover;
        els.cover.src = toImg(cover);
        els.cover.style.visibility = cover ? "visible" : "hidden";
      }
      if (lastKey !== null && key !== lastKey) { fadeIn(els.meta, skipDir); fadeIn(els.disc, skipDir); }
      if (key !== lastKey) { updateAura().catch(() => {}); loadLyrics(item.uri || ""); }
      lastKey = key;

      let heart = false;
      try { heart = !!Spicetify.Player.getHeart(); } catch (_) {}
      if (heart !== lastHeart) {
        els.like.innerHTML = svg(heart ? "likeOn" : "likeOff");
        els.like.classList.toggle("vmp-active", heart);
        els.like.setAttribute("aria-label", heart ? "Remove from Liked Songs" : "Save to Liked Songs");
        if (lastHeart !== null && !settings.performance && els.like.animate) {
          els.like.animate([{ transform: "scale(.88)" }, { transform: "scale(1.1)" }, { transform: "scale(1)" }], { duration: 420, easing: "ease-out" });
        }
        lastHeart = heart;
      }

      let shuf = false;
      try { shuf = !!Spicetify.Player.getShuffle(); } catch (_) {}
      if (shuf !== lastShuffle) {
        els.shuffle.classList.toggle("vmp-active", shuf);
        els.shuffle.setAttribute("aria-label", shuf ? "Shuffle on" : "Shuffle");
        lastShuffle = shuf;
      }

      updateProgress();
      renderQueue(false);
    }

    function act(name) {
      const P = Spicetify.Player;
      if (name === "prev" || name === "next") {
        skipDir = name === "next" ? 1 : -1;
        clearTimeout(skipTimer);
        skipTimer = setTimeout(() => { skipDir = 1; }, 2500);
      }
      if (name === "prev") P.back();
      else if (name === "next") P.next();
      else if (name === "play") {
        root.classList.toggle("is-playing");
        P.togglePlay();
        return;
      }
      else if (name === "queue") { setQueueOpen(!qOpen); return; }
      else if (name === "like") P.toggleHeart();
      else if (name === "shuffle") P.toggleShuffle();
      else if (name === "close") { win.close(); return; }
      setTimeout(render, 120);
    }

    function detach() {
      try { if (tickWin) { tickWin.clearInterval(tick); tickWin.clearInterval(lyricTimer); } } catch (_) {}
      lyricTimer = null;
      metaHover = false;
      marqueeAnims = [];
      lyr = null;
      lyrIdx = -1;
      lyrToken++;
      lyrAnim = null;
      lyrSwapping = false;
      tick = null;
      tickWin = null;
      if (spinAnim) { try { spinAnim.cancel(); } catch (_) {} }
      spinAnim = null;
      spinRate = spinTarget = 0;
      spinRaf = 0;
      lastPlaying = null;
      auraToken++;
      auraKey = "";
      clearTimeout(toastTimer);
      win = doc = root = els = null;
      qOpen = false;
      qExtra = 0;
      qBusy = false;
      qDragFrom = -1;
      sort = null;
      winDragging = false;
      qHome = qShift = null;
      baseBarH = BAR_H;
      holdUntil = 0;
      curStack = false;
      layoutSig = null;
      clearTimeout(skipTimer);
      skipDir = 1;
      lastKey = lastHeart = lastShuffle = null;
    }

    function attach(target) {
      win = target;
      doc = target.document;
      target.addEventListener("pagehide", () => { saveWin(); detach(); });

      doc.title = "Vinyl Mini Player";
      doc.documentElement.className = document.documentElement.className;
      doc.body.className = document.body.className;

      for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
        doc.head.appendChild(node.cloneNode(true));
      }
      const own = doc.createElement("style");
      own.textContent = CSS;
      doc.head.appendChild(own);

      const computed = getComputedStyle(document.body);
      doc.body.style.margin = "0";
      doc.body.style.overflow = "hidden";
      doc.body.style.fontFamily = computed.fontFamily;
      doc.body.style.color = computed.color;
      doc.documentElement.style.background = "#0b0b0f";

      root = doc.createElement("div");
      root.className = "vmp-root";
      root.innerHTML = TEMPLATE;
      root.style.setProperty("--vmp-font", computed.fontFamily);
      doc.body.appendChild(root);

      els = {
        bar: $(".vmp-bar"),
        ctrls: $(".vmp-ctrls"),
        vinyl: $(".vmp-vinyl"),
        aura: $(".vmp-aura"),
        disc: $(".vmp-disc"),
        meta: $(".vmp-meta"),
        cover: $(".vmp-cover"),
        title: $(".vmp-title span"),
        artist: $(".vmp-artist span"),
        lyric: $(".vmp-lyric span"),
        titleBox: $(".vmp-title"),
        artistBox: $(".vmp-artist"),
        lyricBox: $(".vmp-lyric"),
        credit: $(".vmp-credit"),
        progress: $(".vmp-progress"),
        fill: $(".vmp-bar-fill"),
        play: $('[data-act="play"]'),
        like: $('[data-act="like"]'),
        shuffle: $('[data-act="shuffle"]'),
        queueBtn: $('[data-act="queue"]'),
        qlist: $(".vmp-qlist"),
        toast: $(".vmp-toast")
      };

      els.disc.addEventListener("wheel", e => {
        e.preventDefault();
        const step = e.shiftKey ? 0.01 : (Number(settings.scrollStep) || 5) / 100;
        const dir = e.deltaY || e.deltaX;
        const cur = Spicetify.Player.getVolume() ?? 0.5;
        const next = Math.min(1, Math.max(0, cur + (dir < 0 ? step : -step)));
        Spicetify.Player.setVolume(next);
        toast(`Volume ${Math.round(next * 100)}%`);
      }, { passive: false });

      root.addEventListener("click", e => {
        if (suppressClick) { suppressClick = false; return; }
        const btn = e.target.closest("button[data-act]");
        if (btn) { if (btn.dataset.act !== "close") pop(btn); act(btn.dataset.act); return; }

        const row = e.target.closest(".vmp-qrow");
        if (!row) return;
        const i = Number(row.dataset.i);
        const qa = e.target.closest("button[data-qact]");
        if (qa) {
          if (qa.dataset.qact === "top") moveTrack(i, 0);
          else if (qa.dataset.qact === "remove") removeTrack(i);
          return;
        }
        playNow(i);
      });

      els.progress.addEventListener("click", e => {
        const r = els.progress.getBoundingClientRect();
        const dur = Spicetify.Player.getDuration();
        if (dur) Spicetify.Player.seek(Math.round(((e.clientX - r.left) / r.width) * dur));
      });

      const sortLayout = () => {
        const q = sort;
        if (!q || !q.active || q.ending) return;
        const list = els.qlist;
        const r = list.getBoundingClientRect();
        const edge = 32;
        let v = 0;
        if (q.cy < r.top + edge) v = -Math.min(1, (r.top + edge - q.cy) / edge) * 12;
        else if (q.cy > r.bottom - edge) v = Math.min(1, (q.cy - (r.bottom - edge)) / edge) * 12;
        if (v) list.scrollTop += v;
        const raw = (q.cy - q.sy) + (list.scrollTop - q.scroll0);
        const dy = Math.max(q.firstTop - q.top0, Math.min(q.firstTop + (q.n - 1) * q.stride - q.top0, raw));
        const to = Math.max(0, Math.min(q.n - 1, Math.round((q.top0 + dy - q.firstTop) / q.stride)));
        q.to = to;
        q.row.style.transform = `translateY(${dy}px) scale(1.02)`;
        for (let j = 0; j < q.n; j++) {
          if (j === q.from) continue;
          let shift = 0;
          if (q.from < to && j > q.from && j <= to) shift = -q.stride;
          else if (q.from > to && j >= to && j < q.from) shift = q.stride;
          if (q.cur[j] !== shift) {
            q.cur[j] = shift;
            q.rows[j].style.transform = shift ? `translateY(${shift}px)` : "";
          }
        }
      };
      const sortLoop = () => {
        if (!sort || !sort.active || sort.ending) return;
        sortLayout();
        sort.raf = target.requestAnimationFrame(sortLoop);
      };
      const sortBegin = q => {
        q.active = true;
        q.n = q.rows.length;
        q.top0 = q.row.offsetTop;
        q.firstTop = q.rows[0].offsetTop;
        q.stride = (q.rows[1].offsetTop - q.rows[0].offsetTop) || 1;
        qDragFrom = q.from;
        els.qlist.classList.add("sorting");
        q.row.classList.add("is-drag");
        try { els.qlist.setPointerCapture(q.id); } catch (_) {}
        q.raf = target.requestAnimationFrame(sortLoop);
      };
      const sortEnd = e => {
        const q = sort;
        if (!q || q.ending || (e && e.pointerId !== q.id)) return;
        if (!q.active) { sort = null; return; }
        q.ending = true;
        if (q.raf) target.cancelAnimationFrame(q.raf);
        q.raf = 0;
        try { els.qlist.releasePointerCapture(q.id); } catch (_) {}
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 80);
        q.row.classList.add("settle");
        q.row.style.transform = `translateY(${(q.to - q.from) * q.stride}px)`;
        setTimeout(() => {
          if (sort !== q) return;
          sort = null;
          qDragFrom = -1;
          if (!els) return;
          els.qlist.classList.remove("sorting");
          q.rows.forEach(n => { n.style.transform = ""; n.classList.remove("is-drag", "settle"); });
          if (q.to !== q.from) moveTrack(q.from, q.to);
        }, 270);
      };
      els.qlist.addEventListener("pointerdown", e => {
        if (e.button !== 0 || qBusy || sort) return;
        const row = e.target.closest && e.target.closest(".vmp-qrow");
        if (!row || e.target.closest("button")) return;
        const rows = [...els.qlist.querySelectorAll(".vmp-qrow")];
        if (rows.length < 2) return;
        const from = rows.indexOf(row);
        sort = { id: e.pointerId, row, rows, from, to: from, sy: e.clientY, cy: e.clientY,
                 scroll0: els.qlist.scrollTop, active: false, ending: false, raf: 0, cur: [] };
      });
      els.qlist.addEventListener("pointermove", e => {
        const q = sort;
        if (!q || e.pointerId !== q.id || q.ending) return;
        q.cy = e.clientY;
        if (!q.active && Math.abs(e.clientY - q.sy) >= 5) sortBegin(q);
      });
      els.qlist.addEventListener("pointerup", sortEnd);
      els.qlist.addEventListener("pointercancel", sortEnd);

      doc.addEventListener("keydown", e => {
        if (e.key === "Escape") setQueueOpen(false);
      });

      let hovering = false;
      const setHover = v => {
        if (!root || hovering === v) return;
        hovering = v;
        root.classList.toggle("hover", v);
      };
      doc.addEventListener("mousemove", () => setHover(true));
      doc.addEventListener("mouseover", () => setHover(true));
      doc.documentElement.addEventListener("mouseleave", () => { if (!drag) setHover(false); });
      doc.addEventListener("mouseout", e => { if (!e.relatedTarget && !drag) setHover(false); });

      let drag = null, dragRaf = 0, dragPos = null;
      root.addEventListener("pointerdown", e => {
        if (e.button !== 0 || e.target.closest("button, .vmp-progress, .vmp-queue")) return;
        drag = { id: e.pointerId, sx: e.screenX, sy: e.screenY, wx: win.screenX, wy: win.screenY, moved: false, frames: 0, warned: false };
      });
      root.addEventListener("pointermove", e => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.screenX - drag.sx;
        const dy = e.screenY - drag.sy;
        if (!drag.moved) {
          if (Math.abs(dx) + Math.abs(dy) < 4) return;
          drag.moved = true;
          winDragging = true;
          try { root.setPointerCapture(e.pointerId); } catch (_) {}
          root.classList.add("dragging-win");
        }
        dragPos = { x: drag.wx + dx, y: drag.wy + dy };
        if (dragRaf) return;
        dragRaf = win.requestAnimationFrame(() => {
          dragRaf = 0;
          if (!drag || !dragPos) return;
          try { win.moveTo(dragPos.x, dragPos.y); } catch (_) {}
          if (!drag.warned && ++drag.frames === 8 && Math.hypot(dragPos.x - drag.wx, dragPos.y - drag.wy) > 30 &&
              Math.abs(win.screenX - drag.wx) < 2 && Math.abs(win.screenY - drag.wy) < 2) {
            drag.warned = true;
            toast("This window can't be moved by dragging");
          }
        });
      });
      const endDrag = e => {
        if (!drag || (e && e.pointerId !== drag.id)) return;
        try { root.releasePointerCapture(drag.id); } catch (_) {}
        drag = null;
        dragPos = null;
        winDragging = false;
        root.classList.remove("dragging-win");
        saveWin();
      };
      root.addEventListener("pointerup", endDrag);
      root.addEventListener("pointercancel", endDrag);

      let saveTimer = 0;
      target.addEventListener("resize", () => {
        layout();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveWin, 400);
      });
      spinInit();
      applySettings();
      render();
      els.meta.addEventListener("mouseenter", () => { metaHover = true; marqueeOn(); });
      els.meta.addEventListener("mouseleave", () => { metaHover = false; marqueeOff(); });
      root.classList.add("peek");
      setTimeout(() => { if (root) root.classList.remove("peek"); }, 2600);
      tickWin = target;
      tick = target.setInterval(render, 500);
      lyricTimer = target.setInterval(updateLyric, 250);
    }

    async function openPlayer() {
      if (opening) return;
      if (win && !win.closed) {
        win.focus();
        return;
      }
      opening = true;
      try {
        let target = null;
        const size = winState && winState.w >= 100 && winState.h >= 40
          ? { width: Math.min(3000, Math.round(winState.w)), height: Math.min(3000, Math.round(winState.h)) }
          : { width: BAR_W, height: BAR_H };
        if (window.documentPictureInPicture) {
          try {
            target = await window.documentPictureInPicture.requestWindow(size);
          } catch (err) {
            console.warn("[vinyl-mini-player] Picture-in-Picture unavailable, using a pop-up window", err);
          }
        }
        if (!target) target = window.open("", "vinyl-mini-player", `popup=yes,width=${size.width},height=${size.height}${winState ? `,left=${Math.round(winState.x)},top=${Math.round(winState.y)}` : ""}`);
        if (!target) {
          Spicetify.showNotification("Allow pop-ups so the mini player can open", true);
          return;
        }
        attach(target);
        restorePos(target);
      } finally {
        opening = false;
      }
    }

    function saveWin() {
      if (!win || win.closed || Date.now() < holdUntil + 300) return;
      try {
        const w = win.innerWidth, h = Math.round(win.innerHeight - (qOpen ? qExtra : 0));
        if (w < 100 || h < 40) return;
        const pos = qOpen && qHome ? qHome : { x: win.screenX, y: win.screenY };
        winState = { w, h, x: pos.x, y: pos.y };
        Spicetify.LocalStorage.set(WIN_KEY, JSON.stringify(winState));
      } catch (_) {}
    }

    function restorePos(target) {
      if (!winState || !Number.isFinite(winState.x) || !Number.isFinite(winState.y)) return;
      const x = Math.max(-(winState.w - 80), Math.round(winState.x)), y = Math.max(0, Math.round(winState.y));
      const go = () => { try { if (win === target && !winDragging) target.moveTo(x, y); } catch (_) {} };
      go();
      setTimeout(go, 150);
    }

    function toggleOpen() {
      if (win && !win.closed) win.close();
      else openPlayer();
    }

    const onPlayback = () => render();
    Spicetify.Player.addEventListener("onplaypause", onPlayback);
    Spicetify.Player.addEventListener("songchange", onPlayback);
    const onProgress = () => {
      try { if (root && !!Spicetify.Player.isPlaying() !== !!lastPlaying) render(); } catch (_) {}
    };
    Spicetify.Player.addEventListener("onprogress", onProgress);
    cleanups.push(() => {
      Spicetify.Player.removeEventListener("onplaypause", onPlayback);
      Spicetify.Player.removeEventListener("songchange", onPlayback);
      Spicetify.Player.removeEventListener("onprogress", onProgress);
    });

    on(document, "click", e => {
      if (!settings.replaceNative) return;
      const btn = e.target.closest && e.target.closest('[data-testid="pip-toggle-button"]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      toggleOpen();
    }, true);

    const SETTING_DEFS = [
      { key: "theme", label: "Theme", type: "seg", options: [["classic", "Classic"], ["tinted", "TintedGlass"], ["minimal", "Minimal"]],
        help: "Classic follows your Spotify theme. TintedGlass is frosted glass. Minimal is flat, dark and quiet." },
      { key: "tint", label: "Tint color", type: "tint", needs: "tinted",
        help: "Auto follows the album's colors. Custom lets you pick your own tint." },
      { key: "tintStrength", label: "Tint strength", type: "range", min: 0, max: 100, step: 5, unit: "%", needs: "tinted",
        help: "How strongly the color tints the glass. 0 is plain dark glass." },
      { key: "bigVinyl", label: "Big vinyl", type: "toggle",
        help: "Draws the vinyl larger than the card so it sticks out past the edges." },
      { key: "rpm", label: "Vinyl speed", type: "seg", options: [["slow", "Slow"], ["33", "33 RPM"], ["45", "45 RPM"]],
        help: "How fast the vinyl spins. Slow is relaxed; 33 and 45 match real records." },
      { key: "lyrics", label: "Live lyrics", type: "toggle",
        help: "Shows the current lyric line under the artist when the song has synced lyrics." },
      { key: "lyricsSource", label: "Lyrics source", type: "seg", options: [["auto", "Auto"], ["spicy", "Spicy"], ["lrclib", "LRCLIB"], ["spotify", "Spotify"]],
        help: "Which service is tried first. If it has nothing, the others are tried in turn (Spicy needs a key)." },
      { key: "lyricOffset", label: "Lyrics offset", type: "range", min: -3000, max: 3000, step: 50, unit: " ms", needs: null,
        help: "Shifts the lyrics timing. Positive shows each line earlier, negative later." },
      { key: "spicyKey", label: "Spicy Lyrics key", type: "text",
        help: "Paste your publishable key (starts with sl_pk_) from developers.spicylyrics.org. Never use a secret sl_sk_ key." },
      { key: "autoHide", label: "Auto-hide controls", type: "toggle",
        help: "Fades the buttons out when the mouse leaves the player and back in on hover." },
      { key: "tonearm", label: "Tonearm", type: "toggle",
        help: "Shows a needle arm that swings onto the record when music plays." },
      { key: "scrollStep", label: "Scroll volume step", type: "range", min: 1, max: 10, step: 1, unit: "%",
        help: "Volume change per scroll tick over the vinyl. Hold Shift for 1% steps." },
      { key: "queueSize", label: "Queue size", type: "seg", options: [[3, "3"], [5, "5"], [10, "10"]],
        help: "How many upcoming tracks the queue panel lists." },
      { key: "blur", label: "Glass blur", type: "range", min: 0, max: 60, step: 5, unit: "px", needs: "tinted",
        help: "How strongly TintedGlass frosts what is behind it. Higher is blurrier." },
      { key: "performance", label: "Performance mode", type: "toggle",
        help: "Turns off blur, shine and animations to save CPU and GPU." },
      { key: "replaceNative", label: "Replace Spotify's button", type: "toggle",
        help: "Opens this player when you click Spotify's own mini player button." }
    ];

    const SETTINGS_CSS = `
.vmp-set{display:flex;flex-direction:column;gap:6px;min-width:min(430px,80vw);font-size:13px;color:var(--spice-text,#fff)}
.vmp-set-row{padding:8px 10px;border-radius:8px;background:rgba(128,128,128,.1);transition:opacity .2s ease}
.vmp-set-row.dim{opacity:.45}
.vmp-set-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.vmp-set-left{display:flex;align-items:center;gap:8px;min-width:0}
.vmp-set-name{font-weight:600}
.vmp-set-q{width:16px;height:16px;flex:none;border-radius:50%;border:1px solid var(--spice-subtext,#b3b3b3);background:none;
  color:var(--spice-subtext,#b3b3b3);font:inherit;font-size:10px;line-height:1;padding:0;cursor:pointer;display:grid;place-items:center;
  outline:none;transition:background-color .15s ease,color .15s ease}
.vmp-set-q:hover,.vmp-set-q.on{background:var(--spice-text,#fff);color:var(--spice-main,#121212)}
.vmp-set-hint{display:none;margin-top:6px;font-size:11px;line-height:1.35;color:var(--spice-subtext,#b3b3b3);max-height:2.7em;overflow:hidden}
.vmp-set-hint.show{display:block;animation:vmp-set-in .18s ease}
@keyframes vmp-set-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
.vmp-seg{display:flex;gap:2px;padding:2px;border-radius:99px;background:rgba(128,128,128,.2)}
.vmp-seg button{border:none;outline:none;background:none;color:inherit;padding:4px 10px;border-radius:99px;font:inherit;font-size:12px;
  cursor:pointer;transition:background-color .15s ease,color .15s ease}
.vmp-seg button.on{background:var(--spice-text,#fff);color:var(--spice-main,#121212)}
.vmp-switch{position:relative;flex:none;width:34px;height:20px;border-radius:99px;border:none;outline:none;padding:0;
  background:rgba(128,128,128,.45);cursor:pointer;transition:background-color .2s ease}
.vmp-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s ease}
.vmp-switch.on{background:var(--spice-button,#1db954)}
.vmp-switch.on::after{transform:translateX(14px)}
.vmp-tint{display:flex;align-items:center;gap:8px}
.vmp-color{width:26px;height:26px;border:none;outline:none;padding:0;border-radius:50%;background:none;cursor:pointer;overflow:hidden;transition:opacity .2s ease}
.vmp-color::-webkit-color-swatch-wrapper{padding:0}
.vmp-color::-webkit-color-swatch{border:none;border-radius:50%}
.vmp-text input{width:170px;padding:5px 9px;border-radius:99px;border:none;outline:none;background:rgba(128,128,128,.2);color:inherit;font:inherit;font-size:12px}
.vmp-range{display:flex;align-items:center;gap:8px}
.vmp-range input{width:130px;accent-color:var(--spice-button,#1db954)}
.vmp-range span{min-width:38px;text-align:right;font-variant-numeric:tabular-nums;color:var(--spice-subtext,#b3b3b3);font-size:12px}
`;
    const settingsStyle = document.createElement("style");
    settingsStyle.textContent = SETTINGS_CSS;
    document.head.appendChild(settingsStyle);
    cleanups.push(() => settingsStyle.remove());

    function setSetting(key, value) {
      settings[key] = value;
      saveSettings();
      applySettings();
      if (els) render();
    }

    function buildSettingsPanel() {
      const h = (tag, cls, text) => {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
      };
      const wrap = h("div", "vmp-set");
      const rows = [];

      SETTING_DEFS.forEach(def => {
        const row = h("div", "vmp-set-row");
        const head = h("div", "vmp-set-head");
        const left = h("div", "vmp-set-left");
        const q = h("button", "vmp-set-q", "?");
        q.type = "button";
        q.setAttribute("aria-label", "What does " + def.label + " do?");
        left.append(h("span", "vmp-set-name", def.label), q);

        let ctrl;
        if (def.type === "seg") {
          ctrl = h("div", "vmp-seg");
          def.options.forEach(([val, text]) => {
            const b = h("button", "", text);
            b.type = "button";
            b.dataset.v = String(val);
            b.addEventListener("click", () => {
              setSetting(def.key, typeof val === "number" ? val : String(val));
              refresh();
            });
            ctrl.appendChild(b);
          });
        } else if (def.type === "tint") {
          ctrl = h("div", "vmp-tint");
          const seg = h("div", "vmp-seg");
          [["auto", "Auto"], ["custom", "Custom"]].forEach(([v, t]) => {
            const b = h("button", "", t);
            b.type = "button";
            b.dataset.v = v;
            b.addEventListener("click", () => { setSetting("tintMode", v); refresh(); });
            seg.appendChild(b);
          });
          const color = h("input", "vmp-color");
          color.type = "color";
          color.addEventListener("input", () => {
            setSetting("tintColor", color.value);
            if (settings.tintMode !== "custom") setSetting("tintMode", "custom");
            refresh();
          });
          ctrl.append(seg, color);
          ctrl._seg = seg;
          ctrl._color = color;
        } else if (def.type === "text") {
          ctrl = h("div", "vmp-text");
          const input = h("input");
          input.type = "password";
          input.placeholder = "sl_pk_…";
          input.autocomplete = "off";
          input.spellcheck = false;
          input.addEventListener("change", () => { setSetting(def.key, input.value.trim()); lyricCache.clear(); if (els) loadLyrics(Spicetify.Player.data?.item?.uri || ""); });
          ctrl.appendChild(input);
          ctrl._input = input;
        } else if (def.type === "toggle") {
          ctrl = h("button", "vmp-switch");
          ctrl.type = "button";
          ctrl.setAttribute("role", "switch");
          ctrl.addEventListener("click", () => { setSetting(def.key, !settings[def.key]); refresh(); });
        } else {
          ctrl = h("div", "vmp-range");
          const input = h("input");
          input.type = "range";
          input.min = def.min; input.max = def.max; input.step = def.step;
          const out = h("span");
          input.addEventListener("input", () => {
            out.textContent = input.value + def.unit;
            setSetting(def.key, Number(input.value));
          });
          ctrl.append(input, out);
          ctrl._input = input;
          ctrl._out = out;
        }

        const hint = h("div", "vmp-set-hint", def.help);
        q.addEventListener("click", () => { hint.classList.toggle("show"); q.classList.toggle("on"); });
        head.append(left, ctrl);
        row.append(head, hint);
        wrap.appendChild(row);
        rows.push({ def, row, ctrl });
      });

      function refresh() {
        rows.forEach(({ def, row, ctrl }) => {
          const v = settings[def.key];
          if (def.type === "seg") ctrl.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === String(v)));
          else if (def.type === "text") ctrl._input.value = v || "";
          else if (def.type === "toggle") { ctrl.classList.toggle("on", !!v); ctrl.setAttribute("aria-checked", String(!!v)); }
          else if (def.type === "tint") {
            ctrl._seg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === settings.tintMode));
            ctrl._color.value = settings.tintColor;
            ctrl._color.style.opacity = settings.tintMode === "custom" ? "1" : ".5";
          }
          else { ctrl._input.value = v; ctrl._out.textContent = v + def.unit; }
          if (def.needs) row.classList.toggle("dim", settings.theme !== def.needs);
        });
      }
      refresh();
      return wrap;
    }

    function openSettings() {
      if (Spicetify.PopupModal && typeof Spicetify.PopupModal.display === "function") {
        Spicetify.PopupModal.display({ title: "Vinyl Mini Player", content: buildSettingsPanel() });
      } else {
        Spicetify.showNotification("Settings need a newer Spicetify (PopupModal missing)", true);
      }
    }

    let menu = null, playbarBtn = null;
    try {
      const openItem = new Spicetify.Menu.Item("Open / close mini player", false, () => toggleOpen());
      const settingsItem = new Spicetify.Menu.Item("Settings…", false, () => openSettings());
      menu = new Spicetify.Menu.SubMenu("Vinyl Mini Player", [openItem, settingsItem]);
      menu.register();
    } catch (err) {
      console.warn("[vinyl-mini-player] could not add the profile menu entry", err);
    }

    try {
      if (Spicetify.Playbar && Spicetify.Playbar.Button) {
        const ICON = '<svg role="img" height="16" width="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm0 5a3 3 0 100 6 3 3 0 000-6z"/></svg>';
        playbarBtn = new Spicetify.Playbar.Button("Vinyl Mini Player settings", ICON, () => openSettings(), false, false, true);
      }
    } catch (err) {
      console.warn("[vinyl-mini-player] could not add the player bar button", err);
    }

    const teardown = () => {
      cleanups.splice(0).forEach(fn => { try { fn(); } catch (_) {} });
      if (win && !win.closed) win.close();
      detach();
      try { if (menu) menu.deregister(); } catch (_) {}
      try { if (playbarBtn && playbarBtn.deregister) playbarBtn.deregister(); } catch (_) {}
    };
    window.__vmp = {
      cleanup: teardown, openSettings, toggle: toggleOpen,
      state: () => ({
        isPlaying: (() => { try { return Spicetify.Player.isPlaying(); } catch (e) { return String(e); } })(),
        shownAsPlaying: root ? root.classList.contains("is-playing") : null,
        spin: spinAnim ? spinAnim.playState : null, spinRate, spinTarget, performance: !!settings.performance
      })
    };

  }

  waitForSpicetify();
})();
