import https from "https";
import { URL } from "url";

export interface CheckResult {
  isUp: boolean;
  statusCode: number | null;
  error: string | null;
  errorType: ErrorType;
  responseTime: number;
  sslInfo: SslInfo | null;
}

export type ErrorType =
  | "none"
  | "ssl_expired"
  | "ssl_not_yet_valid"
  | "ssl_self_signed"
  | "ssl_hostname_mismatch"
  | "ssl_other"
  | "dns_not_found"
  | "connection_refused"
  | "connection_reset"
  | "timeout"
  | "http_4xx"
  | "http_5xx"
  | "too_slow"
  | "unknown";

export interface SslInfo {
  valid: boolean;
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
}

// SSL sertifika bilgisini kontrol et
function checkSsl(hostname: string): Promise<SslInfo | null> {
  return new Promise((resolve) => {
    try {
      const req = https.request(
        { hostname, port: 443, method: "HEAD", timeout: 5000 },
        (res) => {
          const cert = (res.socket as import("tls").TLSSocket).getPeerCertificate();
          if (!cert || !cert.valid_from) {
            resolve(null);
            return;
          }

          const validFrom = new Date(cert.valid_from);
          const validTo = new Date(cert.valid_to);
          const now = new Date();
          const daysRemaining = Math.floor(
            (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          resolve({
            valid: now >= validFrom && now <= validTo,
            issuer: String(cert.issuer?.O || cert.issuer?.CN || "Bilinmiyor"),
            subject: String(cert.subject?.CN || "Bilinmiyor"),
            validFrom: validFrom.toISOString(),
            validTo: validTo.toISOString(),
            daysRemaining,
          });

          res.destroy();
        }
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

// Hata mesajından errorType belirle
function classifyError(err: Error): { error: string; errorType: ErrorType } {
  const msg = err.message || "";

  if (err.name === "AbortError") {
    return { error: "Zaman asimi (10s timeout)", errorType: "timeout" };
  }
  if (msg.includes("ENOTFOUND")) {
    return { error: "DNS bulunamadi - domain gecersiz veya DNS sunucusu yanitlamiyor", errorType: "dns_not_found" };
  }
  if (msg.includes("ECONNREFUSED")) {
    return { error: "Baglanti reddedildi - sunucu portu kapali veya servis calismiyory", errorType: "connection_refused" };
  }
  if (msg.includes("ECONNRESET")) {
    return { error: "Baglanti sifirlandi - sunucu baglantiyi kesti", errorType: "connection_reset" };
  }
  if (msg.includes("CERT_HAS_EXPIRED") || msg.includes("certificate has expired")) {
    return { error: "SSL sertifikasi suresi dolmus", errorType: "ssl_expired" };
  }
  if (msg.includes("CERT_NOT_YET_VALID")) {
    return { error: "SSL sertifikasi henuz gecerli degil", errorType: "ssl_not_yet_valid" };
  }
  if (msg.includes("DEPTH_ZERO_SELF_SIGNED") || msg.includes("self signed")) {
    return { error: "SSL sertifikasi self-signed (kendinden imzali)", errorType: "ssl_self_signed" };
  }
  if (msg.includes("ERR_TLS_CERT_ALTNAME_INVALID") || msg.includes("hostname")) {
    return { error: "SSL sertifikasi domain ile uyusmuyor", errorType: "ssl_hostname_mismatch" };
  }
  if (msg.includes("certificate") || msg.includes("SSL") || msg.includes("TLS")) {
    return { error: `SSL hatasi: ${msg}`, errorType: "ssl_other" };
  }

  return { error: msg, errorType: "unknown" };
}

// HTTP durum kodunu sınıfla
function classifyHttpStatus(status: number, statusText: string): { error: string; errorType: ErrorType } {
  if (status >= 500) {
    const details: Record<number, string> = {
      500: "Sunucu ic hatasi (Internal Server Error)",
      502: "Kotu aggeçidi (Bad Gateway) - upstream sunucu yanit vermiyor",
      503: "Servis kullanilamiyor (Service Unavailable) - sunucu asiri yuklu veya bakimda",
      504: "Aggeçidi zaman asimi (Gateway Timeout) - upstream sunucu yavas",
    };
    return {
      error: details[status] || `HTTP ${status} ${statusText}`,
      errorType: "http_5xx",
    };
  }
  if (status >= 400) {
    const details: Record<number, string> = {
      400: "Hatali istek (Bad Request)",
      401: "Yetkilendirme gerekli (Unauthorized)",
      403: "Erisim engellendi (Forbidden)",
      404: "Sayfa bulunamadi (Not Found)",
      429: "Cok fazla istek (Rate Limited)",
    };
    return {
      error: details[status] || `HTTP ${status} ${statusText}`,
      errorType: "http_4xx",
    };
  }
  return { error: "", errorType: "none" };
}

const SLOW_THRESHOLD_MS = 5000;

export async function checkUrl(url: string): Promise<CheckResult> {
  const start = Date.now();
  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === "https:";

  // SSL kontrolü (sadece HTTPS siteleri için, paralel çalışır)
  const sslPromise = isHttps ? checkSsl(parsedUrl.hostname) : Promise.resolve(null);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "UptimeMonitor/1.0" },
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - start;
    const sslInfo = await sslPromise;

    // HTTP hata kontrolü
    if (res.status >= 400) {
      const { error, errorType } = classifyHttpStatus(res.status, res.statusText);
      return { isUp: false, statusCode: res.status, error, errorType, responseTime, sslInfo };
    }

    // Çok yavaş yanıt uyarısı
    if (responseTime > SLOW_THRESHOLD_MS) {
      return {
        isUp: true,
        statusCode: res.status,
        error: `Yavas yanit: ${(responseTime / 1000).toFixed(1)}s (esik: ${SLOW_THRESHOLD_MS / 1000}s)`,
        errorType: "too_slow",
        responseTime,
        sslInfo,
      };
    }

    // SSL sertifika süresi uyarısı (30 günden az kaldıysa)
    let sslWarning: string | null = null;
    if (sslInfo && sslInfo.daysRemaining <= 30 && sslInfo.daysRemaining > 0) {
      sslWarning = `SSL sertifikasi ${sslInfo.daysRemaining} gun icinde sona erecek!`;
    }

    return {
      isUp: true,
      statusCode: res.status,
      error: sslWarning,
      errorType: "none",
      responseTime,
      sslInfo,
    };
  } catch (err: unknown) {
    const responseTime = Date.now() - start;
    const sslInfo = await sslPromise;

    if (err instanceof Error) {
      const { error, errorType } = classifyError(err);
      return { isUp: false, statusCode: null, error, errorType, responseTime, sslInfo };
    }

    return {
      isUp: false,
      statusCode: null,
      error: "Bilinmeyen hata",
      errorType: "unknown",
      responseTime,
      sslInfo,
    };
  }
}
