# 🔒 Ultra Profesyonel & Görünmez Blogger RSS Otomasyonu

Bu proje; harici hiçbir sunucu veya veritabanı (Supabase, MySQL vb.) gerektirmeyen, **tamamen GitHub Actions ve GitHub API altyapısı üzerinde sıfır maliyetle çalışan** akıllı bir RSS otomasyon sistemidir. 

Sistem, dmoz.org dizini ruhuyla tasarlanmış açık renkli, sade ve %100 mobil uyumlu bir web yönetim paneline sahiptir. RSS adresleriniz, zaman ayarlarınız ve Blogger API anahtarlarınız tamamen GitHub sisteminin arkasında şifrelenmiştir. Dışarıdan kodları inceleyen veya sitenize giren hiç kimse gizli verilerinizi, API anahtarlarınızı veya bağladığınız kaynakları kesinlikle göremez.

---

## ⚡ Temel Sistem Özellikleri

- 💻 **Nostaljik & Mobil Uyumlu Panel:** %100 duyarlı (responsive) yapısıyla telefondan veya tabletten kolayca yönetilebilen klasik DMOZ açık tema arayüzü.
- 🔑 **Yedekli Çoklu API Havuzu:** Günlük 10.000 olan Blogger API istek sınırı dolduğunda, sistem hata vermeden havuzdaki bir sonraki yedek anahtara otomatik geçiş yapar.
- ⏱️ **Akıllı Zamanlama Filtresi:** Her RSS kaynağı için ayrı zaman periyotları (5, 10, 20, 30 dakika veya 1, 2, 3 saat) belirleyebilme esnekliği.
- 🛡️ **Görünmez Veri Güvenliği:** Panel girişinde şifre olarak sizin oluşturacağınız **GitHub Personal Access Token (PAT)** kullanılır. Bu sayede tarayıcıda veya kaynak kodda hiçbir şifre barındırılmaz.
- 📝 **Zengin Metin (HTML) Editör Uyumluluğu:** Çekilen RSS içeriklerini tarayarak zararlı script veya stil etiketlerini ayıklar ve Blogger editörünü bozmayacak pürüzsüz HTML biçiminde yayınlar.
- 🧠 **Kilitli Bellek Sistemi:** Paylaşılan haberlerin benzersiz MD5 özetlerini GitHub Actions şifreli önbelleğinde (`cache`) saklar. Deponuza hiçbir JSON dosyası commit edilmez, böylece deponuz temiz kalır ve haberler asla mükerrer (çift) paylaşılmaz.

---

## 🛠️ Sıfır Hata İle Adım Adım Kurulum Kılavuzu

Sistemi hatasız ayağa kaldırmak için aşağıdaki 5 ana adımı sırasıyla uygulayın:

