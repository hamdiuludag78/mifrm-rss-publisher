(()=>{
"use strict";

/* ==========================================================================
   DEĞİŞİKLİK ÖZETİ (videoların açılmama sorunu ve genel sağlamlaştırma)
   --------------------------------------------------------------------------
   1) extractMedia(): Sadece ".mp4" uzantısı ve YouTube linkleri aranıyordu.
      Blogger'ın KENDİ video yükleme özelliğiyle eklenen videolar
      (iframe src="https://www.blogger.com/video.g?token=...") hiç
      yakalanmıyordu -> bu videolar hep resme düşüyordu. Artık ayrı bir
      "bloggervideo" tipi olarak tanınıyor ve gömülüyor. Ayrıca .webm/.mov
      ve query-string'li video linkleri de destekleniyor.
   2) YouTube postMessage komutları (mute/play) iframe "load" olayından hemen
      sonra TEK SEFER gönderiliyordu. YouTube player'ın kendi mesaj
      dinleyicisi bu an itibarıyla henüz hazır olmayabiliyor ve komut
      sessizce kayboluyor; bu da "video görünüyor ama oynamıyor" sorununa
      yol açan en olası nedenlerden biri. Artık komutlar kısa aralıklarla
      birkaç kez tekrar gönderiliyor (idempotent, zararsız).
   3) <video> ve <iframe> yüklemesi tek bir olaya (oncanplay / onload)
      bağlıydı; bu olay bazı mobil tarayıcılarda veya yavaş/aksayan
      CDN'lerde hiç tetiklenmeyebiliyordu ve öğe sonsuza dek iskelet
      (skeleton) animasyonunda kalıyordu. Artık birden fazla olay
      dinleniyor + bir güvenlik zaman aşımı (timeout) var.
   4) IntersectionObserver'lar tarayıcı viewport'unu root alıyordu; kendi
      kaydırma konteynerimiz olduğu için artık explore-feed konteyneri
      root olarak veriliyor (daha doğru görünürlük oranı).
   5) http:// ile başlayan medya/avatar linkleri https sayfada "mixed
      content" olarak engellenebiliyordu -> otomatik https'e yükseltiliyor.
   6) Bazı tarayıcılar/politikalar sessiz videoyu bile otomatik
      başlatmayabiliyor. Bu durumda artık görünür bir "oynat" ikonu
      beliriyor ve dokunarak/​tıklayarak elle başlatılabiliyor (video hiç
      açılmıyormuş gibi görünmesin diye).
   7) Sekme arka plana alındığında (visibilitychange) oynayan medyalar
      duraklatılıyor; pil/performans için.

   -------------------- v3 EKLERİ (bu güncelleme) --------------------------
   8) TAM EKRAN OTURMA (mobil + masaüstü/tablet/iPad):
      - 100vh yerine 100dvh kullanılıyor: mobilde tarayıcı adres çubuğu
        açılıp kapanınca video boyu zıplamıyor, gerçekten ekrana tam oturuyor.
      - Masaüstünde (≥701px) artık video/görsel tüm pencere genişliğine
        GERİLMİYOR. Her .ef-item içine iki katman eklendi:
          .ef-backdrop → aynı görselin/afişin bulanıklaştırılmış,
                         büyütülmüş kopyası (arkaplan dolgusu)
          .ef-stage    → gerçek medyanın oturduğu, telefon oranında
                         (max 460px) ORTALANMIŞ kart
        Bu tam olarak TikTok/Instagram'ın masaüstü görünümüdür: video
        yanları germiyor, ortada bir "telefon ekranı" gibi duruyor.
   9) BAŞLIK OTOMATİK GİZLENME: Video/görsel başlığı + avatar + tarih
      artık bir .ef-caption sarmalayıcısında. Bir öğe ekranda aktif hale
      gelince 5 saniyelik sayaç başlıyor, süre dolunca (.ef-ui-hidden
      class'ı ile) yumuşakça soluyor. Ekrana (video üzerine, buton/link
      hariç herhangi bir yere) dokununca/tıklayınca tekrar beliriyor ve
      sayaç sıfırlanıyor. Bu mantık, sadece video/iframe'i izleyen
      mediaObserver'dan bağımsız yeni bir "activeObserver" ile TÜM öğe
      tiplerinde (görsel dahil) çalışıyor.
   10) SES BUTONU KONUMU: Artık başlık kartının altına/bitişiğine değil,
      TikTok/Instagram'daki gibi SAĞ ÜST köşeye sabitlendi (env safe-area
      destekli). Böylece masaüstünde "çok aşağıda kalma" sorunu ortadan
      kalktı; buton ekran boyutundan bağımsız hep aynı yerde.

   -------------------- v4 DÜZELTMELERİ ---------------------
   11) (v5'te tamamen değiştirildi, aşağıya bakın — bkz. madde 14)
   12) MASAÜSTÜ DÜZENİNİN MOBİLDE YANLIŞLIKLA TETİKLENMESİ DÜZELTİLDİ:
      v3'teki "≥701px'te videoyu ortala" kuralı sadece ekran GENİŞLİĞİNE
      bakıyordu. Bir tarayıcının "Masaüstü Sitesi" modu (ör. Brave'de)
      veya duyarlı olmayan bir viewport, telefonda da geniş bir sanal
      genişlik bildirebiliyor — bu da videonun küçük bir kutu içinde
      ortalanmış görünmesine yol açıyordu. Artık kural sadece genişliğe
      değil, GERÇEK fare/hover donanımına da bakıyor: "(pointer:fine) and
      (hover:hover)". Dokunmatik ekranlar (masaüstü modu açık olsa bile)
      her zaman pointer:coarse bildirdiğinden, bu blok artık yalnızca
      gerçek PC/Mac'lerde devreye giriyor.
   13) SADECE VİDEOLU KONULAR: Feed artık içinde gerçek video/YouTube/
      Blogger-video bulunmayan (salt metin veya salt görsel) konuları hiç
      göstermiyor. Filtre, gönderiler DOM'a eklenmeden ÖNCE uygulanıyor
      (extractMedia() ile), Blogger'ın otomatik kapak resmi (media$thumbnail)
      bu kararda dikkate ALINMIYOR — sadece gönderi içeriğinde gerçek video
      etiketi varsa "video konusu" sayılıyor.

   -------------------- v5 DÜZELTMESİ (bu güncelleme) -----------------------
   14) v4'teki "#ef-sentinel ile header yüksekliğini otomatik ölç" yöntemi
      GERİ ALINDI. Sebep: bu widget, konu (post) içeriği olarak sayfaya
      gömülü — yani ondan önce DOM'da sadece site navbar'ı değil, forum
      arama kutusu, breadcrumb ("Forum > Keşfet") ve konu başlık kartı
      (avatar, tarih, "14 dk okuma", "Özetle" butonu, "Keşfet" başlığı)
      da yer alıyor. Ölçüm bunların TAMAMINI "header" sanıp videoyu aşağı
      itti; bu içerik ortaya çıktı ve video küçücük/üst üste binmiş
      göründü — önceden bunlar widget'ın tam ekran kaplamasının ALTINDA
      gizli kalıyordu.
      Çözüm: header yüksekliğini tahmin etmeye hiç çalışmıyoruz. Widget
      artık TikTok/Instagram'daki gibi GERÇEK tam ekran: top:0'dan
      başlıyor, z-index'i mümkün olan en yükseğe (2147483000) çekildi —
      navbar dahil sayfadaki HER ŞEYİN üstünü kaplıyor, body'de
      overflow:hidden olduğu için altındaki hiçbir şey görünmüyor/
      kaymıyor. Bu hem bugünkü "arama kutusu/breadcrumb ortaya çıktı"
      sorununu hem de önceki "header 2 satıra sarınca video üst üste
      biniyor" sorununu kökten çözüyor; çünkü artık kaplanacak bir
      "header yüksekliği" hesaplamaya gerek yok.
   ========================================================================== */

const $   = id => document.getElementById(id);
const esc = s  => String(s||"").replace(/[&<>"']/g,
  m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[m]);

/* Blogger thumbnail URL → maksimum çözünürlük */
const maxRes = url => {
  if(!url) return "";
  return url
    .replace(/\/s\d+(-c)?\//,  "/s1600/")
    .replace(/\/w\d+-h\d+(-[a-z]+)*\//, "/s1600/")
    .replace(/=s\d+$/,         "=s1600");
};

/* Protokolsiz (//...) URL'leri güvenli hale getir */
const absUrl = url => {
  if(!url) return "";
  return url.startsWith("//") ? "https:" + url : url;
};

/* https sayfada http:// kaynaklar "mixed content" olarak engellenebilir */
const forceHttps = url => url ? url.replace(/^http:\/\//i, "https://") : url;

const cleanUrl = url => forceHttps(absUrl(url||""));

/* Post içeriğinden medya çek */
const extractMedia = html => {
  if(!html) return {type:"none",src:""};

  /* YouTube (youtube.com/embed, youtube-nocookie.com/embed veya youtu.be) */
  const ytM = html.match(
    /(?:src|data-src)=["']([^"']*(?:youtube(?:-nocookie)?\.com\/embed|youtu\.be)\/([A-Za-z0-9_-]{11})[^"']*)["']/i
  );
  if(ytM && ytM[2]) return {type:"youtube", src:ytM[2]};

  /* Blogger'ın kendi video yükleme özelliği (video.g embed) */
  const bv = html.match(/(?:src|data-src)=["']([^"']*blogger\.com\/video\.g[^"']*)["']/i)
          || html.match(/(?:src|data-src)=["']([^"']*blogspot\.com\/video\.g[^"']*)["']/i);
  if(bv) return {type:"bloggervideo", src: cleanUrl(bv[1])};

  /* Doğrudan video dosyası: mp4 / webm / mov, sorgu parametreli olabilir */
  const vid = html.match(/(?:src|data-src)=["']([^"']+\.(?:mp4|webm|mov)(?:\?[^"']*)?)["']/i);
  if(vid) return {type:"video", src: cleanUrl(vid[1])};

  /* İlk img */
  const img = html.match(/(?:src|data-src)=["']([^"']+\.(jpe?g|png|webp|gif)[^"']*)["']/i);
  if(img) return {type:"image", src: cleanUrl(maxRes(img[1]))};

  return {type:"none",src:""};
};

const getAvatar = post => {
  try{
    const src = post.author?.[0]?.["gd$image"]?.src || "";
    /* Blogger varsayılan gri avatar fingerprint'ini atla */
    if(src && !src.includes("zFdxGE77vvD2w5xHy6jkVuElKv")) return cleanUrl(maxRes(src));
  }catch(_){}
  return "";
};

const getAuthor  = post => post.author?.[0]?.name?.$t || "";
const formatDate = iso => {
  try{ return new Date(iso).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}); }
  catch(_){ return ""; }
};

/* ── Konteyner ── */
const container = $("explore-feed");
if(!container) return;

let globalMuted = true;
const pageOrigin = location.origin;

/* YouTube iframe API'sine postMessage komutu gönder.
   Iframe "load" olayı, YouTube player'ın kendi mesaj dinleyicisini
   kaydetmesinden HEMEN SONRA garanti değildir; bu yüzden komut kısa
   aralıklarla birkaç kez (zararsız, idempotent) tekrar gönderilir. */
const ytCommand = (iframe, func, args=[]) => {
  if(!iframe || !iframe.contentWindow) return;
  const payload = JSON.stringify({event:"command", func, args});
  const send = () => { try{ iframe.contentWindow.postMessage(payload, "*"); }catch(_){} };
  send();
  setTimeout(send, 250);
  setTimeout(send, 800);
  setTimeout(send, 1600);
};

/* Bir öğe için "oynat" dokunma katmanını göster/gizle
   (tarayıcı otomatik oynatmayı engellerse kullanıcı elle başlatabilsin) */
const setPlayOverlay = (item, show) => {
  const ov = item.querySelector(".ef-play-overlay");
  if(ov) ov.classList.toggle("ef-show", !!show);
};

/* Ses durumunu TÜM yüklenmiş medyalara uygula (ayrı bir buton olmadığı için
   artık ekrana dokunma hem başlığı gösteriyor hem sesi açıp kapatıyor). */
const applyMuted = muted => {
  globalMuted = muted;
  document.querySelectorAll(".ef-item.ef-loaded").forEach(it => {
    const v = it.querySelector("video.ef-media");
    if(v) v.muted = globalMuted;
    const f = it.querySelector("iframe.ef-media[data-type='youtube']");
    if(f) ytCommand(f, globalMuted ? "mute" : "unMute");
  });
};

/* ── Başlık/İsim otomatik gizleme (TikTok/Instagram davranışı) ──
   Bir öğe aktif hale geldiğinde başlık görünür ve 5 saniyelik bir
   sayaç başlar; süre dolunca başlık solarak kaybolur. Ekrana (video
   üzerine) dokunulduğunda tekrar görünür ve sayaç sıfırlanır. */
const showCaption = item => {
  item.classList.remove("ef-ui-hidden");
  clearTimeout(item._uiTimer);
  item._uiTimer = setTimeout(() => item.classList.add("ef-ui-hidden"), 5000);
};
const hideCaption = item => {
  item.classList.add("ef-ui-hidden");
  clearTimeout(item._uiTimer);
};

/* Görsel/video/YouTube fark etmeksizin TÜM öğe tiplerinde çalışması için
   ayrı, medya oynatmadan bağımsız bir gözlemci kullanılıyor
   (mediaObserver sadece video/iframe'i gözlemliyor, görselleri değil). */
const activeObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    const item = e.target;
    if(e.isIntersecting) showCaption(item);
    else { clearTimeout(item._uiTimer); item.classList.remove("ef-ui-hidden"); }
  });
}, {root: container, threshold: 0.5});

/* Görünen video/iframe'i başlat, kaybolunca durdur */
const mediaObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    const item    = e.target;
    const vid     = item.querySelector("video.ef-media");
    const ytFrame = item.querySelector("iframe.ef-media[data-type='youtube']");

    if(e.isIntersecting){
      if(vid){
        vid.muted = globalMuted;
        const p = vid.play();
        if(p && typeof p.catch === "function"){
          p.then(() => setPlayOverlay(item, false))
           .catch(() => setPlayOverlay(item, true)); /* otomatik oynatma engellendi */
        }
      }
      if(ytFrame){
        ytCommand(ytFrame, globalMuted ? "mute" : "unMute");
        ytCommand(ytFrame, "playVideo");
      }
    } else {
      if(vid){ vid.pause(); vid.currentTime = 0; setPlayOverlay(item, false); }
      if(ytFrame){ ytCommand(ytFrame, "pauseVideo"); }
    }
  });
}, {root: container, threshold:0.5});

