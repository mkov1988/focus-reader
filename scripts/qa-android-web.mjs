// Starts the Android app's Expo WEB build for browser-based self-QA.
// The native app renders the same screens via react-native-web, which lets
// the preview tooling click through and screenshot it without a phone.
// Native-only behavior (worklet scrub feel, haptics, keep-awake) still needs
// device testing — this catches runtime crashes, layout, data, and nav bugs.
import { spawn } from 'node:child_process';

const child = spawn('npx', ['expo', 'start', '--web', '--port', '8090'], {
    cwd: 'C:/Users/Michael/Desktop/Focus Reader Android',
    stdio: 'inherit',
    shell: true,
});
child.on('exit', (code) => process.exit(code ?? 0));
