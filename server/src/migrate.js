import { init } from './db.js';

init()
  .then(() => {
    console.log('Migration completed: table survey_responses is ready.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
