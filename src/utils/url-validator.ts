import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";

export class InvalidWebhookUrlError extends Error {
  readonly statusCode = 422;

  constructor(reason: string) {
    super(`Invalid webhook URL: ${reason}`);
    this.name = "InvalidWebhookUrlError";
  }
}

const publicIpv6 = ipaddr.IPv6.parseCIDR("2000::/3");

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return ipaddr.IPv4.parse(address).range() === "unicast";
  if (family !== 6 || address.includes("%")) return false;
  const parsed = ipaddr.IPv6.parse(address);
  return parsed.range() === "unicast" && parsed.match(publicIpv6);
}

export function validateWebhookUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new InvalidWebhookUrlError("URL is malformed or cannot be parsed");
  }
  if (parsed.protocol !== "https:") {
    throw new InvalidWebhookUrlError("Only HTTPS URLs are permitted");
  }
  if (parsed.username || parsed.password) {
    throw new InvalidWebhookUrlError("Credentials in the URL are not permitted");
  }

  // WHATWG URL wraps IPv6 literals in brackets, but the IP parser expects the address.
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const localName = !hostname.includes(".") || hostname.endsWith(".localhost") || hostname.endsWith(".local");
  if (isIP(hostname) ? !isPublicAddress(hostname) : localName) {
    throw new InvalidWebhookUrlError("Loopback, private, and link-local addresses are not permitted");
  }
  return parsed;
}

/**
 * Supply the validated address directly to the socket. TLS and Host retain the
 * configured hostname. Reject a mixed answer instead of connecting to any of it.
 */
export const lookupWebhookDestination: LookupFunction = (hostname, options, callback) => {
  void lookup(hostname, { all: true, order: "ipv4first" }).then((addresses) => {
    const selected = addresses[0];
    if (!selected || addresses.some(({ address }) => !isPublicAddress(address))) {
      callback(new InvalidWebhookUrlError("Destination must resolve only to public addresses"), "");
    } else if (options.all) {
      callback(null, [selected]);
    } else {
      callback(null, selected.address, selected.family);
    }
  }, (error: NodeJS.ErrnoException) => callback(error, ""));
};
