import axios from "axios";
import Parser from "rss-parser";
import { RSS_FETCH_TIMEOUT_MS } from "../server/config.js";

const parser = new Parser();

export async function fetchRssFeed(url: string) {
  const { data } = await axios.get<string>(url, {
    timeout: RSS_FETCH_TIMEOUT_MS,
    responseType: "text",
    headers: {
      "User-Agent": "spiffy-trader/1.0 (RSS)",
      Accept: "application/rss+xml, application/xml, text/xml, */*"
    }
  });
  return parser.parseString(data);
}
