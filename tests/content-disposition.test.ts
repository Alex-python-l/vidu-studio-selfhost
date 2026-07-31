import assert from "node:assert/strict";
import test from "node:test";
import { inlineContentDisposition } from "../lib/content-disposition";

test("content disposition keeps headers ASCII-safe and preserves UTF-8 names", () => {
  const value = inlineContentDisposition("7\u670828\u65e5(3).mp4");

  assert.match(value, /^inline; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
  assert.match(value, /%E6%9C%88/);
  assert.doesNotMatch(value, /[\u0080-\uFFFF]/);
  assert.doesNotThrow(() => new Headers({ "Content-Disposition": value }));
});

test("content disposition neutralizes quotes and control characters", () => {
  const value = inlineContentDisposition("bad\"\r\nname.mov");

  assert.doesNotMatch(value, /\r|\n/);
  assert.match(value, /filename="bad_name\.mov"/);
  assert.match(value, /filename\*=UTF-8''bad%22%0D%0Aname\.mov/);
});

test("content disposition uses a stable fallback for blank names", () => {
  assert.equal(
    inlineContentDisposition("   "),
    "inline; filename=\"media\"; filename*=UTF-8''media",
  );
});
