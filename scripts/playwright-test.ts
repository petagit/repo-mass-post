/* eslint-disable no-console */

import { POST } from "../app/api/scrape-xiaohongshu/route";

async function main(): Promise<void> {
  process.env.USE_PLAYWRIGHT = "true";

  const input = "一如初见【大昔涟】 http://xhslink.com/o/1M4hl3mEKA Copy and open Xiaohongshu to view the full post！";

  const req = new Request("http://localhost/api/scrape-xiaohongshu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: input }),
  });

  const res = await POST(req);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


