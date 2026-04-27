import { describe, it, expect, vi } from "vitest";

// No server-only imports needed — response-schema.ts has "server-only" but
// we mock it to allow unit testing the pure factory function.
vi.mock("server-only", () => ({}));

import { buildRecSchema } from "@/lib/chat/response-schema";

describe("buildRecSchema", () => {
  it("returns schema with recommendations as the only required field", () => {
    const schema = buildRecSchema(["place-1", "place-2"]);

    expect(schema.type).toBe("object");
    expect(schema.required).toContain("recommendations");
    expect(schema.required).not.toContain("assistant_message");
    expect(schema.additionalProperties).toBe(false);
  });

  it("does not expose assistant_message property (text now streams separately)", () => {
    const schema = buildRecSchema(["place-1"]);
    expect(schema.properties).not.toHaveProperty("assistant_message");
  });

  it("recommendations is an array with correct bounds", () => {
    const schema = buildRecSchema(["a", "b", "c"]);
    const recs = schema.properties.recommendations;

    expect(recs.type).toBe("array");
    expect(recs.minItems).toBe(0);
    expect(recs.maxItems).toBe(5);
  });

  it("recommendation items have place_id and why_fits as required", () => {
    const schema = buildRecSchema(["x"]);
    const item = schema.properties.recommendations.items;

    expect(item.required).toContain("place_id");
    expect(item.required).toContain("why_fits");
    expect(item.additionalProperties).toBe(false);
  });

  it("place_id enum matches provided placeIdEnum exactly with 3 values", () => {
    const ids = ["id-alpha", "id-beta", "id-gamma"];
    const schema = buildRecSchema(ids);
    const placeIdProp = schema.properties.recommendations.items.properties.place_id;

    expect(placeIdProp.type).toBe("string");
    expect(placeIdProp.enum).toEqual(ids);
  });

  it("place_id enum matches provided placeIdEnum with 15 values", () => {
    const ids = Array.from({ length: 15 }, (_, i) => `ChIJplace${i}`);
    const schema = buildRecSchema(ids);
    const placeIdEnum = schema.properties.recommendations.items.properties.place_id.enum;

    expect(placeIdEnum).toHaveLength(15);
    expect(placeIdEnum).toEqual(ids);
  });

  it("uses sentinel __none__ enum when placeIdEnum is empty (0 candidates)", () => {
    const schema = buildRecSchema([]);
    const placeIdEnum = schema.properties.recommendations.items.properties.place_id.enum;

    // Must not be empty — Responses API requires at least one enum value.
    expect(placeIdEnum).toHaveLength(1);
    expect(placeIdEnum[0]).toBe("__none__");
  });

  it("schema is structurally valid JSON-serialisable", () => {
    const ids = ["place-a", "place-b"];
    const schema = buildRecSchema(ids);

    const serialised = JSON.stringify(schema);
    const parsed = JSON.parse(serialised) as typeof schema;
    expect(parsed.properties.recommendations.items.properties.place_id.enum).toEqual(ids);
  });

  it("why_fits property is type string with description", () => {
    const schema = buildRecSchema(["p1"]);
    const whyFits = schema.properties.recommendations.items.properties.why_fits;

    expect(whyFits.type).toBe("string");
    expect(typeof whyFits.description).toBe("string");
    expect(whyFits.description.length).toBeGreaterThan(0);
  });
});
