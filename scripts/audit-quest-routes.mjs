// Fetches the current public feeds at run time; stores no third-party dataset in this repo.
import { fetchOsms } from '../src/osms.js';
import { fetchQuestCatalog } from '../src/quests.js';
import { auditQuestRoutes } from '../src/questrouteaudit.js';

const [data, quests] = await Promise.all([fetchOsms(), fetchQuestCatalog()]);
const audit = auditQuestRoutes(data, quests);
console.log(JSON.stringify(audit, null, 2));