/* ── Item oluştur ── */
const buildItem = (post, idx) => {
  const item      = document.createElement("div");
  item.className  = "ef-item";

  const title     = esc(post.title?.$t || "İçerik");
  const published = post.published?.$t || new Date().toISOString();
  const date      = formatDate(published);
  const author    = esc(getAuthor(post));
  const avatarSrc = getAvatar(post);
  const postLink  = (post.link||[]).find(l=>l.rel==="alternate")?.href || "#";

  /* Medya kaynağı — önce içerikte gerçek video/YouTube/Blogger-video var mı
     diye bak, yoksa Blogger'ın verdiği thumbnail'e (statik görsel) düş.
     (post.__media, feed filtrelenirken zaten hesaplandıysa tekrar
     regex çalıştırmamak için burada yeniden kullanılıyor.) */
  let media = post.__media || extractMedia(post.content?.$t || post.summary?.$t || "");

  /* Poster/afiş görseli — video yüklenene kadar siyah ekran yerine gösterilir */
  const posterSrc = post["media$thumbnail"]?.url ? cleanUrl(maxRes(post["media$thumbnail"].url)) : "";

  if(media.type === "none" && post["media$thumbnail"]?.url){
    media = {type:"image", src: posterSrc};
  }
  if(!media.src){
    media = {type:"image", src:`https://picsum.photos/seed/${idx+1}/1080/1920`};
  }

  /* Avatar */
  const avatarHtml = avatarSrc
    ? `<img class="ef-avatar" src="${esc(avatarSrc)}" alt="${author}" loading="lazy" decoding="async">`
    : `<div class="ef-avatar-fallback">${author ? esc(author[0].toUpperCase()) : "?"}</div>`;

  /* Medya HTML */
  let mediaHtml = "";
  let needsPlayOverlay = false;

  if(media.type === "image"){
    mediaHtml = `<img class="ef-media" data-type="image" data-src="${esc(media.src)}" alt="${title}" decoding="async" fetchpriority="${idx<3?'high':'auto'}">`;
  } else if(media.type === "video"){
    const posterAttr = posterSrc ? `poster="${esc(posterSrc)}"` : "";
    mediaHtml = `<video class="ef-media" data-type="video" data-src="${esc(media.src)}" ${posterAttr} muted playsinline webkit-playsinline="true" disablepictureinpicture loop preload="none"></video>`;
    needsPlayOverlay = true;
  } else if(media.type === "youtube"){
    const ytSrc = `https://www.youtube-nocookie.com/embed/${media.src}?autoplay=1&mute=1&loop=1&playlist=${media.src}&controls=0&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(pageOrigin)}`;
    mediaHtml = `<iframe class="ef-media" data-type="youtube" data-src="${esc(ytSrc)}" frameborder="0" allow="autoplay;encrypted-media;picture-in-picture" allowfullscreen></iframe>`;
  } else if(media.type === "bloggervideo"){
    const sep = media.src.includes("?") ? "&" : "?";
    mediaHtml = `<iframe class="ef-media" data-type="bloggervideo" data-src="${esc(media.src + sep + 'autoplay=1')}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  }

  /* Ses butonu kaldırıldı (v6) — video/YouTube her zaman sessiz başlar,
     oynatma engellenirse kullanıcı oynat ikonuna dokunarak sesle başlatabilir. */

  /* Masaüstü bulanık arkaplan için görsel kaynağı (görsel/afiş/YouTube
     kapak resmi) — Blogger video ve doğrudan mp4'lerde afiş yoksa
     arkaplan düz siyah kalır, sorun değil. */
  let backdropSrc = "";
  if(media.type === "image") backdropSrc = media.src;
  else if(media.type === "video") backdropSrc = posterSrc || "";
  else if(media.type === "youtube") backdropSrc = `https://img.youtube.com/vi/${media.src}/hqdefault.jpg`;
  const backdropHtml = `<div class="ef-backdrop"${backdropSrc ? ` style="background-image:url('${esc(backdropSrc)}')"` : ""}></div>`;

  const playOverlayHtml = needsPlayOverlay
    ? `<div class="ef-play-overlay" aria-hidden="true">
         <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
           <circle cx="32" cy="32" r="30" fill="rgba(0,0,0,.45)" stroke="rgba(255,255,255,.9)" stroke-width="2"/>
           <path d="M26 20L46 32L26 44V20Z" fill="#fff"/>
         </svg>
       </div>` : "";

  item.innerHTML = `
    ${backdropHtml}
    <div class="ef-stage">
      ${mediaHtml}
      <div class="ef-tap-layer"></div>
      ${playOverlayHtml}
      <div class="ef-caption">
        <div class="ef-meta">
          ${avatarHtml}
          <div class="ef-meta-text">
            <span class="ef-post-date">${date}</span>
            ${author ? `<span class="ef-author">${author}</span>` : ""}
          </div>
        </div>
        <a class="ef-card" href="${esc(postLink)}" rel="noopener noreferrer">
          <span class="ef-card-date">${date}</span>
          <p class="ef-title">${title}</p>
        </a>
      </div>
    </div>`;

  /* Ekrana (video üzerine) dokununca/tıklayınca başlık görünür, 5 saniyelik
     gizlenme sayacı sıfırlanır VE ses açılıp/kapatılır (ayrı bir ses butonu
     olmadığı için dokunma bu iki işi birden yapıyor). Tıklama artık gerçek
     medyanın (video/iframe) değil, üstündeki şeffaf .ef-tap-layer katmanının
     üzerine düşüyor — böylece iframe'lerin tıklamayı yutması sorunu da çözülüyor.
     Başlık kartına (link) veya oynat ikonuna dokunulduğunda bu davranış
     devreye girmesin diye onlar hariç tutulur. */
  const tapLayer = item.querySelector(".ef-tap-layer");
  if(tapLayer){
    tapLayer.addEventListener("click", e => {
      if(e.target.closest(".ef-card, .ef-play-overlay")) return;
      applyMuted(!globalMuted);
      showCaption(item);
    });
  }


  /* Otomatik oynatma engellenirse kullanıcı dokunarak/tıklayarak başlatabilsin */
  const playOverlay = item.querySelector(".ef-play-overlay");
  if(playOverlay){
    playOverlay.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      const vid = item.querySelector("video.ef-media");
      if(vid){
        applyMuted(false);
        vid.play().then(() => setPlayOverlay(item, false)).catch(()=>{});
      }
    });
  }

  return item;
};

