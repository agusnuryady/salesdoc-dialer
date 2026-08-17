import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Without this, Turbopack's root auto-detection can walk up past this repo
  // to an unrelated lockfile higher in the filesystem (e.g. in $HOME) and
  // resolve relative imports against the wrong directory.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
