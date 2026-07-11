"use strict";

const C = window.APP_CONFIG;

const db = supabase.createClient(
  C.SUPABASE_URL,
  C.SUPABASE_ANON_KEY
);

const $ = id => document.getElementById(id);

const loginView = $("loginView");
const panelView = $("panelView");
const loginForm = $("loginForm");
const email = $("email");
const password = $("password");
const loginMessage = $("loginMessage");
const logoutBtn = $("logoutBtn");
const userEmail = $("userEmail");

const feedForm = $("feedForm");
const feedName = $("feedName");
const sourceType = $("sourceType");
const sourceUrl = $("sourceUrl");
const bloggerLabel = $("bloggerLabel");
const maxItems = $("maxItems");
const intervalHours = $("intervalHours");
const formMessage = $("formMessage");

const feedsBox = $("feeds");
const historyBox = $("history");

email.value = C.ADMIN_EMAIL;


loginForm.addEventListener("submit", async e => {
  e.preventDefault();

  loginMessage.textContent = "Giriş yapılıyor...";

  const { data, error } = await db.auth.signInWithPassword({
    email: C.ADMIN_EMAIL,
    password: password.value
  });

  if (error) {
    loginMessage.textContent = error.message;
    loginMessage.className = "message error";
    return;
  }

  if (
    data.user.email.toLowerCase() !==
    C.ADMIN_EMAIL.toLowerCase()
  ) {
    await db.auth.signOut();
    loginMessage.textContent = "Yetkisiz hesap.";
    return;
  }

  password.value = "";
  await renderSession();
});


logoutBtn.addEventListener("click", async () => {
  await db.auth.signOut();
  location.reload();
});


feedForm.addEventListener("submit", async e => {
  e.preventDefault();

  try {
    const url = new URL(sourceUrl.value.trim());

    if (url.protocol !== "https:") {
      throw new Error("Kaynak HTTPS olmalıdır.");
    }

    const { error } = await db
      .from("feeds")
      .insert({
        name: feedName.value.trim(),
        source_type: sourceType.value,
        source_url: url.href,
        blogger_label: bloggerLabel.value.trim(),
        max_items: Number(maxItems.value),
        interval_hours: Number(intervalHours.value),
        enabled: true
      });

    if (error) throw error;

    feedForm.reset();
    maxItems.value = 5;
    intervalHours.value = 6;

    formMessage.textContent =
      "Kaynak başarıyla kaydedildi.";

    await loadAll();

  } catch (err) {
    formMessage.textContent = err.message;
    formMessage.className = "message error";
  }
});


$("refreshBtn").addEventListener(
  "click",
  loadAll
);


async function loadAll() {
  await Promise.all([
    loadFeeds(),
    loadHistory()
  ]);
}


async function loadFeeds() {
  const { data, error } = await db
    .from("feeds")
    .select("*")
    .order("created_at", {
      ascending: false
    });

  if (error) {
    feedsBox.textContent = error.message;
    return;
  }

  const feeds = data || [];

  $("statFeeds").textContent =
    feeds.length;

  $("statActive").textContent =
    feeds.filter(x => x.enabled).length;

  feedsBox.innerHTML = feeds.length
    ? feeds.map(feedHtml).join("")
    : "<p>Henüz kaynak yok.</p>";
}


function feedHtml(f) {
  return `
  <article class="feed">

    <div class="feed-head">
      <h3>${esc(f.name)}</h3>
      <strong>
        ${Number(f.total_published || 0)} yayın
      </strong>
    </div>

    <p>
      <b>Etiket:</b>
      ${esc(f.blogger_label)}
    </p>

    <p>
      ${f.max_items} içerik ·
      ${f.interval_hours} saatte bir
    </p>

    <p class="feed-url">
      ${esc(f.source_url)}
    </p>

    ${
      f.last_error
        ? `<p class="error">
             ${esc(f.last_error)}
           </p>`
        : ""
    }

    <div class="actions">

      <button
        onclick="
          toggleFeed(
            '${f.id}',
            ${!f.enabled}
          )
        "
      >
        ${f.enabled ? "Durdur" : "Başlat"}
      </button>

      <button
        class="danger"
        onclick="
          deleteFeed('${f.id}')
        "
      >
        Sil
      </button>

    </div>

  </article>`;
}


window.toggleFeed = async (
  id,
  enabled
) => {
  const { error } = await db
    .from("feeds")
    .update({ enabled })
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadFeeds();
};


window.deleteFeed = async id => {
  if (!confirm("Kaynak silinsin mi?")) {
    return;
  }

  const { error } = await db
    .from("feeds")
    .delete()
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadAll();
};


async function loadHistory() {
  const { data, error } = await db
    .from("published_items")
    .select("*")
    .order("published_at", {
      ascending: false
    })
    .limit(50);

  if (error) {
    historyBox.textContent =
      error.message;
    return;
  }

  const items = data || [];

  $("statPublished").textContent =
    items.length;

  historyBox.innerHTML =
    items.length
      ? items.map(item => `
        <article class="history">
          <strong>
            ${esc(item.title)}
          </strong>

          <p class="muted">
            ${
              new Date(
                item.published_at
              ).toLocaleString("tr-TR")
            }
          </p>

          ${
            item.blogger_url
              ? `<a
                   href="${esc(item.blogger_url)}"
                   target="_blank"
                   rel="noopener"
                 >
                   Blogger'da Aç
                 </a>`
              : ""
          }
        </article>
      `).join("")
      : "<p>Henüz yayın yok.</p>";
}


async function renderSession() {
  const {
    data: { session }
  } = await db.auth.getSession();

  const currentEmail =
    session?.user?.email?.toLowerCase();

  if (
    !session ||
    currentEmail !==
    C.ADMIN_EMAIL.toLowerCase()
  ) {
    loginView.hidden = false;
    panelView.hidden = true;
    return;
  }

  loginView.hidden = true;
  panelView.hidden = false;

  userEmail.textContent =
    session.user.email;

  await loadAll();
}


function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


db.auth.onAuthStateChange(() => {
  setTimeout(renderSession, 0);
});

renderSession();