/* ── Medyayı yükle (src ata) ── */
const loadMedia = (item, fallbackIdx) => {
  const media = item.querySelector(".ef-media");
  if(!media || !media.dataset.src) return;
  const src = media.dataset.src;
  delete media.dataset.src;

  if(media.tagName === "IMG"){
    media.onload  = () => { item.classList.add("ef-loaded"); media.style.willChange="auto"; };
    media.onerror = () => {
      media.src = `https://picsum.photos/seed/${fallbackIdx}/1080/1920`;
      item.classList.add("ef-loaded");
    };
    media.src = src;

  } else if(media.tagName === "VIDEO"){
    let settled = false;
    const finish = (ok) => {
      if(settled) return;
      settled = true;
      item.classList.add("ef-loaded");
      if(ok !== false) mediaObserver.observe(item);
    };
    media.addEventListener("loadeddata", () => finish(true), {once:true});
    media.addEventListener("canplay",    () => finish(true), {once:true});
    media.addEventListener("error",      () => finish(false), {once:true});
    media.src = src;
    media.load();
    /* Bazı mobil tarayıcılarda / yavaş CDN'lerde olaylar hiç tetiklenmeyebilir:
       öğenin sonsuza dek iskelet animasyonunda kalmaması için güvenlik ağı */
    setTimeout(() => finish(true), 6000);

  } else if(media.tagName === "IFRAME"){
    let settled = false;
    const finish = () => {
      if(settled) return;
      settled = true;
      item.classList.add("ef-loaded");
      mediaObserver.observe(item);
    };
    media.addEventListener("load", finish, {once:true});
    media.src = src;
    setTimeout(finish, 6000);
  }
};

