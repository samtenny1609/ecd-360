import { GroupingService } from "../src/services/grouping.service";
import { Domain, ResponseCode, ResponseRecord } from "../src/types";

// Mock auditService to not actually hit Airtable during testing
jest.mock("../src/services/audit.service", () => ({
  auditService: { logClassification: jest.fn().mockResolvedValue(true) }
}));

describe("Grouping Service", () => {
  const groupingService = new GroupingService();
  const dummyCycleId = "cycle_123";
  const dummyAge = 12;

  const createRes = (domain: Domain, value: ResponseCode): ResponseRecord => ({
    response_id: Math.random().toString(),
    cycle_id: dummyCycleId,
    prompt_id: `P_${domain}_0_000`,
    domain,
    response_value: value,
  });

  describe("Edge Gates", () => {
    it("Gate 1 fires if N_total < 3", async () => {
      const responses = [createRes(Domain.COG, ResponseCode.OFTEN), createRes(Domain.COG, ResponseCode.NOT_YET)];
      const res = await groupingService.classifyCycleResponses(dummyCycleId, dummyAge, responses);
      expect(res[0].group).toBe("INCOMPLETE");
    });

    it("Gate 2 fires if NEUTRAL% >= 60%", async () => {
      const responses = [
        createRes(Domain.COG, ResponseCode.NEUTRAL),
        createRes(Domain.COG, ResponseCode.NEUTRAL),
        createRes(Domain.COG, ResponseCode.OFTEN)
      ];
      // N_total = 3, N_eff = 3. Neutral is 2/3 = 66.7%
      const res = await groupingService.classifyCycleResponses(dummyCycleId, dummyAge, responses);
      expect(res[0].group).toBe("SEEK_SUPP");
    });

    it("evaluates REMIND_LATER accumulation: all REMIND_LATER -> Gate 1 fires", async () => {
      const responses = [
        createRes(Domain.COG, ResponseCode.REMIND_LATER),
        createRes(Domain.COG, ResponseCode.REMIND_LATER),
        createRes(Domain.COG, ResponseCode.REMIND_LATER),
      ];
      // Excluded are not counted in N_total yet based on given logic (N_total = pos + neg + neutral).
      // Wait, is N_total = pos+neg+neutral? The prompt says: "N_total = Positive + Negative + Neutral".
      // Yes. So 3 excluded means N_total = 0.
      const res = await groupingService.classifyCycleResponses(dummyCycleId, dummyAge, responses);
      expect(res[0].group).toBe("INCOMPLETE");
    });

    it("evaluates REMIND_LATER near-miss: 7 REMIND_LATER + 1 OFTEN -> Gate 1 fires", async () => {
      const responses = [
        ...Array(7).fill(createRes(Domain.COG, ResponseCode.REMIND_LATER)),
        createRes(Domain.COG, ResponseCode.OFTEN)
      ];
      // N_total = 1.
      const res = await groupingService.classifyCycleResponses(dummyCycleId, dummyAge, responses);
      expect(res[0].group).toBe("INCOMPLETE");
    });
  });

  describe("Main Rules", () => {
    it("Rule 6 Fallthrough: Exact P%=20.0 / Neg%=60.0 boundary case", async () => {
      // Need exactly P=20, Neg=60, Neut=20. N=10 (P=2, N=6, Neut=2)
      const responses = [
        ...Array(2).fill(createRes(Domain.COG, ResponseCode.OFTEN)),
        ...Array(6).fill(createRes(Domain.COG, ResponseCode.NOT_YET)),
        ...Array(2).fill(createRes(Domain.COG, ResponseCode.NEUTRAL)),
      ];
      const res = await groupingService.classifyCycleResponses(dummyCycleId, dummyAge, responses);
      expect(res[0].group).toBe("SEEK_SUPP");
    });

    it("Mixed domain batch processes correctly", async () => {
      const responses = [
        ...Array(5).fill(createRes(Domain.COG, ResponseCode.OFTEN)),     // COG: N=5, 100% P -> ACT_DEV
        ...Array(5).fill(createRes(Domain.LANG, ResponseCode.NOT_YET))   // LANG: N=5, 100% Neg -> SEEK_SUPP
      ];
      
      const res = await groupingService.classifyCycleResponses(dummyCycleId, dummyAge, responses);
      expect(res.length).toBe(2);
      expect(res.find(r => r.domain === Domain.COG)?.group).toBe("ACT_DEV");
      expect(res.find(r => r.domain === Domain.LANG)?.group).toBe("SEEK_SUPP");
    });
  });
});
