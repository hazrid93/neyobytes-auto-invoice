import base64, hashlib, json, re
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
from cryptography import x509

ROOT = Path(__file__).resolve().parents[2]
dump = (ROOT / "docs/myinvois/signature-creation-json.md").read_text()
lines = dump.splitlines()
signed_line = next(ln.strip() for ln in lines if ln.strip().startswith('{"_D":') and "SignatureValue" in ln)
dvs = re.findall(r'"DigestValue":\[\{"_":"([^"]+)"', signed_line)
sv_b64 = re.findall(r'"SignatureValue":\[\{"_":"([^"]+)"', signed_line)[0]
cert_b64 = re.findall(r'"X509Certificate":\[\{"_":"([^"]+)"', signed_line)[0]
doc_ref_digest = dvs[2]   # the Reference with Type="" URI="" (the document)
signedprops_ref_digest = dvs[1]

# The signed sample is a JSON fragment:  { "_D","_A","_B", "Invoice":[{...,"UBLExtensions":[...]}, ...stuff...] }
# Actually structure is: {"_D":..,"_A":..,"_B":..,"Invoice":[{"....","UBLExtensions":[...]}]}
# plus possibly a top-level "Signature":[...]. Parse with json (preserves order on py3.7+).
full = json.loads(signed_line)
print("top-level keys:", list(full.keys()))
invoice = full["Invoice"][0]
print("Invoice keys:", list(invoice.keys()))

# Step-1 transform = remove UBLExtensions (and Signature) from the Invoice.
invoice.pop("UBLExtensions", None)
# Re-serialize MINIFIED. json.dumps with separators=(",",":") is the standard minify.
# BUT: does it match the page's byte serialization? Key order is preserved (insertion).
# The page's minified form may differ in number formatting (e.g. 1.0 vs 1, true vs True).
doc_minified = json.dumps(full, separators=(",", ":"), ensure_ascii=False)
print("\n=== reconstructed v1.1 transformed doc (json minified, key-order preserved) ===")
print("  length:", len(doc_minified))
print("  starts:", doc_minified[:90])
print("  has UBLExtensions? :", "UBLExtensions" in doc_minified)

print("\n=== TEST: base64(SHA256(minified v1.1 transformed)) == doc_ref_digest ? ===")
h = hashlib.sha256(doc_minified.encode("utf-8")).digest()
h_b64 = base64.b64encode(h).decode()
print("  computed:", h_b64)
print("  expected:", doc_ref_digest, " (Reference with empty Type/URI)")
print("  MATCH:", h_b64 == doc_ref_digest)

print("\n=== TEST: RSA-verify SignatureValue over SHA256(minified v1.1 transformed) ===")
sig = base64.b64decode(sv_b64)
cert = x509.load_der_x509_certificate(base64.b64decode(cert_b64))
pubkey = cert.public_key()
try:
    pubkey.verify(sig, h, padding.PKCS1v15(), hashes.SHA256())
    print("  -> TRUE ✅✅✅  PROSE READING CONFIRMED: SignatureValue = SignHash(SHA256(doc))")
except Exception as e:
    print("  -> False (", type(e).__name__, ")")

# Cross-check the SignedProperties algorithm again (should still match — sanity)
sp_block = next(ln.strip() for ln in lines if ln.strip().startswith('{"Target":"signature","SignedProperties":['))
h_sp = hashlib.sha256(sp_block.encode("utf-8")).digest()
print("\n=== sanity: SHA256(minified SignedProperties) == signedprops_ref_digest ? ===")
print("  computed:", base64.b64encode(h_sp).decode())
print("  expected:", signedprops_ref_digest)
print("  MATCH:", base64.b64encode(h_sp).decode() == signedprops_ref_digest)