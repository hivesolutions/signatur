const fs = require("fs");
const path = require("path");
const readline = require("readline");
const bcrypt = require("bcryptjs");

const USERS_PATH = path.join(__dirname, "..", "config", "users.json");

const ALLOWED_ROLES = new Set(["admin", "user"]);

const promptPassword = function(question) {
    return new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true
        });

        // intercepts the standard output write so the password
        // typed by the operator is masked with asterisks while
        // the readline prompt still works as expected
        const stdoutWrite = process.stdout.write.bind(process.stdout);
        rl._writeToOutput = function(stringToWrite) {
            if (stringToWrite.startsWith(question) || stringToWrite === "\r\n" || stringToWrite === "\n") {
                stdoutWrite(stringToWrite);
                return;
            }
            stdoutWrite("*");
        };
        rl.question(question, answer => {
            rl.close();
            stdoutWrite("\n");
            resolve(answer);
        });
    });
};

const loadUsers = function() {
    try {
        const raw = fs.readFileSync(USERS_PATH, "utf8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        if (err.code === "ENOENT") return [];
        throw err;
    }
};

const writeUsers = function(users) {
    // writes the users file through a sibling temp path and renames
    // it into place so a partial write caused by a process kill or
    // disk full event cannot leave the on disk file in a half
    // serialized state that would lock every operator out
    const tmpPath = USERS_PATH + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(users, null, 4) + "\n", "utf8");
    fs.renameSync(tmpPath, USERS_PATH);
};

const main = async function() {
    const [username, role, providedPassword] = process.argv.slice(2);
    if (!username || !role) {
        console.log("Usage: npm run user:add <username> <role> [password]");
        console.log("Allowed roles: " + Array.from(ALLOWED_ROLES).join(", "));
        process.exit(1);
    }
    if (!ALLOWED_ROLES.has(role)) {
        console.log("Invalid role: " + role);
        console.log("Allowed roles: " + Array.from(ALLOWED_ROLES).join(", "));
        process.exit(1);
    }

    // accepts the password as an optional third positional argument
    // so non interactive callers (CI scripts, container entrypoints,
    // ansible playbooks) can seed a user without driving a TTY, with
    // the interactive double prompt path kept as the default for an
    // operator running the command by hand at the terminal
    let password;
    if (providedPassword !== undefined) {
        password = providedPassword;
        if (!password) {
            console.log("Password cannot be empty");
            process.exit(1);
        }
    } else {
        password = await promptPassword("Password for " + username + ": ");
        if (!password) {
            console.log("Password cannot be empty");
            process.exit(1);
        }
        const confirm = await promptPassword("Confirm password: ");
        if (password !== confirm) {
            console.log("Passwords do not match");
            process.exit(1);
        }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const users = loadUsers();
    const existing = users.findIndex(entry => entry.username === username);
    const entry = { username: username, password_hash: passwordHash, role: role };
    if (existing >= 0) {
        users[existing] = entry;
        console.log("Updated existing user " + username + " with role " + role);
    } else {
        users.push(entry);
        console.log("Added user " + username + " with role " + role);
    }
    writeUsers(users);
};

main().catch(err => {
    console.error(err);
    process.exit(1);
});
