
import { SqliteMetadataService } from '../src/services/sqlite-metadata.service.js';
import fs from 'fs';
import path from 'path';

async function verify() {
  console.log('--- STARTING MIGRATION VERIFICATION ---');

  const metadataService = new SqliteMetadataService();
  
  // Check Health
  console.log('Checking Health...');
  const healthy = metadataService.checkHealth();
  console.log(`Health Check: ${healthy ? 'PASS' : 'FAIL'}`);

  if (!healthy) {
    console.error('Migration failed: Service unhealthy');
    process.exit(1);
  }

  // Check if DB exists
  const dbPath = path.join(process.cwd(), 'data', 'vectors.db');
  if (fs.existsSync(dbPath)) {
    console.log(`Database file found at ${dbPath}`);
  } else {
    console.error('Database file NOT found');
    process.exit(1);
  }

  // Check data count
  const allData = metadataService.getAllOverrides();
  const count = Object.keys(allData).length;
  console.log(`Total records in SQLite: ${count}`);

  if (count > 0) {
    console.log('Data verification: PASS (Records exist)');
  } else {
    console.log('Data verification: WARN (No records found - might be empty source)');
  }

  console.log('--- VERIFICATION COMPLETE ---');
}

verify().catch(console.error);
