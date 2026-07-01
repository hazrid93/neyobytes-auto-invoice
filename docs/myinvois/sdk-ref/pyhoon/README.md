# myinvois-b4x-sdk

LHDN MyInvois B4X SDK — generate UBL 2.1 compliant e-invoices in XML and JSON format for Malaysia's MyInvois system. Cross-platform (B4J / B4A / B4i).

## Features

- **UBL 2.1 Invoice generation** — XML via `GenerateInvoiceXML()` and JSON via `GenerateInvoiceJSON()`
- **XAdES signature support** — populate UBLExtensions with digital signature elements (SignedInfo, KeyInfo, QualifyingProperties)
- **Compact or pretty-printed output** — toggle with the `Compact` parameter
- **Cross-platform** — runs on Windows, macOS, Linux (B4J), Android (B4A), iOS (B4i)

## Project structure

```
source/
├── Lib/
│   ├── MyInvois.bas         # Core class: UBL type definitions + XML/JSON generation
│   ├── manifest.txt         # Library metadata and dependency declarations
│   └── myinvois-b4x-sdk.b4j # Main development project
├── B4X/
│   ├── B4XMainPage.bas      # Sample code with CreateDocument() helper and test invocation
│   ├── B4J/                 # B4J desktop app project
│   ├── B4A/                 # B4A Android app project
│   ├── B4i/                 # B4i iOS app project
│   └── server/              # B4J server app project
release/
└── MyInvois.b4xlib          # Compiled library for B4X
```

## Usage

```b4x
Dim inv As MyInvois
inv.Initialize

Dim doc As Document = CreateDocument("1.1", "INV-001", Null, Null)
Dim xml As String = inv.GenerateInvoiceXML(doc, False)     ' pretty-printed XML
Dim json As String = inv.GenerateInvoiceJSON(doc, True)    ' compact JSON
```

See `B4XMainPage.bas:CreateDocument` for a complete document setup with supplier, customer, delivery, payment, tax, and line items.

## Note on MyInvoisUtils

This library does not include `MyInvoisUtils.bas` — a separate utility class intended for certificate handling, SHA-256 signing, canonicalization, base64 encoding, and linearization. This class depends on some libraries such as JavaObject and Encryption which only supported on B4A and B4J but not for B4i. Some public methods on `MyInvois` (e.g., `GetValue`, `GetValue2`, `GetValues`) are exposed as helpers for `MyInvoisUtils` and similar consumers. 

## Dependencies

| Platform | Libraries |
|----------|-----------|
| B4J      | `Json`, `Xml2Map` |
| B4A      | `Json`, `Xml2Map` |
| B4i      | `iJSON`, `Xml2Map` |
| Server   | `encryption`, `javaobject`, `jserver`, `json`, `xml2map`, `jstringutils`, `xmlsec-2.1.8`, `slf4j` |

## License

See [LICENSE](LICENSE).
