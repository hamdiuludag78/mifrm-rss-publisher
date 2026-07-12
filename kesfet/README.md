# explore-feed

Blogger için tam ekran (TikTok/Instagram tarzı) video/görsel keşfet akışı.

## Dosyalar
- `explore-feed.css` — tüm stiller
- `explore-feed.js` — tüm mantık (feed çekme, oynatma, dokunma/ses davranışı)
- `explore-feed.html` — sayfaya eklenecek tek satırlık konteyner

## Blogger'a kurulum

GitHub'a yükledikten sonra jsDelivr üzerinden CDN linki alın (raw.githubusercontent.com
yerine jsDelivr kullanın — daha hızlı ve doğru Content-Type döner):

```
https://cdn.jsdelivr.net/gh/KULLANICI_ADIN/REPO_ADIN@main/explore-feed.css
https://cdn.jsdelivr.net/gh/KULLANICI_ADIN/REPO_ADIN@main/explore-feed.js
```

Blogger gönderisine (HTML görünümünde) şunu ekleyin:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/KULLANICI_ADIN/REPO_ADIN@main/explore-feed.css">

<div id="explore-feed"></div>

<script src="https://cdn.jsdelivr.net/gh/KULLANICI_ADIN/REPO_ADIN@main/explore-feed.js"></script>
```

Sıra önemli: `<div id="explore-feed">` script'ten ÖNCE gelmeli (script çalıştığında
`document.getElementById("explore-feed")` bulabilsin diye).

## Not
Dosyayı GitHub'da güncelledikten sonra jsDelivr önbelleği ~12-24 saat gecikmeli
güncellenebilir. Anında test etmek isterseniz `@main` yerine geçici olarak commit
hash'i kullanabilir (`@<commit-sha>`) ya da `raw.githubusercontent.com` linkini
kullanabilirsiniz (CORS/Content-Type sorunlarına karşı script/link etiketlerinde
`type="text/css"` / `type="text/javascript"` belirtmeniz gerekebilir).
