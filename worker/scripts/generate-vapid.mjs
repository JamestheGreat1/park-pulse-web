import { webcrypto } from "node:crypto";

const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicRaw = new Uint8Array(await webcrypto.subtle.exportKey("raw", pair.publicKey));
const privateJwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
console.log("VAPID_SERVER_PUBLIC_KEY=" + b64url(publicRaw));
console.log("VAPID_SERVER_PRIVATE_KEY=" + privateJwk.d);
