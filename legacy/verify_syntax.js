// verify_syntax.js — Kiểm tra syntax các file .gs + .js của dự án.
// Bypass Google Apps Script globals bằng cách prefix "STUB_".

const stub = `
function STUB_SpreadsheetApp() {}
function STUB_Session() {}
function STUB_ScriptApp() {}
function STUB_GmailApp() {}
function STUB_Logger() {}
function STUB_PropertiesService() {}
function STUB_HtmlService() {}
function STUB_UrlFetchApp() {}
function STUB_ContentService() {}
function STUB_Console() {}
const STUB_NOTIFY_EMAILS = [];
const STUB_NOTIFY_OWNER = false;
const STUB_WEBAPP_URL = "";
`;

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const gsFiles = ["Code.gs", "Triggers.gs"];
let allOk = true;

gsFiles.forEach(f => {
  const code = stub + "\n" + fs.readFileSync(f, "utf8");
  const tmp = path.join(os.tmpdir(), "syn_" + f.replace(".gs", ".js"));
  fs.writeFileSync(tmp, code);
  try {
    execSync("node --check " + JSON.stringify(tmp), { stdio: "pipe" });
    console.log("[OK] " + f);
  } catch (e) {
    console.log("[FAIL] " + f);
    console.log(e.stderr ? e.stderr.toString() : e.message);
    allOk = false;
  }
  try { fs.unlinkSync(tmp); } catch {}
});

["app.js"].forEach(f => {
  try {
    execSync("node --check " + JSON.stringify(path.resolve(f)), { stdio: "pipe" });
    console.log("[OK] " + f);
  } catch (e) {
    console.log("[FAIL] " + f);
    console.log(e.stderr ? e.stderr.toString() : e.message);
    allOk = false;
  }
});

if (!allOk) process.exit(1);
console.log("\n[ALL PASSED]");