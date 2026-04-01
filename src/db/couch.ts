import axios from "axios";
import { COUCHDB_AUTH, COUCHDB_URL } from "../server/config.js";

export async function couchRequest(
  method: string,
  dbPath: string,
  data?: any,
  params?: any,
  timeoutMs = 10_000
) {
  const url = `${COUCHDB_URL}${dbPath}`;
  const response = await axios({
    method,
    url,
    data,
    params,
    auth: COUCHDB_AUTH,
    timeout: timeoutMs
  });
  return response.data;
}

export async function ensureDb(name: string) {
  try {
    await couchRequest("PUT", `/${name}`);
  } catch (error: any) {
    if (error?.response?.status !== 412) {
      throw error;
    }
  }
}

export async function upsertStatus(newStatus: any) {
  let existing: any = null;
  try {
    existing = await couchRequest("GET", "/status/current");
  } catch (error: any) {
    if (error?.response?.status !== 404) throw error;
  }

  const payload = {
    _id: "current",
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    ...newStatus
  };
  await couchRequest("PUT", "/status/current", payload);
}