### Adım 1: Blogger Blog ID Numaranızı Bulun
1. [Blogger](https://blogger.com) panelinize giriş yapın.
2. Tarayıcınızın adres çubuğundaki URL kontrol edin.
3. URL'nin en sonunda yer alan `blogID=XXXXXXXXXXXXXXXXXXX` ifadesindeki **sadece sayıları** kopyalayın ve bir yere not edin. Bu sizin `BLOGGER_BLOG_ID` değerinizdir.

---

### Adım 2: Google Cloud Üzerinden API Anahtarı Havuzu Oluşturun
> 💡 *Blogger günlük kota sınırını (10.000) aşmak ve kotayı katlamak için bu adımı farklı Google hesaplarıyla tekrarlayarak birden fazla anahtar almanız önerilir.*

1. [Google Cloud Console](https://google.com) adresine gidin.
2. Üst menüden **"Proje Seçin" > "Yeni Proje"** diyerek projenizi oluşturun.
3. Sol menüden **"API'ler ve Hizmetler" > "Kitaplık" (Library)** sekmesine geçin.
4. Arama çubuğuna **"Blogger API v3"** yazın, çıkan sonuca tıklayın ve **"Etkinleştir" (Enable)** butonuna basın.
5. API aktif olduktan sonra yönlendirildiğiniz ekranda (veya sol menüde) **"Kimlik Bilgileri" (Credentials)** sekmesine tıklayın.
6. Üstteki **"+ Kimlik Bilgisi Oluştur" > "API Anahtarı" (API Key)** seçeneğini seçin.
7. Ekrana gelen `AIzaSy...` ile başlayan uzun kodu kopyalayın ve bir yere not edin.

---

### Adım 3: GitHub Giriş Şifrenizi (Personal Access Token) Üretin
Yönetim panelinizin deponuzdaki ayarları güvenle güncelleyebilmesi için bu şifreyi almanız şarttır:
1. GitHub panelinizde sağ üstteki **Profil Resminize** tıklayıp **Settings (Ayarlar)** sayfasına gidin.
2. Sol menünün en altındaki **Developer Settings (Geliştirici Ayarları)** sekmesine tıklayın.
3. **Personal access tokens > Tokens (classic)** yolunu izleyin.
4. Sağ üstteki **Generate new token > Generate new token (classic)** butonuna basın.
5. **Note:** Bölümüne `Blogger Bot Sifresi` yazın. **Expiration:** Süresini isteğinize göre (Örn: `No expiration` - Süresiz) ayarlayın.
6. **Select Scopes (İzinler):** Panelinizin çalışması için şu iki ana kutucuğu mutlaka işaretlemelisiniz:
   - ⬜ **`repo`** (Depo yönetimi için - Komple işaretleyin)
   - ⬜ **`workflow`** (Otomasyon tetiklemeleri için - İşaretleyin)
7. Sayfanın en altındaki yeşil **Generate token** butonuna basın.
8. Karşınıza gelen **`ghp_...`** şeklindeki uzun kodu hemen kopyalayıp güvenli bir yere kaydedin. *(Sayfa yenilendiğinde bu kod bir daha gösterilmeyecektir!)*

---

### Adım 4: GitHub Deponuzun Gizli Kilitlerini Yapılandırın
GitHub deponuzun ana sayfasındaki üst menüden **Settings (Ayarlar)** sekmesine tıklayın. Sol menüden **Secrets and variables > Actions** yolunu takip edin.

#### A) Şifreli Gizli Veriler (Secrets Sekmesi)
**New repository secret** butonuna basarak şu iki gizli kilidi tanımlayın:
1. **Name:** `BLOGGER_BLOG_ID` | **Value:** *Adım 1'de aldığınız sayısal ID.*
2. **Name:** `GIZLI_API_HAVUZU` | **Value:** *Adım 2'de aldığınız API anahtarlarını aralarına virgül koyarak, **tam olarak aşağıdaki köşeli parantez formatında** girin:*
   ```json
   ["AIzaSyBirinciAnahtar", "AIzaSyIkinciAnahtar", "AIzaSyUcuncuAnahtar"]
   ```

#### B) Düzenlenebilir Ayarlar (Variables Sekmesi)
Secrets butonunun hemen sağındaki **Variables** sekmesine geçin. **New repository variable** butonuna tıklayın:
1. **Name:** `GIZLI_RSS_AYARLARI` | **Value:** *İçine sadece boş bir dizin açmak için tam olarak şu iki karakteri yazıp kaydedin:* `[]`

---

### Adım 5: Yönetim Panelinizi Yayına Alın (GitHub Pages)
1. Deponuzda **Settings (Ayarlar)** sekmesine girin.
2. Sol menüden **Pages** seçeneğine tıklayın.
3. *Build and deployment* başlığı altındaki *Source* kısmını **"Deploy from a branch"** yapın.
4. *Branch* ayarını `main` (veya `master`) seçip klasörü `/ (root)` olarak belirleyerek **Save** butonuna basın.
5. 1-2 dakika sonra sayfayı yenilediğinizde üst alanda size özel panel web site adresiniz (`https://github.io`) yeşil onay işaretiyle görünecektir.

---

## 🎮 Yönetim Panelinin Kullanımı

1. GitHub Pages'ın size sağladığı canlı web site adresine gidin.
2. Giriş ekranındaki bilgileri şu şekilde doldurun:
   - **Kullanıcı Adı:** `Hamdi`
   - **GitHub Token (Şifreniz):** *Adım 3'te kopyaladığınız **`ghp_...`** kodu.*
3. **Sisteme Giriş Yap** butonuna bastığınızda, paneliniz GitHub API'sine bağlanarak arka plandaki tüm aktif RSS havuzunuzu önünüze listeleyecektir.
4. **Yeni Otomatik RSS Adresi Tanımla** kutusunu kullanarak dilediğiniz haber kaynaklarını ekleyebilir, zaman periyotlarını seçip **Ayarları Şifreli Güncelle** butonuna basarak sistemi tamamen otomatik pilotta çalıştırabilirsiniz!
