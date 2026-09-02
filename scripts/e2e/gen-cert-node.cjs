// Minimal self-signed X.509 cert generator in pure Node (no deps).
// Used only to give the local fake SMTP server a TLS identity; the client
// (nodemailer) runs with NODE_TLS_REJECT_UNAUTHORIZED=0, so chain/validity
// checks are disabled and a well-formed cert is sufficient.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// ---- minimal DER helpers ----
function derLen(len) {
  if (len < 0x80) return Buffer.from([len]);
  const bytes = [];
  let v = len;
  while (v > 0) { bytes.unshift(v & 0xff); v >>>= 8; }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
function derTlv(tag, content) {
  return Buffer.concat([Buffer.from([tag]), derLen(content.length), content]);
}
function derInt(value) {
  let bytes = [];
  let v = value;
  while (v > 0) { bytes.unshift(v & 0xff); v = Math.floor(v / 256); }
  if (!bytes.length) bytes = [0];
  if (bytes[0] & 0x80) bytes.unshift(0);
  return derTlv(0x02, Buffer.from(bytes));
}
function derOid(oid) {
  const parts = oid.split('.').map(Number);
  const body = [40 * parts[0] + parts[1]];
  for (const p of parts.slice(2)) {
    let n = p;
    const chunk = [];
    do { chunk.unshift(n & 0x7f); n = Math.floor(n / 128); } while (n > 0);
    for (let i = 0; i < chunk.length - 1; i++) chunk[i] |= 0x80;
    body.push(...chunk);
  }
  return derTlv(0x06, Buffer.from(body));
}
function derUtf8String(text) { return derTlv(0x0c, Buffer.from(text, 'utf8')); }
function derOctetString(buf) { return derTlv(0x04, buf); }
function derBitString(buf) { return derTlv(0x03, Buffer.concat([Buffer.from([0x00]), buf])); }
function derUtcTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getUTCFullYear() % 100;
  const s = `${pad(y)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  return derTlv(0x17, Buffer.from(s, 'ascii'));
}
// Name ::= SEQUENCE OF RDN; RDN ::= SET OF AttributeTypeAndValue
function derName(cn) {
  const attribute = derTlv(0x30, Buffer.concat([derOid('2.5.4.3'), derUtf8String(cn)]));
  return derTlv(0x30, derTlv(0x31, attribute));
}
function derBool(b) { return derTlv(0x01, Buffer.from([b ? 0xff : 0x00])); }

const SHA256_RSA_OID = '1.2.840.113549.1.1.11';
const ALG = derTlv(0x30, Buffer.concat([derOid(SHA256_RSA_OID), Buffer.from([0x05, 0x00])]));

function buildSanExtension() {
  const dnsName = derTlv(0x82, Buffer.from('localhost', 'utf8'));
  const ipAddress = derTlv(0x87, Buffer.from([127, 0, 0, 1]));
  const generalNames = derTlv(0x30, Buffer.concat([dnsName, ipAddress]));
  const ext = Buffer.concat([
    derOid('2.5.29.17'),
    derBool(true), // critical
    derOctetString(generalNames),
  ]);
  return derTlv(0x30, ext);
}

async function main() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const spki = publicKey.export({ type: 'spki', format: 'der' });

  const notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  const notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const serial = crypto.randomBytes(16);

  const tbs = derTlv(0x30, Buffer.concat([
    Buffer.from([0xa0, 0x03, 0x02, 0x01, 0x02]), // version v3
    derInt(serial.readUInt32BE(0) || 1),
    ALG,
    derName('localhost'),
    derTlv(0x30, Buffer.concat([derUtcTime(notBefore), derUtcTime(notAfter)])),
    derName('localhost'),
    spki, // SubjectPublicKeyInfo (already a DER SEQUENCE)
    derTlv(0xa3, derTlv(0x30, buildSanExtension())), // extensions [3]
  ]));

  const signature = crypto.sign('sha256', tbs, privateKey);
  const certDer = derTlv(0x30, Buffer.concat([tbs, ALG, derBitString(signature)]));

  if (process.argv.includes('--dump')) {
    console.error('TBS HEX:');
    console.error(tbs.toString('hex').match(/.{1,2}/g).join(' '));
    console.error('CERT HEX (first 200 bytes):');
    console.error(certDer.toString('hex').slice(0, 400).match(/.{1,2}/g).join(' '));
  }

  const certPem = ['-----BEGIN CERTIFICATE-----',
    certDer.toString('base64').match(/.{1,64}/g).join('\n'),
    '-----END CERTIFICATE-----'].join('\n');
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

  const outDir = path.resolve(__dirname, 'certs');
  fs.writeFileSync(path.join(outDir, 'server.crt'), certPem + '\n');
  fs.writeFileSync(path.join(outDir, 'server.key'), keyPem);

  // sanity: parse back with node's X509Certificate
  const parsed = new crypto.X509Certificate(certPem);
  console.log('cert written. subject =', parsed.subject);
  console.log('SAN =', parsed.subjectAltName);
}

main().catch((error) => { console.error(error); process.exit(1); });