/* ── Lazy observer ── */
const lazyObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if(!e.isIntersecting) return;
    lazyObserver.unobserve(e.target);
    loadMedia(e.target, Date.now());
  });
}, {root: container, rootMargin:"100% 0px"});

/* Sekme arka plana alınınca oynayan medyaları duraklat (pil/performans) */
document.addEventListener("visibilitychange", () => {
  if(!document.hidden) return;
  document.querySelectorAll(".ef-item.ef-loaded video.ef-media").forEach(v => v.pause());
  document.querySelectorAll(".ef-item.ef-loaded iframe.ef-media[data-type='youtube']").forEach(f => ytCommand(f, "pauseVideo"));
});

/* ── Feed fetch (Blogger tek istekte ~150 sonuçla sınırlar,
      bu yüzden tüm gönderileri almak için sayfalama yapılır) ── */
const fetchAllPosts = async () => {
  const pageSize   = 150;
  const maxPages   = 50; /* güvenlik sınırı: sonsuz döngüyü engeller (~7500 gönderi) */
  let startIndex   = 1;
  let all          = [];

  for(let page = 0; page < maxPages; page++){
    let data;
    try{
      const res = await fetch(`/feeds/posts/default?alt=json&max-results=${pageSize}&start-index=${startIndex}`);
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    }catch(err){
      if(all.length === 0) throw err; /* ilk sayfa bile başarısızsa hatayı yükselt */
      console.warn("[explore-feed] Sayfalama erken durduruldu:", err);
      break; /* elde edilen postlarla devam et, hepsini kaybetme */
    }
    const entries = data?.feed?.entry || [];
    all = all.concat(entries);
    if(entries.length < pageSize) break; /* son sayfaya ulaşıldı */
    startIndex += pageSize;
  }
  return all;
};

