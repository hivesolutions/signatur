const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const util = require("hive-js-util");

const USERS_PATH = path.join(__dirname, "..", "..", "config", "users.json");

let usersCache = null;
let watcher = null;

/**
 * Reads the users from the `config/users.json` file caching the
 * result so that the next requests do not pay the disk read cost,
 * also installing a file system watcher on the first successful
 * read so that changes to the file are picked up automatically
 * without the need to restart the application; the cache and the
 * watcher are only set once the file actually exists so a later
 * `npm run user:add` run that creates the file for the first time
 * still gets picked up on the next request.
 *
 * @returns {Array} The list of user entries loaded from disk, or
 * an empty list when the file does not exist yet.
 */
const loadUsers = () => {
    if (usersCache !== null) return usersCache;
    let users = [];
    let loaded = false;
    try {
        const raw = fs.readFileSync(USERS_PATH, "utf8");
        const parsed = JSON.parse(raw);
        users = Array.isArray(parsed) ? parsed : [];
        loaded = true;
    } catch (err) {
        if (err.code !== "ENOENT") {
            util.Logging.error("Failed to load users file: " + err.message);
        }
    }
    if (!loaded) {
        // skips both the cache write and the watcher install when
        // the file is missing so the next call retries the read
        // and picks up the file as soon as it is created on disk
        return users;
    }
    usersCache = users;
    if (watcher === null) {
        try {
            watcher = fs.watch(USERS_PATH, () => {
                usersCache = null;
            });
            watcher.on("error", () => {
                usersCache = null;
            });
        } catch {
            // ignores watcher install errors so a transient watch
            // failure does not bring down the auth surface; the
            // cache is still populated so reads stay fast and the
            // process can be restarted to pick up any divergence
        }
    }
    return usersCache;
};

/**
 * Verifies the given credentials against the on disk users file
 * comparing the provided password against the stored bcrypt hash,
 * returning the resolved user entry stripped of the password hash
 * on success and `null` otherwise.
 *
 * @param {String} username The username to look up in the users file.
 * @param {String} password The plain text password to verify.
 * @returns {Promise<Object>} The matched user entry without the password
 * hash, or `null` when the credentials are invalid.
 */
const verifyCredentials = async (username, password) => {
    if (!username || !password) return null;
    const users = loadUsers();
    const user = users.find(entry => entry.username === username);
    if (!user || !user.password_hash) return null;
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return null;
    return { username: user.username, role: user.role || "user" };
};

/**
 * Express middleware that ensures a user is present on the session
 * redirecting to the `/login` page with the original URL preserved
 * as the `next` query parameter when no user is found, so the
 * downstream login flow can return the visitor to the protected
 * page they were trying to reach.
 *
 * @param {any} req The Express request object.
 * @param {any} res The Express response object.
 * @param {Function} next The Express next callback.
 */
const requireUser = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
        return;
    }
    const target = "/login?next=" + encodeURIComponent(req.originalUrl);
    res.redirect(302, target);
};

/**
 * Express middleware that ensures the session user holds the
 * `admin` role, redirecting unauthenticated visitors to `/login`
 * and rendering a localized `403` page for users whose role does
 * not match.
 *
 * @param {any} req The Express request object.
 * @param {any} res The Express response object.
 * @param {Function} next The Express next callback.
 */
const requireAdmin = (req, res, next) => {
    if (!req.session || !req.session.user) {
        const target = "/login?next=" + encodeURIComponent(req.originalUrl);
        res.redirect(302, target);
        return;
    }
    if (req.session.user.role !== "admin") {
        const locale = req.session.locale || "";
        const theme = req.session.theme || "";
        res.status(403).render("forbidden" + (locale ? `-${locale}` : ""), {
            theme: theme
        });
        return;
    }
    next();
};

/**
 * Closes the cached file system watcher on the users file and
 * clears the in memory cache so callers like the unit test suite
 * can release the underlying event loop handle and let the Node
 * process exit cleanly without depending on the watcher to be
 * garbage collected.
 */
const closeUsersWatcher = () => {
    if (watcher !== null) {
        try {
            watcher.close();
        } catch {
            // ignores close errors so a watcher that was never
            // successfully attached does not throw on shutdown
        }
        watcher = null;
    }
    usersCache = null;
};

module.exports = {
    loadUsers: loadUsers,
    verifyCredentials: verifyCredentials,
    requireUser: requireUser,
    requireAdmin: requireAdmin,
    closeUsersWatcher: closeUsersWatcher
};
