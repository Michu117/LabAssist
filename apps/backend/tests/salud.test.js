const request = require("supertest");

const app = require("../src/app");

describe("GET /api/v1/salud", () => {
  it("responde 200 con ok en true y el estado del servicio", async () => {
    const res = await request(app).get("/api/v1/salud");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { estado: "ok" } });
  });
});
