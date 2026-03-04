import { Redis } from "@upstash/redis";

export interface Site {
  id: string;
  url: string;
  name: string;
  addedAt: string;
  lastCheck: string | null;
  status: "up" | "down" | "unknown";
  downSince: string | null;
  notifiedAt: string | null;
  lastError: string | null;
  errorType: string | null;
  responseTime: number | null;
  sslDaysRemaining: number | null;
}

const SITES_KEY = "uptime:sites";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function getSites(): Promise<Site[]> {
  const data = await redis.get<Site[]>(SITES_KEY);
  return data || [];
}

export async function saveSites(sites: Site[]): Promise<void> {
  await redis.set(SITES_KEY, sites);
}

export async function addSite(url: string, name: string): Promise<Site> {
  const sites = await getSites();
  const site: Site = {
    id: crypto.randomUUID(),
    url,
    name,
    addedAt: new Date().toISOString(),
    lastCheck: null,
    status: "unknown",
    downSince: null,
    notifiedAt: null,
    lastError: null,
    errorType: null,
    responseTime: null,
    sslDaysRemaining: null,
  };
  sites.push(site);
  await saveSites(sites);
  return site;
}

export async function removeSite(id: string): Promise<boolean> {
  const sites = await getSites();
  const filtered = sites.filter((s) => s.id !== id);
  if (filtered.length === sites.length) return false;
  await saveSites(filtered);
  return true;
}

export async function updateSite(
  id: string,
  updates: Partial<Site>
): Promise<void> {
  const sites = await getSites();
  const index = sites.findIndex((s) => s.id === id);
  if (index === -1) return;
  sites[index] = { ...sites[index], ...updates };
  await saveSites(sites);
}
