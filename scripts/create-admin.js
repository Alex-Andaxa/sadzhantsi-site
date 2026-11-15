// Створити адміністратора або надати права існуючому користувачу.
// Використання: npm run create-admin -- email@example.com пароль "Ім'я"
const { db, hashPassword } = require("../db");

const [email, password, name = "Адміністратор"] = process.argv.slice(2);
if (!email) {
  console.log('Використання: npm run create-admin -- <email> [пароль] ["Ім\'я"]');
  process.exit(1);
}

const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
if (user) {
  db.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(user.id);
  if (password) db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), user.id);
  console.log(`Користувач ${email} тепер адміністратор.`);
} else {
  if (!password || password.length < 6) {
    console.log("Для нового користувача вкажіть пароль (щонайменше 6 символів).");
    process.exit(1);
  }
  db.prepare("INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 1)")
    .run(name, email.toLowerCase(), hashPassword(password));
  console.log(`Створено адміністратора ${email}.`);
}