fetchAllPosts()
  .then(entries => {
    if(!entries?.length){
      container.innerHTML = `<div class="ef-state">İçerik bulunamadı.</div>`;
      return;
    }

    /* Sadece VİDEO içeren konular gösterilsin — resim/metin konuları
       feed'e hiç girmesin. media$thumbnail (Blogger'ın otomatik
       kapak resmi) burada SAYILMAZ; sadece gönderi içeriğinde gerçek
       <video>, YouTube embed veya Blogger video.g varsa "video konusu"
       kabul edilir. Sonuç, buildItem()'ın tekrar regex çalıştırmaması
       için post.__media içine önbelleklenir. */
    const videoEntries = entries.filter(post => {
      const media = extractMedia(post.content?.$t || post.summary?.$t || "");
      const isVideo = media.type === "video" || media.type === "youtube" || media.type === "bloggervideo";
      if(isVideo) post.__media = media;
      return isVideo;
    });

    if(!videoEntries.length){
      container.innerHTML = `<div class="ef-state">Video içeren konu bulunamadı.</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    videoEntries.forEach((post, i) => {
      const item = buildItem(post, i);
      lazyObserver.observe(item);
      activeObserver.observe(item);
      frag.appendChild(item);
    });
    container.appendChild(frag);

    /* İlk 3 hemen yükle */
    container.querySelectorAll(".ef-item").forEach((item, i) => {
      if(i >= 3) return;
      lazyObserver.unobserve(item);
      loadMedia(item, i+1);
    });
  })
  .catch(err => {
    console.error("[explore-feed]", err);
    container.innerHTML = `<div class="ef-state">İçerikler yüklenemedi.<br><small style="opacity:.55">${esc(err.message)}</small></div>`;
  });

})();
