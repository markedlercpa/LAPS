# LAPS Agent API

LAPS is **agent-managed, human-visible**: an agent creates and fills records so
people don't do data entry. This HTTP API is the agent surface for **proposals**
(the first entity; leads/appointments follow the same pattern later).

## Auth

Every request needs a bearer token equal to the `AGENT_API_KEY` env var:

```
Authorization: Bearer <AGENT_API_KEY>
```

- `AGENT_API_KEY` unset → `503` (API disabled).
- Missing/incorrect token → `401`.

Base URL in production: `https://laps-wxm8.onrender.com`.

## Endpoints

### `GET /api/agent/templates`
List full proposal templates + section snippets (the reusable building blocks).

```json
{
  "templates": [
    { "key": "quality-of-earnings", "name": "Quality of Earnings (QoE)",
      "defaultTitle": "Quality of Earnings Engagement",
      "coverLetter": "…", "scopeNarrative": "…", "termsText": "…",
      "paymentScheduleType": "DEPOSIT_THEN_BALANCE", "recurringInterval": null,
      "defaultDeliveryCost": "12000",
      "lineItems": [{ "description": "…", "quantity": 1, "unitPrice": 25000 }],
      "payments": [{ "description": "50% deposit on signing", "amount": 12500, "dueOn": "On signing" }] }
  ],
  "snippets": [ { "key": "cas-monthly-scope", "type": "SCOPE", "name": "Client Accounting Services (CAS) — Scope", "body": "…" } ]
}
```

Starter template keys: `cas-monthly`, `tax-prep-planning`, `quality-of-earnings`,
`fractional-cfo`.

### `POST /api/agent/proposals`
Create a proposal for an existing lead, optionally prefilled from a template and/or
with explicit overrides. Provide **`leadId` or `leadEmail`** (must resolve to an
existing lead).

```jsonc
{
  "leadEmail": "jane@acme.com",
  "templateKey": "quality-of-earnings",   // optional — prefills all sections
  "title": "Project Falcon — QoE",         // optional overrides on top of the template
  "estimatedDeliveryCost": 14000,
  "lineItems": [                            // present arrays REPLACE the template's
    { "description": "Sell-side QoE", "quantity": 1, "unitPrice": 32000 }
  ],
  "payments": [
    { "description": "50% deposit on signing", "amount": 16000, "dueOn": "On signing" },
    { "description": "50% on delivery",        "amount": 16000, "dueOn": "On delivery" }
  ]
}
```

Returns `201` with the full proposal summary (see below). The lead is advanced to
the **Proposal** stage.

### `GET /api/agent/proposals/:id`
Full proposal summary (includes internal `estimatedDeliveryCost` — agent-only).

```json
{
  "id": "…", "title": "…", "status": "DRAFT", "publicToken": null, "link": null,
  "paymentStatus": "NONE", "amountPaid": null,
  "estimatedDeliveryCost": 14000, "contractTotal": 32000,
  "coverLetter": "…", "scopeNarrative": "…", "termsText": "…",
  "paymentScheduleType": "DEPOSIT_THEN_BALANCE", "recurringInterval": null,
  "lead": { "id": "…", "name": "Acme Co", "email": "jane@acme.com" },
  "owner": { "id": "…", "name": "Mark Edler", "email": "mark@edlerzain.com" },
  "lineItems": [ … ], "payments": [ … ]
}
```

### `PATCH /api/agent/proposals/:id`
Apply a `templateKey` and/or any subset of the proposal fields (same shape as
create, minus lead). `lineItems`/`payments` arrays replace existing rows. Returns
the updated summary.

### `POST /api/agent/proposals/:id/send`
Generate the public link, mark the proposal **SENT**, and email the client the
signing link via the owner's Microsoft 365 account (when connected). Requires ≥1
line item and a non-zero `estimatedDeliveryCost` (the margin guard).

```json
{ "ok": true, "link": "https://laps-wxm8.onrender.com/p/<token>", "emailed": true }
```

The client then reviews and signs at `link`; if the first payment row is a deposit
and Stripe is configured, they pay it before the proposal finalizes to **Won**.

## Notes

- The margin field (`estimatedDeliveryCost`) is internal and returned to agents but
  never shown on the public `/p/<token>` page.
- Humans see everything the agent does in the LAPS dashboard (Proposals → detail);
  they can review, tweak, or override before/after sending.
