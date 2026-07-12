/* ==========================================================================
   player.js — Tek API'li oynatıcı katmanı + platform adaptörleri
   --------------------------------------------------------------------------
   Her adaptör aynı sözleşmeyi uygular:
     load() play() pause() stop() destroy() mute() unmute() seek(t)
     isPlaying() isVisible() setVisible(v)
   virtualization.js, gerçek <video>/<iframe> DOM elemanlarını bir HAVUZDAN
   alıp buraya (mount edilecek element olarak) verir; adaptörler elemanı
   OLUŞTURMAZ, sadece kontrol eder — böylece eleman yeniden kullanılabilir.
   ========================================================================== */
(() => {
  "use strict";

  const EF = (window.EF = window.EF || {});
  const { esc, repeatPostMessage, cleanUrl } = EF.Utils;

  const PAGE_ORIGIN = location.origin;

  /* ---------------------------------------------------------------------
     Temel adaptör — tüm platformların ortak iskeleti
  --------------------------------------------------------------------- */
  class BaseAdapter {
    constructor(el, src, opts = {}) {
      this.el = el;
      this.src = src;
      this.opts = opts;
      this._playing = false;
      this._visible = false;
      this._muted = opts.muted !== false;
    }
    load() { /* alt sınıflar uygular */ }
    play() { this._playing = true; }
    pause() { this._playing = false; }
    stop() { this.pause(); }
    destroy() { this.stop(); }
    mute() { this._muted = true; }
    unmute() { this._muted = false; }
    seek(_time) { /* varsayılan: desteklenmiyor */ }
    isPlaying() { return this._playing; }
    isVisible() { return this._visible; }
    setVisible(v) { this._visible = !!v; }
  }

  /* ---------------------------------------------------------------------
     HTML5Adapter — <video> etiketi (mp4/webm/mov)
  --------------------------------------------------------------------- */
  class HTML5Adapter extends BaseAdapter {
    load() {
      const v = this.el;
      v.muted = this._muted;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute("webkit-playsinline", "true");
      v.disablePictureInPicture = true;
      v.preload = "auto";
      if (this.opts.poster) v.poster = this.opts.poster;

      return new Promise(resolve => {
        let settled = false;
        const finish = ok => { if (settled) return; settled = true; resolve(!!ok); };
        v.addEventListener("loadeddata", () => finish(true), { once: true });
        v.addEventListener("canplay", () => finish(true), { once: true });
        v.addEventListener("error", () => finish(false), { once: true });
        v.src = this.src;
        v.load();
        /* Bazı mobil tarayıcılarda/yavaş CDN'lerde olaylar hiç
           tetiklenmeyebilir: sonsuz iskelette kalmasın diye güvenlik ağı */
        setTimeout(() => finish(true), 6000);
      });
    }
    play() {
      this.el.muted = this._muted;
      const p = this.el.play();
      this._playing = true;
      return p instanceof Promise ? p : Promise.resolve();
    }
    pause() {
      try { this.el.pause(); this.el.currentTime = 0; } catch { /* henüz hazır değil */ }
      this._playing = false;
    }
    mute() { super.mute(); this.el.muted = true; }
    unmute() { super.unmute(); this.el.muted = false; }
    seek(time) { try { this.el.currentTime = time; } catch { /* yoksay */ } }
    isPlaying() { return !!this.el && !this.el.paused && !this.el.ended; }
    destroy() {
      this.pause();
      try { this.el.removeAttribute("src"); this.el.removeAttribute("poster"); this.el.load(); } catch { /* yoksay */ }
    }
  }

  /* ---------------------------------------------------------------------
     HLSAdapter — .m3u8 : native destek varsa direkt, yoksa hls.js
  --------------------------------------------------------------------- */
  let hlsJsLoaderPromise = null;
  const loadHlsJs = () => {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (hlsJsLoaderPromise) return hlsJsLoaderPromise;
    hlsJsLoaderPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.15/hls.min.js";
      s.async = true;
      s.onload = () => resolve(window.Hls);
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return hlsJsLoaderPromise;
  };

  class HLSAdapter extends HTML5Adapter {
    load() {
      const v = this.el;
      v.muted = this._muted;
      v.loop = true;
      v.playsInline = true;
      const nativeSupport = v.canPlayType("application/vnd.apple.mpegurl");

      if (nativeSupport) return super.load();

      return loadHlsJs().then(Hls => new Promise(resolve => {
        if (!Hls || !Hls.isSupported()) { resolve(false); return; }
        this.hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        this.hls.loadSource(this.src);
        this.hls.attachMedia(v);
        let settled = false;
        const finish = ok => { if (settled) return; settled = true; resolve(!!ok); };
        this.hls.on(Hls.Events.MANIFEST_PARSED, () => finish(true));
        this.hls.on(Hls.Events.ERROR, (_e, data) => { if (data?.fatal) finish(false); });
        setTimeout(() => finish(true), 6000);
      })).catch(() => false);
    }
    destroy() {
      if (this.hls) { try { this.hls.destroy(); } catch { /* yoksay */ } this.hls = null; }
      super.destroy();
    }
  }

  /* ---------------------------------------------------------------------
     postMessage tabanlı iframe adaptörleri (YouTube / TikTok / Vimeo)
     Ortak nokta: resmi bir kontrol protokolü var → ses/oynatma TAM kontrol.
  --------------------------------------------------------------------- */
  class YouTubeAdapter extends BaseAdapter {
    load() {
      const id = this.src;
      const url = `https://www.youtube-nocookie.com/embed/${id}` +
        `?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1` +
        `&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(PAGE_ORIGIN)}`;
      return new Promise(resolve => {
        this.el.addEventListener("load", () => resolve(true), { once: true });
        this.el.src = url;
        setTimeout(() => resolve(true), 6000);
      });
    }
    _send(func, args = []) {
      repeatPostMessage(this.el.contentWindow, JSON.stringify({ event: "command", func, args }));
    }
    play() { this._send(this._muted ? "mute" : "unMute"); this._send("playVideo"); this._playing = true; return Promise.resolve(); }
    pause() { this._send("pauseVideo"); this._playing = false; }
    mute() { super.mute(); this._send("mute"); }
    unmute() { super.unmute(); this._send("unMute"); }
    destroy() { this.pause(); try { this.el.src = "about:blank"; } catch { /* yoksay */ } }
  }

  class TikTokAdapter extends BaseAdapter {
    load() {
      const id = this.src;
      const url = `https://www.tiktok.com/player/v1/${id}` +
        `?autoplay=1&loop=1&muted=1&controls=0&progress_bar=0&play_button=0` +
        `&volume_control=0&fullscreen_button=0&timestamp=0&music_info=0` +
        `&description=0&closed_caption=0&native_context_menu=0&rel=0`;
      return new Promise(resolve => {
        this.el.addEventListener("load", () => resolve(true), { once: true });
        this.el.src = url;
        setTimeout(() => resolve(true), 6000);
      });
    }
    _send(type) {
      repeatPostMessage(this.el.contentWindow, { type, "x-tiktok-player": true });
    }
    play() { this._send(this._muted ? "mute" : "unMute"); this._send("play"); this._playing = true; return Promise.resolve(); }
    pause() { this._send("pause"); this._playing = false; }
    mute() { super.mute(); this._send("mute"); }
    unmute() { super.unmute(); this._send("unMute"); }
    destroy() { this.pause(); try { this.el.src = "about:blank"; } catch { /* yoksay */ } }
  }

  class VimeoAdapter extends BaseAdapter {
    load() {
      const sep = this.src.includes("?") ? "&" : "?";
      const url = this.src + sep + "autoplay=1&muted=1&loop=1&background=0&controls=0&playsinline=1";
      return new Promise(resolve => {
        this.el.addEventListener("load", () => resolve(true), { once: true });
        this.el.src = cleanUrl(url);
        setTimeout(() => resolve(true), 6000);
      });
    }
    _send(method, value) {
      const payload = JSON.stringify(value === undefined ? { method } : { method, value });
      repeatPostMessage(this.el.contentWindow, payload);
    }
    play() { this._send("setVolume", this._muted ? 0 : 1); this._send("play"); this._playing = true; return Promise.resolve(); }
    pause() { this._send("pause"); this._playing = false; }
    mute() { super.mute(); this._send("setVolume", 0); }
    unmute() { super.unmute(); this._send("setVolume", 1); }
    destroy() { this.pause(); try { this.el.src = "about:blank"; } catch { /* yoksay */ } }
  }

  /* ---------------------------------------------------------------------
     DailymotionAdapter — postMessage protokolü güvenilir belgelenmediği
     için ses/oynatma, iframe URL'ini değiştirip YENİDEN yükleyerek yapılır.
  --------------------------------------------------------------------- */
  class DailymotionAdapter extends BaseAdapter {
    _buildUrl(muted) {
      return `https://www.dailymotion.com/embed/video/${this.src}` +
        `?autoplay=1&mute=${muted ? 1 : 0}&queue-enable=false` +
        `&ui-start-screen-info=false&sharing-enable=false`;
    }
    load() {
      return new Promise(resolve => {
        this.el.addEventListener("load", () => resolve(true), { once: true });
        this.el.src = this._buildUrl(this._muted);
        setTimeout(() => resolve(true), 6000);
      });
    }
    play() { this.el.src = this._buildUrl(this._muted); this._playing = true; return Promise.resolve(); }
    pause() { try { this.el.src = "about:blank"; } catch { /* yoksay */ } this._playing = false; }
    mute() { super.mute(); this.el.src = this._buildUrl(true); }
    unmute() { super.unmute(); this.el.src = this._buildUrl(false); }
    destroy() { this.pause(); }
  }

  /* ---------------------------------------------------------------------
     IframeBasicAdapter — Blogger video / Facebook / Instagram / Twitter /
     Twitch: dışarıdan hiçbir resmi ses/oynatma kontrol API'si YOK. Oynatma
     durumu, iframe'in src'sini boşaltıp geri koyarak (network+playback
     durdurma) taklit edilir. Ses kontrolü desteklenmez (no-op) — kullanıcı
     oynatıcının kendi arayüzüne (varsa) doğrudan dokunabilir.
  --------------------------------------------------------------------- */
  class IframeBasicAdapter extends BaseAdapter {
    load() {
      return new Promise(resolve => {
        this.el.addEventListener("load", () => resolve(true), { once: true });
        this.el.src = this.src;
        setTimeout(() => resolve(true), 6000);
      });
    }
    play() {
      if (this.el.src === "about:blank" || !this.el.getAttribute("src")) this.el.src = this.src;
      this._playing = true;
      return Promise.resolve();
    }
    pause() { try { this.el.src = "about:blank"; } catch { /* yoksay */ } this._playing = false; }
    mute() { super.mute(); }
    unmute() { super.unmute(); }
    destroy() { this.pause(); }
  }

  /* ---------------------------------------------------------------------
     AdapterFactory — medya türüne göre nihai src'i kurar ve doğru
     adaptör sınıfını üretir.
  --------------------------------------------------------------------- */
  const buildSrc = (type, rawSrc) => {
    switch (type) {
      case "bloggervideo": {
        const sep = rawSrc.includes("?") ? "&" : "?";
        return rawSrc + sep + "autoplay=1";
      }
      case "facebook":
      case "instagram": {
        const sep = rawSrc.includes("?") ? "&" : "?";
        const extra = /autoplay=/i.test(rawSrc) ? "" : `${sep}autoplay=true`;
        return rawSrc + extra;
      }
      case "twitter":
        return `https://platform.twitter.com/embed/Tweet.html?id=${rawSrc}&theme=dark&dnt=true`;
      case "twitch":
        return rawSrc.includes("parent=") ? rawSrc : `${rawSrc}${rawSrc.includes("?") ? "&" : "?"}parent=${location.hostname}&autoplay=true&muted=true`;
      default:
        return rawSrc;
    }
  };

  const ADAPTER_MAP = {
    video: HTML5Adapter,
    hls: HLSAdapter,
    youtube: YouTubeAdapter,
    tiktok: TikTokAdapter,
    vimeo: VimeoAdapter,
    dailymotion: DailymotionAdapter,
    bloggervideo: IframeBasicAdapter,
    facebook: IframeBasicAdapter,
    instagram: IframeBasicAdapter,
    twitter: IframeBasicAdapter,
    twitch: IframeBasicAdapter
  };

  /* Bu türler <video> etiketi üzerinde çalışır, diğerleri <iframe> ister */
  const NATIVE_VIDEO_TYPES = Object.freeze(["video", "hls"]);

  const AdapterFactory = {
    /**
     * @param {string} type  extractMedia() çıktısındaki tür
     * @param {HTMLElement} el havuzdan alınmış <video> veya <iframe>
     * @param {string} rawSrc extractMedia() çıktısındaki ham kaynak/ID
     * @param {object} opts   {muted, poster}
     */
    create(type, el, rawSrc, opts = {}) {
      const AdapterClass = ADAPTER_MAP[type];
      if (!AdapterClass) return null;
      const finalSrc = buildSrc(type, rawSrc);
      return new AdapterClass(el, finalSrc, opts);
    },
    needsVideoElement(type) { return NATIVE_VIDEO_TYPES.includes(type); },
    needsIframeElement(type) { return !!ADAPTER_MAP[type] && !NATIVE_VIDEO_TYPES.includes(type); }
  };

  EF.Player = { AdapterFactory, BaseAdapter };
})();
