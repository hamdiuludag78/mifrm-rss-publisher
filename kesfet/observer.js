/* ==========================================================================
   observer.js — IntersectionObserver / ResizeObserver / Page Visibility
   --------------------------------------------------------------------------
   Tüm gözlemci mantığı burada toplanır; virtualization.js ve
   explore-feed.js sadece callback verir, gözlemci kurulum detayını bilmez.
   ========================================================================== */
(() => {
  "use strict";

  const EF = (window.EF = window.EF || {});

  /* Genel IntersectionObserver sarmalayıcısı. root olarak tarayıcı
     viewport'u değil, kendi kaydırma konteynerimiz veriliyor — çünkü
     widget kendi iç scroll alanına sahip (daha doğru görünürlük oranı). */
  const createVisibilityObserver = (root, { onEnter, onExit, threshold = 0.5, rootMargin = "0px" } = {}) => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) onEnter && onEnter(entry.target, entry);
        else onExit && onExit(entry.target, entry);
      });
    }, { root, threshold, rootMargin });
    return obs;
  };

  /* Lazy-load: öğe görünür alana YAKLAŞTIĞINDA (rootMargin ile önceden)
     bir kez tetiklenir, ardından kendini bırakır (unobserve). */
  const createLazyLoadObserver = (root, onEnter, rootMargin = "100% 0px") =>
    createVisibilityObserver(root, {
      threshold: 0,
      rootMargin,
      onEnter: (target, entry) => { onEnter(target, entry); }
    });

  /* ── Başlık/meta otomatik gizleme kontrolcüsü (TikTok/Instagram davranışı) ──
     Bir öğe ekranda aktif hale geldiğinde başlık görünür ve 5 sn'lik bir
     sayaç başlar; süre dolunca başlık solarak kaybolur. Dokunulduğunda
     tekrar görünür ve sayaç sıfırlanır. */
  class CaptionController {
    constructor(root, { autoHideMs = 5000 } = {}) {
      this.autoHideMs = autoHideMs;
      this._timers = new WeakMap();
      this.observer = createVisibilityObserver(root, {
        threshold: 0.5,
        onEnter: item => this.show(item),
        onExit: item => this._clear(item)
      });
    }
    observe(item) { this.observer.observe(item); }
    unobserve(item) { this.observer.unobserve(item); this._clear(item); }
    show(item) {
      item.classList.remove("ef-ui-hidden");
      this._clear(item, /* keepVisible */ true);
      const timer = setTimeout(() => item.classList.add("ef-ui-hidden"), this.autoHideMs);
      this._timers.set(item, timer);
    }
    _clear(item, keepVisible = false) {
      const t = this._timers.get(item);
      if (t) clearTimeout(t);
      this._timers.delete(item);
      if (!keepVisible) item.classList.remove("ef-ui-hidden");
    }
    disconnect() { this.observer.disconnect(); }
  }

  /* ── Sayfa Görünürlüğü: sekme arka plana alınınca tüm oynatmayı durdur ── */
  const bindPageVisibility = (pauseAllFn) => {
    const handler = () => { if (document.hidden) pauseAllFn(); };
    document.addEventListener("visibilitychange", handler, { passive: true });
    return () => document.removeEventListener("visibilitychange", handler);
  };

  /* ── ResizeObserver: konteyner boyutu değişince (döndürme, foldable
     açılma/katlanma, klavye açılması vb.) düzen yeniden hesaplanabilir. ── */
  const bindResize = (el, callback) => {
    if (typeof ResizeObserver !== "function") {
      const handler = EF.Utils.debounce(callback, 200);
      window.addEventListener("resize", handler, { passive: true });
      return () => window.removeEventListener("resize", handler);
    }
    const ro = new ResizeObserver(EF.Utils.debounce(entries => callback(entries), 200));
    ro.observe(el);
    return () => ro.disconnect();
  };

  EF.Observers = { createVisibilityObserver, createLazyLoadObserver, CaptionController, bindPageVisibility, bindResize };
})();
