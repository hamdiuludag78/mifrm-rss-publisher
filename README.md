# 🚀 Gelişmiş Blogger RSS Otomasyon & Yönetim Paneli

Bu proje; birden fazla RSS kaynağından otomatik olarak içerik çekip Blogger sitenizde zengin metin (HTML) biçiminde paylaşan, günlük API kotalarını aşmak için çoklu API anahtarı havuzu barındıran ve web tabanlı tamamen güvenli bir admin paneline sahip **GitHub Actions + Supabase + Python** tabanlı gelişmiş bir otomasyon sistemidir.

---

## 🛠️ Temel Özellikler

- 🔑 **Çoklu API Havuzu (Kota Çözümü):** 10.000 sorgu limiti dolduğunda otomatik olarak bir sonraki API anahtarına geçiş yapar.
- ⚡ **Gelişmiş Zamanlama:** RSS bazlı dinamik zaman filtresi (5 dk, 10 dk, 30 dk, 1-2-3 saat seçenekleri).
- 🏷️ **Akıllı Etiket Sistemi:** Hem elinizle yazdığınız sabit etiketleri basar hem de RSS içerisindeki kategorileri otomatik ayıklayıp Blogger etiketine dönüştürür.
- 🔐 **Güvenli Admin Paneli:** `Hamdi` kullanıcı adı ve `*Arif1978` şifresi kaynak kodda görünmez, tamamen veritabanı seviyesinde şifreli (MD5) doğrulanır.
- 📝 **Editör Uyumluluğu:** Çekilen RSS içeriklerindeki HTML yapısını bozmadan zengin metin olarak Blogger'a aktarır.

---

## 📋 Adım Adım Kurulum Kılavuzu

### Adım 1: Google Cloud Panelinden Blogger API Anahtarları Alma

Blogger günlük kota limitini esnetmek için bu adımı **en az 2 veya 3 farklı Google hesabıyla** ya da aynı hesapta **birden fazla proje** açarak tekrarlamanız önerilir. Her proje size temiz bir +10.000 kota hakkı verir.

