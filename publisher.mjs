import { XMLParser } from "fast-xml-parser";
import sanitizeHtml from "sanitize-html";
import crypto from "node:crypto";

const E = process.env;

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BLOGGER_BLOG_ID",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN"
];

for (const key of required) {
  if (!E[key]) {
    throw new Error(`Eksik secret: ${key}`);
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: "__cdata",
  trimValues: false,
  parseTagValue: false
});


async function request(url, options = {}) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      30000
    );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const text =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${text.slice(0,500)}`
      );
    }

    return text;

  } finally {
    clearTimeout(timer);
  }
}


async function sb(path, options = {}) {
  const text = await request(
    `${E.SUPABASE_URL}/rest/v1/${path}`,
    {
      ...options,
      headers: {
        apikey:
          E.SUPABASE_SERVICE_ROLE_KEY,

        Authorization:
          `Bearer ${E.SUPABASE_SERVICE_ROLE_KEY}`,

        "Content-Type":
          "application/json",

        ...options.headers
      }
    }
  );

  return text
    ? JSON.parse(text)
    : null;
}


async function googleToken() {
  const body =
    new URLSearchParams({
      client_id:
        E.GOOGLE_CLIENT_ID,

      client_secret:
        E.GOOGLE_CLIENT_SECRET,

      refresh_token:
        E.GOOGLE_REFRESH_TOKEN,

      grant_type:
        "refresh_token"
    });

  const text = await request(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body
    }
  );

  const data = JSON.parse(text);

  if (!data.access_token) {
    throw new Error(
      "Google access token alınamadı."
    );
  }

  return data.access_token;
}


function arr(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}


function text(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);

  return (
    v.__cdata ||
    v["#text"] ||
    ""
  );
}


function parse(xml) {
  const d = parser.parse(xml);

  if (d?.rss?.channel) {
    return arr(
      d.rss.channel.item
    ).map(i => ({
      id:
        text(i.guid) ||
        text(i.link) ||
        text(i.title),

      title:
        text(i.title).trim(),

      link:
        text(i.link).trim(),

      content:
        text(i["content:encoded"]) ||
        text(i.description),

      publishedAt:
        text(i.pubDate) ||
        text(i["dc:date"]),

      videoId: ""
    }));
  }

  if (d?.feed) {
    return arr(
      d.feed.entry
    ).map(i => {
      const links =
        arr(i.link);

      const alternate =
        links.find(
          x =>
            x?.["@_rel"] ===
            "alternate"
        );

      return {
        id:
          text(i["yt:videoId"]) ||
          text(i.id),

        title:
          text(i.title).trim(),

        link:
          alternate?.["@_href"] ||
          links[0]?.["@_href"] ||
          "",

        content:
          text(
            i["media:group"]
              ?.[
                "media:description"
              ]
          ) ||
          text(i.content) ||
          text(i.summary),

        publishedAt:
          text(i.published) ||
          text(i.updated),

        videoId:
          text(i["yt:videoId"])
      };
    });
  }

  throw new Error(
    "RSS/Atom formatı tanınmadı."
  );
}


function clean(html) {
  return sanitizeHtml(
    String(html || ""),
    {
      allowedTags: [
        "p","br","strong","b",
        "em","i","u",
        "blockquote",
        "ul","ol","li",
        "h2","h3","h4",
        "a","img"
      ],

      allowedAttributes: {
        a: ["href","title"],
        img: [
          "src",
          "alt",
          "title",
          "width",
          "height"
        ]
      },

      allowedSchemes: [
        "http",
        "https"
      ]
    }
  );
}


function hash(item) {
  return crypto
    .createHash("sha256")
    .update(
      item.id ||
      item.link ||
      item.title
    )
    .digest("hex");
}


function htmlEscape(s = "") {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}


function content(item) {
  let video = "";

  if (item.videoId) {
    video = `
