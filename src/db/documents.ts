import { SEED_NEWS_SOURCE_URLS } from "../server/config.js";
import { couchRequest, ensureDb } from "./couch.js";

export type ListDocsOpts = { repairTried?: boolean };

/** Drop and recreate news_sources (RSS URLs only). */
export async function recreateNewsSourcesDb() {
  try {
    await couchRequest("DELETE", "/news_sources");
  } catch (delErr: any) {
    const s = delErr?.response?.status;
    if (s !== 404 && s !== 200) throw delErr;
  }
  await ensureDb("news_sources");
}

export async function addNewsSourceIfMissing(url: string, origin: "seed" | "llm") {
  const docs = await listDocs("news_sources");
  if (docs.some((d: any) => d.url === url)) return;
  await couchRequest("POST", "/news_sources", {
    type: "rss",
    url,
    origin,
    createdAt: new Date().toISOString()
  });
}

export async function seedNewsSourcesIfNeeded() {
  await ensureDb("news_sources");
  for (const url of SEED_NEWS_SOURCE_URLS) {
    await addNewsSourceIfMissing(url, "seed");
  }
}

/** If news_sources is broken (500 / badmatch / enoent), drop and recreate — only RSS config lives here. */
export async function repairNewsSourcesDbIfBroken() {
  await ensureDb("news_sources");
  try {
    await couchRequest("GET", "/news_sources/_all_docs", undefined, { limit: "1", include_docs: "true" });
  } catch (e: any) {
    if (e?.response?.status !== 500) throw e;
    console.warn(
      "CouchDB: news_sources unreadable at startup (500). Recreating database (RSS sources will be re-seeded)."
    );
    await recreateNewsSourcesDb();
  }
}

export async function listDocs(name: string, opts?: ListDocsOpts) {
  const repairTried = opts?.repairTried === true;
  try {
    const data = await couchRequest("GET", `/${name}/_all_docs`, undefined, { include_docs: true });
    return (data.rows || []).map((row: any) => row.doc).filter((doc: any) => doc != null);
  } catch (e: any) {
    if (e?.response?.status !== 500) throw e;
    console.warn(
      `CouchDB 500 on ${name}/_all_docs (include_docs) — retrying without include_docs`
    );
    try {
      const slim = await couchRequest("GET", `/${name}/_all_docs`);
      const docs: any[] = [];
      for (const row of slim.rows || []) {
        if (!row.id || String(row.id).startsWith("_design")) continue;
        try {
          docs.push(await couchRequest("GET", `/${name}/${encodeURIComponent(row.id)}`));
        } catch {
          /* deleted or missing */
        }
      }
      return docs;
    } catch (e2: any) {
      if (name === "news_sources" && !repairTried && e2?.response?.status === 500) {
        console.warn(
          "CouchDB: news_sources still 500 on _all_docs — recreating DB and re-seeding (avoids crashing the server)."
        );
        await recreateNewsSourcesDb();
        await seedNewsSourcesIfNeeded();
        return listDocs(name, { repairTried: true });
      }
      throw e2;
    }
  }
}
