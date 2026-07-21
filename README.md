# 🔒 Ultra Profesyonel Görünmez Blogger RSS Otomasyonu

Bu proje; harici hiçbir veritabanı veya web yönetim paneli gerektirmeden, **tamamen GitHub Actions altyapısı üzerinde gizli modda çalışan** bir RSS otomasyon sistemidir. RSS adresleriniz, zaman ayarlarınız ve Blogger API anahtarlarınız tamamen şifrelenmiştir; dışarıdan kodları inceleyen hiç kimse hiçbir verinizi göremez.

---

## 🛠️ Kurulum ve Gizli Ayarlar Kılavuzu

Sistemin sıfır hata ile çalışması için aşağıdaki 3 adımı sırasıyla uygulayın:

### Adım 1: Blogger Blog ID Numaranızı Alın
Blogger yönetim panelinize (`blogger.com`) giriş yapın. Tarayıcınızın adres çubuğundaki URL'nin en sonunda yazan `blogID=XXXXXXXXXXXXXXXXXXX` alanındaki benzersiz sayı dizisini kopyalayın ve not edin.

---

### Adım 2: Google Cloud Panelinden Kota Anahtarları Üretin
Günlük 10.000 limitini aşmak için bu adımı **farklı Google hesaplarında** tekrarlayarak birden fazla anahtar üretebilirsiniz:
1. [Google Cloud Console](https://google.com) adresine gidin.
2. Yeni bir proje oluşturup sol menüden **API'ler ve Hizmetler > Kitaplık** yolunu izleyin.
3. **Blogger API v3** servisini aratıp **Etkinleştir** butonuna basın.
4. Yönlendirildiğiniz sayfada **Kimlik Bilgileri (Credentials) > + Kimlik Bilgisi Oluştur > API Anahtarı** seçeneği ile anahtarınızı (`AIzaSy...`) üretip not edin.

---

### Adım 3: GitHub Panelinde Gizli Kilitleri Kapatma (En Kritik Adım)

GitHub deponuzun üst menüsünden **Settings (Ayarlar)** sekmesine tıklayın. Sol dikey menüden **Secrets and variables > Actions** yolunu izleyin.

#### A) Şifreli Veriler (Secrets Sekmesi)
**New repository secret** butonuna basarak aşağıdaki kilitleri tanımlayın. (Buraya eklenen veriler kaydedildikten sonra bir daha asla hiç kimse tarafından okunamaz):

1. **`BLOGGER_BLOG_ID`** : Adım 1'de aldığınız Blogger ID numaranız.
2. **`GIZLI_API_HAVUZU`** : Google Cloud'dan aldığınız API anahtarlarını, aralarına virgül koyarak **tam olarak aşağıdaki köşeli parantez formatında** girin:
   ```json
   ["AIzaSyBirinciAnahtariniz", "AIzaSyIkinciYedekAnahtariniz", "AIzaSyUcuncuYedekAnahtariniz"]
   ```

#### B) Düzenlenebilir Ayarlar (Variables Sekmesi)
Secrets butonunun hemen sağındaki **Variables** sekmesine geçin. **New repository variable** butonuna tıklayarak RSS kaynaklarınızı ve dakikalık zaman ayarlarınızı yöneteceğiniz anahtarı açın:

1. **`GIZLI_RSS_AYARLARI`** : Çekilecek internet sitelerinin RSS linklerini, kontrol edilme sürelerini (dakika cinsinden) ve etiket ayarlarını **tam olarak aşağıdaki formatta tek parça halinde** yapıştırın:
   ```json
   [
     {
       "url": "https://webtekno.com",
       "dakika": 10,
       "etiketler": "teknoloji,guncel",
       "oto_kategori": true
     },
     {
       "url": "https://shiftdelete.net",
       "dakika": 5,
       "etiketler": "haber,donanim",
       "oto_kategori": true
     },
     {
       "url": "https://sondakika.com",
       "dakika": 30,
       "etiketler": "sondakika",
       "oto_kategori": false
     }
   ]
   ```

*(Not: Zamanlama mekanizmasının kusursuz çalışması için `dakika` değerlerini 5, 10, 20, 30, 60 (1 saat), 120 (2 saat) veya 180 (3 saat) gibi katlar şeklinde girmeniz önerilir.)*

---

## ⚙️ Sistem Nasıl Yönetilir?
- **Yeni RSS Eklemek / Süre Değiştirmek:** Deponuzda hiçbir koda dokunmazsınız. Sadece GitHub -> Settings -> Secrets and variables -> Actions -> **Variables** sekmesine gelir, `GIZLI_RSS_AYARLARI` değişkenini düzenleyip (Edit) listenize yeni bir satır ekler veya süresini değiştirip kaydedersiniz.
- **Kota Artırmak:** Havuza yeni bir Google API anahtarı eklemek istediğinizde **Secrets** sekmesindeki `GIZLI_API_HAVUZU` verisini güncelleyerek listenin sonuna yeni anahtarı eklemeniz yeterlidir.
