(function vinylMiniPlayer() {
  "use strict";

  const VERSION = "1.2.0";

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
    const settings = {
      rippleStrength: 60, performance: false, replaceNative: true, theme: "classic", rpm: "slow",
      scrollStep: 5, queueSize: 10, blur: 35, tintMode: "auto", tintColor: "#6a7cff", tintStrength: 60,
      lyrics: true, lyricsSource: "auto", spicyKey: "", autoHide: true, lyricStyle: "default",
      bgMotion: true, trackFx: true, titleMarquee: true, ...saved
    };
    settings.rpm = "slow";

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
      grip: '<path d="M9 5h2v2H9zm4 0h2v2H9zm4 0h2v2h-2zM9 11h2v2H9zm4 0h2v2H9zm4 0h2v2h-2zM9 17h2v2H9zm4 0h2v2H9zm4 0h2v2H9z"/>',
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

.vmp-disc{position:relative;flex:none;width:5.6rem;height:5.6rem;transition:width .4s cubic-bezier(0.25,1,0.5,1), height .4s cubic-bezier(0.25,1,0.5,1)}
.vmp-vinyl{position:absolute;inset:0;border-radius:50%;overflow:hidden;background:#111;
  box-shadow:0 0 0 1px #000,0 .3rem 1rem rgba(0,0,0,.45);will-change:transform}
.vmp-cover{display:block;width:100%;height:100%;object-fit:cover;transition:opacity .25s ease}
.vmp-grooves{position:absolute;inset:0;border-radius:50%;pointer-events:none;
  background:repeating-radial-gradient(circle,transparent 0 .2rem,rgba(0,0,0,.22) .26rem .3rem)}
.vmp-shine{position:absolute;inset:0;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.28),transparent 55%)}
.vmp-hole{position:absolute;left:50%;top:50%;width:9%;height:9%;transform:translate(-50%,-50%);
  border-radius:50%;background:var(--spice-main,#121212);box-shadow:0 0 0 .15rem #1b1b1b;pointer-events:none}

.vmp-meta{flex:1 1 0;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:2px;overflow:hidden;position:relative}
.vmp-title{font-size:1.3rem;font-weight:600;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block!important}
.vmp-artist{font-size:1rem;letter-spacing:.05em;text-transform:uppercase;color:var(--spice-subtext,#b3b3b3);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block!important}

@property --p{syntax:"<percentage>";inherits:false;initial-value:0%}
.vmp-lyric{--lt:var(--spice-text,#fff);--ld:rgba(255,255,255,.4);
  display:block;max-height:0;margin-top:0;opacity:0;font-size:1.1rem;line-height:1.2;font-weight:600;letter-spacing:-.005em;
  white-space:nowrap;overflow:hidden;color:var(--lt);--ml:2px;--mr:2px;
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 var(--ml),#000 calc(100% - var(--mr)),transparent 100%);
  mask-image:linear-gradient(90deg,transparent 0,#000 var(--ml),#000 calc(100% - var(--mr)),transparent 100%);
  transition:max-height .5s cubic-bezier(0.25,1,0.5,1),opacity .5s ease}
.vmp-root.has-lyrics .vmp-lyric{max-height:1.4rem;opacity:1}
.vmp-lyric span{display:inline-block;transform:translateX(var(--sx,0px));background:linear-gradient(90deg,var(--lt) 0%,var(--lt) calc(var(--p) - 5%),var(--ld) calc(var(--p) + 5%),var(--ld) 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  transition:--p 0.12s linear, transform 0.35s cubic-bezier(0.25,1,0.5,1); will-change: transform, --p;}
.vmp-root.is-perf .vmp-lyric span{background:none;-webkit-text-fill-color:currentColor}

.vmp-credit{display:block;max-height:0;opacity:0;font-size:.75rem;line-height:1.1;letter-spacing:.02em;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;color:var(--spice-subtext,#b3b3b3);transition:max-height .5s ease,opacity .5s ease}
.vmp-root.has-lyrics .vmp-credit.on{max-height:.9rem;opacity:.6}
.vmp-credit a{color:inherit;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.25)}
.vmp-credit a:hover{color:var(--spice-text,#fff)}
.vmp-root.stack .vmp-lyric{font-size:1.4rem;max-width:100%}
.vmp-root.stack.has-lyrics .vmp-lyric{max-height:2rem}

.vmp-ctrls{flex:none;display:flex;align-items:center;gap:.4rem;transition:opacity .35s ease}
.vmp-root.autohide .vmp-ctrls{opacity:0;pointer-events:none}
.vmp-root.autohide:not(.is-playing) .vmp-ctrls,.vmp-root.autohide.hover .vmp-ctrls,.vmp-root.autohide.peek .vmp-ctrls,
.vmp-root.autohide.q-open .vmp-ctrls,.vmp-root.autohide:focus-within .vmp-ctrls{opacity:1;pointer-events:auto}
.vmp-btn{appearance:none;background:none;border:none;outline:none;padding:0;margin:0;color:var(--spice-subtext,#b3b3b3);
  cursor:pointer;width:3.2rem;height:3.2rem;display:grid;place-items:center;border-radius:50%;
  transition:transform .25s cubic-bezier(.25,1,.5,1),color .3s ease,background-color .3s ease}
.vmp-btn svg{width:2rem;height:2rem;fill:currentColor;display:block}
.vmp-btn:hover{color:var(--spice-text,#fff);transform:scale(1.06)}
.vmp-btn:active{transform:scale(.94)}
.vmp-btn:focus-visible{box-shadow:0 0 0 .2rem var(--spice-button,#1db954)}
.vmp-btn.vmp-active{color:var(--spice-button,#1ed760)}
.vmp-shuffle{position:relative}
.vmp-shuffle::after{content:"";position:absolute;bottom:.32rem;left:50%;width:.4rem;height:.4rem;border-radius:50%;
  background:currentColor;opacity:0;transform:translateX(-50%) scale(.25);pointer-events:none;
  transition:opacity .2s cubic-bezier(.25,1,.5,1),transform .24s cubic-bezier(.34,1.56,.64,1)}
.vmp-shuffle.vmp-active::after{opacity:1;transform:translateX(-50%) scale(1)}
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
  opacity:0;transform:translateY(-.5rem);transition:opacity .45s cubic-bezier(0.25,1,0.5,1),transform .45s cubic-bezier(0.25,1,0.5,1)}
.vmp-root.has-queue .vmp-queue{display:flex}
.vmp-root.q-open .vmp-queue{opacity:1;transform:none}
.vmp-qhead{flex:none;display:flex;align-items:center;justify-content:space-between;gap:.8rem;padding:.8rem 1.4rem .4rem;
  font-size:1.2rem;font-weight:700;color:var(--spice-subtext,#b3b3b3);letter-spacing:.04em;text-transform:uppercase}
.vmp-qhint{flex:1 1 0;min-width:0;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:400;text-transform:none;letter-spacing:0;opacity:.8}
.vmp-qshuffle{flex:none;width:2.8rem;height:2.8rem}
.vmp-qshuffle svg{width:1.7rem;height:1.7rem}
.vmp-btn:disabled{opacity:.35;pointer-events:none}
.vmp-qlist{position:relative;flex:1 1 auto;min-height:0;overflow-y:auto;padding:.4rem .6rem .8rem;scrollbar-width:thin}
.vmp-qrow{position:relative;display:flex;align-items:center;gap:1rem;padding:.5rem .8rem;border-radius:.8rem;cursor:pointer;
  transition:background-color .15s ease,box-shadow .2s ease}
.vmp-qrow:hover{background:rgba(128,128,128,.18)}
.vmp-qrow.enter{animation:vmp-in .55s cubic-bezier(0.25,1,0.5,1) backwards;animation-delay:calc(var(--i,0) * 36ms)}
@keyframes vmp-in{from{opacity:0;transform:translateY(.5rem)}to{opacity:1;transform:none}}
.vmp-qlist.sorting,.vmp-qlist.sorting *{cursor:grabbing!important}
.vmp-qlist.sorting .vmp-qrow{transition:transform .32s cubic-bezier(0.25,1,0.5,1),background-color .15s ease;will-change:transform}
.vmp-qlist.sorting .vmp-qrow:hover{background:none}
.vmp-qlist.sorting .vmp-qrow.is-drag{z-index:3;background:color-mix(in srgb,var(--spice-main,#121212) 78%,var(--spice-text,#fff) 22%);
  box-shadow:0 .8rem 2.2rem rgba(0,0,0,.5),0 0 0 1px rgba(128,128,128,.25);
  transition:box-shadow .2s ease,background-color .2s ease}
.vmp-qlist.sorting .vmp-qrow.is-drag.settle{transition:transform .26s cubic-bezier(0.25,1,0.5,1),box-shadow .26s ease,background-color .26s ease}
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
.vmp-root.card .vmp-progress{left:1.8rem;right:1.8rem;bottom:.6rem;border-radius:99px;overflow:hidden}
.vmp-disc{z-index:1}
.vmp-root.card .vmp-queue{margin-top:.8rem;border:1px solid rgba(128,128,128,.28);border-radius:1.8rem;overflow:hidden;background:rgba(128,128,128,.12)}

.vmp-root.stack .vmp-bar{flex-direction:column;justify-content:center;align-items:center;gap:1rem;padding:1.5rem 1.5rem 2rem;text-align:center}
.vmp-root.stack .vmp-disc,.vmp-root.stack.card .vmp-disc{width:clamp(10rem, 45vh, 14rem);height:clamp(10rem, 45vh, 14rem);margin:0 auto}
.vmp-root.stack .vmp-meta{flex:none;width:100%;align-items:center;text-align:center}
.vmp-root.stack .vmp-title{font-size:1.6rem;max-width:100%}
.vmp-root.stack .vmp-artist{font-size:1.1rem;max-width:100%}
.vmp-root.stack .vmp-ctrls{gap:.2rem;justify-content:center}
.vmp-root.stack .vmp-btn.vmp-close{position:absolute;top:.6rem;right:.6rem;margin:0}
.vmp-root.stack.card .vmp-progress{left:2rem;right:2rem;bottom:1rem}

@property --aura-a{syntax:"<color>";inherits:true;initial-value:rgb(44,50,84)}
@property --aura-b{syntax:"<color>";inherits:true;initial-value:rgb(24,26,42)}
.vmp-aura{display:none;position:absolute;inset:0;pointer-events:none;opacity:var(--tint,.7);
  background:radial-gradient(circle at 20% 20%, var(--aura-a) 0%, transparent 50%),
             radial-gradient(circle at 80% 80%, var(--aura-b) 0%, transparent 50%),
             radial-gradient(circle at 50% 50%, rgba(255,255,255,0.08) 0%, transparent 70%);
  animation:vmp-breathe 10s ease-in-out infinite alternate;
  transition:--aura-a 1.4s ease,--aura-b 1.4s ease,opacity .4s ease}
@keyframes vmp-breathe{from{transform:scale(1);opacity:calc(var(--tint,.7) * 0.85)}to{transform:scale(1.08);opacity:calc(var(--tint,.7) * 1.15)}}

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
.vmp-root.theme-glass:not(.stack) .vmp-progress,.vmp-root.stack.theme-glass .vmp-progress{left:0;right:0;bottom:0;border-radius:0}
.vmp-root.theme-glass .vmp-queue{margin:.2rem .8rem .8rem;border:none;border-radius:2.2rem;overflow:hidden;
  background:rgba(255,255,255,.07);
  backdrop-filter:blur(var(--blur,35px)) saturate(190%);-webkit-backdrop-filter:blur(var(--blur,35px)) saturate(190%);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),inset 0 1px 1px rgba(255,255,255,.25),0 20px 40px rgba(0,0,0,.35)}
.vmp-root.is-perf.theme-glass{background:rgba(20,20,25,.92)}
.vmp-root.is-perf.theme-glass .vmp-aura{display:none}
.vmp-root.is-perf.theme-glass .vmp-bar{background:none;backdrop-filter:none;-webkit-backdrop-filter:none}
.vmp-root.is-perf.theme-glass .vmp-queue{background:rgba(32,32,38,.92);backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none}

.vmp-root.theme-mini{padding:0;border-radius:0;background:#000;--spice-text:#f4f4f5;--spice-subtext:#85858b;--spice-button:#f4f4f5;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI",var(--vmp-font,sans-serif)}
.vmp-root.theme-mini .vmp-aura{display:none}
.vmp-root.theme-mini .vmp-rim{display:block;box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
.vmp-root.theme-mini .vmp-bar{background:none;border:none;border-radius:0;backdrop-filter:none;-webkit-backdrop-filter:none}
.vmp-root.theme-mini .vmp-title{font-weight:600;letter-spacing:-.005em}
.vmp-root.theme-mini .vmp-artist{font-size:1rem;letter-spacing:.12em}
.vmp-root.theme-mini .vmp-hole{background:#000}
.vmp-root.theme-mini .vmp-btn:hover{background:rgba(255,255,255,.07)}
.vmp-root.theme-mini .vmp-btn.vmp-play{background:#f4f4f5;color:#000}
.vmp-root.theme-mini .vmp-progress{left:0;right:0;bottom:0;border-radius:0;height:max(2px,.2rem);background:rgba(255,255,255,.07)}
.vmp-root.theme-mini .vmp-progress:hover{height:max(4px,.5rem)}
.vmp-root.theme-mini .vmp-lyric{--ld:rgba(255,255,255,.26)}
.vmp-root.theme-mini .vmp-queue{margin:.2rem .8rem .8rem;border:none;border-radius:1.2rem;background:#000;backdrop-filter:none;-webkit-backdrop-filter:none;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
.vmp-root.is-perf.theme-mini{background:#000}
.vmp-root.is-perf.theme-mini .vmp-queue{background:#000}

.vmp-bgimg{display:none;position:absolute;inset:-12%;width:124%;height:124%;object-fit:cover;pointer-events:none;
  opacity:0;transition:opacity .7s ease}
.vmp-root.theme-liquid .vmp-bgimg{display:block;filter:url(#vmp-f-ripple) brightness(var(--lq-dim)) saturate(1.25) contrast(1.05)}
.vmp-root.theme-liquid.no-ripple .vmp-bgimg{filter:brightness(var(--lq-dim)) saturate(1.25) contrast(1.05)}
.vmp-root.theme-liquid{
  padding:0;border-radius:0;
  --lq-dim:.45;
  --lq-text:#ffffff;
  --lq-subtext:rgba(255,255,255,0.75);
  --spice-text:var(--lq-text);--spice-subtext:var(--lq-subtext);
  background:#06070a}
.vmp-root.theme-liquid .vmp-aura{display:none}
.vmp-root.theme-liquid .vmp-rim{display:block;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
.vmp-root.theme-liquid .vmp-bar{border:none;border-radius:0;background:linear-gradient(rgba(6,7,10,.2),rgba(6,7,10,.5));backdrop-filter:none;-webkit-backdrop-filter:none}
.vmp-root.theme-liquid .vmp-vinyl{box-shadow:0 0 0 1px rgba(255,255,255,.1),0 1rem 2.4rem rgba(0,0,0,.6)}
.vmp-root.theme-liquid .vmp-hole{background:#06070a}
.vmp-root.theme-liquid .vmp-title{font-weight:650;letter-spacing:-.01em;text-shadow:0 1px 10px rgba(0,0,0,.45)}
.vmp-root.theme-liquid .vmp-artist{text-transform:none;letter-spacing:0;font-weight:500;font-size:1.15rem;text-shadow:0 1px 8px rgba(0,0,0,.45)}
.vmp-root.theme-liquid .vmp-lyric{--ld:rgba(255,255,255,.32)}
.vmp-root.theme-liquid .vmp-btn{background:none;box-shadow:none;color:var(--lq-subtext);
  transition:transform .4s cubic-bezier(.34,1.56,.64,1),color .25s ease}
.vmp-root.theme-liquid .vmp-btn:hover{background:none;color:var(--lq-text);transform:scale(1.22)}
.vmp-root.theme-liquid .vmp-btn:active{transform:scale(.9);transition-duration:.12s}
.vmp-root.theme-liquid .vmp-btn.vmp-active{color:var(--lq-text)}
.vmp-root.theme-liquid .vmp-btn.vmp-play,.vmp-root.theme-liquid .vmp-btn.vmp-play:hover{background:none;color:var(--lq-text);
  box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.7)}
.vmp-root.theme-liquid .vmp-btn.vmp-play:hover{transform:scale(1.14);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.95)}
.vmp-root.theme-liquid .vmp-btn.vmp-close{transition:opacity .2s ease,transform .4s cubic-bezier(.34,1.56,.64,1),color .25s ease}
.vmp-root.theme-liquid .vmp-btn.vmp-close:hover{background:none;transform:rotate(90deg) scale(1.2)}
.vmp-root.theme-liquid .vmp-btn:focus-visible{box-shadow:0 0 0 .15rem rgba(255,255,255,.35)}
.vmp-root.theme-liquid .vmp-progress{left:0;right:0;bottom:0;border-radius:0;height:max(2px,.3rem);background:rgba(255,255,255,.14);transition:height .3s cubic-bezier(.34,1.56,.64,1)}
.vmp-root.theme-liquid .vmp-progress:hover{height:max(4px,.6rem)}
.vmp-root.theme-liquid .vmp-bar-fill{background:var(--lq-text)}
.vmp-root.theme-liquid .vmp-queue{border:none;border-radius:2.2rem;background:rgba(6,7,10,.55);box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none}
.vmp-root.theme-liquid .vmp-qlist:not(.sorting) .vmp-qrow{transition:transform .4s cubic-bezier(.34,1.56,.64,1),background-color .2s ease}
.vmp-root.theme-liquid .vmp-qlist:not(.sorting) .vmp-qrow:hover{background:rgba(255,255,255,.06);transform:scale(1.025)}
.vmp-root.theme-liquid .vmp-credit a{border-bottom-color:rgba(255,255,255,.2)}
.vmp-root.is-perf .vmp-bgimg{display:none!important}
.vmp-root.is-perf.theme-liquid{background:#0e0e12}

.vmp-lyric.rtl{direction:rtl}
.vmp-lyric.rtl span{background:linear-gradient(270deg,var(--lt) 0%,var(--lt) calc(var(--p) - 5%),var(--ld) calc(var(--p) + 5%),var(--ld) 100%);
  -webkit-background-clip:text;background-clip:text}

.vmp-root .vmp-lyrics-stack{
  --lh: 1.4rem;
  display: none;
  position: relative;
  height: 0;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  opacity: 0;
  --ml: 2px;
  --mr: 2px;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 var(--ml), #000 calc(100% - var(--mr)), transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 var(--ml), #000 calc(100% - var(--mr)), transparent 100%);
  transition: height .5s cubic-bezier(0.25, 1, 0.5, 1), opacity .5s ease;
}
.vmp-root.lyr-stack .vmp-lyric{display:none!important}
.vmp-root.lyr-stack .vmp-lyrics-stack{display:block!important}
.vmp-root.lyr-stack.has-lyrics .vmp-lyrics-stack{
  height: calc(var(--lh) * 3) !important;
  opacity: 1 !important;
}

.vmp-root .lyric-line{
  position: absolute;
  left: 50%;
  top: 50%;
  width: max-content;
  max-width: none;
  height: var(--lh);
  line-height: var(--lh);
  font-size: 1.05rem;
  font-weight: 500;
  white-space: nowrap;
  text-align: center;
  transform-origin: center center;
  transform: translate(calc(-50% + var(--sx, 0px)), calc(-50% + (var(--pos, 0) * var(--lh)))) scale(0.92);
  color: rgba(255, 255, 255, 0.35);
  filter: blur(1.5px);
  opacity: 0.45;
  will-change: transform, filter, opacity;
  transition: transform 0.5s cubic-bezier(0.25, 1, 0.5, 1), filter 0.5s cubic-bezier(0.25, 1, 0.5, 1), color 0.4s ease, opacity 0.4s ease;
}
.vmp-root .lyric-line[dir="rtl"]{transform-origin: center center}
.vmp-root.stack .lyric-line{font-size: 1.4rem}
.vmp-root .lyric-line.prev,.vmp-root .lyric-line.next{opacity: 0.5; filter: blur(1.5px)}
.vmp-root .lyric-line.active{
  color: #ffffff;
  font-weight: 700;
  opacity: 1;
  filter: blur(0px);
  transform: translate(calc(-50% + var(--sx, 0px)), calc(-50% + (var(--pos, 0) * var(--lh)))) scale(1.04);
}
.vmp-root .lyric-line.snap{transition: none}

.vmp-root .vmp-title.marq{-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 7%,#000 93%,transparent 100%);
  mask-image:linear-gradient(90deg,transparent 0,#000 7%,#000 93%,transparent 100%)}

.vmp-bgwrap{position:absolute;inset:0;pointer-events:none}
@keyframes vmp-drift{from{transform:translate3d(-4%,-3%,0) scale(1.08) rotate(-1deg)}to{transform:translate3d(4%,3%,0) scale(1.2) rotate(1deg)}}
.vmp-root.theme-liquid.bg-motion .vmp-bgwrap{animation:vmp-drift 28s cubic-bezier(0.37,0,0.63,1) infinite alternate;will-change:transform}

.vmp-root.is-perf .vmp-vinyl{animation:none;box-shadow:none}
.vmp-root.is-perf .vmp-grooves,.vmp-root.is-perf .vmp-shine{display:none}
.vmp-root.is-perf *{transition:none!important;animation:none!important}
`;

    const TEMPLATE = `
<svg class="vmp-defs" width="0" height="0" aria-hidden="true" style="position:absolute"><defs>
  <filter id="vmp-f-ripple" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="3" result="n"/>
    <feDisplacementMap id="vmp-d-ripple" in="SourceGraphic" in2="n" scale="60" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</defs></svg>
<div class="vmp-bgwrap"><img class="vmp-bgimg" alt=""></div>
<div class="vmp-aura"></div>
<div class="vmp-rim"></div>
<div class="vmp-bar">
  <div class="vmp-disc">
    <div class="vmp-vinyl"><img class="vmp-cover" alt=""><div class="vmp-grooves"></div></div>
    <div class="vmp-shine"></div>
    <div class="vmp-hole"></div>
  </div>
  <div class="vmp-meta">
    <div class="vmp-title"><span></span></div>
    <div class="vmp-artist"><span></span></div>
    <div class="vmp-lyric"><span></span></div>
    <div class="vmp-lyrics-stack"></div>
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
  <div class="vmp-qhead"><span>Next up</span><span class="vmp-qhint">Drag to reorder · click to play now</span><button class="vmp-btn vmp-qshuffle" data-act="qshuffle" aria-label="Reshuffle the queue" title="Reshuffle the queue">${svg("shuffle")}</button></div>
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
    let curStack = false;
    let lastPlaying = null, spinAnim = null, spinRate = 0, spinTarget = 0, spinRaf = 0, spinLast = 0;
    let auraToken = 0, auraKey = "", tickWin = null;
    let metaHover = false, lyr = null, lyrIdx = -1, lyrToken = 0, lyricTimer = null, marqueeAnims = [];
    let lyrAnim = null, lyrSwapping = false, lyrPending = "";
    let lyrRtl = false, lyrBW = 0, lyrTW = 0, lyrMeasKey = "", lyrStackAnim = null, lyrStyleSeen = null;
    const lyrEls = new Map();
    let swapping = false, swapId = 0, pendingTrack = null, titleAnim = null, marqT = 0, lockSize = null, guardUntil = 0, lockTimer = 0;
    const lyricCache = new Map();
    const paletteCache = new Map();

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

    function applyRipple(force = false) {
      if (!root || !els || !els.dispRipple || !els.bgimg) return;
      const v = String(Math.max(0, Math.round(Number(settings.rippleStrength) || 0)));
      const changed = els.dispRipple.getAttribute("scale") !== v;
      if (!changed && !force) return;
      if (changed) els.dispRipple.setAttribute("scale", v);
      const st = els.bgimg.style;
      st.filter = "none";
      void els.bgimg.offsetWidth;
      st.filter = "";
    }

    function layout() {
      if (!win || !root) return;
      const w = win.innerWidth || BAR_W;
      const h = win.innerHeight || BAR_H;
      const holding = Date.now() < holdUntil;
      if (!qOpen && !holding) baseBarH = h;
      const aspect = w / baseBarH;
      const stack = curStack ? aspect < 1.85 : aspect < 1.5;
      const mini = settings.theme === "minimal";
      const liquid = settings.theme === "liquid";
      const glass = settings.theme === "tinted" || liquid;
      const card = glass;

      curStack = stack;
      doc.documentElement.style.background = mini ? "#000" : liquid ? "#06070a" : glass ? "#0b0b0f" : "";
      scale = stack
        ? Math.max(0.7, Math.min(4, w / STACK_W, baseBarH / STACK_H))
        : Math.max(0.7, Math.min(4, w / BAR_W, baseBarH / BAR_H));
      doc.documentElement.style.fontSize = (10 * scale).toFixed(2) + "px";

      root.classList.toggle("stack", stack);
      root.classList.toggle("theme-glass", glass);
      root.classList.toggle("theme-mini", mini);
      root.classList.toggle("theme-liquid", liquid);
      root.classList.toggle("no-ripple", !(Number(settings.rippleStrength) > 0));
      root.classList.toggle("card", card);

      void doc.documentElement.offsetWidth;
      void root.offsetWidth;

      const pad = card && !glass ? 10 * scale : 0;
      root.style.setProperty("--bar-h", qOpen || holding ? Math.max(40, baseBarH - 2 * pad) + "px" : "100%");
      const lw = w / scale;
      root.classList.toggle("no-shuffle", !stack && lw < 430);
      root.classList.toggle("no-like", !stack && lw < 370);
      root.classList.toggle("no-skip", !stack && lw < 330);

      scheduleTitleMarquee();
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

    const SPIN = { slow: 8 };

    function applySettings() {
      if (!root) return;
      root.classList.toggle("is-perf", !!settings.performance);
      root.style.setProperty("--blur", (Number(settings.blur) || 0) + "px");
      root.style.setProperty("--tint", (Math.max(0, Math.min(100, Number(settings.tintStrength))) / 100 || 0).toFixed(2));
      root.classList.toggle("autohide", !!settings.autoHide);
      root.classList.toggle("bg-motion", !!settings.bgMotion);
      root.classList.toggle("lyr-stack", settings.lyricStyle === "stack");
      if (lyrStyleSeen !== settings.lyricStyle) {
        lyrStyleSeen = settings.lyricStyle;
        resetLyricStack();
        lyrIdx = -1;
        els.lyric.dataset.t = "";
      }
      layout();
      applyRipple(true);
      auraKey = "";
      updateAura().catch(() => {});
      spinWant(!!lastPlaying);
      const uri = Spicetify.Player.data?.item?.uri || "";
      if (settings.lyrics && !settings.performance && (!lyr || lyr.uri !== uri) && lyrPending !== uri) loadLyrics(uri);
      else updateLyric();
      scheduleTitleMarquee();
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
      if (els.qshuffle) els.qshuffle.disabled = list.length < 2;
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

    async function syncQueueOrder(list, expected, delay) {
      try {
        const api = Spicetify.Platform && Spicetify.Platform.PlayerAPI;
        if (api && typeof api.reorderQueue === "function") {
          for (let i = list.length - 2; i >= 0; i--) {
            await api.reorderQueue([ref(list[i])], { before: ref(list[i + 1]) });
          }
        }
      } catch (_) {}
      await sleep(delay);
      if (readQueue().map(t => t.uri).join("|") !== expected) {
        try {
          await Spicetify.removeFromQueue(list.map(ref));
          await Spicetify.addToQueue(list.map(t => ({ uri: t.uri })));
          await sleep(delay);
        } catch (_) {}
      }
    }

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
      } catch (_) {}
      await sleep(350);
      if (readQueue().map(t => t.uri).join("|") !== expected) {
        try {
          await Spicetify.removeFromQueue(list.map(ref));
          await Spicetify.addToQueue(list.map(t => ({ uri: t.uri })));
          await sleep(350);
        } catch (_) {}
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
      try { await Spicetify.removeFromQueue([ref(t)]); } catch (_) {}
      await sleep(250);
      qBusy = false;
      renderQueue(true);
    }

    async function playNow(i) {
      if (i > 0) await moveTrack(i, 0);
      Spicetify.Player.next();
    }

    async function reshuffleQueue() {
      if (qBusy || qTracks.length < 2) return;
      qBusy = true;
      const before = qTracks.slice();
      const list = before.slice();
      for (let tries = 0; tries < 6; tries++) {
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [list[i], list[j]] = [list[j], list[i]];
        }
        if (list.some((t, i) => t.uri !== before[i].uri)) break;
      }
      paintQueue(list);
      if (els && els.qshuffle) els.qshuffle.disabled = true;
      await syncQueueOrder(list, list.map(t => t.uri).join("|"), 350);
      qBusy = false;
      renderQueue(true);
    }

    function setQueueOpen(open) {
      if (!els || open === qOpen) return;
      qOpen = open;
      els.queueBtn.classList.toggle("vmp-active", open);
      if (open) {
        qHome = { x: win.screenX, y: win.screenY };
        qShift = null;
        baseBarH = (win.innerHeight - qExtra) || BAR_H;
        holdUntil = 0;
        lockSize = null;
        guardUntil = 0;
        root.classList.add("has-queue");
        layout();
        if (!qExtra) {
          qExtra = Math.round(QUEUE_H * scale);
          try { win.resizeBy(0, qExtra); } catch (_) { qExtra = 0; }
        }
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
        holdUntil = Date.now() + 1000;
        lockSize = null;
        guardUntil = 0;
        layout();
        w.setTimeout(() => {
          if (win !== w || qOpen) return;
          if (qExtra) { try { w.resizeBy(0, -qExtra); } catch (_) {} qExtra = 0; }
          if (shift) {
            const back = () => {
              if (win === w && !qOpen && !winDragging) { try { w.moveTo(tx, ty); } catch (_) {} }
            };
            back();
            w.setTimeout(back, 120);
            w.setTimeout(back, 350);
          }
          if (root) root.classList.remove("has-queue");
          w.setTimeout(() => { if (win === w) layout(); }, 480);
        }, 380);
      }
    }

    function marqueeOn() {
      if (!els || settings.performance) return;
      const box = els.titleBox;
      const span = box && box.firstElementChild;
      if (!span || !span.animate || !box.offsetWidth) return;
      box.style.textOverflow = "clip";
      span.style.display = "inline-block";
      const ov = span.offsetWidth - box.clientWidth;
      if (ov > 2) {
        marqueeAnims.push(span.animate([
          { transform: "translateX(0)" },
          { transform: "translateX(0)", offset: 0.15 },
          { transform: `translateX(${(box.dir === "rtl" ? 1 : -1) * ov}px)`, offset: 0.85 },
          { transform: `translateX(${(box.dir === "rtl" ? 1 : -1) * ov}px)` }
        ], { duration: Math.max(3600, ov * 45 + 2600), iterations: Infinity, direction: "alternate", easing: "ease-in-out" }));
      } else {
        box.style.textOverflow = "";
        span.style.display = "";
      }
    }

    function marqueeOff() {
      marqueeAnims.forEach(a => { try { a.cancel(); } catch (_) {} });
      marqueeAnims = [];
      if (!els || !els.titleBox) return;
      els.titleBox.style.textOverflow = "";
      if (els.titleBox.firstElementChild) els.titleBox.firstElementChild.style.display = "";
    }

    const endMs = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v) * 1000) : undefined);

    async function fetchSpicy(id) {
      const key = String(settings.spicyKey || "").trim();
      if (!key || /^sl_sk_/.test(key)) return null;
      const res = await fetch(`https://api.spicylyrics.org/v1/lyrics/${id}`, { headers: { Authorization: "Bearer " + key } });
      if (res.status === 429 || res.status >= 500) throw new Error("Spicy Lyrics answered " + res.status);
      if (!res.ok) return null;
      const data = await res.json();
      const body = (data && data.Body) || data;
      if (!body || !Array.isArray(body.Content)) return null;
      const lines = [];
      if (body.Type === "Line") {
        body.Content.forEach(c => { if (c && c.Text != null) lines.push({ t: Math.round((Number(c.StartTime) || 0) * 1000), w: String(c.Text).trim(), e: endMs(c.EndTime) }); });
      } else if (body.Type === "Syllable") {
        body.Content.forEach(c => {
          const lead = c && c.Lead;
          if (!lead || !Array.isArray(lead.Syllables)) return;
          let text = "";
          lead.Syllables.forEach(sy => { text += String(sy.Text || "") + (sy.IsPartOfWord ? "" : " "); });
          lines.push({ t: Math.round((Number(lead.StartTime) || 0) * 1000), w: text.replace(/\s+/g, " ").trim(), e: endMs(lead.EndTime != null ? lead.EndTime : (lead.Syllables[lead.Syllables.length - 1] || {}).EndTime) });
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
      if (res.status === 429 || res.status >= 500) throw new Error("LRCLIB answered " + res.status);
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
      if (!settings.lyrics || settings.performance || !uri || !uri.startsWith("spotify:track:")) { lyrPending = ""; updateLyric(); return; }
      const ck = `${uri}|${settings.lyricsSource}|${settings.spicyKey ? 1 : 0}`;
      const hit = lyricCache.get(ck);
      if (hit && hit.exp > Date.now()) { lyrPending = ""; lyr = hit.entry; updateLyric(); return; }
      lyrPending = uri;
      await sleep(400);
      if (token !== lyrToken) return;
      const item = (Spicetify.Player.data && Spicetify.Player.data.item) || {};
      const id = uri.split(":")[2];
      const sources = { spicy: () => fetchSpicy(id), lrclib: () => fetchLrclib(item), spotify: () => fetchSpotifyLyrics(id) };
      const order = ["spicy", "lrclib", "spotify"];
      const first = order.indexOf(settings.lyricsSource);
      if (first > 0) order.unshift(order.splice(first, 1)[0]);
      let res = null, uncertain = false;
      for (const name of order) {
        try { res = await sources[name](); } catch (_) { uncertain = true; }
        if (res || token !== lyrToken) break;
      }
      if (token !== lyrToken) return;
      lyrPending = "";
      const entry = { uri, lines: res ? res.lines : [], credit: res ? res.credit : null };
      const ttl = res ? 3600e3 : (uncertain ? 20e3 : 600e3);
      lyricCache.set(ck, { entry, exp: Date.now() + ttl });
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

    function setLyricText(text, idx = -1) {
      const key = idx + "|" + text;
      if (!els || els.lyric.dataset.t === key) return;
      els.lyric.dataset.t = key;
      const box = els.lyricBox, span = els.lyric;
      if (lyrAnim) { try { lyrAnim.cancel(); } catch (_) {} lyrAnim = null; }
      const commit = () => {
        if (lyrAnim) { try { lyrAnim.cancel(); } catch (_) {} lyrAnim = null; }
        lyrSwapping = false;
        if (!els) return;
        span.textContent = text;
        lyrRtl = isRtl(text);
        box.classList.toggle("rtl", lyrRtl);
        span.style.transition = "none";
        span.style.setProperty("--p", "0%");
        span.style.setProperty("--sx", "0px");
        box.style.setProperty("--ml", "2px");
        box.style.setProperty("--mr", "2px");
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

    const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/g;
    const LTR_RE = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/g;
    const isRtl = t => {
      const str = String(t || "");
      const r = (str.match(RTL_RE) || []).length;
      return r > 0 && r >= (str.match(LTR_RE) || []).length;
    };

    const LYRIC_LEAD = 80;
    const lineSpan = (line, gap) => {
      if (line.e && line.e > line.t) return Math.max(400, Math.min(line.e - line.t, 15000));
      return Math.max(400, Math.min(gap * 0.96, Math.max(900, (line.w || "").length * 75)));
    };

    function resetLyricStack() {
      if (lyrStackAnim) { try { lyrStackAnim.cancel(); } catch (_) {} lyrStackAnim = null; }
      lyrEls.forEach(el => el.remove());
      lyrEls.clear();
    }

    function renderLyricStack(lines, i) {
      const box = els.lyrStack;
      if (!box) return;
      if (lyrEls.size && !lyrEls.has(i) && !lyrEls.has(i - 1) && !lyrEls.has(i + 1)) resetLyricStack();
      const snap = !lyrEls.size;
      const text = k => lines[k].w || "♪";

      for (let k = i - 1; k <= i + 1; k++) {
        if (k < 0 || k >= lines.length || lyrEls.has(k)) continue;
        const el = doc.createElement("div");
        el.className = "lyric-line" + (snap ? " snap" : "");
        el.dir = isRtl(lines[k].w) ? "rtl" : "ltr";
        el.textContent = text(k);
        box.appendChild(el);
        lyrEls.set(k, el);
      }

      lyrEls.forEach((el, k) => {
        if (k < i - 1 || k > i + 1) {
          el.remove();
          lyrEls.delete(k);
          return;
        }
        const role = k === i ? "active" : k === i - 1 ? "prev" : "next";
        const wasActive = el.classList.contains("active");
        el.style.setProperty("--pos", String(k - i));
        el.className = "lyric-line " + role + (snap ? " snap" : "");
        if (role !== "active" && wasActive) el.style.setProperty("--sx", "0px");
      });

      if (snap) win.requestAnimationFrame(() => lyrEls.forEach(el => el.classList.remove("snap")));
    }

    function updateLyric() {
      if (!els || !root) return;
      const uri = Spicetify.Player.data?.item?.uri || "";
      const stackMode = settings.lyricStyle === "stack";
      const hasLines = !!(lyr && lyr.uri === uri && lyr.lines && lyr.lines.length);
      const show = !!(settings.lyrics && !settings.performance && hasLines);

      root.classList.toggle("has-lyrics", show);
      setCredit(show ? lyr.credit : null);

      if (!show) {
        if (stackMode) resetLyricStack(); else setLyricText("");
        lyrIdx = -1;
        lyrMeasKey = "";
        return;
      }

      const lines = lyr.lines;
      const pos = (Spicetify.Player.getProgress() || 0) + LYRIC_LEAD;
      let i = lyrIdx;
      if (i < 0 || i >= lines.length || lines[i].t > pos) i = -1;
      while (i + 1 < lines.length && lines[i + 1].t <= pos) i++;

      if (stackMode) {
        const beforeStart = i < 0 && pos < lines[0].t;
        root.classList.toggle("has-lyrics", show && !beforeStart);
        if (beforeStart) {
          resetLyricStack();
          lyrIdx = -1;
          return;
        }
        if (i !== lyrIdx || !lyrEls.size) {
          lyrIdx = i;
          renderLyricStack(lines, i);
        }

        if (i >= 0 && lyrEls.has(i)) {
          const activeEl = lyrEls.get(i);
          const box = els.lyrStack;
          const t0 = lines[i].t;
          const t1 = i + 1 < lines.length ? lines[i + 1].t : t0 + 5000;
          const real = Math.max(0, Math.min(1, (pos - t0) / lineSpan(lines[i], Math.max(400, t1 - t0))));
          const boxW = box.clientWidth;
          const textW = activeEl.offsetWidth * 1.04;
          const overflow = textW - boxW;

          if (overflow > 2) {
            const panX = Math.min(overflow, Math.max(0, real * textW - boxW * 0.45));
            const pad = Math.max(2, Math.min(6, boxW * 0.04));
            activeEl.style.setProperty("--sx", (-panX).toFixed(1) + "px");
            box.style.setProperty("--ml", pad + "px");
            box.style.setProperty("--mr", pad + "px");
          } else {
            activeEl.style.setProperty("--sx", "0px");
            box.style.setProperty("--ml", "2px");
            box.style.setProperty("--mr", "2px");
          }
        }
        return;
      }

      if (i !== lyrIdx) {
        lyrIdx = i;
        setLyricText(i >= 0 ? (lines[i].w || "♪") : "", i);
      }
      if (i >= 0 && !lyrSwapping) {
        const t0 = lines[i].t;
        const t1 = i + 1 < lines.length ? lines[i + 1].t : t0 + 5000;
        const real = Math.max(0, Math.min(1, (pos - t0) / lineSpan(lines[i], Math.max(400, t1 - t0))));
        els.lyric.style.setProperty("--p", (real * 100).toFixed(1) + "%");
        const mkey = i + "|" + (win ? win.innerWidth : 0);
        if (mkey !== lyrMeasKey || !lyrTW) { lyrBW = els.lyricBox.clientWidth; lyrTW = els.lyric.offsetWidth; lyrMeasKey = mkey; }
        const bw = lyrBW, tw = lyrTW, ov = tw - bw;
        const sx = ov > 2 ? Math.min(ov, Math.max(0, real * tw - bw * 0.45)) : 0;
        const pad = Math.max(2, Math.min(6, bw * 0.04));
        els.lyric.style.setProperty("--sx", (lyrRtl ? sx : -sx).toFixed(1) + "px");
        els.lyricBox.style.setProperty("--ml", pad + "px");
        els.lyricBox.style.setProperty("--mr", pad + "px");
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
      const cached = paletteCache.get(uri);
      if (cached) { setAura(cached[0], cached[1]); return; }
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
      const pa = shade(a, 0.72), pb = shade(b, 0.55);
      if (uri) { paletteCache.set(uri, [pa, pb]); if (paletteCache.size > 24) paletteCache.delete(paletteCache.keys().next().value); }
      setAura(pa, pb);
    }

    function syncPlaying(playing) {
      root.classList.toggle("is-playing", playing);
      const plabel = playing ? "Pause" : "Play";
      if (els.play.getAttribute("aria-label") !== plabel) els.play.setAttribute("aria-label", plabel);
      lastPlaying = playing;
      spinWant(playing);
    }

    function setShuffleState(shuf) {
      if (!els || !els.shuffle) return;
      const active = !!shuf;
      els.shuffle.classList.toggle("vmp-active", active);
      els.shuffle.setAttribute("aria-label", active ? "Shuffle on" : "Shuffle");
      lastShuffle = active;
    }

    function syncShuffleState(force = false) {
      if (!els || !els.shuffle) return;
      let shuf = false;
      try { shuf = !!Spicetify.Player.getShuffle(); } catch (_) {}
      if (!force && shuf === lastShuffle) return;
      setShuffleState(shuf);
    }

    function render() {
      if (!root || !els) return;
      let playing = false;
      try { playing = !!Spicetify.Player.isPlaying(); } catch (_) {}
      try { syncPlaying(playing); } catch (_) {}
      try { renderTrack(); } catch (_) {}
    }

    function titleMarqueeStop() {
      if (titleAnim) { try { titleAnim.cancel(); } catch (_) {} titleAnim = null; }
      if (!els || !els.titleBox) return;
      els.titleBox.classList.remove("marq");
      els.titleBox.style.textOverflow = "";
      els.title.style.display = "";
    }

    function titleMarqueeStart() {
      titleMarqueeStop();
      if (!els || settings.performance || !settings.titleMarquee) return;
      const box = els.titleBox, span = els.title;
      if (!box.offsetWidth || !span.animate) return;
      span.style.display = "inline-block";
      const ov = span.offsetWidth - box.clientWidth;
      if (ov <= 2) { span.style.display = ""; return; }
      box.style.textOverflow = "clip";
      box.classList.add("marq");
      const dist = (box.dir === "rtl" ? 1 : -1) * ov;
      const start = 1800, scroll = Math.max(3500, ov * 70), hold = 3000;
      const total = start + scroll + hold + scroll;
      const ease = "cubic-bezier(.37,0,.63,1)";
      titleAnim = span.animate([
        { transform: "translateX(0)", offset: 0 },
        { transform: "translateX(0)", offset: start / total, easing: ease },
        { transform: `translateX(${dist}px)`, offset: (start + scroll) / total },
        { transform: `translateX(${dist}px)`, offset: (start + scroll + hold) / total, easing: ease },
        { transform: "translateX(0)", offset: 1 }
      ], { duration: total, iterations: Infinity });
    }

    function scheduleTitleMarquee() {
      if (!win) return;
      win.clearTimeout(marqT);
      marqT = win.setTimeout(titleMarqueeStart, 160);
    }

    function applyTrack(title, artist, cover) {
      const textChanged = els.title.textContent !== title || els.artist.textContent !== artist;
      setText(els.title, title);
      setText(els.artist, artist);
      const td = isRtl(title) ? "rtl" : "ltr", ad = isRtl(artist) ? "rtl" : "ltr";
      if (els.titleBox.dir !== td) els.titleBox.dir = td;
      if (els.artistBox.dir !== ad) els.artistBox.dir = ad;
      if (textChanged && metaHover) { marqueeOff(); marqueeOn(); }
      if (textChanged) scheduleTitleMarquee();
      if (els.cover.dataset.src !== cover) {
        els.cover.dataset.src = cover;
        els.cover.src = toImg(cover);
        els.cover.style.visibility = cover ? "visible" : "hidden";
        els.bgimg.style.opacity = "0";
        if (cover) {
          els.bgimg.onload = () => { if (els) els.bgimg.style.opacity = "1"; };
          els.bgimg.src = toImg(cover);
        } else els.bgimg.removeAttribute("src");
      }
    }

    function endSwap(id) {
      if (id !== swapId || !swapping) return;
      swapping = false;
      if (pendingTrack && els) {
        const p = pendingTrack;
        pendingTrack = null;
        applyTrack(p.title, p.artist, p.cover);
      }
    }

    function transitionTrack(title, artist, cover) {
      swapping = true;
      pendingTrack = null;
      const id = ++swapId;
      const dir = skipDir || 1;
      const disc = els.disc;
      const parts = [els.titleBox, els.artistBox];
      titleMarqueeStop();
      const outs = [disc.animate(
        [{ transform: "perspective(700px) rotateY(0deg)", opacity: 1 }, { transform: `perspective(700px) rotateY(${dir * 88}deg)`, opacity: 0.85 }],
        { duration: 220, easing: "cubic-bezier(.5,0,.9,.6)", fill: "forwards" })];
      parts.forEach((n, k) => outs.push(n.animate(
        [{ transform: "translateX(0)", opacity: 1, filter: "blur(0)" }, { transform: `translateX(${-dir * 1.4}rem)`, opacity: 0, filter: "blur(.4rem)" }],
        { duration: 200, delay: k * 40, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" })));
      let swapped = false;
      const swap = () => {
        if (swapped || id !== swapId || !els) return;
        swapped = true;
        applyTrack(title, artist, cover);
        outs.forEach(a => { try { a.cancel(); } catch (_) {} });
        disc.animate(
          [{ transform: `perspective(700px) rotateY(${-dir * 88}deg)`, opacity: 0.85 }, { transform: "perspective(700px) rotateY(0deg)", opacity: 1 }],
          { duration: 520, easing: "cubic-bezier(.22,1.25,.36,1)" });
        parts.forEach((n, k) => n.animate(
          [{ transform: `translateX(${dir * 1.4}rem)`, opacity: 0, filter: "blur(.4rem)" }, { transform: "translateX(0)", opacity: 1, filter: "blur(0)" }],
          { duration: 560, delay: 60 + k * 70, easing: "cubic-bezier(.34,1.35,.64,1)", fill: "backwards" }));
        win.setTimeout(() => endSwap(id), 700);
      };
      outs[0].onfinish = swap;
      win.setTimeout(swap, 600);
    }

    function renderTrack() {
      const item = Spicetify.Player.data?.item || {};
      const meta = item.metadata || {};
      const title = item.name || meta.title || "Nothing playing";
      const artist = (item.artists || []).map(a => a.name).join(", ") || meta.artist_name || "";
      const cover = meta.image_xlarge_url || meta.image_large_url || meta.image_url || item.album?.images?.[0]?.url || "";
      const key = (item.uri || "") + "|" + title;

      const changed = lastKey !== null && key !== lastKey;
      const fx = changed && settings.trackFx && !settings.performance && !!cover;
      if (changed) guardWindowSize();
      if (swapping) pendingTrack = { title, artist, cover };
      else if (fx) transitionTrack(title, artist, cover);
      else applyTrack(title, artist, cover);
      if (changed && !fx && !swapping) { fadeIn(els.meta, skipDir); fadeIn(els.disc, skipDir); }
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

      syncShuffleState();
      updateProgress();
      renderQueue(false);
    }

    function act(name) {
      const P = Spicetify.Player;
      if (name === "prev" || name === "next") {
        skipDir = name === "next" ? 1 : -1;
        guardWindowSize();
        clearTimeout(skipTimer);
        skipTimer = setTimeout(() => { skipDir = 1; }, 2500);
      }
      if (name === "prev") P.back();
      else if (name === "next") P.next();
      else if (name === "play") {
        root.classList.toggle("is-playing");
        lastPlaying = root.classList.contains("is-playing");
        spinWant(lastPlaying);
        P.togglePlay();
        return;
      } else if (name === "queue") { setQueueOpen(!qOpen); return; }
      else if (name === "qshuffle") { reshuffleQueue(); return; }
      else if (name === "like") P.toggleHeart();
      else if (name === "shuffle") {
        const nextActive = !lastShuffle;
        setShuffleState(nextActive);
        P.toggleShuffle();
        setTimeout(() => syncShuffleState(true), 120);
        return;
      } else if (name === "close") { win.close(); return; }
      setTimeout(render, 120);
    }

    function detach() {
      try { if (tickWin) { tickWin.clearInterval(tick); tickWin.clearInterval(lyricTimer); } } catch (_) {}
      try { titleMarqueeStop(); } catch (_) {}
      try { if (win) win.clearTimeout(marqT); } catch (_) {}
      resetLyricStack();
      clearTimeout(lockTimer);
      lockSize = null;
      guardUntil = 0;
      swapping = false;
      pendingTrack = null;
      lyrStyleSeen = null;
      lyrRtl = false;
      lyrMeasKey = "";
      lyricTimer = null;
      metaHover = false;
      marqueeAnims = [];
      lyr = null;
      lyrIdx = -1;
      lyrToken++;
      lyrPending = "";
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
      clearTimeout(skipTimer);
      skipDir = 1;
      lastKey = lastHeart = lastShuffle = null;
    }

    function guardWindowSize() {
      if (!win || qOpen) return;
      if (!lockSize) lockSize = { w: win.innerWidth, h: win.innerHeight };
      guardUntil = Date.now() + 2500;
    }

    function undoUnwantedResize(target) {
      if (!guardUntil || Date.now() >= guardUntil || !lockSize || qOpen || Date.now() < holdUntil || winDragging) return false;
      if (Math.abs(target.innerWidth - lockSize.w) <= 3 && Math.abs(target.innerHeight - lockSize.h) <= 3) return false;
      const ow = target.outerWidth - target.innerWidth, oh = target.outerHeight - target.innerHeight;
      try { target.resizeTo(lockSize.w + ow, lockSize.h + oh); } catch (_) {}
      return true;
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
      doc.documentElement.style.background = "";

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
        toast: $(".vmp-toast"),
        bgimg: $(".vmp-bgimg"),
        dispRipple: $("#vmp-d-ripple"),
        lyrStack: $(".vmp-lyrics-stack"),
        qshuffle: $(".vmp-qshuffle")
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
        if (undoUnwantedResize(target)) return;
        target.requestAnimationFrame(layout);
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveWin, 400);
        clearTimeout(lockTimer);
        lockTimer = setTimeout(() => {
          if (win === target && !qOpen && Date.now() >= guardUntil) lockSize = { w: target.innerWidth, h: target.innerHeight };
        }, 500);
      });
      lockTimer = setTimeout(() => { if (win === target && !qOpen) lockSize = { w: target.innerWidth, h: target.innerHeight }; }, 900);
      spinInit();
      applySettings();
      render();
      syncShuffleState(true);
      els.titleBox.addEventListener("mouseenter", () => { metaHover = true; marqueeOn(); });
      els.titleBox.addEventListener("mouseleave", () => { metaHover = false; marqueeOff(); });
      root.classList.add("peek");
      setTimeout(() => { if (root) root.classList.remove("peek"); }, 2600);
      tickWin = target;
      tick = target.setInterval(render, 500);
      lyricTimer = target.setInterval(updateLyric, 25);
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
          } catch (_) {}
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
      try {
        if (!root || !els) return;
        syncShuffleState();
        if (!!Spicetify.Player.isPlaying() !== !!lastPlaying) render();
      } catch (_) {}
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
      { key: "theme", label: "Theme", type: "seg", options: [["classic", "Classic"], ["tinted", "TintedGlass"], ["minimal", "Minimal"], ["liquid", "Liquid"]],
        help: "Classic follows your Spotify theme. TintedGlass is frosted glass. Minimal is flat, dark and quiet. Liquid shows the cover art as a rippled background." },
      { key: "rippleStrength", label: "Background ripple", type: "range", min: 0, max: 120, step: 5, unit: "", needs: "liquid",
        help: "How strongly the Liquid background is warped like water. 0 shows the picture clean. The vinyl is never affected." },
      { key: "bgMotion", label: "Animated background", type: "toggle", needs: "liquid",
        help: "Lets the Liquid background drift slowly. The ripple stays. Performance mode turns it off." },
      { key: "tint", label: "Tint color", type: "tint", needs: "tinted",
        help: "Auto follows the album's colors. Custom lets you pick your own tint." },
      { key: "tintStrength", label: "Tint strength", type: "range", min: 0, max: 100, step: 5, unit: "%", needs: "tinted",
        help: "How strongly the color tints the glass. 0 is plain dark glass." },
      { key: "lyrics", label: "Live lyrics", type: "toggle",
        help: "Shows the current lyric line under the artist when the song has synced lyrics." },
      { key: "lyricStyle", label: "Lyric style", type: "seg", options: [["default", "Default"], ["stack", "Afterimage"]],
        help: "Default shows one line with a fill that follows it. Afterimage shows the previous, current and next line as a soft stack." },
      { key: "lyricsSource", label: "Lyrics source", type: "seg", options: [["auto", "Auto"], ["spicy", "Spicy"], ["lrclib", "LRCLIB"], ["spotify", "Spotify"]],
        help: "Which service is tried first." },
      { key: "spicyKey", label: "Spicy Lyrics key", type: "text",
        help: "Paste your publishable key (starts with sl_pk_) from developers.spicylyrics.org." },
      { key: "autoHide", label: "Auto-hide controls", type: "toggle",
        help: "Fades the buttons out when the mouse leaves the player and back in on hover." },
      { key: "trackFx", label: "Track change animation", type: "toggle",
        help: "The artwork flips like a card when the song changes." },
      { key: "titleMarquee", label: "Scroll long titles", type: "toggle",
        help: "A title that does not fit scrolls to the end." },
      { key: "scrollStep", label: "Scroll volume step", type: "range", min: 1, max: 10, step: 1, unit: "%",
        help: "Volume change per scroll tick over the vinyl." },
      { key: "queueSize", label: "Queue size", type: "seg", options: [[3, "3"], [5, "5"], [10, "10"]],
        help: "How many upcoming tracks the queue panel lists." },
      { key: "blur", label: "Glass blur", type: "range", min: 0, max: 60, step: 5, unit: "px", needs: "tinted",
        help: "Glass blur intensity." },
      { key: "performance", label: "Performance mode", type: "toggle",
        help: "Turns off blur, shine and animations to save CPU and GPU." },
      { key: "replaceNative", label: "Replace Spotify's button", type: "toggle",
        help: "Opens this player when you click Spotify's own mini player button." }
    ];

    const SETTINGS_CSS = `
.vmp-set{display:flex;flex-direction:column;gap:6px;min-width:min(430px,80vw);font-size:13px;color:var(--spice-text,#fff)}
.vmp-set-row{padding:8px 10px;border-radius:8px;background:rgba(128,128,128,.1);transition:opacity .2s ease}
.vmp-set-row.dim{opacity:.45;pointer-events:none;user-select:none}
.vmp-set-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.vmp-set-left{display:flex;align-items:center;gap:8px;min-width:0}
.vmp-set-name{font-weight:600}
.vmp-set-q{width:16px;height:16px;flex:none;border-radius:50%;border:1px solid var(--spice-subtext,#b3b3b3);background:none;
  color:var(--spice-subtext,#b3b3b3);font:inherit;font-size:10px;line-height:1;padding:0;cursor:pointer;display:grid;place-items:center;
  outline:none;transition:background-color .18s ease,color .18s ease,transform .24s cubic-bezier(.34,1.56,.64,1),border-color .18s ease}
.vmp-set-q:hover,.vmp-set-q.on{background:var(--spice-text,#fff);border-color:var(--spice-text,#fff);color:var(--spice-main,#121212);transform:scale(1.08)}
.vmp-set-hint{display:grid;grid-template-rows:0fr;margin-top:0;opacity:0;transform:translateY(-4px);
  font-size:11px;line-height:1.35;color:var(--spice-subtext,#b3b3b3);pointer-events:none;
  transition:grid-template-rows .26s cubic-bezier(.25,1,.5,1),margin-top .26s cubic-bezier(.25,1,.5,1),opacity .2s ease,transform .26s cubic-bezier(.25,1,.5,1)}
.vmp-set-hint-inner{overflow:hidden;min-height:0}
.vmp-set-hint.show{grid-template-rows:1fr;margin-top:6px;opacity:1;transform:none;pointer-events:auto}
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

    function setSetting(key, value, persist = true) {
      settings[key] = value;
      if (persist) saveSettings();
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
            setSetting("tintColor", color.value, false);
            if (settings.tintMode !== "custom") setSetting("tintMode", "custom", false);
            refresh();
          });
          color.addEventListener("change", saveSettings);
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
            setSetting(def.key, Number(input.value), false);
          });
          input.addEventListener("change", saveSettings);
          ctrl.append(input, out);
          ctrl._input = input;
          ctrl._out = out;
        }

        const hint = h("div", "vmp-set-hint");
        hint.appendChild(h("div", "vmp-set-hint-inner", def.help));
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
          } else { ctrl._input.value = v; ctrl._out.textContent = v + def.unit; }
          if (def.needs) {
            const off = settings.theme !== def.needs;
            row.classList.toggle("dim", off);
            row.inert = off;
            row.setAttribute("aria-disabled", String(off));
          }
        });
      }
      refresh();
      return wrap;
    }

    function openSettings() {
      if (Spicetify.PopupModal && typeof Spicetify.PopupModal.display === "function") {
        Spicetify.PopupModal.display({ title: "Vinyl Mini Player", content: buildSettingsPanel() });
      } else {
        Spicetify.showNotification("Settings need a newer Spicetify", true);
      }
    }

    let menu = null, playbarBtn = null, menuTimer = null, menuTries = 0;
    const registerMenu = () => {
      if (!(Spicetify.React && Spicetify.ReactJSX && Spicetify.ReactJSX.jsx)) {
        if (++menuTries < 100) menuTimer = setTimeout(registerMenu, 300);
        return;
      }
      try {
        const openItem = new Spicetify.Menu.Item("Open / close mini player", false, () => toggleOpen());
        const settingsItem = new Spicetify.Menu.Item("Settings…", false, () => openSettings());
        menu = new Spicetify.Menu.SubMenu("Vinyl Mini Player", [openItem, settingsItem]);
        menu.register();
      } catch (_) {}
    };
    registerMenu();

    try {
      if (Spicetify.Playbar && Spicetify.Playbar.Button) {
        const ICON = '<svg role="img" height="16" width="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm0 5a3 3 0 100 6 3 3 0 000-6z"/></svg>';
        playbarBtn = new Spicetify.Playbar.Button("Vinyl Mini Player settings", ICON, () => openSettings(), false, false, true);
      }
    } catch (_) {}

    const teardown = () => {
      cleanups.splice(0).forEach(fn => { try { fn(); } catch (_) {} });
      clearTimeout(menuTimer);
      if (win && !win.closed) win.close();
      detach();
      try { if (menu) menu.deregister(); } catch (_) {}
      try { if (playbarBtn && playbarBtn.deregister) playbarBtn.deregister(); } catch (_) {}
    };
    window.__vmp = {
      version: VERSION, cleanup: teardown, openSettings, toggle: toggleOpen,
      tune: o => {
        if (o && o.rippleScale != null) {
          settings.rippleStrength = Number(o.rippleScale) || 0;
          if (root) { root.classList.toggle("no-ripple", !(settings.rippleStrength > 0)); applyRipple(); }
        }
        return settings.rippleStrength;
      },
      liquid: () => {
        if (!root) return "the player is closed";
        return { version: VERSION, classes: root.className, ripple: settings.rippleStrength, filterScale: els.dispRipple.getAttribute("scale") };
      },
      state: () => ({
        isPlaying: (() => { try { return Spicetify.Player.isPlaying(); } catch (e) { return String(e); } })(),
        shownAsPlaying: root ? root.classList.contains("is-playing") : null,
        spin: spinAnim ? spinAnim.playState : null, spinRate, spinTarget, performance: !!settings.performance
      })
    };

    console.info(`[vinyl-mini-player] v${VERSION} loaded`);
  }

  waitForSpicetify();
})();
