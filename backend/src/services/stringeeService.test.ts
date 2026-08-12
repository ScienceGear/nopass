import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isStringeeConfigured, generateStringeeJwt } from "./stringeeService.js";

describe("stringeeService unit tests", () => {
  it("isStringeeConfigured returns a boolean status", () => {
    assert.equal(typeof isStringeeConfigured(), "boolean");
  });

  it("generateStringeeJwt returns a valid JWT structure", () => {
    const token = generateStringeeJwt("SK.test.123456", "test_secret_key_stringee_123456789");
    assert.ok(typeof token === "string");
    assert.equal(token.split(".").length, 3);
  });
});
