#!/usr/bin/env bash
# One-time: set up a STABLE self-signed code-signing certificate so Quickboard
# builds are signed with the same identity every time. macOS keys app permissions
# (Accessibility, etc.) to the signature — a stable one means updates keep their
# permissions instead of resetting every time. Ad-hoc signing (the default) gets a
# fresh signature per build, which is why permissions reset on each update.
#
# Run once:  ./scripts/setup-signing.sh
# It needs your login password for the trust step (a macOS dialog will ask).
# After this, ./scripts/release.sh signs automatically. See docs/RELEASING.md.
set -eo pipefail

CN="Quickboard Self-Signed"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if security find-identity -v -p codesigning | grep -q "$CN"; then
  echo "OK: '$CN' is already trusted and ready — nothing to do."
  exit 0
fi

# Create + import the cert if it isn't in the keychain yet.
if ! security find-certificate -c "$CN" >/dev/null 2>&1; then
  echo "==> Creating self-signed code-signing certificate…"
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  cat > "$TMP/req.conf" <<EOF
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = $CN
[v3]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
EOF
  openssl req -x509 -newkey rsa:2048 -keyout "$TMP/k.key" -out "$TMP/c.crt" -days 3650 -nodes -config "$TMP/req.conf" -sha256 >/dev/null 2>&1
  # -legacy so macOS's `security import` can read the PKCS#12 (OpenSSL 3 default can't).
  openssl pkcs12 -export -legacy -inkey "$TMP/k.key" -in "$TMP/c.crt" -out "$TMP/c.p12" -passout pass:qbtemp -name "$CN" >/dev/null 2>&1
  security import "$TMP/c.p12" -k "$KEYCHAIN" -P qbtemp -T /usr/bin/codesign -T /usr/bin/security >/dev/null
  echo "    imported into the login keychain."
fi

echo "==> Trusting it for code signing (a macOS dialog will ask for your login password)…"
CERT_PEM="$(mktemp)"
security find-certificate -c "$CN" -p "$KEYCHAIN" > "$CERT_PEM"
security add-trusted-cert -r trustRoot -p codeSign "$CERT_PEM"
rm -f "$CERT_PEM"

if security find-identity -v -p codesigning | grep -q "$CN"; then
  echo "OK: '$CN' is trusted and ready. ./scripts/release.sh will now sign with it."
else
  echo "ERROR: still not a valid signing identity. Open Keychain Access, find '$CN',"
  echo "       and set it to 'Always Trust' for Code Signing, then re-run this."
  exit 1
fi
