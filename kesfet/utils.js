/* ==========================================================================
   utils.js — Ortak yardımcı fonksiyonlar
   --------------------------------------------------------------------------
   Tüm modüller aynı global ad alanını (window.EF) kullanır. Bu dosya en
   önce yüklenmelidir; diğer tüm modüller EF.Utils'e bağımlıdır.
   Blogger'a doğrudan <script> etiketiyle eklenebilmesi için ES Module
   kullanılmıyor; her dosya kendi IIFE'i içinde EF nesnesine ekleme yapıyor.
   ========================================================================== */
(() => {
  "use strict";

  const EF = (window.EF = window.EF || {});

  const $ = id => document.getElementById(id);

  /* HTML enjeksiyonuna karşı temel kaçış (escape) */
  const esc = s => String(s ?? "").replace(/[&<>"']/g,
    m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  /* Protokolsüz (//cdn...) URL'leri güvenli hale getir */
  const absUrl = url => (url && url.startsWith("//")) ? `https:${url}` : (url || "");

  /* https sayfada http:// kaynaklar "mixed content" olarak engellenebilir */
  const forceHttps = url => url ? url.replace(/^http:\/\//i, "https://") : url;

  const cleanUrl = url => forceHttps(absUrl(url || ""));

  /* Blogger/Google görsel URL'sini maksimum çözünürlüğe çevir */
  const maxRes = url => {
    if (!url) return "";
    return url
      .replace(/\/s\d+(-c)?\//, "/s1600/")
      .replace(/\/w\d+-h\d+(-[a-z]+)*\//, "/s1600/")
      .replace(/=s\d+$/, "=s1600");
  };

  const formatDate = (iso, locale = "tr-TR") => {
    try { return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }); }
    catch { return ""; }
  };

  /* Kısa süreli tekrarlı çağrıları seyreltir (ör. resize/scroll) */
  const debounce = (fn, wait = 150) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  };

  const throttle = (fn, wait = 150) => {
    let last = 0, pending = null;
    return (...args) => {
      const now = Date.now();
      if (now - last >= wait) { last = now; fn(...args); }
      else {
        clearTimeout(pending);
        pending = setTimeout(() => { last = Date.now(); fn(...args); }, wait - (now - last));
      }
    };
  };

  /* requestIdleCallback güvenli sarmalayıcı (Safari'de yok) */
  const idle = (fn, timeout = 1000) => {
    if (typeof requestIdleCallback === "function") return requestIdleCallback(fn, { timeout });
    return setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 15 }), 0);
  };

  const createEl = (tag, className) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  };

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  /* Bağlantı Bilgisi API'si — mevcutsa yavaş bağlantılarda kalite/preload
     kararlarını etkilemek için kullanılır. Desteklenmiyorsa güvenli
     varsayılan (iyi bağlantı kabul edilir) döner. */
  const getConnectionInfo = () => {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return { saveData: false, effectiveType: "4g", downlink: 10, slow: false };
    const slow = !!c.saveData || ["slow-2g", "2g", "3g"].includes(c.effectiveType);
    return { saveData: !!c.saveData, effectiveType: c.effectiveType || "4g", downlink: c.downlink ?? 10, slow };
  };

  /* Bir fonksiyonun yalnızca bir kez çalışmasını garanti eder */
  const once = fn => {
    let called = false, result;
    return (...args) => { if (!called) { called = true; result = fn(...args); } return result; };
  };

  /* postMessage tabanlı oynatıcı komutlarını kısa aralıklarla tekrar
     gönderir; iframe "load" olayı, oynatıcının kendi mesaj dinleyicisini
     kaydetmesinden hemen sonra garanti değildir (idempotent/zararsız). */
  const repeatPostMessage = (win, payload, delays = [0, 250, 800, 1600]) => {
    if (!win) return;
    delays.forEach(d => setTimeout(() => {
      try { win.postMessage(payload, "*"); } catch { /* cross-origin engeli — yoksay */ }
    }, d));
  };

  EF.Utils = {
    $, esc, absUrl, forceHttps, cleanUrl, maxRes, formatDate,
    debounce, throttle, idle, createEl, clamp, getConnectionInfo,
    once, repeatPostMessage
  };
})();
