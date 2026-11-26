delete process.env.REDIS_URL;

const assert = (await import("node:assert/strict")).default;
const L = await import("../server/lobby.mjs");

const user = { id: "profile_user", email: "profile@test.local", name: "Old", chips: 1000 };
await L.saveAccount(user);

const renamed = await L.updateAccountProfile(user, { name: "Ada", gender: "female" });
assert.equal(renamed.name, "Ada");
assert.equal(renamed.gender, "female");
assert.equal(renamed.chips, 1000);

const photo = `data:image/jpeg;base64,${"a".repeat(40)}`;
const withPhoto = await L.updateAccountProfile(user, { avatar: photo, gender: "private" });
assert.equal(withPhoto.avatar, photo);
assert.equal(withPhoto.gender, "private");
assert.equal(withPhoto.name, "Ada");

await assert.rejects(() => L.updateAccountProfile(user, { name: "   " }), /1 to 24/);
await assert.rejects(() => L.updateAccountProfile(user, { gender: "other" }), /private/);
await assert.rejects(() => L.updateAccountProfile(user, { avatar: "javascript:alert(1)" }), /photo/);

const stored = await L.findAccountById(user.id);
assert.equal(stored.name, "Ada");
assert.equal(stored.passwordHash, undefined);
console.log("ok");
