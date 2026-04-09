const crypto = require("crypto");
const { promisify } = require("util");

const PASSWORD_HASH_PREFIX = "scrypt";
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_LENGTH = 64;
const scryptAsync = promisify(crypto.scrypt);

async function main() {
  const password = String(process.argv[2] || process.env.PASSWORD || "");

  if (!password) {
    console.error("Usage: npm run hash:password -- \"your-password\"");
    process.exit(1);
  }

  const salt = crypto.randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const derivedKey = await scryptAsync(password, salt, PASSWORD_KEY_LENGTH);
  const passwordHash = `${PASSWORD_HASH_PREFIX}$${salt}$${Buffer.from(derivedKey).toString("hex")}`;

  console.log(passwordHash);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
