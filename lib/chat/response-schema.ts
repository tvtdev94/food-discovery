import "server-only";

/**
 * Builds a strict JSON Schema for the pass-2 structured output (recs branch).
 *
 * After the Pass-2 split (parallel text-stream + recs-structured), assistant_message
 * is owned by the streaming text call, NOT this structured call. Schema therefore
 * contains ONLY `recommendations` — text comes via separate `message_delta` events.
 *
 * place_id is constrained to an enum of filtered place IDs to prevent hallucination.
 * When placeIdEnum is empty the enum array is ["__none__"] — model must return 0 recs.
 */
export function buildRecSchema(placeIdEnum: string[]) {
  // Responses API requires at least one enum value; use sentinel when no places found.
  const safeEnum = placeIdEnum.length > 0 ? placeIdEnum : ["__none__"];

  return {
    type: "object",
    properties: {
      recommendations: {
        type: "array",
        minItems: 0,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            place_id: {
              type: "string",
              enum: safeEnum,
            },
            why_fits: {
              type: "string",
              description: "VI, ≤80 ký tự, nêu tại sao hợp user này.",
            },
          },
          required: ["place_id", "why_fits"],
          additionalProperties: false,
        },
      },
    },
    required: ["recommendations"],
    additionalProperties: false,
  } as const;
}
