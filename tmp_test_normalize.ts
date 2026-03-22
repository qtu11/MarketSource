
const { normalizeUserId } = require('./lib/database');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function test() {
  try {
    const id = await normalizeUserId('some_firebase_uid_string_123', 'qtussnguyen0220@gmail.com');
    console.log('Result for string + valid email:', id);
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

test();
