# 🔒 Ultra Profesyonel & Görünmez Blogger RSS Otomasyonu (Google OAuth 2.0 & GitHub Pages)

Bu proje; harici hiçbir sunucuya, veritabanına (Supabase, MySQL vb.) veya geleneksel kısıtlı statik API anahtarlarına ihtiyaç duymadan, **tamamen GitHub Actions, GitHub API ve resmi Google OAuth 2.0 entegrasyonu** ile sıfır maliyetle çalışan kurumsal düzeyde bir RSS otomasyon sistemidir.

Sistem, internet efsanesi **dmoz.org** dizini ruhuyla tasarlanmış açık renkli, sade ve %100 mobil uyumlu bir web yönetim paneline sahiptir. RSS adresleriniz, zaman ayarlarınız ve Google erişim yetkileriniz tamamen GitHub altyapısının arkasında şifrelenmiştir. Dışarıdan kodları inceleyen veya sitenize giren hiç kimse gizli verilerinizi kesinlikle göremez.

---

## ⚡ Sistem Mimarisi ve Üstün Özellikleri

* 💻 **Nostaljik & Mobil Uyumlu Panel:** %100 duyarlı (responsive) yapısıyla telefondan veya tabletten kolayca yönetilebilen klasik DMOZ açık tema arayüzü.
* 🔑 **Resmi Google OAuth 2.0 Girişi:** Kapsamı daraltılmış veya çalınabilecek statik API anahtarları yerine doğrudan **hamdiuludag@gmail.com** hesabınızla resmi Google izin ekranı üzerinden güvenli kimlik doğrulama.
* ⏱️ **Kalıcı Arka Plan Yetkisi (Refresh Token):** Bilgisayarınızı kapatsanız dahi GitHub Actions robotunun 5 dakikada bir Blogger'a içerik yükleyebilmesi için otonom yenileme jetonu sistemi. Kota veya oturum kapanma sorunlarına son!
* 🗃️ **Yerel Dosya Tabanlı Veri Yönetimi:** Tüm RSS havuzu deponuzun içindeki `data.json` dosyasında şifreli olarak saklanır, CORS engellerine takılmaz ve Türkçe karakterler asla bozulmaz.
* 🧠 **Kilitli Önbellek (Cache) Belleği:** Paylaşılan haberlerin benzersiz MD5 özetlerini GitHub Actions şifreli çalışma alanında saklar. Aynı haberler blogunuza asla mükerrer (çift) olarak basılmaz.

---

## 📋 Baştan Sona Eksiksiz Kurulum Kılavuzu

Sistemin **sıfır hata** ile ve tek seferde çalışabilmesi için aşağıdaki 6 ana adımı eksiksiz olarak uygulayın.

