import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { releaseLockStorage, releaseWriteLock } from "../src/lib/cms/release-write-lock.server.ts";
const original = { ...releaseLockStorage };
afterEach(() => Object.assign(releaseLockStorage, original));
test("release writers cannot overlap and only unlock their own object", async () => {
  let held = false;
  releaseLockStorage.put = async (path, body, options) => {
    assert.equal(path, "civilcraft/release-control/write-lock.json");
    assert.equal(options.allowOverwrite, false);
    assert.equal(options.addRandomSuffix, false);
    assert.equal(options.access, "private");
    assert.ok(JSON.parse(String(body)).owner);
    if (held) throw new Error("exists");
    held = true;
    return { etag: "owner-etag" } as Awaited<ReturnType<typeof original.put>>;
  };
  releaseLockStorage.del = async (_path, options) => {
    assert.equal(options?.ifMatch, "owner-etag");
    held = false;
  };
  await releaseWriteLock.run(async () => {
    await assert.rejects(
      releaseWriteLock.run(async () => {
        assert.fail("second writer ran");
      }),
      /busy or locked/,
    );
    assert.equal(held, true);
  });
  assert.equal(held, false);
  await assert.rejects(
    releaseWriteLock.run(async () => {
      throw new Error("task failed");
    }),
    /task failed/,
  );
  assert.equal(held, false);
});
test("uncertain lock creation never runs or unlocks the protected write", async () => {
  releaseLockStorage.put = async () => {
    throw new Error("lost response");
  };
  releaseLockStorage.del = async () => {
    assert.fail("must not unlock uncertain ownership");
  };
  await assert.rejects(
    releaseWriteLock.run(async () => {
      assert.fail("must not run");
    }),
    /busy or locked/,
  );
});
