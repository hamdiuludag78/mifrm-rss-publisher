/* ==========================================================================
   virtualization.js — Eleman havuzu + aktif pencere yönetimi (recycler)
   --------------------------------------------------------------------------
   NOT (tasarım kararı): Native "scroll-snap" ile TAM DOM sanallaştırması
   (yani kaydırıldıkça container div'lerinin de DOM'dan silinip yeniden
   eklenmesi) tarayıcının scroll konumunu ve snap noktalarını bozar —
   yüzlerce gönderi arasında konum tutmak için elle transform tabanlı bir
   sanal liste gerekir ki bu, kırılganlığı artırıp "hiçbir özelliği
   bozma" kuralıyla çelişir. Bunun yerine GERÇEK maliyeti yaratan
   elemanlar (video/iframe) havuzlanır: sayfada en fazla POOL_SIZE kadar
   <video>/<iframe> DOM elemanı var olur, hafif kart konteynerleri
   (content-visibility:auto + contain sayesinde ekran dışında neredeyse
   maliyetsiz) sabit kalır. Bu, gerçek darboğazı (video/iframe decode +
   network) doğru şekilde sınırlar.
   ========================================================================== */
(() => {
  "use strict";

  const EF = (window.EF = window.EF || {});
  const { createEl } = EF.Utils;

  /* ── Basit eleman havuzu (object pool) ── */
  class ElementPool {
    constructor(tagName, max, setup) {
      this.tagName = tagName;
      this.max = max;
      this.setup = setup || (() => {});
      this._free = [];
      this._created = 0;
    }
    acquire() {
      if (this._free.length) return this._free.pop();
      if (this._created < this.max) {
        const el = createEl(this.tagName, "ef-media");
        this.setup(el);
        this._created++;
        return el;
      }
      return null; /* havuz dolu — çağıran taraf en eski aktif öğeyi tahliye eder */
    }
    release(el) {
      if (!el) return;
      el.remove();
      el.removeAttribute("data-type");
      this._free.push(el);
    }
  }

  /* ── FeedVirtualizer ── */
  class FeedVirtualizer {
    /**
     * @param {HTMLElement} container kaydırma konteyneri (#explore-feed)
     * @param {{videoPoolSize?:number, iframePoolSize?:number, activeRadius?:number}} opts
     */
    constructor(container, opts = {}) {
      this.container = container;
      this.videoPool = new ElementPool("video", opts.videoPoolSize ?? 5, v => {
        v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
        v.disablePictureInPicture = true;
      });
      this.iframePool = new ElementPool("iframe", opts.iframePoolSize ?? 6, f => {
        f.setAttribute("frameborder", "0");
        f.setAttribute("allow", "autoplay; encrypted-media; fullscreen; picture-in-picture");
        f.setAttribute("allowfullscreen", "");
      });

      /* index -> {adapter, item} — o an GERÇEKTEN bağlı (mounted) öğeler.
         LRUCache burada "en son görünen" sırayı tutar; havuz dolduğunda
         en uzun süredir görünmeyen öğe otomatik tahliye edilir. */
      this._active = new EF.LRUCache(
        (opts.videoPoolSize ?? 5) + (opts.iframePoolSize ?? 6),
        (_index, entry) => this._teardown(entry)
      );

      this._globalMuted = true;
      this._onPlayBlocked = opts.onPlayBlocked || (() => {});
    }

    /* Havuzdan uygun elemanı (video/iframe) al; doluysa null döner ve
       LRU zaten en eskiyi otomatik tahliye ettiği için normalde buraya
       düşülmez (pool boyutu === LRU kapasitesi). */
    _acquireElement(type) {
      if (EF.Player.AdapterFactory.needsVideoElement(type)) return { el: this.videoPool.acquire(), pool: this.videoPool };
      return { el: this.iframePool.acquire(), pool: this.iframePool };
    }

    _teardown(entry) {
      if (!entry) return;
      try { entry.adapter.destroy(); } catch { /* yoksay */ }
      entry.item.classList.remove("ef-loaded");
      entry.pool.release(entry.el);
    }

    /**
     * Bir gönderiyi (index) aktif pencereye bağlar: havuzdan eleman alır,
     * doğru adaptörü kurar, .ef-stage'e ekler ve load() başlatır.
     * @returns {Promise<{adapter, item}|null>}
     */
    async mount(index, item, media, meta) {
      if (this._active.has(index)) return this._active.get(index);

      const { el, pool } = this._acquireElement(media.type);
      if (!el) return null; /* teorik olarak oluşmaz (LRU==pool boyutu) */

      el.dataset.type = media.type;
      const stage = item.querySelector(".ef-stage");
      stage.insertBefore(el, stage.firstChild);

      const adapter = EF.Player.AdapterFactory.create(media.type, el, media.src, {
        muted: this._globalMuted,
        poster: meta.poster
      });
      if (!adapter) { pool.release(el); return null; }

      const entry = { adapter, item, el, pool, index };
      this._active.set(index, entry);

      const ok = await adapter.load();
      item.classList.add("ef-loaded");
      if (!ok) return entry; /* yükleme başarısız olsa da iskelet kaldırılır; kullanıcı tekrar deneyebilir */
      return entry;
    }

    /* Bir öğeyi aktif pencereden çıkar (ör. uzun süre ekran dışında) */
    unmount(index) { this._active.delete(index); }

    getEntry(index) { return this._active.get(index); }

    /* Görünürlüğe girildiğinde çağrılır: oynat + tek-aktif-video kuralı
       (yeni video görünür olunca ÖNCEKİLER zaten LRU/observer tarafından
       durduruluyor — burada sadece bu index'i başlatıyoruz). */
    async play(index) {
      const entry = this._active.get(index);
      if (!entry) return;
      try {
        const p = entry.adapter.play();
        if (p && typeof p.catch === "function") {
          await p.catch(() => this._onPlayBlocked(entry.item, true));
          this._onPlayBlocked(entry.item, false);
        }
      } catch { /* yoksay */ }
    }

    pause(index) {
      const entry = this._active.get(index);
      if (entry) entry.adapter.pause();
    }

    pauseAll() {
      this._active.keys().forEach(k => this.pause(k));
    }

    setMuted(muted) {
      this._globalMuted = muted;
      this._active.keys().forEach(k => {
        const entry = this._active.get(k);
        if (!entry) return;
        muted ? entry.adapter.mute() : entry.adapter.unmute();
      });
    }

    destroy() {
      this._active.keys().forEach(k => this._active.delete(k));
    }
  }

  EF.FeedVirtualizer = FeedVirtualizer;
})();
