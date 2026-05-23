const assert = require("assert");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const lib = require("../../../lib");

describe("Auth", function() {
    const usersPath = path.join(__dirname, "..", "..", "..", "config", "users.json");
    const backupPath = usersPath + ".bak";
    let hadExisting = false;

    before(function() {
        // backs up any existing on disk users file so the test
        // suite does not clobber the developer's local credentials,
        // restoring it after the suite finishes regardless of the
        // pass or fail outcome
        if (fs.existsSync(usersPath)) {
            fs.copyFileSync(usersPath, backupPath);
            hadExisting = true;
        }
        const users = [
            {
                username: "alice",
                password_hash: bcrypt.hashSync("alicepw", 10),
                role: "admin"
            },
            {
                username: "bob",
                password_hash: bcrypt.hashSync("bobpw", 10)
            }
        ];
        fs.writeFileSync(usersPath, JSON.stringify(users, null, 4) + "\n", "utf8");
    });

    after(function() {
        if (hadExisting) {
            fs.renameSync(backupPath, usersPath);
        } else {
            try {
                fs.unlinkSync(usersPath);
            } catch (err) {
                if (err.code !== "ENOENT") throw err;
            }
        }
    });

    describe("#verifyCredentials()", function() {
        it("should resolve the user entry on matching credentials", async () => {
            const user = await lib.verifyCredentials("alice", "alicepw");
            assert.deepStrictEqual(user, { username: "alice", role: "admin" });
        });

        it("should default the role to user when missing on the entry", async () => {
            const user = await lib.verifyCredentials("bob", "bobpw");
            assert.deepStrictEqual(user, { username: "bob", role: "user" });
        });

        it("should reject an unknown username", async () => {
            const user = await lib.verifyCredentials("charlie", "anything");
            assert.strictEqual(user, null);
        });

        it("should reject an invalid password", async () => {
            const user = await lib.verifyCredentials("alice", "wrong");
            assert.strictEqual(user, null);
        });

        it("should reject empty credentials", async () => {
            assert.strictEqual(await lib.verifyCredentials("", "alicepw"), null);
            assert.strictEqual(await lib.verifyCredentials("alice", ""), null);
            assert.strictEqual(await lib.verifyCredentials(null, null), null);
        });
    });
});
