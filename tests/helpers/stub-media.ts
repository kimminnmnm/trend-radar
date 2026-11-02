import type { Page } from "@playwright/test";

/** 1×1 PNG. 테스트에서 외부 썸네일·임베드 요청을 실제로 보내지 않도록 대신 응답한다. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

export async function stubRemoteMedia(page: Page, options: { failImages?: boolean } = {}) {
  const requests: string[] = [];
  await page.route(/https:\/\/(i\d?\.ytimg\.com|[^/]*cdninstagram\.com|[^/]*fbcdn\.net)\//, async (route) => {
    requests.push(route.request().url());
    if (options.failImages) await route.abort("failed");
    else await route.fulfill({ status: 200, contentType: "image/png", body: PNG });
  });
  await page.route(/https:\/\/www\.youtube-nocookie\.com\//, (route) => { requests.push(route.request().url()); return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>stub</title>" }); });
  return requests;
}
