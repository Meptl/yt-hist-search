#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const electronOutDir = path.join(rootDir, 'dist-electron');

function run(cmd, args, options = {}) {
  const isWindowsPnpm = process.platform === 'win32' && cmd === 'pnpm';
  const command = isWindowsPnpm ? 'cmd.exe' : cmd;
  const commandArgs = isWindowsPnpm ? ['/d', '/s', '/c', 'pnpm', ...args] : args;

  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function writeBuilderConfig() {
  const config = {
    appId: 'com.yutoo.ythistdesktop',
    productName: 'YT Hist Desktop',
    asar: false,
    directories: {
      output: electronOutDir,
    },
    files: [
      {
        from: rootDir,
        to: '.',
        filter: [
          'electron/**',
          'frontend/dist/**',
          'src/**',
          'pyproject.toml',
          'uv.lock',
          'package.json',
          '!**/__pycache__/**',
          '!**/*.pyc',
        ],
      },
    ],
    extraMetadata: {
      main: 'electron/main.cjs',
    },
    linux: {
      target: ['AppImage', 'deb'],
      category: 'Utility',
    },
    mac: {
      target: ['dmg', 'zip'],
    },
    win: {
      target: ['nsis', 'zip'],
    },
  };

  const configPath = path.join(rootDir, '.electron-builder.generated.json');
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return configPath;
}

function main() {
  const builderArgs = process.argv.slice(2);
  const skipFrontendBuild = process.env.SKIP_FRONTEND_BUILD === '1';

  if (!skipFrontendBuild) {
    run('pnpm', ['--dir', 'frontend', 'run', 'build']);
  }

  const builderConfigPath = writeBuilderConfig();
  run('pnpm', [
    'exec',
    'electron-builder',
    '--config',
    builderConfigPath,
    '--publish',
    'never',
    ...builderArgs,
  ]);
}

main();
