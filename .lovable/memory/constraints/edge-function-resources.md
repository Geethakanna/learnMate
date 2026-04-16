---
name: Edge Function Resource Limits
description: File size limits, memory-safe base64, and OCR.space integration for extraction
type: constraint
---
- MAX_FILE_SIZE = 20MB for process-handwritten and extract-pdf
- Use Deno std base64Encode, never spread operator on large Uint8Array
- OCR.space (Engine 2) is primary extractor for images/PDFs; AI vision is fallback
- OCR.space rate limit: 500 calls/day on free tier
- Secret: OCR_SPACE_API_KEY