### 1. Adım: Blogger Blog ID Numaranızı Alın
1. [Blogger](https://blogger.com) panelinize giriş yapın.
2. Tarayıcınızın adres çubuğundaki URL'yi kontrol edin.
3. URL'nin en sonunda yer alan `blogID=XXXXXXXXXXXXXXXXXXX` ifadesindeki **sadece sayıları** kopyalayın ve bir yere not edin. Bu sizin `BLOGGER_BLOG_ID` değerinizdir.

---

### 2. Adım: GitHub Giriş Şifrenizi (Personal Access Token) Üretin
Web panelinizin deponuzdaki `data.json` dosyasını otomatik güncelleyebilmesi için bu şifreyi almalısınız:
1. GitHub profil resminize tıklayıp **Settings (Ayarlar) > Developer Settings (Geliştirici Ayarları)** sayfasına gidin.
2. Doğrudan gitmek için: [GitHub Tokens (Classic) Sayfası](https://github.com) linkini kullanabilirsiniz.
3. **Generate new token > Generate new token (classic)** butonuna basın.
4. **Note:** Bölümüne `Blogger Bot Paneli` yazın.
5. **Expiration:** Süresini `No expiration` (Süresiz) yapın.
6. **Select Scopes (İzinler):** Şu iki ana kutucuğu mutlaka mavi tık ile işaretleyin:
   * ⬜ **`repo`** (Depo yönetimi ve dosya yazma izni - Komple işaretleyin)
   * ⬜ **`workflow`** (Otomasyon tetiklemeleri için - İşaretleyin)
7. En alttaki yeşil **Generate token** butonuna basın ve ekrana gelen **`ghp_...`** şeklindeki uzun kodu kopyalayıp güvenli bir yere kaydedin. *(Sayfa yenilendiğinde bu kod bir daha gösterilmez!)*

---

### 3. Adım: Google Cloud Üzerinden OAuth 2.0 İstemci Kimliği Üretin
Sistemin API anahtarsız, doğrudan resmi e-posta onay ekranı ile çalışabilmesi için bu adımı uygulayın:
1. [Google Cloud Console](https://google.com) adresine girin ve projenizi seçin.
2. Sol menüden **API'ler ve Hizmetler > OAuth onay ekranı (OAuth consent screen)** sayfasına gidin.
3. Kullanıcı Türünü **Harici (External)** seçip oluşturun. Uygulama adı alanına `Blogger RSS Otomasyonu`, destek e-postası alanına ise kendi e-postanızı yazıp kaydedin.
4. Sol menüden **Kimlik Bilgileri (Credentials)** sayfasına geçin.
5. Üst menüden **+ Kimlik Bilgisi Oluştur > OAuth istemci kimliği (OAuth client ID)** seçeneğine tıklayın.
6. Uygulama türünü **Web uygulaması (Web application)** seçin.
7. **Yetkilendirilmiş yönlendirme URI'leri (Authorized redirect URIs)** başlığının altındaki **+ URL EKLE** butonuna basın ve panelinizin tam linkini buraya yapıştırın:
   `https://github.io`
8. **Oluştur (Create)** butonuna basın. Ekrana gelen **"İstemci Kimliğiniz" (Client ID)** (`.apps.googleusercontent.com` ile biten kod) ve **"Gizli İstemci Şifresi" (Client Secret)** metinlerini kopyalayıp not edin.

---

### 4. Adım: Otonom Arka Plan Şifresini (Refresh Token) Alın
Botun siz bilgisayarı kapatsanız dahi Google adına 5 dakikada bir çalışabilmesi için kalıcı yenileme jetonunu almalıyız:
1. Resmi [Google OAuth 2.0 Playground](https://google.com) adresine gidin.
2. Sağ üst köşedeki **çark (OAuth 2.0 configuration) simgesine** tıklayın.
3. ⬜ **Use your own OAuth credentials** kutucuğunu işaretleyin.
4. **OAuth Client ID** ve **OAuth Client Secret** alanlarına **3. Adımda** Google Cloud'dan aldığınız kodları yapıştırıp kapatın.
5. Sol taraftaki listeden **Blogger API v3** bulun veya üstteki kutucuğa tam olarak şunu yazın: `https://googleapis.com`
6. Mavi **Authorize APIs** butonuna basın. Karşınıza gelen resmi Google ekranında **hamdiuludag@gmail.com** hesabınızı seçip uygulamaya tam yetki onayı verin.
7. Sayfa sizi Playground'a geri atacaktır. Sol menüdeki **Step 2** alanında yer alan yeşil **Exchange authorization code for tokens** butonuna tıklayın.
8. Alt satırda açılan **Refresh Token** kutusunun içindeki uzun kodu kopyalayıp not edin. Bu botunuzun otonom çalışma anahtarıdır.

---

### 5. Adım: GitHub Secrets (Gizli Anahtarlar) Yapılandırması
Topladığımız tüm gizli şifreleri Actions robotunun okuyabilmesi için deponuzon arkasına kilitleyelim:
1. GitHub deponuzda üst menüden **Settings (Ayarlar)** sekmesine tıklayın.
2. Sol menüden sırasıyla **Secrets and variables > Actions** yolunu takip edin.
3. **New repository secret** butonuna basarak aşağıdaki 4 gizli kilidi tek tek tanımlayın:
   * **`BLOGGER_BLOG_ID`** : **1. Adımdaki** Blogger sayısal ID numaranız.
   * **`GOOGLE_CLIENT_ID`** : **3. Adımdaki** Google İstemci Kimliği (Client ID).
   * **`GOOGLE_CLIENT_SECRET`** : **3. Adımdaki** Gizli İstemci Şifresi (Client Secret).
   * **`GOOGLE_REFRESH_TOKEN`** : **4. Adımdaki** Google Kalıcı Yenileme Jetonu (Refresh Token).

---

### 6. Adım: GitHub Pages (Canlı Panel) Yayını
1. Deponuzda **Settings > Pages** seçeneğine tıklayın.
2. *Build and deployment* altındaki *Source* kısmını **"Deploy from a branch"** yapın.
3. *Branch* ayarını `main` seçip klasörü `/ (root)` olarak belirleyerek **Save** butonuna basın.
4. 1-2 dakika içinde web siteniz resmi olarak `https://github.io` adresinde yayına alınacaktır.

---

## 🎮 Yönetim Panelinin Kullanımı ve Akışı

1. Tarayıcınızdan canlı panel linkinize gidin.
2. **GitHub Token Şifreniz** kutusuna **2. Adımda** aldığınız `ghp_...` kodunu yapıştırın.
3. **hamdiuludag@gmail.com ile Giriş** butonuna basın. Resmi Google penceresi açılacaktır, onay verip ilerleyin.
4. Panel otomatik olarak açılacak ve deponuzdaki `data.json` dosyasını tarayarak aktif havuzunuzu listeleyecektir.
5. **Yeni Otomatik RSS Adresi Tanımla** formunu doldurup **Ayarları Depoya Kaydet** dediğinizde sistem Türkçe karakterleri koruyarak deponuza güvenli bir şekilde commit atacaktır.
6. GitHub Actions arka planda her 5 dakikada bir otomatik olarak uyanır, taze Google token'ını çeker ve süresi gelmiş RSS kaynaklarındaki içerikleri pürüzsüz HTML biçiminde Blogger sitenize yükler.
