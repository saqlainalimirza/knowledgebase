import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Live OpenAPI 3.1 spec for the Evergreen API. An AI client can fetch this at
// GET /api/openapi and then call every endpoint. Set EVERGREEN_PUBLIC_URL to the
// deployed Railway domain so `servers` is absolute for remote callers.
export async function GET() {
  const server = process.env.EVERGREEN_PUBLIC_URL || "/";
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Scaletopia Evergreen API",
      version: "1.0.0",
      description:
        "First-party memory for cold-outreach copywriting. Read endpoints serve data from multiple angles (pains, lingo, case studies, winning copy, niche brain); `limit` controls how much. Write endpoints save copy and link it to a campaign.",
    },
    servers: [{ url: server }],
    paths: {
      "/api/clients": {
        get: {
          operationId: "listClients",
          summary: "List all clients with corpus counts.",
          responses: { "200": { description: "clients", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/ClientRow" } } } } } },
        },
      },
      "/api/clients/{slug}": {
        get: {
          operationId: "getClient",
          summary: "Full client detail: pains, case studies, calls, campaigns, niche brain.",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "client detail" } },
        },
      },
      "/api/clients/{slug}/stats": {
        get: {
          operationId: "getClientStats",
          summary: "Live performance KPIs from Airtable + per-campaign stats (sent, replies, bookings, completion).",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "stats + campaigns" } },
        },
      },
      "/api/clients/{slug}/deals": {
        get: {
          operationId: "getClientDeals",
          summary:
            "Live deals from Airtable with full attribution: outcome (stage, reply category, lost reason, closed amount), copy_variant, campaign (name + db_campaign_id), who converted (job_title, company, contact), and the conversation thread. Includes by_stage/by_variant/by_channel/by_reply_category aggregates. Optional filters: stage, variant, channel, category, limit.",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
            { name: "stage", in: "query", schema: { type: "string" } },
            { name: "variant", in: "query", schema: { type: "string" } },
            { name: "channel", in: "query", schema: { type: "string", enum: ["sms", "email"] } },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 500 } },
          ],
          responses: { "200": { description: "deals + aggregates" } },
        },
      },
      "/api/clients/{slug}/copies": {
        get: {
          operationId: "listCopies",
          summary: "All copies for a client (with campaign link + real positive_rate) and the client's campaigns.",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "copies + campaigns" } },
        },
      },
      "/api/search": {
        post: {
          operationId: "search",
          summary:
            "Semantic search over one angle of the memory. Embeds the query and returns the most relevant rows, ranked by similarity. Use `route` to first match the query to the best niche, then search inside it.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SearchRequest" } } },
          },
          responses: { "200": { description: "results", content: { "application/json": { schema: { $ref: "#/components/schemas/SearchResponse" } } } } },
        },
      },
      "/api/clusters": {
        post: {
          operationId: "clusterPains",
          summary:
            "Cluster a niche's (or client's) pains by embedding similarity (cosine >= threshold). Returns groups of near-duplicate pains with their members and client_count — i.e. the dominant, repeated pains.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ClusterRequest" } } },
          },
          responses: { "200": { description: "clusters" } },
        },
      },
      "/api/graph": {
        get: { operationId: "getGraph", summary: "Knowledge-graph nodes + edges (niche → client → pains/campaigns/cases/copies/calls, with provenance + niche-similarity edges).", responses: { "200": { description: "graph" } } },
      },
      "/api/agents/save-copy": {
        post: {
          operationId: "saveCopy",
          summary: "Save a finished copy + its components (char counts + embeddings computed). Optionally link to a campaign at save time.",
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SaveCopyRequest" } } } },
          responses: { "200": { description: "saved", content: { "application/json": { schema: { $ref: "#/components/schemas/AgentResult" } } } } },
        },
      },
      "/api/copy/link": {
        post: {
          operationId: "linkCopy",
          summary: "Link (or unlink) a saved copy to a campaign. The copy inherits the campaign's niche/persona.",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { copyId: { type: "integer" }, campaignId: { type: "integer", nullable: true } }, required: ["copyId"] } } } },
          responses: { "200": { description: "ok" } },
        },
      },
    },
    components: {
      schemas: {
        ClientRow: {
          type: "object",
          properties: {
            slug: { type: "string" }, client: { type: "string" }, niche: { type: "string", nullable: true },
            sub_niche: { type: "string", nullable: true }, offer: { type: "string", nullable: true },
            airtable_client_id: { type: "string", nullable: true }, status: { type: "string", nullable: true },
            calls: { type: "string" }, pains: { type: "string" }, case_studies: { type: "string" }, campaigns: { type: "string" },
          },
        },
        SearchRequest: {
          type: "object",
          required: ["type", "query"],
          properties: {
            type: { type: "string", enum: ["pains", "calls", "case_studies", "copies", "components"], description: "which angle to search" },
            query: { type: "string", description: "natural-language query; embedded for semantic match" },
            niche: { type: "string", description: "scope to an exact niche (skips routing)" },
            status: { type: "string", description: "copies only: winner | loser | neutral | draft" },
            route: { type: "boolean", description: "route the query to the best niche first, then search inside it (recommended when no niche given)" },
            limit: { type: "integer", default: 10, description: "how many rows — the more/less/medium dial (e.g. 3 / 6 / 12)" },
          },
        },
        SearchResponse: {
          type: "object",
          properties: {
            type: { type: "string" }, query: { type: "string" },
            routed: { type: "array", items: { type: "object", properties: { niche: { type: "string" }, score: { type: "number" } } } },
            results: { type: "array", items: { type: "object", description: "row with a `score` (cosine similarity 0-1). Pains: item_text, kind, confidence. Case studies: subject_brand, tier, after_state, unique_mechanism. Copies: t1, t2, lever, status, positive_rate. Components: component_type, item_text, verdict." } },
          },
        },
        ClusterRequest: {
          type: "object",
          properties: {
            niche: { type: "string" }, client: { type: "string" },
            threshold: { type: "number", default: 0.82, description: "cosine cutoff to merge pains" },
          },
        },
        SaveCopyRequest: {
          type: "object",
          required: ["client_slug"],
          properties: {
            client_slug: { type: "string" }, t1: { type: "string" }, t2: { type: "string" },
            lever: { type: "string" }, persona: { type: "string" }, niche: { type: "string" },
            status: { type: "string", enum: ["draft", "winner", "loser", "neutral"], default: "draft" },
            campaignId: { type: "integer", description: "link to this campaign at save time" },
            components: {
              type: "array",
              items: { type: "object", properties: { component_type: { type: "string", enum: ["disarmer", "identity", "case_line", "unique_mechanism", "relevance", "cta"] }, item_text: { type: "string" } } },
            },
          },
        },
        AgentResult: { type: "object", properties: { ok: { type: "boolean" }, output: { type: "string" } } },
      },
    },
  };
  return NextResponse.json(spec);
}
