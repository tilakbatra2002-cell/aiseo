import { ensureSeeded } from '@/server/seed';
import mongoose from 'mongoose';

ensureSeeded()
  .then(async () => {
    console.log('✓ Webamazee AgentOS seeded (org, owner, agents, SOPs, workflow, integrations, demo project).');
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('Seed failed:', e);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
