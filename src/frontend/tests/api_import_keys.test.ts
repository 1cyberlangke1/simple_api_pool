import { describe, expect, it } from "vitest";

import { parseImportedKeys, splitImportedKeys } from "@/api.js";

describe("import key parsing", function () {
  it("支持半角逗号、全角逗号和换行混合切分", function () {
    expect(splitImportedKeys(" key-1，key-2,\nkey-3 ， key-4 ")).toEqual(["key-1", "key-2", "key-3", "key-4"]);
  });

  it("会在混合分隔输入下去重并保留首次出现顺序", function () {
    expect(parseImportedKeys("key-1，key-2,key-1\nkey-3， key-2")).toEqual(["key-1", "key-2", "key-3"]);
  });
});
