import { dbService } from "../src/services/db.service";
import { config } from "dotenv";
config();

async function run() {
  console.log("Testing dbService mapping...");
  const result = await dbService.getActionForDomainAndState("COG", "STS");
  console.log("Returned:", result);
  process.exit(0);
}

run();
