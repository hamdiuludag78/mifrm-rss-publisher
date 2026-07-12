/* ==========================================================================
   cache.js — Genel amaçlı LRU (Least Recently Used) Cache
   --------------------------------------------------------------------------
   Map, ekleme sırasını koruduğu için LRU davranışı Map ile doğal olarak
   kurulabilir: bir anahtar "kullanıldığında" silinip yeniden eklenir, bu
   da onu Map'in "en sonuncusu" yapar. Kapasite dolunca en baştaki (en uzun
   süredir kullanılmayan) anahtar otomatik silinir.
   Kullanım alanları:
     - virtualization.js  → aktif medya oynatıcı havuzunun tahliye sırası
     - parser.js           → tekrarlanan gönderilerde extractMedia() sonucu
   ========================================================================== */
(() => {
  "use strict";

  const EF = (window.EF = window.EF || {});

  class LRUCache {
    /**
     * @param {number} maxSize maksimum tutulacak öğe sayısı
     * @param {(key:any, value:any)=>void} [onEvict] kapasite dolunca çağrılır
     */
    constructor(maxSize = 20, onEvict = null) {
      this.maxSize = maxSize;
      this.onEvict = onEvict;
      this._map = new Map();
    }

    has(key) { return this._map.has(key); }

    get(key) {
      if (!this._map.has(key)) return undefined;
      const value = this._map.get(key);
      /* Erişilen anahtarı en sona taşı (en yeni kullanılan) */
      this._map.delete(key);
      this._map.set(key, value);
      return value;
    }

    set(key, value) {
      if (this._map.has(key)) this._map.delete(key);
      this._map.set(key, value);
      while (this._map.size > this.maxSize) {
        const oldestKey = this._map.keys().next().value;
        const oldestVal = this._map.get(oldestKey);
        this._map.delete(oldestKey);
        if (typeof this.onEvict === "function") this.onEvict(oldestKey, oldestVal);
      }
      return value;
    }

    delete(key) {
      if (!this._map.has(key)) return false;
      const value = this._map.get(key);
      this._map.delete(key);
      if (typeof this.onEvict === "function") this.onEvict(key, value);
      return true;
    }

    /* Tahliye callback'ini TETİKLEMEDEN tamamen boşalt (destroy sırasında) */
    clear() { this._map.clear(); }

    get size() { return this._map.size; }
    keys() { return Array.from(this._map.keys()); }
  }

  EF.LRUCache = LRUCache;
})();