<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin-bottom:20px">
<iframe
src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.videoId)}"
title="${htmlEscape(item.title)}"
loading="lazy"
style="position:absolute;inset:0;width:100%;height:100%;border:0"
allowfullscreen>
</iframe>
</div>`;
  }

  return `
<article>
${video}
${clean(item.content)}
<p>
<a href="${htmlEscape(item.link)}"
target="_blank"
rel="noopener noreferrer nofollow">
Orijinal Kaynak
</a>
</p>
</article>`;
}


async function exists(
  feedId,
  sourceId
) {
  const q =
    new URLSearchParams({
      feed_id:
        `eq.${feedId}`,
      source_id:
        `eq.${sourceId}`,
      select: "id",
      limit: "1"
    });

  const data =
    await sb(
      `published_items?${q}`
    );

  return data.length > 0;
}


async function publish(
  token,
  feed,
  item
) {
  const text = await request(
    `https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(E.BLOGGER_BLOG_ID)}/posts?isDraft=false`,
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${token}`,
        "Content-Type":
          "application/json"
      },
      body:
        JSON.stringify({
          kind: "blogger#post",
          title: item.title,
          content: content(item),
          labels: [
            feed.blogger_label
          ]
        })
    }
  );

  return JSON.parse(text);
}


async function updateFeed(
  id,
  data
) {
  const q =
    new URLSearchParams({
      id: `eq.${id}`
    });

  await sb(
    `feeds?${q}`,
    {
      method: "PATCH",
      headers: {
        Prefer:
          "return=minimal"
      },
      body:
        JSON.stringify(data)
    }
  );
}


async function processFeed(
  feed,
  token
) {
  const started =
    new Date().toISOString();

  try {
    if (feed.last_run_at) {
      const next =
        new Date(
          feed.last_run_at
        ).getTime()
        +
        feed.interval_hours *
        3600000;

      if (Date.now() < next) {
        console.log(
          `Atlandı: ${feed.name}`
        );
        return;
      }
    }

    const xml =
      await request(
        feed.source_url,
        {
          headers: {
            "User-Agent":
              "MiFRM-RSS-Publisher/4.0",
            Accept:
              "application/rss+xml,application/atom+xml,application/xml,text/xml"
          }
        }
      );

    let items =
      parse(xml)
        .filter(
          i => i.title && i.id
        )
        .slice(
          0,
          feed.max_items
        );

    let count = 0;

    for (const item of items) {
      const sourceId =
        hash(item);

      if (
        await exists(
          feed.id,
          sourceId
        )
      ) {
        continue;
      }

      const post =
        await publish(
          token,
          feed,
          item
        );

      await sb(
        "published_items",
        {
          method: "POST",
          headers: {
            Prefer:
              "return=minimal"
          },
          body:
            JSON.stringify({
              feed_id:
                feed.id,
              source_id:
                sourceId,
              title:
                item.title,
              source_url:
                item.link || null,
              blogger_post_id:
                post.id || null,
              blogger_url:
                post.url || null,
              source_published_at:
                item.publishedAt || null
            })
        }
      );

      count++;
    }

    await updateFeed(
      feed.id,
      {
        last_run_at:
          started,

        last_success_at:
          new Date().toISOString(),

        last_error:
          null,

        total_published:
          Number(
            feed.total_published || 0
          ) + count
      }
    );

  } catch (error) {
    console.error(
      feed.name,
      error
    );

    await updateFeed(
      feed.id,
      {
        last_run_at:
          started,

        last_error:
          String(
            error.message || error
          ).slice(0,2000)
      }
    );
  }
}


async function main() {
  const feeds =
    await sb(
      "feeds?enabled=eq.true&select=*&order=created_at.asc"
    );

  if (!feeds.length) {
    console.log(
      "Aktif kaynak yok."
    );
    return;
  }

  const token =
    await googleToken();

  for (const feed of feeds) {
    await processFeed(
      feed,
      token
    );
  }
}


main().catch(error => {
  console.error(error);
  process.exit(1);
});
