import mongoose from 'mongoose';
import { env } from './env';

// Resolve the MongoDB URI. In development (no MONGODB_URI provided) the dev-db
// launcher writes the in-memory server URI to .env.local before booting.
function resolveUri(): string {
  const uri = env.MONGODB_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. In production use MongoDB Atlas. In development run `npm run dev`',
    );
  }
  return uri;
}

interface Cached {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const g = global as unknown as { _agentosMongoose?: Cached };
const cached: Cached = g._agentosMongoose ?? { conn: null, promise: null };
g._agentosMongoose = cached;

export async function dbConnect(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(resolveUri(), {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
