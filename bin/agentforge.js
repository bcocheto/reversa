#!/usr/bin/env node

import { runCli } from '../lib/cli.js';

process.exitCode = await runCli({ binaryName: 'agentforge' });
