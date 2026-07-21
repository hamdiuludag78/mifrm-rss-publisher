import os
import sys
import json
import hashlib
import requests
import feedparser
from bs4 import BeautifulSoup
from datetime import datetime, timezone

# 1. GİZLİ ÇEVRE DEĞİŞKENLERİNİ ÇEK
BLOGGER_BLOG_ID = os.environ.get("BLOGGER_BLOG_ID")
GIZLI_RSS_AYARLARI = os.environ.get("GIZLI_RSS_AYARLARI")
GIZLI_API_HAVUZU = os.environ.get("GIZLI_API_HAVUZU")

# Önbellek dosyası yolu (Haber hafızası için)
CACHE_FILE = ".posted_cache.json"

if not all([BLOGGER_BLOG_ID, GIZLI_RSS_AYARLARI, GIZLI_API_HAVUZU]):
    print("❌ Kritik Hata: GitHub Secrets veya Variables yapılandırması eksik!")
    sys.exit(1)

# Verileri JSON formatına güvenle dönüştür
try:
    rss_listesi = json.loads(GIZLI_RSS_AYARLARI)
    api_anahtarlari = json.loads(GIZLI_API_HAVUZU)
except Exception as e:
    print(f"❌ JSON Ayrıştırma Hatası: Giriş formatlarınızı kontrol edin. Detay: {e}")
    sys.exit(1)

# Hafıza dosyasını yükle (Aynı haberleri tekrar atmamak için)
posted_cache = []
if os.path.exists(CACHE_FILE):
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            posted_cache = json.load(f)
    except:
        posted_cache = []

def clean_html_for_blogger(raw_html):
    """Blogger zengin metin editörüne tam uyumlu HTML temizliği yapar."""
    soup = BeautifulSoup(raw_html, "html.parser")
    for s in soup(["script", "style", "iframe"]):
        s.decompose()
    return str(soup)

def post_to_blogger(title, content, labels, api_key):
    """Blogger API v3 ile içerik yayınlar."""
    url = f"https://googleapis.com{BLOGGER_BLOG_ID}/posts"
    payload = {
        "kind": "blogger#post",
        "title": title,
        "content": content,
        "labels": labels
    }
    return requests.post(url, json=payload, params={"key": api_key}, headers={"Content-Type": "application/json"})

def main():
    global posted_cache
    now = datetime.now(timezone.utc)
    key_index = 0
    cache_guncellendi = False

    print(f"🚀 Otomasyon Başlatıldı: {now.strftime('%d.%m.%Y %H:%M:%S')} (UTC)")
    print(f"🔑 API Havuzunda {len(api_anahtarlari)} adet aktif anahtar yüklü.")

    for src in rss_listesi:
        rss_url = src.get("url")
        interval = int(src.get("dakika", 60))
        custom_labels = src.get("etiketler", "")
        auto_category = src.get("oto_kategori", True)

        # Zamanlama Filtresi: GitHub Actions cron ayarı 5 dakikada birdir.
        # Şu anki saatin dakika değerinin, belirlenen periyoda tam bölünüp bölünmediğine bakar.
        if (now.minute % interval) != 0:
            print(f"⏱️ Zaman Beklemesi: {rss_url} için {interval} dakikalık periyot henüz gelmedi. Atlanıyor.")
            continue

        print(f"📰 RSS Kaynağı taranıyor: {rss_url}")
        feed = feedparser.parse(rss_url)
        
        if not feed.entries:
            print(f"⚠️ Uyarı: {rss_url} adresinden haber çekilemedi veya geçersiz RSS.")
            continue

        base_labels = [l.strip() for l in custom_labels.split(",")] if custom_labels else []

        # Her periyotta kaynak başına en güncel en fazla 3 haberi işleme al (Kota tasarrufu için)
        for entry in feed.entries[:3]:
            link = entry.get("link")
            if not link:
                continue

            link_hash = hashlib.md5(link.encode('utf-8')).hexdigest()
            
            # Haber mükerrerlik (Çift paylaşım) kontrolü
            if link_hash in posted_cache:
                continue

            title = entry.get("title", "")
            raw_content = entry.get("summary") or entry.get("description") or ""
            clean_content = clean_html_for_blogger(raw_content)

            # Otomatik Kategori Eşleştirme (RSS tags -> Blogger etiketleri)
            final_labels = list(base_labels)
            if auto_category and "tags" in entry:
                for tag in entry.tags:
                    term = tag.get("term")
                    if term and term not in final_labels:
                        final_labels.append(term)

            # Blogger'a Gönderim Döngüsü (Yedekli Kota Yönetimi)
            success = False
            while key_index < len(api_anahtarlari):
                active_key = api_anahtarlari[key_index]
                res = post_to_blogger(title, clean_content, final_labels, active_key)

                if res.status_code == 403 or "quota" in res.text.lower():
                    print(f"💥 Anahtar [{key_index}] kotası tükendi! Sonraki yedek anahtara geçiliyor...")
                    key_index += 1
                    continue
                elif res.status_code == 200:
                    print(f"✅ Başarıyla Blogger'a Gönderildi: {title}")
                    posted_cache.append(link_hash)
                    cache_guncellendi = True
                    success = True
                    break
                else:
                    print(f"❌ Blogger Hatası ({res.status_code}): {res.text[:100]}")
                    break

            if not success and key_index >= len(api_anahtarlari):
                print("❌ KRİTİK: API havuzundaki tüm anahtarların kotası doldu! İşlem durduruluyor.")
                break

    # Hafızayı diske kaydet
    if cache_guncellendi:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(posted_cache, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
