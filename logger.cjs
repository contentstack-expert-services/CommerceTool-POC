const fs = require('fs').promises;
const path = require('path');

const LOG_DIR = path.resolve(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'field_rules_cleanup.log');

function getISTTimestamp() {
  const date = new Date();
  const ISTOffset = 330;
  const ist = new Date(date.getTime() + ISTOffset * 60000);

  const pad = (n) => n.toString().padStart(2, '0');
  const yyyy = ist.getFullYear();
  const mm = pad(ist.getMonth() + 1);
  const dd = pad(ist.getDate());
  const hh = pad(ist.getHours());
  const min = pad(ist.getMinutes());
  const ss = pad(ist.getSeconds());

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

async function log(message) {
  try {
    // Ensure logs folder exists
    await fs.mkdir(LOG_DIR, { recursive: true });

    const timestamp = getISTTimestamp();
    const finalMessage = `[${timestamp}] ${message}\n`;
    await fs.appendFile(LOG_FILE, finalMessage, 'utf-8');
  } catch (err) {
    console.error('Logger error:', err.message);
  }
}

module.exports = { log };
