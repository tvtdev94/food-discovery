import "server-only";

/** Tool schema for OpenAI Responses API — get_weather */
export const getWeatherToolSchema = {
  type: "function" as const,
  name: "get_weather",
  description: "Lấy thời tiết hiện tại tại vị trí user.",
  parameters: {
    type: "object",
    properties: {
      lat: { type: "number", description: "Vĩ độ" },
      lng: { type: "number", description: "Kinh độ" },
    },
    required: ["lat", "lng"],
    additionalProperties: false,
  },
};

/** Tool schema for OpenAI Responses API — find_places */
export const findPlacesToolSchema = {
  type: "function" as const,
  name: "find_places",
  description: "Tìm quán ăn gần vị trí user. Tối đa 15 quán.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Loại món hoặc từ khoá tìm, VI ok, vd: 'phở bò', 'bún đậu'",
      },
      lat: { type: "number", description: "Vĩ độ" },
      lng: { type: "number", description: "Kinh độ" },
      radius_m: {
        type: "integer",
        minimum: 300,
        maximum: 5000,
        default: 2000,
        description: "Bán kính tìm kiếm tính bằng mét",
      },
      open_now: {
        type: "boolean",
        description: "Chỉ trả quán đang mở",
      },
      max_price: {
        type: "integer",
        minimum: 1,
        maximum: 4,
        description: "Mức giá tối đa 1-4",
      },
    },
    required: ["query", "lat", "lng"],
    additionalProperties: false,
  },
};

/** All tool schemas to pass to the Responses API. */
export const ALL_TOOL_SCHEMAS = [getWeatherToolSchema, findPlacesToolSchema];
