/* ==========================================================================
   explore-feed.js — Ana orkestrasyon
   --------------------------------------------------------------------------
   Bağımlılıklar (bu sıra ile yüklenmeli): utils, cache, parser, player,
   observer, virtualization. Bu dosya sadece "birleştirme" (composition)
   yapar: Blogger feed'ini çeker, sadece video içeren gönderileri filtreler,
   hafif kart iskeletlerini oluşturur ve virtualizer/observer'ları bağlar.
   ========================================================================== */
(() => {
  "use strict";

  const EF = window.EF;
  const { $, esc, cleanUrl } = EF.Utils;
  const Parser = EF.Parser;
  const { createLazyLoadObserver, CaptionController, bindPageVisibility } = EF.Observers;

  const container = $("explore-feed");
  if (!container) return;

  /* ---------------------------------------------------------------------
     1) Feed'i sayfalayarak tam olarak çek (Blogger tek istekte ~150
        sonuçla sınırlar).
  --------------------------------------------------------------------- */
  const fetchAllPosts = async () => {
    const pageSize = 150;
    const maxPages = 50; /* güvenlik sınırı: sonsuz döngüyü engeller (~7500 gönderi) */
    let startIndex = 1;
    let all = [];

    for (let page = 0; page < maxPages; page++) {
      let data;
      try {
        const res = await fetch(`/feeds/posts/default?alt=json&max-results=${pageSize}&start-index=${startIndex}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      } catch (err) {
        if (all.length === 0) throw err; /* ilk sayfa bile başarısızsa hatayı yükselt */
        console.warn("[explore-feed] Sayfalama erken durduruldu:", err);
        break; /* elde edilen postlarla devam et, hepsini kaybetme */
      }
      const entries = data?.feed?.entry || [];
      all = all.concat(entries);
      if (entries.length < pageSize) break; /* son sayfaya ulaşıldı */
      startIndex += pageSize;
    }
    return all;
  };

  /* ---------------------------------------------------------------------
     2) Hafif öğe iskeleti — GERÇEK <video>/<iframe> burada YOKTUR, o
        virtualizer.mount() tarafından havuzdan alınıp .ef-stage'e eklenir.
  --------------------------------------------------------------------- */
  const buildBackdropSrc = (media, poster) => {
    if (media.type === "image") return media.src;
    if (media.type === "video" || media.type === "hls") return poster || "";
    if (media.type === "youtube") return `https://img.youtube.com/vi/${media.src}/hqdefault.jpg`;
    return "";
  };

  const buildItemSkeleton = (post, idx) => {
    const item = EF.Utils.createEl("div", "ef-item");
    item.dataset.index = String(idx);

    const title = Parser.getTitle(post);
    const date = EF.Utils.formatDate(Parser.getPublished(post));
    const author = Parser.getAuthor(post);
    const avatarSrc = Parser.getAvatar(post);
    const postLink = Parser.getPostLink(post);
    const media = post.__media; /* fetchAllPosts filtre aşamasında zaten hesaplandı */
    const poster = Parser.getPoster(post);

    const avatarHtml = avatarSrc
      ? `<img class="ef-avatar" src="${esc(avatarSrc)}" alt="${author}" loading="lazy" decoding="async">`
      : `<div class="ef-avatar-fallback">${author ? esc(author[0].toUpperCase()) : "?"}</div>`;

    const backdropSrc = buildBackdropSrc(media, poster);
    const backdropHtml = `<div class="ef-backdrop"${backdropSrc ? ` style="background-image:url('${esc(backdropSrc)}')"` : ""}></div>`;

    const needsPlayOverlay = media.type === "video" || media.type === "hls";
    const playOverlayHtml = needsPlayOverlay
      ? `<div class="ef-play-overlay" aria-hidden="true">
           <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
             <circle cx="32" cy="32" r="30" fill="rgba(0,0,0,.45)" stroke="rgba(255,255,255,.9)" stroke-width="2"/>
             <path d="M26 20L46 32L26 44V20Z" fill="#fff"/>
           </svg>
         </div>` : "";

    const skipTapLayer = Parser.NO_CONTROL_API_TYPES.includes(media.type);
    const tapLayerHtml = skipTapLayer ? "" : `<div class="ef-tap-layer"></div>`;

    item.innerHTML = `
      ${backdropHtml}
      <div class="ef-stage">
        ${tapLayerHtml}
        ${playOverlayHtml}
        <div class="ef-caption">
          <div class="ef-meta">
            ${avatarHtml}
            <div class="ef-meta-text">
              <span class="ef-post-date">${date}</span>
              ${author ? `<span class="ef-author">${author}</span>` : ""}
            </div>
          </div>
          <a class="ef-card" href="${esc(cleanUrl(postLink))}" rel="noopener noreferrer">
            <span class="ef-card-date">${date}</span>
            <p class="ef-title">${title}</p>
          </a>
        </div>
      </div>`;

    return { item, media, meta: { poster, title, needsPlayOverlay } };
  };

  /* ---------------------------------------------------------------------
     3) Uygulama durumu ve olay bağlama
  --------------------------------------------------------------------- */
  const registry = new Map(); /* index -> {item, media, meta} */
  const virtualizer = new EF.FeedVirtualizer(container, {
    videoPoolSize: 5,
    iframePoolSize: 6,
    onPlayBlocked: (item, show) => {
      const ov = item.querySelector(".ef-play-overlay");
      if (ov) ov.classList.toggle("ef-show", !!show);
    }
  });

  let activeIndex = -1;
  let globalMuted = true;

  const captions = new EF.Observers.CaptionController(container, { autoHideMs: 5000 });

  /* Bir öğe %50 ve üstü görünür olduğunda: tek-aktif-video kuralını
     uygula, oynat, sonraki 2 öğeyi önceden yükle (preload). */
  const activatePlayback = async (item) => {
    const idx = Number(item.dataset.index);
    if (idx === activeIndex) return;
    const prev = activeIndex;
    activeIndex = idx;

    if (prev !== -1) virtualizer.pause(prev);

    const rec = registry.get(idx);
    if (!rec) return;
    const entry = await virtualizer.mount(idx, rec.item, rec.media, rec.meta);
    if (entry) await virtualizer.play(idx);

    /* Sonraki 2 öğeyi sessizce önceden hazırla (oynatmadan) */
    [idx + 1, idx + 2].forEach(async i => {
      const r = registry.get(i);
      if (r) virtualizer.mount(i, r.item, r.media, r.meta);
    });
  };

  const deactivatePlayback = (item) => {
    const idx = Number(item.dataset.index);
    virtualizer.pause(idx);
  };

  const playbackObserver = EF.Observers.createVisibilityObserver(container, {
    threshold: 0.5,
    onEnter: activatePlayback,
    onExit: deactivatePlayback
  });

  const lazyObserver = createLazyLoadObserver(container, item => {
    const idx = Number(item.dataset.index);
    const rec = registry.get(idx);
    if (rec) virtualizer.mount(idx, rec.item, rec.media, rec.meta);
  }, "60% 0px");

  const applyMuted = muted => {
    globalMuted = muted;
    virtualizer.setMuted(muted);
  };

  const wireItemInteractions = (item) => {
    const tapLayer = item.querySelector(".ef-tap-layer");
    if (tapLayer) {
      tapLayer.addEventListener("click", e => {
        if (e.target.closest(".ef-card, .ef-play-overlay")) return;
        applyMuted(!globalMuted);
        captions.show(item);
      }, { passive: true });
    }
    const playOverlay = item.querySelector(".ef-play-overlay");
    if (playOverlay) {
      playOverlay.addEventListener("click", e => {
        e.preventDefault(); e.stopPropagation();
        applyMuted(false);
        const idx = Number(item.dataset.index);
        virtualizer.play(idx).then(() => playOverlay.classList.remove("ef-show"));
      });
    }
  };

  bindPageVisibility(() => virtualizer.pauseAll());

  /* ---------------------------------------------------------------------
     4) Başlat
  --------------------------------------------------------------------- */
  fetchAllPosts()
    .then(entries => {
      if (!entries?.length) {
        container.innerHTML = `<div class="ef-state">İçerik bulunamadı.</div>`;
        return;
      }

      /* Sadece VİDEO içeren konular gösterilsin — resim/metin konuları
         feed'e hiç girmesin. Blogger'ın otomatik kapak resmi
         (media$thumbnail) bu kararda dikkate ALINMAZ. */
      const videoEntries = entries.filter(post => {
        const media = Parser.extractMedia(post.content?.$t || post.summary?.$t || "");
        const isVideo = Parser.VIDEO_TYPES.includes(media.type);
        if (isVideo) post.__media = media;
        return isVideo;
      });

      if (!videoEntries.length) {
        container.innerHTML = `<div class="ef-state">Video içeren konu bulunamadı.</div>`;
        return;
      }

      const frag = document.createDocumentFragment();
      videoEntries.forEach((post, idx) => {
        const { item, media, meta } = buildItemSkeleton(post, idx);
        registry.set(idx, { item, media, meta });
        wireItemInteractions(item);
        lazyObserver.observe(item);
        playbackObserver.observe(item);
        captions.observe(item);
        frag.appendChild(item);
      });
      container.appendChild(frag);

      /* İlk öğeyi hemen bağla ve oynat (kullanıcı beklemesin) */
      const first = registry.get(0);
      if (first) {
        virtualizer.mount(0, first.item, first.media, first.meta).then(() => {
          activeIndex = 0;
          virtualizer.play(0);
        });
        [1, 2].forEach(i => {
          const r = registry.get(i);
          if (r) virtualizer.mount(i, r.item, r.media, r.meta);
        });
      }
    })
    .catch(err => {
      console.error("[explore-feed]", err);
      container.innerHTML = `<div class="ef-state">İçerikler yüklenemedi.<br><small style="opacity:.55">${esc(err.message)}</small></div>`;
    });
})();
