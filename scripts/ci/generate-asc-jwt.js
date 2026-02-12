const fs = require('fs');
const crypto = require('crypto');

const [keyId, issuerId, keyPath] = process.argv.slice(2);
if (!keyId || !issuerId || !keyPath) {
  console.error('Usage: node scripts/ci/generate-asc-jwt.js <keyId> <issuerId> <keyPath>');
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const exp = now + 1200;
const encodeJson = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

const header = encodeJson({ alg: 'ES256', kid: keyId, typ: 'JWT' });
const payload = encodeJson({ iss: issuerId, iat: now, exp, aud: 'appstoreconnect-v1' });
const unsignedToken = `${header}.${payload}`;

const privateKey = fs.readFileSync(keyPath, 'utf8');
const signature = crypto.sign('sha256', Buffer.from(unsignedToken), {
  key: privateKey,
  dsaEncoding: 'ieee-p1363',
});

process.stdout.write(`${unsignedToken}.${signature.toString('base64url')}`);
