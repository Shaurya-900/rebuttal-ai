// Records the model's answers for the chat's suggested opening attacks into fixtures/llm-cache, so on the hosted
// site those chips replay for free. Run: npm run record:chat (needs REBUTTAL_LLM_KEY in .env).
import { chatTurn, SUGGESTIONS } from "../src/lib/chat";
import { DEFAULT_POLICY } from "../src/lib/firewall/types";
import { createLlm, LLM_CACHE_DIR, providersFromEnv, QuotaError } from "../src/lib/llm";

const llm = createLlm({ mode: "record", providers: providersFromEnv(), cacheDir: LLM_CACHE_DIR });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const [label, text] of SUGGESTIONS) {
  for (let attempt = 1; ; attempt++) {
    try {
      const o = await chatTurn(llm, [text], DEFAULT_POLICY);
      console.log(`${label}: Rebuttal ${o.choice} -> ${o.gate?.kind ?? "none"}${o.rebuttalFooled ? " (FOOLED)" : ""}; naive ${o.naive.proposal.type}${o.naive.fooled ? " (FOOLED)" : ""}`);
      break;
    } catch (e) {
      if (!(e instanceof QuotaError) || attempt > 6) throw e;
      const wait = Math.max(e.retryAfterMs ?? 0, 20_000);
      console.log(`${label}: rate limited, waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }
}
