#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function executeCommand(command, description) {
  try {
    log(`${colors.blue}📦 ${description}...${colors.reset}`);
    execSync(command, { stdio: 'inherit', cwd: process.cwd() });
    log(`${colors.green}✅ ${description} completed${colors.reset}`);
  } catch (error) {
    log(`${colors.red}❌ Error: ${description} failed${colors.reset}`, colors.red);
    log(`Command: ${command}`, colors.red);
    process.exit(1);
  }
}

function createFile(filePath, content, description) {
  try {
    const fullPath = path.resolve(filePath);
    fs.writeFileSync(fullPath, content);
    log(`${colors.green}✅ ${description}${colors.reset}`);
  } catch (error) {
    log(`${colors.red}❌ Error creating ${filePath}: ${error.message}${colors.reset}`, colors.red);
    process.exit(1);
  }
}

function updatePackageJson() {
  try {
    const packagePath = path.resolve('package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    // Add/update scripts
    packageJson.scripts = {
      ...packageJson.scripts,
      "setup": "node ./scripts/setup.js",
      "start:clear": "expo start --clear",
      "dev": "expo start --clear",
      "android": "expo start --android",
      "ios": "expo start --ios",
      "web": "expo start --web"
    };

    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
    log(`${colors.green}✅ Updated package.json scripts${colors.reset}`);
  } catch (error) {
    log(`${colors.red}❌ Error updating package.json: ${error.message}${colors.reset}`, colors.red);
    process.exit(1);
  }
}

// Start setup process
log(`${colors.bold}${colors.blue}🚀 MATHTATAG Auto-Config Setup${colors.reset}`);
log(`${colors.yellow}Setting up your React Native Expo project...${colors.reset}\n`);

// 1. Clean install dependencies
executeCommand('npm ci --legacy-peer-deps || npm install --legacy-peer-deps', 'Installing dependencies with peer dependency resolution');

// 2. Create babel.config.js
const babelConfig = `module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'expo-router/babel',
      'react-native-reanimated/plugin',
    ],
  };
};
`;
createFile('babel.config.js', babelConfig, 'Created babel.config.js');

// 3. Create metro.config.js
const metroConfig = `const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add custom configurations if needed
config.resolver.alias = {
  '@': './',
};

module.exports = config;
`;
createFile('metro.config.js', metroConfig, 'Created metro.config.js');

// 4. Create expo-env.d.ts
const expoEnvTypes = `/// <reference types="expo-router/types" />

// Global type declarations
declare module '*.png' {
  const value: any;
  export = value;
}

declare module '*.jpg' {
  const value: any;
  export = value;
}

declare module '*.jpeg' {
  const value: any;
  export = value;
}

declare module '*.gif' {
  const value: any;
  export = value;
}

declare module '*.svg' {
  const value: any;
  export = value;
}
`;
createFile('expo-env.d.ts', expoEnvTypes, 'Created expo-env.d.ts');

// 5. Update package.json scripts
updatePackageJson();

// 6. Install missing packages if needed
try {
  log(`${colors.blue}📦 Checking for missing packages...${colors.reset}`);
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  if (!packageJson.dependencies['react-native-worklets']) {
    executeCommand('npm install react-native-worklets@latest --legacy-peer-deps', 'Installing react-native-worklets');
  }
} catch (error) {
  log(`${colors.yellow}⚠️  Package check skipped: ${error.message}${colors.reset}`);
}

// 7. Clear any existing cache
try {
  executeCommand('npx expo install --fix', 'Fixing Expo package versions');
} catch (error) {
  log(`${colors.yellow}⚠️  Expo fix skipped (not critical)${colors.reset}`);
}

// Success message
log(`\n${colors.bold}${colors.green}✨ Setup completed successfully!${colors.reset}`);
log(`\n${colors.bold}📱 Start Development:${colors.reset}`);
log(`${colors.blue}   npm run start:clear    ${colors.reset}# Start with cache cleared (recommended)`);
log(`${colors.blue}   npm run dev            ${colors.reset}# Same as start:clear`);
log(`${colors.blue}   npm start              ${colors.reset}# Regular start`);
log(`${colors.blue}   npm run android        ${colors.reset}# Start on Android`);
log(`${colors.blue}   npm run ios           ${colors.reset}# Start on iOS`);
log(`${colors.blue}   npm run web           ${colors.reset}# Start on web`);
log(`\n${colors.green}🎉 Your MATHTATAG app is ready for development!${colors.reset}`);