1. [Google Cloud Console](https://google.com) adresine gidin ve Google hesabınızla giriş yapın.
2. Üst menüde yer alan **Proje Seçici** butonuna tıklayın ve **"Yeni Proje" (New Project)** oluşturun.
3. Sol menüden **"API'ler ve Hizmetler" (APIs & Services) > "Kitaplık" (Library)** sekmesine geçin.
4. Arama çubuğuna **"Blogger API v3"** yazın, çıkan sonuca tıklayın ve **"Etkinleştir" (Enable)** butonuna basın.
5. API etkinleştikten sonra otomatik yönlendirileceğiniz sayfada (veya sol menüde) **"Kimlik Bilgileri" (Credentials)** sekmesine tıklayın.
6. Üst menüdeki **"+ Kimlik Bilgisi Oluştur" (Create Credentials)** butonuna basın ve **"API Anahtarı" (API Key)** seçeneğini seçin.
7. Ekrana gelen `AIzaSy...` şeklindeki uzun kodu kopyalayın ve bir yere not edin. (Bu sizin Blogger API anahtarınızdır).
8. **Önemli (Blog ID Bulma):** Blogger panelinize (`blogger.com`) girin. Tarayıcınızın adres çubuğundaki URL'ye bakın. URL'nin sonundaki `blogID=XXXXXXXXXXXXXXXXXXX` kısmındaki sayılar sizin **Blogger Blog ID** numaranızdır. Bunu da not edin.

---

### Adım 2: Supabase Veritabanı Altyapısını Kurma

1. [Supabase](https://supabase.com) adresine gidin, ücretsiz bir hesap oluşturun ve yeni bir proje başlatın.
2. Projeniz açıldığında sol menüde yer alan **"SQL Editor"** (`>-` simgesi) sayfasına girin.
3. **"New Query"** butonuna basarak açılan boş sayfaya aşağıdaki tek parça SQL kodunu yapıştırın ve sağ üstteki **"Run"** butonuna tıklayın:

```sql
-- 1. TABLO: RSS Kaynakları ve Ayarlar Tablosu
CREATE TABLE IF NOT EXISTS rss_sources (
    id SERIAL PRIMARY KEY,
    rss_url TEXT UNIQUE NOT NULL,
    custom_labels TEXT,
    auto_category_enable BOOLEAN DEFAULT true,
    interval_minutes INTEGER DEFAULT 60,
    last_run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '1 day',
    is_active BOOLEAN DEFAULT true
);

-- 2. TABLO: Mükerrer (Çift) Paylaşım Engelleme Hafızası
CREATE TABLE IF NOT EXISTS posted_cache (
    id SERIAL PRIMARY KEY,
    post_link_hash TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. TABLO: API Anahtarları Dağıtım Tablosu
CREATE TABLE IF NOT EXISTS blogger_keys (
    id SERIAL PRIMARY KEY,
    api_key TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TABLO: Yönetici Kimlik Bilgileri Tablosu
CREATE TABLE IF NOT EXISTS admin_credentials (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
);

-- 5. VERİ: Giriş Bilgilerini Şifreli Olarak Kaydetme (Görünmez Şifreleme)
INSERT INTO admin_credentials (username, password_hash)
VALUES ('Hamdi', md5('*Arif1978'))
ON CONFLICT (username) DO NOTHING;

-- 6. GÜVENLİK FONKSİYONU: Kaynak Koddan Şifre Gizleme Mekanizması
CREATE OR REPLACE FUNCTION verify_admin_login(p_username TEXT, p_password TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    is_valid BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM admin_credentials 
        WHERE username = p_username AND password_hash = md5(p_password)
    ) INTO is_valid;
    
    RETURN is_valid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

4. Tablolar oluştuktan sonra sol menüden **"Table Editor"** sayfasına gelin. `blogger_keys` tablosunu seçin, **"Insert row"** butonuna basarak **Adım 1**'de Google Cloud'dan aldığınız API anahtarlarını buraya tek tek satır olarak ekleyin.

---

### Adım 3: GitHub Deponuzu (Repository) Hazırlama

GitHub deponuzda şu 4 ana dosyanın ve klasör yapısının hatasız bulunduğundan emin olun:

#### 1. `.github/workflows/run.yml` (Otomatik Zamanlayıcı)
```yaml
name: Blogger RSS Automator

on:
  schedule:
    - cron: '*/5 * * * *' # Her 5 dakikada bir çalışarak süresi gelen RSS'leri tetikler
  workflow_dispatch:

jobs:
  run-bot:
    runs-on: ubuntu-latest
    steps:
    - name: Depoyu Klonla
      uses: actions/checkout@v4
    - name: Python Kurulumu
      uses: actions/setup-python@v5
      with:
        python-version: '3.10'
    - name: Bağımlılıkları Yükle
      run: |
        python -m pip install --upgrade pip
        pip install -r requirements.txt
    - name: Botu Çalıştır
      env:
        SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
        SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
        BLOGGER_BLOG_ID: ${{ secrets.BLOGGER_BLOG_ID }}
      run: python main.py
```

#### 2. `requirements.txt` (Kütüphaneler)
```text
supabase>=2.4.0
requests>=2.31.0
feedparser>=6.0.11
beautifulsoup4>=4.12.3
```

#### 3. `main.py` ve `index.html` dosyalarını deponuzun ana dizinine eksiksiz ekleyin.
*(Not: `index.html` içerisindeki `YOUR_SUPABASE_URL` ve `YOUR_SUPABASE_ANON_KEY` alanlarını Supabase panelinizdeki "Project Settings > API" bölümünden alıp doldurmayı unutmayın.)*

---

### Adım 4: GitHub Secrets (Gizli Değişkenler) Tanımlama

Kodların çalışırken Supabase ve Blogger ile güvenli bağ kurulabilmesi için şifreleri GitHub'a ekleyin:

1. GitHub deponuzun üst menüsünden **Settings** sekmesine gidin.
2. Sol menüden sırasıyla **Secrets and variables > Actions** yolunu takip edin.
3. **"New repository secret"** butonuna basarak aşağıdaki 3 veriyi tek tek girin:
   - `SUPABASE_URL` : Supabase proje ana URL adresiniz.
   - `SUPABASE_KEY` : Supabase anon / service_role API anahtarınız.
   - `BLOGGER_BLOG_ID` : Adım 1'de Blogger URL'sinden aldığınız ID numaranız.

---

### Adım 5: Admin Panelini Yayına Alma (GitHub Pages)

Her yerden telefonla veya bilgisayarla erişebileceğiniz yönetim panelini web sitesi haline getirmek için:

1. GitHub deponuzda **Settings** sekmesine girin.
2. Sol menüden **Pages** seçeneğine tıklayın.
3. *Build and deployment* altındaki *Source* kısmını **"Deploy from a branch"** olarak seçin.
4. *Branch* ayarını `main` yapıp klasörü `/ (root)` seçerek **Save** butonuna basın.
5. Birkaç dakika sonra sayfa yenilendiğinde en üstte size özel bir web site adresi (`https://github.io`) tanımlanacaktır.

---

## 🔒 Güvenli Yönetim Paneli Kullanımı

1. GitHub Pages'ın size sağladığı web site linkine tıklayın.
2. Karşınıza gelen şık giriş ekranında şu bilgileri yazın:
   - **Kullanıcı Adı:** `Hamdi`
   - **Şifre:** `*Arif1978`
3. Giriş yaptıktan sonra **"Yeni RSS Kaynağı Ekle"** formunu kullanarak istediğiniz haber sitelerinin RSS linklerini sisteme tanımlayabilir, dakikalık veya saatlik zaman periyotlarını seçip tamamen otomatik arkaya yaslanabilirsiniz!
