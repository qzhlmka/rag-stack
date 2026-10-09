# OCR pipeline (scanned docs, images, photos of documents)

Use for ingestion when sources include scanned PDFs, images, handwritten or
photographed pages. Then continue with the standard Phases 1–8.
`npm run ingest:check` flags pages with no text layer ("NO TEXT") — those need this route.

## Detect

A PDF page needs OCR if extracted text is empty or < ~50 characters while
the page has visible content. Check per page, not per file.

## Options (compare on a sample in Phase 2)

| Option | Good for |
|---|---|
| Claude vision (page image → Markdown) | mixed layouts, tables, multilingual text, handwriting-light |
| Dedicated OCR/document APIs (e.g. Mistral OCR, Azure Document Intelligence, Google Document AI) | high volume, forms, consistent layouts |
| Tesseract (`tesseract.js`) | free, clean printed text only |

## Steps

1. Render pages to images at 200–300 DPI.
2. OCR to **Markdown** (keep headings, lists, tables as Markdown tables).
3. Keep `page` metadata and a `ocr_engine` field on every chunk.
4. Quality check: hand-verify 10 pages; measure character error rate (CER)
   or spot-check key terms. Target CER ≤ 3% on printed text.
5. Tables: keep each table intact in one chunk with its caption/heading;
   if large, also store a row-per-record text version.
6. Images/diagrams with meaning: add a short vision-model description as text.

## Gate (added to Phase 2)

OCR quality check passed before baseline retrieval is measured — otherwise
retrieval failures will be blamed on chunking when the text itself is wrong.
