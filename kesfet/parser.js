/* ==========================================================================
   parser.js — Gönderi ayrıştırma: temizlik + medya algılama + meta veri
   --------------------------------------------------------------------------
   Regex, yalnızca bir URL'nin İÇİNDEKİ kimliği (video ID, tweet ID vb.)
   ayıklamak için kullanılıyor; etiket/öznitelik tespiti DOMParser +
   querySelector ile yapılıyor (regex ile HTML ayrıştırmak kırılgandır).
   ========================================================================== */
(() => {
  "use strict";

  const EF = (window.EF = window.EF || {});
  const { esc, cleanUrl, maxRes } = EF.Utils;

  /* Tek, yeniden kullanılan bir DOMParser örneği (her çağrıda yeni obje
     oluşturmamak için) — parse() thread-safe olmasa da tarayıcıda
     senkron çalıştığından burada sorun yaratmaz. */
  const parser = new DOMParser();

  /* Gönderi HTML'ini gerçek bir DOM ağacına çevirir; script/style/font/
     svg/noscript/yorum/boş etiketleri temizler. Sonuç, hem extractMedia
     hem de olası ileride metin gösterimi için kullanılabilir. */
  const parseAndClean = html => {
    if (!html) return null;
    const doc = parser.parseFromString(`<div id="__root">${html}</div>`, "text/html");
    const root = doc.getElementById("__root");
    if (!root) return null;

    /* Zararlı / gereksiz etiketleri kaldır */
    root.querySelectorAll("script,style,font,svg,noscript,link,meta").forEach(n => n.remove());

    /* Yorum düğümlerini kaldır (TreeWalker ile) */
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_COMMENT, null);
    const comments = [];
    let node;
    while ((node = walker.nextNode())) comments.push(node);
    comments.forEach(n => n.remove());

    /* Inline style ve gereksiz class öznitelikleri: extractMedia için
       gerekli değil (src/href/data-* öznitelikleri korunuyor), ama
       DOM'u hafifletmek için temizlenir. */
    root.querySelectorAll("[style]").forEach(n => n.removeAttribute("style"));

    /* Boş div/span/p ve tek başına &nbsp; içeren düğümleri kaldır */
    root.querySelectorAll("div,span,p,br").forEach(n => {
      const text = (n.textContent || "").replace(/\u00a0/g, "").trim();
      if (!text && n.children.length === 0 && n.tagName !== "BR") n.remove();
    });

    return root;
  };

  /* URL'den YouTube video ID'sini çıkar (embed veya youtu.be) */
  const youtubeIdFromUrl = src => {
    try {
      const u = new URL(src, location.href);
      if (/youtu\.be$/i.test(u.hostname)) return u.pathname.split("/").filter(Boolean)[0] || null;
      if (/youtube(-nocookie)?\.com$/i.test(u.hostname.replace(/^www\./, ""))) {
        const parts = u.pathname.split("/").filter(Boolean);
        const embedIdx = parts.indexOf("embed");
        if (embedIdx !== -1 && parts[embedIdx + 1]) return parts[embedIdx + 1];
      }
    } catch { /* geçersiz URL */ }
    return null;
  };

  /**
   * Gönderi içeriğinden desteklenen medya türünü ve kaynağını çıkarır.
   * Dönüş: {type, src} — type: "none" | "video" | "hls" | "youtube" |
   *   "bloggervideo" | "tiktok" | "facebook" | "instagram" | "vimeo" |
   *   "dailymotion" | "twitter" | "twitch" | "image"
   */
  const extractMedia = html => {
    if (!html) return { type: "none", src: "" };
    const root = parseAndClean(html);
    if (!root) return { type: "none", src: "" };

    /* 1) <video> etiketi — src, <source> veya data-src'de olabilir.
       .m3u8 ile bitiyorsa HLS olarak işaretlenir (player.js karar verir). */
    const videoEl = root.querySelector("video[src],video source[src],video[data-src]");
    if (videoEl) {
      const raw = videoEl.getAttribute("src") || videoEl.getAttribute("data-src") || "";
      if (raw) {
        const src = cleanUrl(raw);
        return { type: /\.m3u8(\?.*)?$/i.test(src) ? "hls" : "video", src };
      }
    }

    /* 2) Tüm iframe'ler tek seferde toplanır; platform host'una göre ayrılır */
    const iframes = Array.from(root.querySelectorAll("iframe[src],iframe[data-src]"));
    for (const frame of iframes) {
      const raw = frame.getAttribute("src") || frame.getAttribute("data-src") || "";
      if (!raw) continue;
      let host = "";
      try { host = new URL(cleanUrl(raw), location.href).hostname.replace(/^www\./, ""); } catch { continue; }
      const src = cleanUrl(raw);

      if (/youtube(-nocookie)?\.com$|youtu\.be$/i.test(host)) {
        const id = youtubeIdFromUrl(src);
        if (id) return { type: "youtube", src: id };
      }
      if (/blogger\.com$|blogspot\.com$/i.test(host) && /video\.g/i.test(src)) {
        return { type: "bloggervideo", src };
      }
      if (/tiktok\.com$/i.test(host)) {
        const m = src.match(/\/(?:player\/v1|embed\/v2)\/(\d+)/i);
        if (m) return { type: "tiktok", src: m[1] };
      }
      if (/facebook\.com$/i.test(host) && /plugins\/video\.php/i.test(src)) {
        return { type: "facebook", src };
      }
      if (/instagram\.com$/i.test(host) && /\/(p|reel|tv)\/[A-Za-z0-9_-]+\/embed/i.test(src)) {
        return { type: "instagram", src };
      }
      if (/player\.vimeo\.com$/i.test(host)) return { type: "vimeo", src };
      if (/dailymotion\.com$/i.test(host)) {
        const m = src.match(/\/embed\/video\/([A-Za-z0-9]+)/i);
        if (m) return { type: "dailymotion", src: m[1] };
      }
      if (/platform\.twitter\.com$|twitter\.com$|x\.com$/i.test(host)) {
        const m = src.match(/[?&]id=(\d+)/i);
        if (m) return { type: "twitter", src: m[1] };
      }
      if (/(clips\.twitch\.tv|player\.twitch\.tv)$/i.test(host)) return { type: "twitch", src };
    }

    /* 3) SDK/embed-kod blokları: <blockquote> + script yerleştirmeleri.
       Bunlarda hazır iframe yok; kendi oynatıcı URL'imizi biz kuracağız. */
    const ttBlock = root.querySelector("blockquote.tiktok-embed[data-video-id]");
    if (ttBlock) return { type: "tiktok", src: ttBlock.getAttribute("data-video-id") };

    const fbDiv = root.querySelector(".fb-video[data-href]");
    if (fbDiv) {
      const href = fbDiv.getAttribute("data-href");
      return { type: "facebook", src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false&autoplay=true` };
    }

    const igBlock = root.querySelector("blockquote.instagram-media[data-instgrm-permalink]");
    if (igBlock) {
      const link = igBlock.getAttribute("data-instgrm-permalink") || "";
      const m = link.match(/instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
      if (m) return { type: "instagram", src: `https://www.instagram.com/${m[1]}/${m[2]}/embed` };
    }

    const twBlock = root.querySelector("blockquote.twitter-tweet");
    if (twBlock) {
      const link = twBlock.querySelector("a[href*='/status/']");
      const m = (link?.getAttribute("href") || "").match(/status\/(\d+)/i);
      if (m) return { type: "twitter", src: m[1] };
    }

    /* 4) Doğrudan video dosyası linki (mp4/webm/mov/m3u8), <a> ya da metin
       içinde kalmış olabilir — son çare regex (tek satır, dar kapsam). */
    const directVideo = (html.match(/["'](https?:[^"']+?\.(?:mp4|webm|mov|m3u8)(?:\?[^"']*)?)["']/i) || [])[1];
    if (directVideo) {
      const src = cleanUrl(directVideo);
      return { type: /\.m3u8/i.test(src) ? "hls" : "video", src };
    }

    /* 5) İlk görsel (video yoksa "none" dönecek — görsel-sadece konular
       feed'e girmeyecek; bu değer sadece backdrop/poster ihtiyacı olursa
       çağıran taraf tarafından değerlendirilir) */
    const img = root.querySelector("img[src],img[data-src]");
    if (img) {
      const raw = img.getAttribute("src") || img.getAttribute("data-src") || "";
      if (raw) return { type: "image", src: cleanUrl(maxRes(raw)) };
    }

    return { type: "none", src: "" };
  };

  const VIDEO_TYPES = Object.freeze([
    "video", "hls", "youtube", "bloggervideo", "tiktok",
    "facebook", "instagram", "vimeo", "dailymotion", "twitter", "twitch"
  ]);

  /* Platformların hiçbir dış postMessage/oynatma kontrol API'si olmayan
     türleri: tap-layer eklenmez, kullanıcı oynatıcının kendi arayüzüne
     doğrudan dokunabilsin diye. */
  const NO_CONTROL_API_TYPES = Object.freeze(["facebook", "instagram", "twitter", "twitch"]);

  const getAvatar = post => {
    try {
      const src = post.author?.[0]?.["gd$image"]?.src || "";
      /* Blogger'ın varsayılan gri avatarını atla */
      if (src && !src.includes("zFdxGE77vvD2w5xHy6jkVuElKv")) return cleanUrl(maxRes(src));
    } catch { /* alan yok */ }
    return "";
  };

  const getAuthor = post => esc(post.author?.[0]?.name?.$t || "");
  const getTitle = post => esc(post.title?.$t || "İçerik");
  const getPublished = post => post.published?.$t || new Date().toISOString();
  const getPostLink = post => (post.link || []).find(l => l.rel === "alternate")?.href || "#";
  const getPoster = post => post["media$thumbnail"]?.url ? cleanUrl(maxRes(post["media$thumbnail"].url)) : "";

  EF.Parser = {
    extractMedia, getAvatar, getAuthor, getTitle, getPublished, getPostLink, getPoster,
    VIDEO_TYPES, NO_CONTROL_API_TYPES
  };
})();
