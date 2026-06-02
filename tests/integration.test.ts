import request from "supertest";
import { app } from "../src/app";
import { dbService } from "../src/services/db.service";
import { Domain, ResponseCode } from "../src/types";

// Mock dbService to isolate AirTable dependency during generic API tests
jest.mock("../src/services/db.service", () => {
  let mockDB: any[] = [];
  return {
    dbService: {
      submitResponses: jest.fn(async (cycleId: string, responses: any[]) => {
        // Idempotency mocking logic simulation as per dbService real implementation
        const existing = mockDB.filter(r => r.cycle_id === cycleId);
        const existingPromptIds = new Set(existing.map(r => r.prompt_id));
        const toSave = responses.filter((r: any) => !existingPromptIds.has(r.prompt_id));
        
        toSave.forEach((r: any) => mockDB.push({ ...r, cycle_id: cycleId }));
        return true;
      }),
      fetchResponses: jest.fn(async (cycleId: string) => mockDB.filter(r => r.cycle_id === cycleId)),
      _clearMockDb: () => { mockDB = [] }
    }
  };
});

describe("API Integration: Cycles", () => {
  afterEach(() => {
    (dbService as any)._clearMockDb();
    jest.clearAllMocks();
  });

  describe("POST /v1/cycles/:id/responses", () => {
    it("handles idempotency: simulating an interrupted client retry", async () => {
      const payload = [
        { prompt_id: "P_LANG_0_0", domain: Domain.LANG, response_value: ResponseCode.OFTEN }
      ];

      // Request 1: Initial submission
      const res1 = await request(app)
        .post("/v1/cycles/cycle_123/responses")
        .send(payload);
      expect(res1.status).toBe(200);

      // Verify db state
      let responsesInDB = await dbService.fetchResponses("cycle_123");
      expect(responsesInDB.length).toBe(1);

      // Request 2: Retry with exact same payload
      const res2 = await request(app)
        .post("/v1/cycles/cycle_123/responses")
        .send(payload);
      expect(res2.status).toBe(200);

      // Verify no duplicates were created
      responsesInDB = await dbService.fetchResponses("cycle_123");
      expect(responsesInDB.length).toBe(1); 
    });
  });
});
